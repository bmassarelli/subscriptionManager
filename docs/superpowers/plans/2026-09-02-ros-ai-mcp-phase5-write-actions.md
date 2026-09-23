# ros-ai-mcp — Fase 5: escritura de Actions con aprobación humana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `save_action` MCP tool to `ros-ai-mcp` that lets Claude create or update a ROS Action, gated behind a mandatory human-approval preview and an off-by-default config flag.

**Architecture:** One new pure function `saveAction(client, input)` in `src/tools/saveAction.ts`, same shape as every existing Phase 1-3 tool (`(client: RosClientLike, input) => Promise<output>`, tested against a fake client, no real HTTP). It has two modes selected by `input.confirm`: `confirm` falsy/absent → builds and returns a preview (diff for updates, summary for creates, warnings) without ever calling `client.postJson`; `confirm: true` → builds the real ROS wire payload and calls `POST /actionDetail/saveAction`. Registration in `server.ts` becomes conditional on a new `enableWrite` config flag (default off).

**Tech Stack:** TypeScript, vitest (existing project stack — no new dependencies).

## Global Constraints

- Repo: `ros-ai-mcp` (`C:\Users\52554\Documents\ros-ai-mcp`), branch `master`, no new branch (same as Fases 1-4).
- No commits without the user's explicit go-ahead at the end — leave changes staged/unstaged, per [[feedback_no-autonomous-commits-ros-ai-mcp]]. Do not run `git commit` at any step below even though the step text shows the command — surface it to the user instead and wait.
- No new ROS HTTP endpoints beyond `POST /actionDetail/saveAction` (already fully verified — see the spec's "Contrato real verificado" section and `[[ros-verified-endpoints]]`).
- `save_action` must never send a partial `actionData` to ROS on update — always merge the input against a freshly-fetched `getAction` result first (ROS does not merge server-side).
- `save_action` must not be reachable when `ROS_MCP_ENABLE_WRITE` is not exactly `'true'` — not registered at all, not just runtime-rejected.
- Follow existing repo conventions exactly: fake `RosClientLike` in tests (no real HTTP anywhere in `test/`), `RosError` subclasses for transport-level failures only (a ROS-side business rejection of a save is a normal return value, not a thrown error), zod schemas in `server.ts` matching the `{name, description, schema, handler}` pattern already used by all 14 existing tools.

---

### Task 1: Add `enableWrite` to RosConfig

**Files:**
- Modify: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `RosConfig.enableWrite: boolean`, read by `index.ts` (Task 4) to decide whether to pass write-tool registration on.

- [ ] **Step 1: Write the failing tests**

Add to `test/config.test.ts`:

```typescript
  it('enableWrite is false when ROS_MCP_ENABLE_WRITE is not set', () => {
    const config = loadRosConfig(validEnv);
    expect(config.enableWrite).toBe(false);
  });

  it('enableWrite is false when ROS_MCP_ENABLE_WRITE is anything other than "true"', () => {
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'TRUE' }).enableWrite).toBe(false);
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: '1' }).enableWrite).toBe(false);
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'false' }).enableWrite).toBe(false);
  });

  it('enableWrite is true when ROS_MCP_ENABLE_WRITE is exactly "true"', () => {
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'true' }).enableWrite).toBe(true);
  });
```

Also update the first test in the file (`'loads and strips a trailing slash from baseUrl'`) so its `toEqual` includes `enableWrite: false` — it currently asserts the exact full object, so it will fail once `enableWrite` exists unless updated:

```typescript
  it('loads and strips a trailing slash from baseUrl', () => {
    const config = loadRosConfig(validEnv);
    expect(config).toEqual({
      baseUrl: 'http://172.19.91.145:8081/masros-gui',
      username: 'jyanez',
      password: 'secret',
      httpTimeoutMs: 15000,
      enableWrite: false,
    });
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- config.test.ts`
Expected: FAIL — `enableWrite` is `undefined`, not `false`/`true`.

- [ ] **Step 3: Implement**

In `src/config.ts`, add the field and the parsing line:

```typescript
export interface RosConfig {
  baseUrl: string;
  username: string;
  password: string;
  httpTimeoutMs: number;
  enableWrite: boolean;
}
```

Inside `loadRosConfig`, before the `return`:

```typescript
  const enableWrite = env.ROS_MCP_ENABLE_WRITE === 'true';
```

And add it to the returned object:

```typescript
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    username,
    password,
    httpTimeoutMs,
    enableWrite,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- config.test.ts`
Expected: PASS, all `config.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add enableWrite config flag, off by default"
```

(Per Global Constraints: do not actually run this commit — leave it staged and tell the user it's ready, same as every other step below.)

---

### Task 2: `save_action` preview logic (create validation, create summary, update merge + diff + warnings)

**Files:**
- Modify: `src/rosClient/types.ts`
- Create: `src/tools/saveAction.ts`
- Test: `test/tools/saveAction.test.ts`

**Interfaces:**
- Consumes: `getAction(client, { actionId }): Promise<{ action: RosAction | RosActionHist; config: ActionDBConfig }>` (existing, `src/tools/getAction.ts`), `RosAction`/`ActionDBConfig`/`RequestPaginationData<T>` (existing, `src/rosClient/types.ts`), `RosClientLike` (existing, `src/rosClient/rosClient.ts`).
- Produces: `SaveActionInput`, `SaveActionResult`, `saveAction(client, input): Promise<SaveActionResult>` — Task 3 extends this same function with the `confirm: true` branch; Task 4's `server.ts` registration imports `saveAction` and `SaveActionInput` by these exact names.

This task builds everything **except** the actual `POST /actionDetail/saveAction` call — even with `confirm: true`, at the end of this task the function still only returns a preview. Task 3 adds the real write. This keeps this task's tests entirely free of any mutating call, and reviewable on its own.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/saveAction.test.ts`:

```typescript
// test/tools/saveAction.test.ts
import { describe, expect, it, vi } from 'vitest';
import { saveAction } from '../../src/tools/saveAction.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { ActionDBConfig, RosAction } from '../../src/rosClient/types.js';

const currentAction: RosAction = {
  actionId: 42,
  actionCode: 'GET_CUSTOMER',
  actionDes: 'Get customer data',
  syncBy: 'admin',
  workerClass: '',
  command: 'return http.get(...)',
  actionType: 'ACTION',
  commandType: 'REST',
  domain: 'https://crm.internal',
  protocol: 'https',
  method: 'GET',
  contentType: 'application/json',
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  eager: 'N',
  hash: 'abc',
  actionYmlConfig: {},
};

const currentConfig: ActionDBConfig = {
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  config: {
    GET_CUSTOMER: {
      SYSTEM: 'CRM',
      READ_TIMEOUT: 5000,
      CONNECT_TIMEOUT: 3000,
      DESCRIPTION: 'Fetches customer data from CRM',
    },
  },
};

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn((path: string) => {
      if (path === '/actionInformation/42') return Promise.resolve({ requestData: currentAction });
      if (path === '/actionDBConfig/42') return Promise.resolve(currentConfig);
      throw new Error(`unexpected path ${path}`);
    }) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

describe('saveAction — preview mode (confirm falsy/absent)', () => {
  it('create mode without required fields returns a validation error, calls nothing', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionCode: 'NEW_ACTION' });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('create');
    expect(result.error?.message).toMatch(/actionType.*commandType.*command|required/i);
    expect(client.getJson).not.toHaveBeenCalled();
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('create mode with all required fields returns a summary and no fieldDiffs', async () => {
    const client = fakeClient();

    const result = await saveAction(client, {
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
    });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('create');
    expect(result.preview.fieldDiffs).toBeUndefined();
    expect(result.preview.summary).toContain('NEW_ACTION');
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('update mode fetches current state via getAction and diffs only fields the input changed', async () => {
    const client = fakeClient();

    const result = await saveAction(client, {
      actionId: 42,
      version: '2',
      command: 'return http.get(...) // v2',
    });

    expect(client.getJson).toHaveBeenCalledWith('/actionInformation/42');
    expect(result.mode).toBe('update');
    expect(result.applied).toBe(false);
    expect(result.preview.fieldDiffs).toEqual([
      { field: 'command', from: 'return http.get(...)', to: 'return http.get(...) // v2' },
    ]);
  });

  it('update mode with no changed fields returns an empty fieldDiffs', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', actionDes: 'Get customer data' });

    expect(result.preview.fieldDiffs).toEqual([]);
  });

  it('update mode warns when the supplied version does not match the current version', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '1', command: 'changed' });

    expect(result.preview.warnings).toContainEqual(expect.stringMatching(/versi[oó]n.*(1).*(2)|stale|obsolet/i));
  });

  it('update mode does not warn about version when it matches', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'changed' });

    expect(result.preview.warnings.some((w) => /versi[oó]n|stale|obsolet/i.test(w))).toBe(false);
  });

  it('warns about server-side compilation when commandType is GROOVY/PYTHON and command changed', async () => {
    const client = fakeClient({
      getJson: vi.fn((path: string) => {
        if (path === '/actionInformation/42') {
          return Promise.resolve({ requestData: { ...currentAction, commandType: 'GROOVY' } });
        }
        if (path === '/actionDBConfig/42') return Promise.resolve(currentConfig);
        throw new Error(`unexpected path ${path}`);
      }) as RosClientLike['getJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'new groovy body' });

    expect(result.preview.warnings.some((w) => /compil/i.test(w))).toBe(true);
  });

  it('does not warn about compilation when commandType is not GROOVY/PYTHON', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', domain: 'https://crm2.internal' });

    expect(result.preview.warnings.some((w) => /compil/i.test(w))).toBe(false);
  });

  it('always warns about cluster cache propagation', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', domain: 'https://crm2.internal' });

    expect(result.preview.warnings.some((w) => /cluster|nodo/i.test(w))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- saveAction.test.ts`
Expected: FAIL — `src/tools/saveAction.ts` does not exist yet (module not found).

- [ ] **Step 3: Add wire-format types**

In `src/rosClient/types.ts`, add (near `RosAction`/`ActionDBConfig`):

```typescript
// Wire body of POST /actionDetail/saveAction — a Map<String,Object> server-side,
// NOT the same field names as the read-side RosAction (actionCommands not
// command, actionSync not syncBy, version is a string).
export interface SaveActionRequestBody {
  actionData: {
    actionId: number; // -1 (RosAction.NEW_ACTION sentinel) to create
    actionCode: string;
    actionDes: string;
    actionSync: string;
    actionType: string;
    commandType: string;
    actionCommands: string;
    domain: string;
    protocol: string;
    method: string;
    contentType: string;
    workerClass: string;
    version: string;
    eager: string;
  };
  READ_TIMEOUT?: number;
  CONNECT_TIMEOUT?: number;
  REST_HEADERS?: Record<string, string>;
  CIRCUIT_BREAKER_CONFIG?: unknown;
  TOPIC_KEY?: string;
  SYSTEM?: string;
  DESCRIPTION?: string;
}
```

(The response reuses the existing `RequestPaginationData<RosAction>` — no new response type needed, since `buildSaveActionResponse` wraps the saved `RosAction` in that same envelope.)

- [ ] **Step 4: Implement `src/tools/saveAction.ts`**

```typescript
// src/tools/saveAction.ts
import { getAction } from './getAction.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { ActionDBConfig, RosAction } from '../rosClient/types.js';

export interface SaveActionInput {
  actionId?: number;
  actionCode?: string;
  actionDes?: string;
  actionType?: string;
  commandType?: string;
  command?: string;
  domain?: string;
  protocol?: string;
  method?: string;
  contentType?: string;
  workerClass?: string;
  syncBy?: string;
  eager?: string;
  version?: string;
  config?: {
    readTimeoutMs?: number;
    connectTimeoutMs?: number;
    restHeaders?: Record<string, string>;
    circuitBreakerConfig?: unknown;
    topicKey?: string;
    system?: string;
    description?: string;
  };
  confirm?: boolean;
}

export interface SaveActionResult {
  applied: boolean;
  mode: 'create' | 'update';
  preview: {
    summary: string;
    fieldDiffs?: Array<{ field: string; from: unknown; to: unknown }>;
    warnings: string[];
  };
  result?: { actionId: number; version: string; successMessage?: string };
  error?: { message: string };
}

const REQUIRED_ON_CREATE = ['actionCode', 'actionType', 'commandType', 'command'] as const;

interface MergedFields {
  actionCode: string;
  actionDes: string;
  actionType: string;
  commandType: string;
  command: string;
  domain: string;
  protocol: string;
  method: string;
  contentType: string;
  workerClass: string;
  syncBy: string;
  eager: string;
}

function pick<T>(inputVal: T | undefined, currentVal: T): T {
  return inputVal !== undefined ? inputVal : currentVal;
}

function mergeAgainstCurrent(input: SaveActionInput, current: RosAction): MergedFields {
  return {
    actionCode: pick(input.actionCode, current.actionCode),
    actionDes: pick(input.actionDes, current.actionDes),
    actionType: pick(input.actionType, current.actionType),
    commandType: pick(input.commandType, current.commandType),
    command: pick(input.command, current.command),
    domain: pick(input.domain, current.domain),
    protocol: pick(input.protocol, current.protocol),
    method: pick(input.method, current.method),
    contentType: pick(input.contentType, current.contentType),
    workerClass: pick(input.workerClass, current.workerClass),
    syncBy: pick(input.syncBy, current.syncBy),
    eager: pick(input.eager, current.eager),
  };
}

function diffChangedInputFields(
  input: SaveActionInput,
  merged: MergedFields,
  current: RosAction
): Array<{ field: string; from: unknown; to: unknown }> {
  const pairs: Array<[keyof SaveActionInput, keyof MergedFields, keyof RosAction]> = [
    ['actionCode', 'actionCode', 'actionCode'],
    ['actionDes', 'actionDes', 'actionDes'],
    ['actionType', 'actionType', 'actionType'],
    ['commandType', 'commandType', 'commandType'],
    ['command', 'command', 'command'],
    ['domain', 'domain', 'domain'],
    ['protocol', 'protocol', 'protocol'],
    ['method', 'method', 'method'],
    ['contentType', 'contentType', 'contentType'],
    ['workerClass', 'workerClass', 'workerClass'],
    ['syncBy', 'syncBy', 'syncBy'],
    ['eager', 'eager', 'eager'],
  ];

  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [inputKey, mergedKey, currentKey] of pairs) {
    if (input[inputKey] === undefined) continue;
    if (merged[mergedKey] !== current[currentKey]) {
      diffs.push({ field: mergedKey, from: current[currentKey], to: merged[mergedKey] });
    }
  }
  return diffs;
}

function buildWarnings(commandType: string, commandChanged: boolean, staleVersion: string | null): string[] {
  const warnings: string[] = [];
  if (staleVersion !== null) {
    warnings.push(
      `La versión enviada ya no es la vigente (actual: ${staleVersion}) — releé con get_action antes de guardar, o el guardado será rechazado por ROS.`
    );
  }
  if (commandChanged && (commandType === 'GROOVY' || commandType === 'PYTHON')) {
    warnings.push(
      'ROS compilará este script de forma sincrónica al guardar; si falla la compilación, el guardado completo se revierte.'
    );
  }
  warnings.push('Este guardado se propaga de forma sincrónica al caché de otros nodos del cluster ROS.');
  return warnings;
}

export async function saveAction(client: RosClientLike, input: SaveActionInput): Promise<SaveActionResult> {
  const isUpdate = input.actionId !== undefined;

  if (!isUpdate) {
    const missing = REQUIRED_ON_CREATE.filter((field) => input[field] === undefined);
    if (missing.length > 0) {
      return {
        applied: false,
        mode: 'create',
        preview: { summary: '', warnings: [] },
        error: { message: `Missing required fields to create a new action: ${missing.join(', ')}` },
      };
    }

    const warnings = buildWarnings(input.commandType as string, true, null);
    return {
      applied: false,
      mode: 'create',
      preview: {
        summary: `Creará una nueva action "${input.actionCode}" (${input.actionType}/${input.commandType}).`,
        warnings,
      },
    };
  }

  const { action: current, config: currentConfig } = await getAction(client, { actionId: input.actionId as number });
  const merged = mergeAgainstCurrent(input, current);
  const fieldDiffs = diffChangedInputFields(input, merged, current);

  const currentVersionStr = String(current.version);
  const staleVersion = input.version !== undefined && input.version !== currentVersionStr ? currentVersionStr : null;
  const commandChanged = fieldDiffs.some((d) => d.field === 'command');
  const warnings = buildWarnings(merged.commandType, commandChanged, staleVersion);

  void currentConfig; // consumed by Task 3's execution path

  return {
    applied: false,
    mode: 'update',
    preview: {
      summary: `Actualizará actionId ${input.actionId} (${merged.actionCode}) — ${fieldDiffs.length} campo(s) cambiado(s).`,
      fieldDiffs,
      warnings,
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- saveAction.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 6: Type-check and full test suite**

Run: `npx tsc --noEmit -p "C:/Users/52554/Documents/ros-ai-mcp"` then `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test`
Expected: no TypeScript errors, all existing + new tests pass (the unused `currentConfig`/`ActionDBConfig` import will be flagged if `void currentConfig;` is removed — keep it as a deliberate placeholder consumed for real in Task 3).

- [ ] **Step 7: Commit**

```bash
git add src/rosClient/types.ts src/tools/saveAction.ts test/tools/saveAction.test.ts
git commit -m "feat: add save_action preview mode (create validation, update diff, warnings)"
```

(Do not actually run — staged only, per Global Constraints.)

---

### Task 3: `save_action` execution path (`confirm: true`)

**Files:**
- Modify: `src/tools/saveAction.ts`
- Test: `test/tools/saveAction.test.ts`

**Interfaces:**
- Consumes: `client.postJson<T>(path, body)` (existing, `RosClientLike`), `SaveActionRequestBody` (Task 2, `src/rosClient/types.ts`), `RequestPaginationData<RosAction>` (existing).
- Produces: same `saveAction(client, input)` signature as Task 2 — now `confirm: true` returns `{applied: true, result}` on success or `{applied: false, error}` on a ROS-side rejection, while `confirm` falsy still behaves exactly as Task 2 left it (no regression).

- [ ] **Step 1: Write the failing tests**

Add to `test/tools/saveAction.test.ts`:

```typescript
describe('saveAction — confirm: true', () => {
  it('create mode posts the wire-shaped payload and returns the new actionId on success', async () => {
    let sentPath = '';
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((path: string, body: unknown) => {
        sentPath = path;
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 99',
          requestData: { ...currentAction, actionId: 99, actionCode: 'NEW_ACTION', command: '' },
        });
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, {
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
      confirm: true,
    });

    expect(sentPath).toBe('/actionDetail/saveAction');
    expect(sentBody).toMatchObject({
      actionData: expect.objectContaining({
        actionId: -1,
        actionCode: 'NEW_ACTION',
        actionType: 'ACTION',
        commandType: 'REST',
        actionCommands: 'return true',
      }),
    });
    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ actionId: 99, version: '1', successMessage: 'Action created: 99' });
  });

  it('update mode posts the merged full actionData, not a partial payload', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action updated: 42',
          requestData: { ...currentAction, version: 3, command: '' },
        });
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'return http.get(...) // v2', confirm: true });

    expect(sentBody).toMatchObject({
      actionData: expect.objectContaining({
        actionId: 42,
        actionCode: 'GET_CUSTOMER', // preserved from current, not lost
        actionType: 'ACTION', // preserved from current
        actionCommands: 'return http.get(...) // v2',
        version: '2',
      }),
      SYSTEM: 'CRM', // preserved protocol config
      READ_TIMEOUT: 5000,
    });
    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ actionId: 42, version: '3', successMessage: 'Action updated: 42' });
  });

  it('returns applied:false with the ROS error message when the save is rejected, without throwing', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({
        responseStatus: 1,
        errorMessage: 'La versión ya no es la vigente para esta action.',
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '1', command: 'changed', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('La versión ya no es la vigente para esta action.');
  });

  it('confirm:true on an invalid create (missing required fields) still short-circuits before any HTTP call', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionCode: 'X', confirm: true });

    expect(result.applied).toBe(false);
    expect(client.postJson).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- saveAction.test.ts`
Expected: FAIL — `confirm: true` currently still returns `applied: false` with only a preview, `postJson` is never called.

- [ ] **Step 3: Implement the execution path**

In `src/tools/saveAction.ts`, add the wire-payload builder and wire the `confirm` branch into both the create and update paths. Replace the `void currentConfig;` line and the two `return` statements as follows:

Add near the top (after the existing imports/types):

```typescript
import type { RequestPaginationData, SaveActionRequestBody } from '../rosClient/types.js';

function buildRequestBody(
  actionId: number,
  fields: MergedFields,
  version: string,
  config: {
    readTimeoutMs?: number;
    connectTimeoutMs?: number;
    restHeaders?: Record<string, string>;
    circuitBreakerConfig?: unknown;
    topicKey?: string;
    system?: string;
    description?: string;
  } = {}
): SaveActionRequestBody {
  return {
    actionData: {
      actionId,
      actionCode: fields.actionCode,
      actionDes: fields.actionDes,
      actionSync: fields.syncBy,
      actionType: fields.actionType,
      commandType: fields.commandType,
      actionCommands: fields.command,
      domain: fields.domain,
      protocol: fields.protocol,
      method: fields.method,
      contentType: fields.contentType,
      workerClass: fields.workerClass,
      version,
      eager: fields.eager,
    },
    ...(config.readTimeoutMs !== undefined && { READ_TIMEOUT: config.readTimeoutMs }),
    ...(config.connectTimeoutMs !== undefined && { CONNECT_TIMEOUT: config.connectTimeoutMs }),
    ...(config.restHeaders !== undefined && { REST_HEADERS: config.restHeaders }),
    ...(config.circuitBreakerConfig !== undefined && { CIRCUIT_BREAKER_CONFIG: config.circuitBreakerConfig }),
    ...(config.topicKey !== undefined && { TOPIC_KEY: config.topicKey }),
    ...(config.system !== undefined && { SYSTEM: config.system }),
    ...(config.description !== undefined && { DESCRIPTION: config.description }),
  };
}

async function executeSave(
  client: RosClientLike,
  actionId: number,
  fields: MergedFields,
  version: string,
  config: SaveActionInput['config']
): Promise<{ applied: true; result: SaveActionResult['result'] } | { applied: false; error: { message: string } }> {
  const body = buildRequestBody(actionId, fields, version, config ?? {});
  const response = await client.postJson<RequestPaginationData<RosAction>>('/actionDetail/saveAction', body);

  if (response.requestData?.actionId === undefined) {
    return { applied: false, error: { message: response.errorMessage ?? 'ROS rejected the save (no error message returned).' } };
  }

  return {
    applied: true,
    result: {
      actionId: response.requestData.actionId,
      version: String(response.requestData.version),
      successMessage: response.successMessage,
    },
  };
}
```

Now replace the create-mode success branch (the block that currently returns the create preview) with:

```typescript
    const fields: MergedFields = {
      actionCode: input.actionCode as string,
      actionDes: input.actionDes ?? '',
      actionType: input.actionType as string,
      commandType: input.commandType as string,
      command: input.command as string,
      domain: input.domain ?? '',
      protocol: input.protocol ?? '',
      method: input.method ?? '',
      contentType: input.contentType ?? '',
      workerClass: input.workerClass ?? '',
      syncBy: input.syncBy ?? '',
      eager: input.eager ?? 'N',
    };
    const warnings = buildWarnings(input.commandType as string, true, null);
    const preview = {
      summary: `Creará una nueva action "${input.actionCode}" (${input.actionType}/${input.commandType}).`,
      warnings,
    };

    if (!input.confirm) {
      return { applied: false, mode: 'create', preview };
    }

    const outcome = await executeSave(client, -1, fields, '1', input.config);
    return outcome.applied
      ? { applied: true, mode: 'create', preview, result: outcome.result }
      : { applied: false, mode: 'create', preview, error: outcome.error };
```

And replace the update-mode `return` at the end of the function with:

```typescript
  const preview = {
    summary: `Actualizará actionId ${input.actionId} (${merged.actionCode}) — ${fieldDiffs.length} campo(s) cambiado(s).`,
    fieldDiffs,
    warnings,
  };

  if (!input.confirm) {
    return { applied: false, mode: 'update', preview };
  }

  const mergedConfig = {
    readTimeoutMs: pick(input.config?.readTimeoutMs, currentConfig.config[current.actionCode]?.READ_TIMEOUT),
    connectTimeoutMs: pick(input.config?.connectTimeoutMs, currentConfig.config[current.actionCode]?.CONNECT_TIMEOUT),
    restHeaders: pick(input.config?.restHeaders, currentConfig.config[current.actionCode]?.REST_HEADERS),
    circuitBreakerConfig: pick(input.config?.circuitBreakerConfig, currentConfig.config[current.actionCode]?.CIRCUIT_BREAKER_CONFIG),
    topicKey: pick(input.config?.topicKey, currentConfig.config[current.actionCode]?.TOPIC_KEY),
    system: pick(input.config?.system, currentConfig.config[current.actionCode]?.SYSTEM),
    description: pick(input.config?.description, currentConfig.config[current.actionCode]?.DESCRIPTION),
  };

  const outcome = await executeSave(client, input.actionId as number, merged, input.version ?? currentVersionStr, mergedConfig);
  return outcome.applied
    ? { applied: true, mode: 'update', preview, result: outcome.result }
    : { applied: false, mode: 'update', preview, error: outcome.error };
```

Remove the now-unused `void currentConfig;` line — `currentConfig` is genuinely used above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- saveAction.test.ts`
Expected: PASS, all Task 2 + Task 3 cases green.

- [ ] **Step 5: Type-check and full test suite**

Run: `npx tsc --noEmit -p "C:/Users/52554/Documents/ros-ai-mcp"` then `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/saveAction.ts test/tools/saveAction.test.ts
git commit -m "feat: add save_action execution path (confirm:true writes to ROS)"
```

(Staged only, per Global Constraints.)

---

### Task 4: Register `save_action` conditionally on `enableWrite`

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `saveAction`, `SaveActionInput` (Task 2/3, `src/tools/saveAction.ts`), `RosConfig.enableWrite` (Task 1, `src/config.ts`).
- Produces: `registerTools(server, client, options?: { enableWrite?: boolean })` — the new third parameter is optional so every existing call site (including all of `test/server.test.ts`'s current calls, which pass only 2 args) keeps compiling and keeps behaving as "write disabled" by default.

- [ ] **Step 1: Write the failing tests**

Add to `test/server.test.ts`:

```typescript
  it('does NOT register save_action when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'save_action')).toBe(false);

    const server2 = new FakeMcpServer();
    registerTools(server2, fakeClient(), { enableWrite: false });
    expect(server2.registered.some((tool) => tool.name === 'save_action')).toBe(false);
  });

  it('registers save_action when enableWrite is true', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'save_action')).toBe(true);
  });

  it('save_action handler calls the client and returns MCP text content', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: {} }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const saveActionTool = server.registered.find((tool) => tool.name === 'save_action')!;
    const result = await saveActionTool.handler({
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mode).toBe('create');
    expect(parsed.applied).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- server.test.ts`
Expected: FAIL — `registerTools` doesn't accept a third argument yet, and `save_action` is never registered.

- [ ] **Step 3: Implement**

In `src/server.ts`, add the import and change the function signature:

```typescript
import { saveAction, type SaveActionInput } from './tools/saveAction.js';
```

```typescript
export interface RegisterToolsOptions {
  enableWrite?: boolean;
}

export function registerTools(server: McpServerLike, client: RosClientLike, options: RegisterToolsOptions = {}): void {
```

At the end of the function body, before the closing `}`, add:

```typescript
  if (options.enableWrite) {
    server.tool(
      'save_action',
      'Create or update a ROS action, with mandatory human-approval preview. Without confirm:true, returns a diff/summary and never writes to ROS; call again with confirm:true only after the user has approved the preview.',
      {
        actionId: z.number().optional(),
        actionCode: z.string().optional(),
        actionDes: z.string().optional(),
        actionType: z.string().optional(),
        commandType: z.string().optional(),
        command: z.string().optional(),
        domain: z.string().optional(),
        protocol: z.string().optional(),
        method: z.string().optional(),
        contentType: z.string().optional(),
        workerClass: z.string().optional(),
        syncBy: z.string().optional(),
        eager: z.string().optional(),
        version: z.string().optional(),
        config: z
          .object({
            readTimeoutMs: z.number().optional(),
            connectTimeoutMs: z.number().optional(),
            restHeaders: z.record(z.string()).optional(),
            circuitBreakerConfig: z.unknown().optional(),
            topicKey: z.string().optional(),
            system: z.string().optional(),
            description: z.string().optional(),
          })
          .optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await saveAction(client, args as SaveActionInput));
        } catch (err) {
          return fail(err);
        }
      }
    );
  }
```

In `src/index.ts`, pass the flag through:

```typescript
  registerTools(server as unknown as McpServerLike, client, { enableWrite: config.enableWrite });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test -- server.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + type-check**

Run: `npx tsc --noEmit -p "C:/Users/52554/Documents/ros-ai-mcp"` then `npm --prefix "C:/Users/52554/Documents/ros-ai-mcp" test`
Expected: no errors, all tests (existing + new) pass. Confirm the existing `'registers all 9 Phase-1 ... tools'` test in `server.test.ts` still passes unmodified (it calls `registerTools(server, fakeClient())` with 2 args, so `save_action` correctly stays absent from its expected list).

- [ ] **Step 6: Commit**

```bash
git add src/server.ts src/index.ts test/server.test.ts
git commit -m "feat: register save_action only when ROS_MCP_ENABLE_WRITE=true"
```

(Staged only, per Global Constraints.)

---

### Task 5: Document the write tool and the gating decision

**Files:**
- Modify: `README.md`
- Modify: `.env.example` (if present; create it only if it doesn't exist and other env vars are already documented there — check first)

**Interfaces:** none — documentation only, no code consumed or produced.

- [ ] **Step 1: Check for an existing env-vars example file**

Run: `ls "C:/Users/52554/Documents/ros-ai-mcp" | grep -i env`
If `.env.example` (or similar) exists and lists `ROS_BASE_URL`/`ROS_USERNAME`/etc., add a line for `ROS_MCP_ENABLE_WRITE` there too, with a comment that it defaults to disabled. If no such file exists, skip this file — don't create new config-file conventions as a side effect of this task.

- [ ] **Step 2: Update README.md's Scope section**

Read the current Scope section (`grep -n -A5 "Phase 3" README.md`) and add a new paragraph immediately after the Phase 3 line, following the exact style of the Phase 1/2/3 lines already there:

```markdown
**Phase 5 — write (1 tool, off by default):** `save_action`. Creates or
updates a ROS action with a mandatory human-approval preview (no ROS call
without an explicit `confirm:true` after the user has reviewed the diff/
summary). Disabled unless `ROS_MCP_ENABLE_WRITE=true` is set — when unset or
any other value, the tool is not even registered with the MCP client.
```

- [ ] **Step 3: Confirm the README renders sensibly**

Run: `sed -n '1,80p' README.md` (or open the file) and re-read the Scope section top to bottom — confirm the new paragraph reads consistently with the existing Phase 1-3 ones and doesn't duplicate information already stated elsewhere in the file (e.g. if there's already a top-level "Configuration" section listing env vars, cross-reference it there instead of repeating the full env var table).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document save_action (Phase 5) and ROS_MCP_ENABLE_WRITE gating"
```

(Staged only, per Global Constraints — this is the last task; after this, tell the user everything is staged across 5 commits' worth of changes and wait for their go-ahead to actually commit/push.)

---

## Rollout note (not a task — read before starting)

Per the spec's Rollout section: there is **no** automated end-to-end test against real ROS in this plan, unlike Phase 1's MVP smoke test. Writing to ROS (even DEV/QA) has real effects (synchronous compilation, cluster cache broadcast, audit history row) — any live test must be a deliberate, explicit decision by the user about which test action to use and in which environment, made after this plan is fully implemented and reviewed. Do not add `save_action` to `scripts/smoke.ts`'s automatic run as part of this plan.

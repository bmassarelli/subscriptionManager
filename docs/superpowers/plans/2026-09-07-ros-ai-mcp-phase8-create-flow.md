# ros-ai-mcp Phase 8 — Create Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **STANDING PROJECT RULE, ask again before Task 1:** Do not commit or push in `ros-ai-mcp` or `ts-skills-1` as an automatic step of whatever skill executes this plan, even though each task below ends with a literal "Commit" step (that's just the skill's normal template). Ask the user explicitly how they want commits handled for this run — batched at the end, skipped entirely, or per-task like Phases 5/6 — *before* dispatching the first implementer. This has been violated and corrected twice already on this exact project; a past "yes" does not carry forward.

**Goal:** Add two new gated MCP write tools to `ros-ai-mcp` — `create_flow` (creates a new ROS flow header via `POST /saveFlowDetail`) and `save_flow_steps` (assembles a brand-new flow's step tree via `POST /saveFlowStep` from a simplified DSL) — so a designed ROS flow can be created end-to-end through the MCP server instead of by hand in masros-gui's visual editor.

**Architecture:** Two new tool files mirroring the existing `save_action`/`execute_flow` preview/confirm pattern, plus one new pure-algorithm file (`flowStepTree.ts`) that translates the simplified step DSL into ROS's flat, DFS-numbered wire format — kept separate from I/O so the trickiest logic (parent/child numbering, decision-branch wiring, subflow `INFLOW`/`OUTFLOW` auto-pairing) is unit-testable without a fake ROS client. Both tools reuse existing read tools (`getFlow`, `getFlowSteps`, `searchFlows`, `searchActions`) rather than duplicating any HTTP calls.

**Tech Stack:** TypeScript, Node.js, Vitest, Zod (MCP tool schemas) — same as every prior phase, no new dependencies.

## Global Constraints

- v1 scope is **create-only**: `create_flow` never updates an existing flow header (no `flowId` input other than the hardcoded `-1` sentinel sent to ROS), and `save_flow_steps` refuses to run at all against a flow that already has any steps (see Task 4, Step 3's guard). Editing an existing flow's step tree is explicitly out of scope for this phase — see the design spec §3.
- Step vocabulary is deliberately minimal: `action`, `decision` (binary Y/N only), `subflow`, `end`. No switch, split, multiply, timer, or independent-subflow support in v1 — see design spec §3.
- Both tools are registered only when `options.enableWrite` is true, identical to `save_action`/`execute_flow` (`server.ts`'s existing `if (options.enableWrite) { ... }` block) — neither tool needs `options.restDeps` (unlike `execute_flow`/`get_job_status`), since both use the plain session-cookie `RosClientLike`, not the JWT `ros-rest` client.
- Preview-by-default, `confirm:true`-to-execute, on both tools — no exceptions, matching every write tool in this project so far.
- `save_flow_steps` always sends `version: 0` and `modDate: 0` in the wire body — the sentinel values for "this flow has no prior step-save history," which is the only case v1 supports. This exact `modDate:0` value for a truly-new flow was inferred from the optimistic-lock SQL's `nvl(...,0)` fallback (see design spec §4.2) but has **not** been live-verified — flag this explicitly in Task 4 and confirm it against real ROS DEV before treating `save_flow_steps` as proven, same discipline Phase 5/6 already established for this project.
- Framework/scaffolding action codes this tool itself emits (`INFLOW`, `OUTFLOW`, `INLINEDEC`, `ES`) are never existence-checked via `search_actions` before sending — only user-supplied `action.actionCode`/`subflow.flowCode` values are. Reason: `search_actions` wraps `POST /getRosActions`, which per this project's own prior verified notes returns "all non-admin/non-reserved actions" — the word "reserved" means it's unverified whether framework codes like `INFLOW` even show up in that list, so a validation pass against them could produce a false "not found" for codes we already know exist from reading `RosCoreAction.java` directly. Don't add that validation without first live-confirming `search_actions` actually includes them.
- Every new file follows the existing project style: no comments explaining *what* code does, only *why* when a decision is non-obvious (see any existing file in `src/tools/` for the bar).

---

## File Structure

```
src/
  rosClient/
    types.ts                # MODIFY — add SaveFlowDetailRequestBody, SaveFlowStepBody, WireFlowStep
  tools/
    flowStepTree.ts          # NEW — pure DSL-to-wire-format algorithm (StepNode, buildWireSteps)
    createFlow.ts            # NEW — create_flow tool
    saveFlowSteps.ts         # NEW — save_flow_steps tool
  server.ts                  # MODIFY — register create_flow + save_flow_steps
test/
  tools/
    flowStepTree.test.ts     # NEW
    createFlow.test.ts       # NEW
    saveFlowSteps.test.ts    # NEW
  server.test.ts             # MODIFY
README.md                    # MODIFY — document the two new tools under Scope
```

---

### Task 1: Wire-format types

**Files:**
- Modify: `src/rosClient/types.ts`
- Test: none (pure type additions — exercised indirectly by every later task's tests)

**Interfaces:**
- Produces: `SaveFlowDetailRequestBody`, `SaveFlowStepBody`, `WireFlowStep` in `src/rosClient/types.ts`, imported by Tasks 2-4.

- [ ] **Step 1: Add the types**

Append to `src/rosClient/types.ts`:

```typescript
// Wire body of POST /saveFlowDetail when flowId is the -1 sentinel (create).
// FlowDetailForm (server-side) has more fields (business info, description,
// etc.) — this is only the subset create_flow (Phase 8) exposes. syncBy and
// priority are NOT here: ROS hardcodes them server-side (syncBy="NONE",
// priority=10) and ignores any client-supplied value.
export interface SaveFlowDetailRequestBody {
  flowId: number; // always -1 for create_flow — updating an existing flow header is out of scope
  flowCode: string;
  flowDes: string;
  activeFlag: boolean;
  massFlag: boolean;
  rosFlag: boolean;
  eagerFlag: boolean;
  inMemory: boolean;
  dbReprocessFlag: boolean;
  flowGroups: number[];
  onCancelAction?: { actionId: number; force?: boolean };
  onCancelAllAction?: { actionId: number; force?: boolean };
  emailNotification?: string;
}

// A single step in the flat, DFS-numbered array POST /saveFlowStep expects.
// bypass/syncStep are deliberately absent — v1's DSL never sets them, so
// they're simply omitted rather than sent as `_bypass`/`_syncStep` (the real
// wire field names on write, underscore-prefixed unlike the read-side
// `bypass`/`syncStep` — see flowStepTree.ts if a future phase adds them).
export interface WireFlowStep {
  stepId: number;
  parentStepId: number;
  actionCode: string;
  flowActionDes?: string;
  decision?: 'Y' | 'N';
  ymlConfig?: Record<string, Record<string, unknown>>;
}

// Wire body of POST /saveFlowStep. version:0/modDate:0 are the sentinels
// save_flow_steps always sends — the only case v1 supports is a flow with
// zero prior step-save history (see Global Constraints).
export interface SaveFlowStepBody {
  flowId: number;
  version: number;
  modDate: number;
  flowSteps: WireFlowStep[];
}
```

---

### Task 2: `flowStepTree.ts` — DSL and pure DFS-to-wire algorithm

**Files:**
- Create: `src/tools/flowStepTree.ts`
- Test: `test/tools/flowStepTree.test.ts`

**Interfaces:**
- Consumes: `WireFlowStep` (Task 1).
- Produces: `StepNode` (DSL union type) and `buildWireSteps(steps: StepNode[], ownFlowCode: string): WireFlowStep[]`, both imported by Task 4 (`saveFlowSteps.ts`).

**Design notes for the implementer:**
- This mirrors the real flow editor's `getFromStepToEnd` DFS (`flow_steps_rappid.js:937` in the verified ROS source): walk the tree, assign `stepId` as a plain counter starting at 1, chain `parentStepId` from the previous node (root's `parentStepId` is `0`).
- A `subflow` DSL node expands to **two** wire steps: an `INFLOW`-coded step carrying `ymlConfig[ownFlowCode] = { FLOW_CODE: <target>, ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' }`, immediately followed by an `OUTFLOW`-coded step (empty `ymlConfig[ownFlowCode] = {}`) chained through it. The two extra `ENABLE_SWITCH_FLOW`/`VALIDATE_SWITCH_FLOW` keys were observed verbatim on a real ROS flow's `INFLOW` step during design research — include them for parity even though their exact purpose wasn't independently confirmed in source; they are always the literal string `'false'` for a plain (non-dynamic-switch) subflow call, which is all v1 supports.
- A `decision` DSL node expands to one `INLINEDEC`-coded wire step carrying `ymlConfig[ownFlowCode] = { DECISION_CRITERIA: criteria }`, followed by its `yes` branch (each first wire step tagged `decision: 'Y'`) and its `no` branch (tagged `decision: 'N'`) — **both branches share the decision step's own `stepId` as their `parentStepId`**, they do not chain off each other.
- **v1 does not implement cross-branch step de-duplication.** The real editor lets both branches of a decision converge back onto the *same* downstream steps (reusing one `stepId` with two different `parentStepId` rows). This DSL has no "merge/goto" primitive, so if a caller wants both `yes` and `no` to end up at the same subflow-call-then-end sequence, they write that sequence out in full inside *both* `yes` and `no` arrays — `buildWireSteps` will emit two independent copies with different `stepId`s. This produces a valid, correctly-executing flow (just a tree instead of the minimal-node DAG the visual editor would draw) — call this out in a code comment so nobody "fixes" it into an under-scoped dedup attempt later.
- An `end` DSL node expands to one `ES`-coded wire step with no children and no `ymlConfig`.
- An `action` DSL node expands to one wire step with the caller's `actionCode`, and `ymlConfig[ownFlowCode] = { ...node.ymlConfig }` only if `node.ymlConfig` was provided (omit the key entirely otherwise, don't send an empty object for plain actions that don't need one).
- **Validation, thrown as a plain `Error` with a descriptive message** (not a `RosError` subclass — this never touches ROS, it's pure input validation the caller can fix locally):
  - `steps` (the top-level array, and any `yes`/`no` array) must be non-empty.
  - The **last** element of `steps` (and of every `yes`/`no` array) must be either `{kind:'end'}` or a `{kind:'decision'}` whose own `yes` and `no` both recursively satisfy this same rule. Any other `kind` in last position is "dangling" (no successor step) — reject with a message naming the offending branch.
  - A `subflow` node's `flowCode` must not equal `ownFlowCode` (self-recursive subflow call) — reject by name.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/flowStepTree.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildWireSteps, type StepNode } from '../../src/tools/flowStepTree.js';

describe('buildWireSteps', () => {
  it('numbers a simple linear chain of actions ending in end', () => {
    const steps: StepNode[] = [
      { kind: 'action', actionCode: 'TM_ST', des: 'Start Transaction' },
      { kind: 'action', actionCode: 'MY_VALIDATION' },
      { kind: 'end' },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      { stepId: 1, parentStepId: 0, actionCode: 'TM_ST', flowActionDes: 'Start Transaction' },
      { stepId: 2, parentStepId: 1, actionCode: 'MY_VALIDATION' },
      { stepId: 3, parentStepId: 2, actionCode: 'ES' },
    ]);
  });

  it('expands a subflow node into INFLOW + OUTFLOW with the right ymlConfig', () => {
    const steps: StepNode[] = [{ kind: 'subflow', flowCode: 'NOTIFY_FLOW' }, { kind: 'end' }];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      {
        stepId: 1,
        parentStepId: 0,
        actionCode: 'INFLOW',
        ymlConfig: { MY_FLOW: { FLOW_CODE: 'NOTIFY_FLOW', ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
      },
      { stepId: 2, parentStepId: 1, actionCode: 'OUTFLOW', ymlConfig: { MY_FLOW: {} } },
      { stepId: 3, parentStepId: 2, actionCode: 'ES' },
    ]);
  });

  it('wires a binary decision with both branches sharing the decision step as parent', () => {
    const steps: StepNode[] = [
      {
        kind: 'decision',
        criteria: "binding.hasVariable('prepaidContract')",
        yes: [{ kind: 'end' }],
        no: [{ kind: 'action', actionCode: 'CSDELSUBSC' }, { kind: 'end' }],
      },
    ];

    const wire = buildWireSteps(steps, 'MY_FLOW');

    expect(wire).toEqual([
      {
        stepId: 1,
        parentStepId: 0,
        actionCode: 'INLINEDEC',
        ymlConfig: { MY_FLOW: { DECISION_CRITERIA: "binding.hasVariable('prepaidContract')" } },
      },
      { stepId: 2, parentStepId: 1, actionCode: 'ES', decision: 'Y' },
      { stepId: 3, parentStepId: 1, actionCode: 'CSDELSUBSC', decision: 'N' },
      { stepId: 4, parentStepId: 3, actionCode: 'ES' },
    ]);
  });

  it('passes ymlConfig through on a plain action node only when provided', () => {
    const withConfig = buildWireSteps([{ kind: 'action', actionCode: 'TM_ST', ymlConfig: { contractPath: 'coCode' } }, { kind: 'end' }], 'MY_FLOW');
    expect(withConfig[0].ymlConfig).toEqual({ MY_FLOW: { contractPath: 'coCode' } });

    const withoutConfig = buildWireSteps([{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }], 'MY_FLOW');
    expect(withoutConfig[0].ymlConfig).toBeUndefined();
  });

  it('throws on an empty steps array', () => {
    expect(() => buildWireSteps([], 'MY_FLOW')).toThrow(/empty/i);
  });

  it('throws when the last step in a branch is not end or a fully-terminated decision', () => {
    expect(() => buildWireSteps([{ kind: 'action', actionCode: 'TM_ST' }], 'MY_FLOW')).toThrow(/must end/i);
    expect(() =>
      buildWireSteps(
        [{ kind: 'decision', criteria: 'true', yes: [{ kind: 'end' }], no: [{ kind: 'action', actionCode: 'X' }] }],
        'MY_FLOW'
      )
    ).toThrow(/must end/i);
  });

  it('throws on a self-recursive subflow call', () => {
    expect(() => buildWireSteps([{ kind: 'subflow', flowCode: 'MY_FLOW' }, { kind: 'end' }], 'MY_FLOW')).toThrow(/recursive/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- flowStepTree.test.ts`
Expected: FAIL — `src/tools/flowStepTree.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Implement `flowStepTree.ts`**

Create `src/tools/flowStepTree.ts`:

```typescript
import type { WireFlowStep } from '../rosClient/types.js';

export type StepNode =
  | { kind: 'action'; actionCode: string; des?: string; ymlConfig?: Record<string, unknown> }
  | { kind: 'decision'; criteria: string; yes: StepNode[]; no: StepNode[] }
  | { kind: 'subflow'; flowCode: string; ymlConfig?: Record<string, unknown> }
  | { kind: 'end' };

function isTerminated(nodes: StepNode[]): boolean {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1];
  if (last.kind === 'end') return true;
  if (last.kind === 'decision') return isTerminated(last.yes) && isTerminated(last.no);
  return false;
}

function assertValid(nodes: StepNode[], ownFlowCode: string, branchLabel: string): void {
  if (nodes.length === 0) {
    throw new Error(`${branchLabel} is empty — every branch needs at least one step.`);
  }
  if (!isTerminated(nodes)) {
    throw new Error(`${branchLabel} must end in an "end" step (directly, or via a decision whose own branches all end).`);
  }
  for (const node of nodes) {
    if (node.kind === 'subflow' && node.flowCode === ownFlowCode) {
      throw new Error(`${branchLabel} calls subflow "${node.flowCode}" recursively — a flow cannot call itself.`);
    }
    if (node.kind === 'decision') {
      assertValid(node.yes, ownFlowCode, `${branchLabel} > decision "yes" branch`);
      assertValid(node.no, ownFlowCode, `${branchLabel} > decision "no" branch`);
    }
  }
}

interface Cursor {
  nextStepId: number;
}

function appendNode(wire: WireFlowStep[], node: StepNode, parentStepId: number, ownFlowCode: string, cursor: Cursor, decision?: 'Y' | 'N'): number {
  if (node.kind === 'action') {
    const stepId = cursor.nextStepId++;
    wire.push({
      stepId,
      parentStepId,
      actionCode: node.actionCode,
      ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
      ...(decision !== undefined ? { decision } : {}),
      ...(node.ymlConfig !== undefined ? { ymlConfig: { [ownFlowCode]: node.ymlConfig } } : {}),
    });
    return stepId;
  }

  if (node.kind === 'end') {
    const stepId = cursor.nextStepId++;
    wire.push({ stepId, parentStepId, actionCode: 'ES', ...(decision !== undefined ? { decision } : {}) });
    return stepId;
  }

  if (node.kind === 'subflow') {
    const inStepId = cursor.nextStepId++;
    wire.push({
      stepId: inStepId,
      parentStepId,
      actionCode: 'INFLOW',
      ...(decision !== undefined ? { decision } : {}),
      ymlConfig: { [ownFlowCode]: { FLOW_CODE: node.flowCode, ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
    });
    const outStepId = cursor.nextStepId++;
    wire.push({ stepId: outStepId, parentStepId: inStepId, actionCode: 'OUTFLOW', ymlConfig: { [ownFlowCode]: {} } });
    return outStepId;
  }

  // decision
  const decStepId = cursor.nextStepId++;
  wire.push({
    stepId: decStepId,
    parentStepId,
    actionCode: 'INLINEDEC',
    ...(decision !== undefined ? { decision } : {}),
    ymlConfig: { [ownFlowCode]: { DECISION_CRITERIA: node.criteria } },
  });
  appendChain(wire, node.yes, decStepId, ownFlowCode, cursor, 'Y');
  appendChain(wire, node.no, decStepId, ownFlowCode, cursor, 'N');
  return decStepId;
}

function appendChain(wire: WireFlowStep[], nodes: StepNode[], parentStepId: number, ownFlowCode: string, cursor: Cursor, firstDecision?: 'Y' | 'N'): void {
  let currentParent = parentStepId;
  for (let i = 0; i < nodes.length; i++) {
    currentParent = appendNode(wire, nodes[i], currentParent, ownFlowCode, cursor, i === 0 ? firstDecision : undefined);
  }
}

export function buildWireSteps(steps: StepNode[], ownFlowCode: string): WireFlowStep[] {
  assertValid(steps, ownFlowCode, 'steps');
  const wire: WireFlowStep[] = [];
  const cursor: Cursor = { nextStepId: 1 };
  appendChain(wire, steps, 0, ownFlowCode, cursor);
  return wire;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- flowStepTree.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/tools/flowStepTree.ts test/tools/flowStepTree.test.ts
git commit -m "feat(flowStepTree): add DSL-to-wire-format algorithm for save_flow_steps"
```

---

### Task 3: `create_flow` tool

**Files:**
- Create: `src/tools/createFlow.ts`
- Test: `test/tools/createFlow.test.ts`

**Interfaces:**
- Consumes: `searchFlows(client, input): Promise<UserFlowSummary[]>` (existing, `src/tools/searchFlows.ts`). `SaveFlowDetailRequestBody` (Task 1). `RosClientLike.postJson` (existing).
- Produces: `CreateFlowInput`, `CreateFlowResult`, `createFlow(client: RosClientLike, input: CreateFlowInput): Promise<CreateFlowResult>` — all from `src/tools/createFlow.ts`. Task 5 imports these three names.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/createFlow.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlow } from '../../src/tools/createFlow.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

function flowSummary(overrides: Partial<UserFlowSummary> = {}): UserFlowSummary {
  return {
    flowId: 99001,
    flowCode: 'EXISTING_FLOW',
    flowDes: 'Existing',
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    syncBy: 'NONE',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
    ...overrides,
  };
}

describe('createFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects the reserved flowCode "Dynamic" before any HTTP call, even with confirm:true', async () => {
    const client = fakeClient();
    const result = await createFlow(client, { flowCode: 'Dynamic', flowDes: 'x', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/reserved/i);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('preview mode (no confirm) never calls postJson and flags an existing flowCode collision', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({ requestData: [flowSummary({ flowCode: 'NEW_FLOW' })] }),
    });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow' });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/already exists/i);
  });

  it('preview mode reports no collision and never writes when flowCode is free', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({ requestData: [flowSummary({ flowCode: 'OTHER' })] }),
    });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow' });

    expect(result.applied).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.preview.summary).toMatch(/NEW_FLOW/);
    expect(client.postJson).toHaveBeenCalledTimes(1); // only the search_flows uniqueness check
  });

  it('confirm:true posts to /saveFlowDetail with flowId:-1 and the right defaults', async () => {
    // search_flows is called twice — once for the pre-save uniqueness check, once
    // as the post-save verification lookup — both hit postJson('/getUserFlows'),
    // so the three calls are distinguished purely by order via mockImplementationOnce.
    const postJson = vi.fn();
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // pre-save uniqueness check
    postJson.mockImplementationOnce(() => Promise.resolve({ successMessage: 'flow.successCreate: 77003' })); // saveFlowDetail
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [flowSummary({ flowId: 77003, flowCode: 'NEW_FLOW' })] })); // post-save verify
    const client = fakeClient({ postJson, getJson: vi.fn() });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow', confirm: true });

    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ flowId: 77003, flowCode: 'NEW_FLOW' });
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      '/saveFlowDetail',
      expect.objectContaining({
        flowId: -1,
        flowCode: 'NEW_FLOW',
        flowDes: 'A new flow',
        massFlag: true,
        rosFlag: true,
        activeFlag: true,
        eagerFlag: false,
        inMemory: false,
        dbReprocessFlag: false,
        flowGroups: [],
      })
    );
  });

  it('confirm:true fails clearly when the post-save verification lookup finds no matching flow', async () => {
    const postJson = vi.fn();
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // pre-save uniqueness check
    postJson.mockImplementationOnce(() => Promise.resolve({ successMessage: 'flow.successCreate: 77003' })); // saveFlowDetail
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // post-save verify finds nothing
    const client = fakeClient({ postJson });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/no flow with that code was found/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- createFlow.test.ts`
Expected: FAIL — `src/tools/createFlow.ts` doesn't exist yet.

- [ ] **Step 3: Implement `createFlow.ts`**

Create `src/tools/createFlow.ts`:

```typescript
import { searchFlows } from './searchFlows.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowDetailRequestBody } from '../rosClient/types.js';
import { RosUnexpectedResponseError } from '../errors.js';

const RESERVED_FLOW_CODE = 'Dynamic';

export interface CreateFlowInput {
  flowCode: string;
  flowDes: string;
  massFlag?: boolean;
  rosFlag?: boolean;
  activeFlag?: boolean;
  eagerFlag?: boolean;
  inMemory?: boolean;
  dbReprocessFlag?: boolean;
  flowGroups?: number[];
  onCancelAction?: { actionId: number; force?: boolean };
  onCancelAllAction?: { actionId: number; force?: boolean };
  emailNotification?: string;
  confirm?: boolean;
}

export interface CreateFlowResult {
  applied: boolean;
  preview: { summary: string; warnings: string[] };
  result?: { flowId: number; flowCode: string };
  error?: { message: string };
}

function buildRequestBody(input: CreateFlowInput): SaveFlowDetailRequestBody {
  return {
    flowId: -1,
    flowCode: input.flowCode,
    flowDes: input.flowDes,
    massFlag: input.massFlag ?? true,
    rosFlag: input.rosFlag ?? true,
    activeFlag: input.activeFlag ?? true,
    eagerFlag: input.eagerFlag ?? false,
    inMemory: input.inMemory ?? false,
    dbReprocessFlag: input.dbReprocessFlag ?? false,
    flowGroups: input.flowGroups ?? [],
    onCancelAction: input.onCancelAction,
    onCancelAllAction: input.onCancelAllAction,
    emailNotification: input.emailNotification,
  };
}

function buildWarnings(rosFlag: boolean): string[] {
  const warnings = ['Este guardado se propaga de forma sincrónica al caché de otros nodos del cluster ROS.'];
  if (rosFlag) {
    warnings.push('rosFlag=true — ROS creará automáticamente una ruta REST por defecto para este flow (patrón /ros_<flowCode>Service).');
  }
  warnings.push('Este tool solo crea el header del flow — todavía no tiene steps. Usa save_flow_steps a continuación para ensamblar el árbol.');
  return warnings;
}

async function resolveNewFlowId(client: RosClientLike, flowCode: string, successMessage: string | undefined): Promise<number> {
  const flows = await searchFlows(client, {});
  const match = flows.find((flow) => flow.flowCode === flowCode);
  if (!match) {
    throw new RosUnexpectedResponseError(
      `saveFlowDetail reported success for flowCode "${flowCode}" but no flow with that code was found afterward`,
      JSON.stringify({ successMessage })
    );
  }
  return match.flowId;
}

export async function createFlow(client: RosClientLike, input: CreateFlowInput): Promise<CreateFlowResult> {
  if (input.flowCode === RESERVED_FLOW_CODE) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowCode "${RESERVED_FLOW_CODE}" is reserved by ROS for dynamic-switch flows and cannot be used.` },
    };
  }

  const existingFlows = await searchFlows(client, {});
  const collision = existingFlows.find((flow) => flow.flowCode === input.flowCode);
  if (collision) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowCode "${input.flowCode}" already exists (flowId ${collision.flowId}) — choose a different code.` },
    };
  }

  const body = buildRequestBody(input);
  const preview = {
    summary: `Creará un nuevo flow "${input.flowCode}" ("${input.flowDes}") — massFlag:${body.massFlag}, rosFlag:${body.rosFlag}, activeFlag:${body.activeFlag}.`,
    warnings: buildWarnings(body.rosFlag),
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowDetail', body);
  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }

  const flowId = await resolveNewFlowId(client, input.flowCode, response.successMessage);
  return { applied: true, preview, result: { flowId, flowCode: input.flowCode } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- createFlow.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/tools/createFlow.ts test/tools/createFlow.test.ts
git commit -m "feat(tools): add create_flow wrapping ros saveFlowDetail"
```

---

### Task 4: `save_flow_steps` tool

**Files:**
- Create: `src/tools/saveFlowSteps.ts`
- Test: `test/tools/saveFlowSteps.test.ts`

**Interfaces:**
- Consumes: `buildWireSteps(steps, ownFlowCode): WireFlowStep[]`, `StepNode` (Task 2). `getFlow(client, {flowId}): Promise<FlowInfo | ...>` (existing, `src/tools/getFlow.ts` — read it before writing this task to confirm its exact return shape/null-handling). `getFlowSteps(client, {flowId}): Promise<StepOptimistic[]>` (existing). `searchActions(client, input?): Promise<RosAction[]>` (existing). `searchFlows(client, input?): Promise<UserFlowSummary[]>` (existing). `SaveFlowStepBody` (Task 1).
- Produces: `SaveFlowStepsInput`, `SaveFlowStepsResult`, `saveFlowSteps(client: RosClientLike, input: SaveFlowStepsInput): Promise<SaveFlowStepsResult>` — all from `src/tools/saveFlowSteps.ts`. Task 5 imports these three names.

**Confirmed from source** (`src/tools/getFlow.ts`): `getFlow(client, {flowId}): Promise<FlowInfo>` always resolves to a `FlowInfo` object (it never itself returns `null`/`undefined` — it's a bare `return response.requestData`), but that `FlowInfo`'s own `.flow` property is `null` when ROS has no matching flow (this is the exact pattern `executeFlow.ts` already relies on: `if (!flowInfo?.flow) { ... }`). The fake-client fixtures below rely on this.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/saveFlowSteps.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFlowSteps } from '../../src/tools/saveFlowSteps.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RosAction, StepOptimistic, UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 88001,
    flowCode: 'MY_NEW_FLOW',
    flowDes: 'My new flow',
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'NONE',
    version: 1,
    modDate: '2026-09-07T00:00:00Z',
    userName: 'jyanez',
    eagerFlag: 'N',
  },
  flowNotification: null,
  allAvailableRoutes: [],
  availableFlowGroup: [],
  selectFlowGroup: [],
  allFlowSchemaDatasPath: {},
  flowActionError: null,
  actionErrorDetail: null,
  businessInfo: null,
  isInMemory: false,
  jobProcessedAction: null,
  jobFinishedAction: null,
  onCancelAction: { actionId: null, force: null },
  onCancelAllAction: { actionId: null, force: null },
  description: null,
};

function actionFixture(actionCode: string): RosAction {
  return {
    actionId: 1,
    actionCode,
    actionDes: actionCode,
    syncBy: 'NONE',
    workerClass: 'PROGRAMMING',
    command: '',
    actionType: 'ACTION',
    commandType: 'GROOVY',
    domain: '',
    protocol: '',
    method: '',
    contentType: '',
    version: 1,
    modDate: '2026-01-01T00:00:00Z',
    userName: 'admin',
    eager: 'N',
    hash: '',
    actionYmlConfig: {},
  };
}

function flowSummary(flowCode: string): UserFlowSummary {
  return {
    flowId: 99002,
    flowCode,
    flowDes: flowCode,
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    syncBy: 'NONE',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
  };
}

describe('saveFlowSteps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to run when the flow already has steps, even with confirm:true', async () => {
    const existingSteps = [{ stepId: 1 } as StepOptimistic];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existingSteps }),
    });

    const result = await saveFlowSteps(client, { flowId: 88001, steps: [{ kind: 'end' }], confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/already has/i);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('fails with a clear error when flowId does not resolve to a real flow', async () => {
    const client = fakeClient({ getJson: vi.fn().mockResolvedValue({ requestData: { ...flowInfoFixture, flow: null } }) });

    const result = await saveFlowSteps(client, { flowId: 999, steps: [{ kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/999/);
  });

  it('fails listing unresolved actionCodes/flowCodes before ever building the wire tree', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }), // get_flow_steps: no existing steps
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [] }); // no actions exist
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [] }); // no flows exist
        return Promise.resolve({});
      }),
    });

    const result = await saveFlowSteps(client, {
      flowId: 88001,
      steps: [{ kind: 'action', actionCode: 'GHOST_ACTION' }, { kind: 'subflow', flowCode: 'GHOST_FLOW' }, { kind: 'end' }],
    });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/GHOST_ACTION/);
    expect(result.error?.message).toMatch(/GHOST_FLOW/);
  });

  it('preview mode resolves and returns the wire tree without calling saveFlowStep', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [actionFixture('TM_ST')] });
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [] });
        return Promise.resolve({});
      }),
    });

    const result = await saveFlowSteps(client, { flowId: 88001, steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.preview.resolvedSteps).toEqual([
      { stepId: 1, parentStepId: 0, actionCode: 'TM_ST' },
      { stepId: 2, parentStepId: 1, actionCode: 'ES' },
    ]);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('confirm:true posts the resolved wire tree to /saveFlowStep with version:0/modDate:0', async () => {
    const postJson = vi.fn().mockImplementation((path: string) => {
      if (path === '/getRosActions') return Promise.resolve({ requestData: [actionFixture('TM_ST')] });
      if (path === '/getUserFlows') return Promise.resolve({ requestData: [] });
      if (path === '/saveFlowStep') return Promise.resolve({ successMessage: 'flow.step.successSave' });
      return Promise.resolve({});
    });
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
      postJson,
    });

    const result = await saveFlowSteps(client, {
      flowId: 88001,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(true);
    expect(postJson).toHaveBeenCalledWith('/saveFlowStep', {
      flowId: 88001,
      version: 0,
      modDate: 0,
      flowSteps: [
        { stepId: 1, parentStepId: 0, actionCode: 'TM_ST' },
        { stepId: 2, parentStepId: 1, actionCode: 'ES' },
      ],
    });
  });

  it('confirm:true surfaces ROS errorMessage as a failed result, not a thrown exception', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [actionFixture('TM_ST')] });
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [] });
        if (path === '/saveFlowStep') return Promise.resolve({ errorMessage: 'tool.alertRecVersion' });
        return Promise.resolve({});
      }),
    });

    const result = await saveFlowSteps(client, {
      flowId: 88001,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('tool.alertRecVersion');
  });

  it('a subflow referencing a real flowCode resolves cleanly', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [] });
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [flowSummary('NOTIFY_FLOW')] });
        return Promise.resolve({});
      }),
    });

    const result = await saveFlowSteps(client, { flowId: 88001, steps: [{ kind: 'subflow', flowCode: 'NOTIFY_FLOW' }, { kind: 'end' }] });

    expect(result.applied).toBe(false); // preview, not confirmed
    expect(result.error).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- saveFlowSteps.test.ts`
Expected: FAIL — `src/tools/saveFlowSteps.ts` doesn't exist yet.

- [ ] **Step 3: Implement `saveFlowSteps.ts`**

Create `src/tools/saveFlowSteps.ts`:

```typescript
import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';
import { searchActions } from './searchActions.js';
import { searchFlows } from './searchFlows.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowStepBody, WireFlowStep } from '../rosClient/types.js';

export interface SaveFlowStepsInput {
  flowId: number;
  steps: StepNode[];
  confirm?: boolean;
}

export interface SaveFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}

function collectReferencedCodes(steps: StepNode[]): { actionCodes: Set<string>; flowCodes: Set<string> } {
  const actionCodes = new Set<string>();
  const flowCodes = new Set<string>();
  const visit = (nodes: StepNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'action') actionCodes.add(node.actionCode);
      if (node.kind === 'subflow') flowCodes.add(node.flowCode);
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(steps);
  return { actionCodes, flowCodes };
}

async function findUnresolvedCodes(client: RosClientLike, steps: StepNode[]): Promise<string[]> {
  const { actionCodes, flowCodes } = collectReferencedCodes(steps);
  const problems: string[] = [];

  if (actionCodes.size > 0) {
    const allActions = await searchActions(client, {});
    const knownActionCodes = new Set(allActions.map((action) => action.actionCode));
    for (const code of actionCodes) {
      if (!knownActionCodes.has(code)) problems.push(`actionCode "${code}" not found`);
    }
  }

  if (flowCodes.size > 0) {
    const allFlows = await searchFlows(client, {});
    const knownFlowCodes = new Set(allFlows.map((flow) => flow.flowCode));
    for (const code of flowCodes) {
      if (!knownFlowCodes.has(code)) problems.push(`flowCode "${code}" not found`);
    }
  }

  return problems;
}

const WARNINGS = [
  'save_flow_steps solo funciona sobre flows recién creados sin steps — reemplaza el árbol completo y renumera todos los stepId en cada guardado.',
  'Los stepId asignados aquí no son estables: si en el futuro se vuelve a llamar a esta tool sobre el mismo flow, se renumerará todo desde cero.',
];

export async function saveFlowSteps(client: RosClientLike, input: SaveFlowStepsInput): Promise<SaveFlowStepsResult> {
  const flowInfo = await getFlow(client, { flowId: input.flowId });
  if (!flowInfo?.flow) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId} not found.` },
    };
  }

  const existingSteps = await getFlowSteps(client, { flowId: input.flowId });
  if (existingSteps.length > 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `flowId ${input.flowId} already has ${existingSteps.length} step(s) — save_flow_steps only supports assembling a brand-new flow's tree, editing an existing flow's steps is out of scope (Phase 8 design §3).`,
      },
    };
  }

  const unresolved = await findUnresolvedCodes(client, input.steps);
  if (unresolved.length > 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `Unresolved references — ${unresolved.join('; ')}.` },
    };
  }

  let wireSteps: WireFlowStep[];
  try {
    wireSteps = buildWireSteps(input.steps, flowInfo.flow.flowCode);
  } catch (err) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  const preview = {
    summary: `Creará ${wireSteps.length} step(s) para el flow ${input.flowId} (${flowInfo.flow.flowCode}).`,
    resolvedSteps: wireSteps,
    warnings: WARNINGS,
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  const body: SaveFlowStepBody = { flowId: input.flowId, version: 0, modDate: 0, flowSteps: wireSteps };
  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowStep', body);

  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }

  return { applied: true, preview, result: { successMessage: response.successMessage } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- saveFlowSteps.test.ts`
Expected: PASS (all 7 cases).

Then run the full suite once to confirm nothing else broke:

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/saveFlowSteps.ts test/tools/saveFlowSteps.test.ts
git commit -m "feat(tools): add save_flow_steps wrapping ros saveFlowStep"
```

---

### Task 5: Register both tools in `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`

**Interfaces:**
- Consumes: `createFlow(client, input): Promise<CreateFlowResult>` (Task 3). `saveFlowSteps(client, input): Promise<SaveFlowStepsResult>` (Task 4). `RegisterToolsOptions` (`{ enableWrite?: boolean; restDeps?: ExecuteFlowDeps }`, already exists in `src/server.ts` — neither new tool needs `restDeps`).
- Produces: `registerTools` now also registers `create_flow` and `save_flow_steps` MCP tools when `options.enableWrite` is truthy (same gate as `save_action`/`execute_flow`, inside the existing `if (options.enableWrite) { ... }` block — not the stricter `enableWrite && restDeps` block used by `get_job_status`).

- [ ] **Step 1: Write the failing tests**

Add to `test/server.test.ts` (inside the existing `if (options.enableWrite)`-gated tests, alongside `save_action`/`execute_flow`):

```typescript
it('does NOT register create_flow or save_flow_steps when enableWrite is false or omitted', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient());
  expect(server.registered.some((tool) => tool.name === 'create_flow')).toBe(false);
  expect(server.registered.some((tool) => tool.name === 'save_flow_steps')).toBe(false);
});

it('registers create_flow and save_flow_steps when enableWrite is true, without needing restDeps', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), { enableWrite: true });
  expect(server.registered.some((tool) => tool.name === 'create_flow')).toBe(true);
  expect(server.registered.some((tool) => tool.name === 'save_flow_steps')).toBe(true);
});

it('create_flow handler returns MCP text content on a rejected preview', async () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), { enableWrite: true });

  const tool = server.registered.find((t) => t.name === 'create_flow')!;
  const result = await tool.handler({ flowCode: 'Dynamic', flowDes: 'x' });

  expect(result.isError).toBeFalsy();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.applied).toBe(false);
  expect(parsed.error.message).toMatch(/reserved/i);
});

it('save_flow_steps handler returns MCP text content on a rejected preview (flow not found)', async () => {
  const client = fakeClient();
  vi.spyOn(client, 'getJson').mockResolvedValue({ requestData: { flow: null } });
  const server = new FakeMcpServer();
  registerTools(server, client, { enableWrite: true });

  const tool = server.registered.find((t) => t.name === 'save_flow_steps')!;
  const result = await tool.handler({ flowId: 1, steps: [{ kind: 'end' }] });

  expect(result.isError).toBeFalsy();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.applied).toBe(false);
  expect(parsed.error.message).toMatch(/not found/i);
});
```

Also update the "registers all Phase-1/2/3 tools" test's negative-assertion pattern (the one asserting the write tools are absent with no options) — confirm it now also implicitly covers `create_flow`/`save_flow_steps` being absent; no change needed if that test asserts on the *complete* registered-name list, but re-read it after Step 3 to be sure, same as Phase 7's plan called out.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server.test.ts`
Expected: FAIL — `create_flow`/`save_flow_steps` are never registered yet.

- [ ] **Step 3: Register the tools**

In `src/server.ts`, add the imports (alongside the other tool imports):

```typescript
import { createFlow, type CreateFlowInput } from './tools/createFlow.js';
import { saveFlowSteps, type SaveFlowStepsInput } from './tools/saveFlowSteps.js';
```

Inside the existing `if (options.enableWrite) { ... }` block (the one already containing `save_action` and `execute_flow`), add:

```typescript
    server.tool(
      'create_flow',
      'Create a new ROS flow header (not its steps — use save_flow_steps afterward), with mandatory human-approval preview. Without confirm:true, returns a preview and never writes to ROS; call again with confirm:true only after the user has approved the preview.',
      {
        flowCode: z.string(),
        flowDes: z.string(),
        massFlag: z.boolean().optional(),
        rosFlag: z.boolean().optional(),
        activeFlag: z.boolean().optional(),
        eagerFlag: z.boolean().optional(),
        inMemory: z.boolean().optional(),
        dbReprocessFlag: z.boolean().optional(),
        flowGroups: z.array(z.number()).optional(),
        onCancelAction: z.object({ actionId: z.number(), force: z.boolean().optional() }).optional(),
        onCancelAllAction: z.object({ actionId: z.number(), force: z.boolean().optional() }).optional(),
        emailNotification: z.string().optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await createFlow(client, args as CreateFlowInput));
        } catch (err) {
          return fail(err);
        }
      }
    );

    const stepNodeSchema: z.ZodTypeAny = z.lazy(() =>
      z.union([
        z.object({ kind: z.literal('action'), actionCode: z.string(), des: z.string().optional(), ymlConfig: z.record(z.unknown()).optional() }),
        z.object({ kind: z.literal('decision'), criteria: z.string(), yes: z.array(stepNodeSchema), no: z.array(stepNodeSchema) }),
        z.object({ kind: z.literal('subflow'), flowCode: z.string(), ymlConfig: z.record(z.unknown()).optional() }),
        z.object({ kind: z.literal('end') }),
      ])
    );

    server.tool(
      'save_flow_steps',
      "Assemble the step tree for a brand-new ROS flow (one with zero existing steps) from a simplified DSL (action/decision/subflow/end), with mandatory human-approval preview. Refuses to run against a flow that already has steps. Without confirm:true, returns the fully-resolved step tree as a preview and never writes to ROS; call again with confirm:true only after the user has approved the preview.",
      {
        flowId: z.number(),
        steps: z.array(stepNodeSchema),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await saveFlowSteps(client, args as SaveFlowStepsInput));
        } catch (err) {
          return fail(err);
        }
      }
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server.test.ts`
Expected: PASS (all existing tests still pass, all new tests pass).

Then run the full suite once more:

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat(server): register create_flow and save_flow_steps behind ROS_MCP_ENABLE_WRITE"
```

---

### Task 6: Update README

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the Scope section**

Read the current `README.md`'s Scope section (it already lists Phases 1-7 per prior phases' updates) and add:

```markdown
8. Flow creation (2 tools): `create_flow` (create a new flow header), `save_flow_steps` (assemble a brand-new flow's step tree from a simplified action/decision/subflow/end DSL — refuses to run against a flow that already has steps). Both gated by `ROS_MCP_ENABLE_WRITE`, same preview/confirm:true pattern as `save_action`/`execute_flow`. v1 scope is create-only — neither tool edits an existing flow.
```

Match the exact list-item style already used for Phases 1-7 (check the file for whether it's a numbered list, bullet list, or table before writing this).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(ros-ai-mcp): document Phase 8 create_flow/save_flow_steps in README"
```

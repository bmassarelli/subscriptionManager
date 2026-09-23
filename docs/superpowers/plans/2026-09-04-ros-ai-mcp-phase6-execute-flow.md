# ros-ai-mcp Phase 6 — execute_flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated `execute_flow` MCP tool to `ros-ai-mcp` that schedules a ROS flow's execution via `ros-rest`'s `POST /job`, authenticated with a JWT obtained from `ros-authorization`'s `POST /authenticate`.

**Architecture:** Two new thin client modules (`RosAuthClient` for JWT fetch/cache, `createJob` for the `POST /job` call) sit alongside — not inside — the existing session-based `RosClient`, since `ros-rest`/`ros-authorization` are separate services with separate auth. A new `executeFlow` tool composes the existing `getFlow` (Phase 1, session-based) for its preview with the two new clients for the actual write, following the same preview/`confirm:true` human-approval pattern `save_action` (Phase 5) already established.

**Tech Stack:** TypeScript, Node.js `fetch` via the existing `rawRequest`/`mapHttpError` helpers in `src/rosClient/httpClient.ts`, Vitest (`vi.spyOn`, `vi.useFakeTimers`), Zod for the MCP tool schema.

## Global Constraints

- Only `POST /job` is in scope. `ros-rest`'s dynamic per-flow wildcard routes (`RosFlowRouting`-configured) are explicitly out of scope — confirmed with the user during brainstorming.
- `execute_flow` is gated by the **same** `ROS_MCP_ENABLE_WRITE` flag `save_action` already uses — no second flag.
- The tool's **preview mode** (no `confirm:true`) must work with zero `ros-rest`/`ros-authorization` config present — it only calls the existing session-based `getFlow`. Only `confirm:true` requires all 6 new env vars.
- No job-status-checking tool (`GET /job`/`GET /jobDetail`) in this phase.
- `scripts/smoke.ts` gets **no** real execution added — real writes stay a deliberate, later, user-initiated step (same as `save_action`'s dedicated throwaway-action test).
- `POST /job` always returns HTTP 200 from ROS's own controller; success/failure is `response.responseStatus.status === 100` vs. anything else, read from the JSON body — never inferred from the HTTP status for that endpoint.
- Business-logic rejections from ROS (still HTTP 200, `status !== 100`) are returned as `{ applied: false, error }` data, never thrown. Real transport/timeout/5xx errors are thrown (propagate as exceptions), exactly like every other tool in this codebase.
- Exactly one retry-with-fresh-token on a 401 from `createJob`; no retry loop.
- Do not modify `RosClient`, `session.ts`, or any Phase 1-5 tool file, other than extending `config.ts`, `server.ts`, and `index.ts` to wire the new pieces in.
- At the end of this plan's execution, **preserve** the SDD workspace (`ts-skills-1/.superpowers/sdd/2026-09-04-ros-ai-mcp-phase6-execute-flow/`) — do not delete it, per the established precedent for this two-repo (`ts-skills-1` plan / `ros-ai-mcp` code) project (Phase 5 broke this precedent by deleting it; don't repeat that).

---

## File Structure

```
src/
  config.ts                 # MODIFY — 6 new optional RosConfig fields
  index.ts                  # MODIFY — builds ExecuteFlowDeps | undefined, passes to registerTools
  server.ts                 # MODIFY — registers execute_flow under the existing enableWrite gate
  rosClient/
    rosAuthClient.ts         # NEW — RosAuthClient: POST /authenticate, JWT cache/refresh
    rosRestClient.ts          # NEW — createJob(): POST /job
  tools/
    executeFlow.ts            # NEW — preview/confirm logic, composes getFlow + the two new clients
test/
  config.test.ts             # MODIFY — cases for the 6 new fields
  server.test.ts             # MODIFY — execute_flow gating + handler cases
  rosClient/
    rosAuthClient.test.ts    # NEW
    rosRestClient.test.ts     # NEW
  tools/
    executeFlow.test.ts       # NEW
.env.example                 # MODIFY — 6 new placeholder vars
```

---

### Task 1: Extend `RosConfig` with the `ros-rest`/`ros-authorization`/audit fields

**Files:**
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `RosConfig` gains 6 new **optional** fields: `rosRestBaseUrl?: string`, `rosAuthorizationBaseUrl?: string`, `rosClientId?: string`, `rosClientSecret?: string`, `auditOrigin?: string`, `auditUsername?: string`. Read from env vars `ROS_REST_BASE_URL`, `ROS_AUTHORIZATION_BASE_URL`, `ROS_CLIENT_ID`, `ROS_CLIENT_SECRET`, `ROS_MCP_AUDIT_ORIGIN`, `ROS_MCP_AUDIT_USERNAME`. None of these throw `ConfigError` when absent — unlike `ROS_BASE_URL`/`ROS_USERNAME`/`ROS_PASSWORD`, which stay required.

- [ ] **Step 1: Write the failing tests**

Add to `test/config.test.ts` (keep the existing tests/`validEnv` constant as-is):

```typescript
describe('loadRosConfig — ros-rest / ros-authorization / audit fields (Phase 6)', () => {
  it('leaves the 6 new fields undefined when their env vars are absent', () => {
    const config = loadRosConfig(validEnv);
    expect(config.rosRestBaseUrl).toBeUndefined();
    expect(config.rosAuthorizationBaseUrl).toBeUndefined();
    expect(config.rosClientId).toBeUndefined();
    expect(config.rosClientSecret).toBeUndefined();
    expect(config.auditOrigin).toBeUndefined();
    expect(config.auditUsername).toBeUndefined();
  });

  it('reads all 6 fields when their env vars are present', () => {
    const config = loadRosConfig({
      ...validEnv,
      ROS_REST_BASE_URL: 'http://172.19.91.145:9081/ros-rest',
      ROS_AUTHORIZATION_BASE_URL: 'http://172.19.91.145:9082/ros-authorization',
      ROS_CLIENT_ID: 'client-abc',
      ROS_CLIENT_SECRET: 'secret-xyz',
      ROS_MCP_AUDIT_ORIGIN: 'ros-ai-mcp',
      ROS_MCP_AUDIT_USERNAME: 'jyanez',
    });
    expect(config.rosRestBaseUrl).toBe('http://172.19.91.145:9081/ros-rest');
    expect(config.rosAuthorizationBaseUrl).toBe('http://172.19.91.145:9082/ros-authorization');
    expect(config.rosClientId).toBe('client-abc');
    expect(config.rosClientSecret).toBe('secret-xyz');
    expect(config.auditOrigin).toBe('ros-ai-mcp');
    expect(config.auditUsername).toBe('jyanez');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- config.test.ts`
Expected: FAIL — `config.rosRestBaseUrl` etc. don't exist yet on the returned object (the new assertions fail; `toBeUndefined()` cases may pass by accident since the field truly is undefined on the old object, but the "present" test must fail).

- [ ] **Step 3: Implement the config fields**

In `src/config.ts`, extend the interface and loader:

```typescript
export interface RosConfig {
  baseUrl: string;
  username: string;
  password: string;
  httpTimeoutMs: number;
  enableWrite: boolean;
  rosRestBaseUrl?: string;
  rosAuthorizationBaseUrl?: string;
  rosClientId?: string;
  rosClientSecret?: string;
  auditOrigin?: string;
  auditUsername?: string;
}
```

In `loadRosConfig`, before the `return`:

```typescript
  const rosRestBaseUrl = env.ROS_REST_BASE_URL?.replace(/\/+$/, '');
  const rosAuthorizationBaseUrl = env.ROS_AUTHORIZATION_BASE_URL?.replace(/\/+$/, '');
  const rosClientId = env.ROS_CLIENT_ID;
  const rosClientSecret = env.ROS_CLIENT_SECRET;
  const auditOrigin = env.ROS_MCP_AUDIT_ORIGIN;
  const auditUsername = env.ROS_MCP_AUDIT_USERNAME;
```

and add all 6 to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- config.test.ts`
Expected: PASS

- [ ] **Step 5: Update `.env.example`**

Append to `.env.example`:

```
# Phase 6 — execute_flow (ros-rest + ros-authorization JWT auth). All optional:
# execute_flow's preview works without these; only confirm:true requires them.
ROS_REST_BASE_URL=
ROS_AUTHORIZATION_BASE_URL=
ROS_CLIENT_ID=
ROS_CLIENT_SECRET=
ROS_MCP_AUDIT_ORIGIN=ros-ai-mcp
ROS_MCP_AUDIT_USERNAME=
```

- [ ] **Step 6: Commit**

```bash
git add src/config.ts test/config.test.ts .env.example
git commit -m "feat(config): add ros-rest/ros-authorization/audit fields for Phase 6"
```

---

### Task 2: `RosAuthClient` — JWT fetch and cache

**Files:**
- Create: `src/rosClient/rosAuthClient.ts`
- Create: `test/rosClient/rosAuthClient.test.ts`

**Interfaces:**
- Consumes: `rawRequest`/`mapHttpError` from `src/rosClient/httpClient.ts` (`rawRequest(url, init, timeoutMs): Promise<RawResponse>` where `RawResponse = { status: number; headers: Headers; text: string }`; `mapHttpError(url, status, text): RosError`), `RosUnexpectedResponseError` from `src/errors.ts`.
- Produces: `RosAuthClientLike { getToken(forceRefresh?: boolean): Promise<string> }` and `RosAuthClient implements RosAuthClientLike`, constructed as `new RosAuthClient({ baseUrl, clientId, clientSecret, httpTimeoutMs })`. Task 3 and Task 4 depend on this exact interface.

- [ ] **Step 1: Write the failing tests**

Create `test/rosClient/rosAuthClient.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { RosAuthClient } from '../../src/rosClient/rosAuthClient.js';
import { RosAuthError } from '../../src/errors.js';

function jsonResponse(status: number, body: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(body) };
}

describe('RosAuthClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function client() {
    return new RosAuthClient({
      baseUrl: 'http://ros-auth.local',
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      httpTimeoutMs: 5000,
    });
  }

  it('sends clientId/clientSecret as JSON to POST /authenticate', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }));

    const token = await client().getToken();

    expect(token).toBe('jwt-1');
    expect(spy).toHaveBeenCalledWith(
      'http://ros-auth.local/authenticate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', clientSecret: 'secret-xyz' }),
      }),
      5000
    );
  });

  it('reuses the cached token within the validity window', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    vi.setSystemTime(10 * 60 * 1000); // 10 minutes later, well within the 1h expiry
    const second = await authClient.getToken();

    expect(second).toBe('jwt-1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the cached token is within the 5-minute safety margin of expiry', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-2', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    vi.setSystemTime(56 * 60 * 1000); // past the 55-minute margin cutoff of a 60-minute token
    const second = await authClient.getToken();

    expect(second).toBe('jwt-2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('refreshes when forceRefresh is true even if the cache is still fresh', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-2', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    const second = await authClient.getToken(true);

    expect(second).toBe('jwt-2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws RosAuthError when /authenticate returns 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: 'bad credentials' });

    await expect(client().getToken()).rejects.toBeInstanceOf(RosAuthError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rosAuthClient.test.ts`
Expected: FAIL with "Cannot find module '../../src/rosClient/rosAuthClient.js'"

- [ ] **Step 3: Implement `RosAuthClient`**

Create `src/rosClient/rosAuthClient.ts`:

```typescript
import { mapHttpError, rawRequest } from './httpClient.js';
import { RosUnexpectedResponseError } from '../errors.js';

export interface RosAuthClientLike {
  getToken(forceRefresh?: boolean): Promise<string>;
}

export interface RosAuthClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  httpTimeoutMs: number;
}

interface AuthenticateResponse {
  token: string;
  expiryHours: number;
}

// Refresh a bit before the JWT actually expires, so a token handed to a
// caller doesn't expire mid-flight on a slow request to ros-rest.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class RosAuthClient implements RosAuthClientLike {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly opts: RosAuthClientOptions) {}

  async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedToken !== null && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.cachedToken;
    }

    const url = `${this.opts.baseUrl}/authenticate`;
    const response = await rawRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.opts.clientId, clientSecret: this.opts.clientSecret }),
      },
      this.opts.httpTimeoutMs
    );

    if (response.status < 200 || response.status >= 300) {
      throw mapHttpError(url, response.status, response.text);
    }

    let parsed: AuthenticateResponse;
    try {
      parsed = JSON.parse(response.text) as AuthenticateResponse;
    } catch (err) {
      throw new RosUnexpectedResponseError(`Expected JSON from ${url} but could not parse the response`, response.text, err);
    }
    if (!parsed.token) {
      throw new RosUnexpectedResponseError(`ros-authorization did not return a token`, response.text);
    }

    this.cachedToken = parsed.token;
    this.expiresAt = Date.now() + parsed.expiryHours * 60 * 60 * 1000;
    return this.cachedToken;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rosAuthClient.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/rosAuthClient.ts test/rosClient/rosAuthClient.test.ts
git commit -m "feat(rosClient): add RosAuthClient for ros-authorization JWT fetch/cache"
```

---

### Task 3: `createJob` — `POST /job` against `ros-rest`

**Files:**
- Create: `src/rosClient/rosRestClient.ts`
- Create: `test/rosClient/rosRestClient.test.ts`

**Interfaces:**
- Consumes: same `rawRequest`/`mapHttpError`/`RosUnexpectedResponseError` as Task 2.
- Produces: `CreateJobBody`, `CreateJobResponse`, and `createJob(baseUrl: string, token: string, body: CreateJobBody, timeoutMs: number): Promise<CreateJobResponse>`. Task 4 depends on this exact signature and on `createJob` **not** interpreting `responseStatus` — it returns the parsed body as-is on any 2xx, and throws only on a non-2xx HTTP status.

- [ ] **Step 1: Write the failing tests**

Create `test/rosClient/rosRestClient.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { createJob } from '../../src/rosClient/rosRestClient.js';
import { RosAuthError, RosServerError } from '../../src/errors.js';

function jsonResponse(status: number, body: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(body) };
}

describe('createJob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const body = { audit: { origin: 'ros-ai-mcp', username: 'jyanez' }, flowId: 34606 };

  it('sends the Bearer token and JSON body to POST /job', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValue(jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 1, jobStatusId: 5, jobStatusCode: 'SCHEDULED' }));

    await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(spy).toHaveBeenCalledWith(
      'http://ros-rest.local/job',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-1', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      5000
    );
  });

  it('returns the parsed response on success (status:100)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(
      jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 42, jobStatusId: 5, jobStatusCode: 'SCHEDULED' })
    );

    const result = await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(result).toEqual({ responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 42, jobStatusId: 5, jobStatusCode: 'SCHEDULED' });
  });

  it('returns the parsed response as-is even when it is a business-logic error (HTTP 200, status:-1)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(
      jsonResponse(200, { responseStatus: { status: -1, statusCode: 'ros.generalError', statusMessage: 'Flow not found for flowId:34606' } })
    );

    const result = await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(result.responseStatus.status).toBe(-1);
    expect(result.responseStatus.statusMessage).toBe('Flow not found for flowId:34606');
    expect(result.jobId).toBeUndefined();
  });

  it('throws RosAuthError on HTTP 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: '{"errorCode":401,"errorMessage":"Unauthorized"}' });

    await expect(createJob('http://ros-rest.local', 'expired-jwt', body, 5000)).rejects.toBeInstanceOf(RosAuthError);
  });

  it('throws RosServerError on HTTP 500', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    await expect(createJob('http://ros-rest.local', 'jwt-1', body, 5000)).rejects.toBeInstanceOf(RosServerError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rosRestClient.test.ts`
Expected: FAIL with "Cannot find module '../../src/rosClient/rosRestClient.js'"

- [ ] **Step 3: Implement `createJob`**

Create `src/rosClient/rosRestClient.ts`:

```typescript
import { mapHttpError, rawRequest } from './httpClient.js';
import { RosUnexpectedResponseError } from '../errors.js';

export interface CreateJobBody {
  audit: { origin: string; username: string };
  flowId?: number;
  flowCode?: string;
  notification?: { email: string[] };
}

export interface CreateJobResponse {
  responseStatus: { status: number; statusCode: string; statusMessage: string };
  jobId?: number;
  jobStatusId?: number;
  jobStatusCode?: string;
}

// A thin wrapper around POST /job — it does not interpret responseStatus.
// ROS's /job controller always answers HTTP 200 for business-logic outcomes
// (success or rejection alike); only transport/security/routing failures use
// a non-2xx status. Interpreting responseStatus.status is executeFlow's job.
export async function createJob(baseUrl: string, token: string, body: CreateJobBody, timeoutMs: number): Promise<CreateJobResponse> {
  const url = `${baseUrl}/job`;
  const response = await rawRequest(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (response.status < 200 || response.status >= 300) {
    throw mapHttpError(url, response.status, response.text);
  }

  try {
    return JSON.parse(response.text) as CreateJobResponse;
  } catch (err) {
    throw new RosUnexpectedResponseError(`Expected JSON from ${url} but could not parse the response`, response.text, err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rosRestClient.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/rosRestClient.ts test/rosClient/rosRestClient.test.ts
git commit -m "feat(rosClient): add createJob for ros-rest POST /job"
```

---

### Task 4: `execute_flow` tool — preview/confirm logic

**Files:**
- Create: `src/tools/executeFlow.ts`
- Create: `test/tools/executeFlow.test.ts`

**Interfaces:**
- Consumes: `getFlow(client: RosClientLike, { flowId }): Promise<FlowInfo>` from `src/tools/getFlow.ts` (existing; `FlowInfo.flow` is `RosFlow | null`, `RosFlow` has `flowCode`, `flowDes`, `activeFlag`, `massFlag`), `RosAuthClientLike` from Task 2, `createJob`/`CreateJobBody`/`CreateJobResponse` from Task 3, `RosAuthError` from `src/errors.ts`.
- Produces: `ExecuteFlowInput`, `ExecuteFlowDeps`, `ExecuteFlowResult`, and `executeFlow(client: RosClientLike, restDeps: ExecuteFlowDeps | undefined, input: ExecuteFlowInput): Promise<ExecuteFlowResult>`. Task 5 depends on this exact 3-argument signature and on the `ExecuteFlowDeps` field names (`restBaseUrl`, `authClient`, `auditOrigin`, `auditUsername`, `httpTimeoutMs`).

- [ ] **Step 1: Write the failing tests**

Create `test/tools/executeFlow.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeFlow, type ExecuteFlowDeps } from '../../src/tools/executeFlow.js';
import * as rosRestClient from '../../src/rosClient/rosRestClient.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAuthClientLike } from '../../src/rosClient/rosAuthClient.js';
import type { FlowInfo } from '../../src/rosClient/types.js';
import { RosAuthError } from '../../src/errors.js';

function fakeClient(getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'admin',
    version: 3,
    modDate: '2026-01-10T12:00:00Z',
    userName: 'admin',
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

function fakeAuthClient(token = 'jwt-1'): RosAuthClientLike {
  return { getToken: vi.fn().mockResolvedValue(token) };
}

function restDeps(overrides: Partial<ExecuteFlowDeps> = {}): ExecuteFlowDeps {
  return {
    restBaseUrl: 'http://ros-rest.local',
    authClient: fakeAuthClient(),
    auditOrigin: 'ros-ai-mcp',
    auditUsername: 'jyanez',
    httpTimeoutMs: 5000,
    ...overrides,
  };
}

describe('executeFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a validation error when neither flowId nor flowCode is given', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), {});

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/flowId or flowCode/);
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('preview without confirm resolves the flow via getFlow and never touches restDeps', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const deps = restDeps();

    const result = await executeFlow(client, deps, { flowId: 34606 });

    expect(result.applied).toBe(false);
    expect(result.preview.summary).toContain('ALTA_SERVICIO_X');
    expect(result.preview.warnings).toContain('Esto programa un job en el mass-scheduler; no es una ejecución síncrona inmediata.');
    expect(deps.authClient.getToken).not.toHaveBeenCalled();
  });

  it('preview includes the emails warning when emails are given', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), { flowId: 34606, emails: ['a@x.com', 'b@x.com'] });

    expect(result.preview.warnings.some((w) => w.includes('a@x.com') && w.includes('b@x.com'))).toBe(true);
  });

  it('preview flags a flowId getFlow could not resolve, without blocking a later confirm', async () => {
    const client = fakeClient(() => ({ requestData: { ...flowInfoFixture, flow: null } }));
    const result = await executeFlow(client, restDeps(), { flowId: 999999 });

    expect(result.applied).toBe(false);
    expect(result.preview.summary).toContain('999999');
    expect(result.preview.summary).toMatch(/no encontrado/);
  });

  it('when only flowCode is given, does not call getFlow and warns it is unresolved locally', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), { flowCode: 'ALTA_SERVICIO_X' });

    expect(client.getJson).not.toHaveBeenCalled();
    expect(result.preview.warnings.some((w) => w.includes('no resuelto localmente'))).toBe(true);
  });

  it('confirm:true without restDeps returns a config error and does not call createJob', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const spy = vi.spyOn(rosRestClient, 'createJob');

    const result = await executeFlow(client, undefined, { flowId: 34606, confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/ROS_REST_BASE_URL/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('confirm:true with success (status:100) returns applied:true with jobId/jobStatusCode', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
      jobId: 42,
      jobStatusId: 5,
      jobStatusCode: 'SCHEDULED',
    });

    const result = await executeFlow(client, restDeps(), { flowId: 34606, confirm: true });

    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ jobId: 42, jobStatusCode: 'SCHEDULED' });
    expect(rosRestClient.createJob).toHaveBeenCalledWith(
      'http://ros-rest.local',
      'jwt-1',
      { audit: { origin: 'ros-ai-mcp', username: 'jyanez' }, flowId: 34606, flowCode: undefined, notification: undefined },
      5000
    );
  });

  it('confirm:true, ROS rejects (status:-1) returns applied:false with the statusMessage, no exception', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: -1, statusCode: 'ros.generalError', statusMessage: 'Flow not found for flowId:34606' },
    });

    const result = await executeFlow(client, restDeps(), { flowId: 34606, confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('Flow not found for flowId:34606');
  });

  it('confirm:true, createJob throws 401 once: retries with a fresh token and succeeds', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const getToken = vi.fn().mockResolvedValueOnce('stale-jwt').mockResolvedValueOnce('fresh-jwt');
    const deps = restDeps({ authClient: { getToken } });

    vi.spyOn(rosRestClient, 'createJob')
      .mockRejectedValueOnce(new RosAuthError('ROS rejected the request (HTTP 401)'))
      .mockResolvedValueOnce({ responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 7, jobStatusId: 5, jobStatusCode: 'SCHEDULED' });

    const result = await executeFlow(client, deps, { flowId: 34606, confirm: true });

    expect(result.applied).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(rosRestClient.createJob).toHaveBeenCalledTimes(2);
  });

  it('confirm:true, createJob fails 401 twice: the second failure propagates', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const deps = restDeps({ authClient: fakeAuthClient() });

    vi.spyOn(rosRestClient, 'createJob').mockRejectedValue(new RosAuthError('ROS rejected the request (HTTP 401)'));

    await expect(executeFlow(client, deps, { flowId: 34606, confirm: true })).rejects.toBeInstanceOf(RosAuthError);
    expect(rosRestClient.createJob).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- executeFlow.test.ts`
Expected: FAIL with "Cannot find module '../../src/tools/executeFlow.js'"

- [ ] **Step 3: Implement `executeFlow`**

Create `src/tools/executeFlow.ts`:

```typescript
import { getFlow } from './getFlow.js';
import { createJob, type CreateJobBody, type CreateJobResponse } from '../rosClient/rosRestClient.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RosAuthClientLike } from '../rosClient/rosAuthClient.js';
import { RosAuthError } from '../errors.js';

export interface ExecuteFlowInput {
  flowId?: number;
  flowCode?: string;
  emails?: string[];
  confirm?: boolean;
}

export interface ExecuteFlowDeps {
  restBaseUrl: string;
  authClient: RosAuthClientLike;
  auditOrigin: string;
  auditUsername: string;
  httpTimeoutMs: number;
}

export interface ExecuteFlowResult {
  applied: boolean;
  preview: { summary: string; warnings: string[] };
  result?: { jobId: number; jobStatusCode: string };
  error?: { message: string };
}

const MISSING_REST_DEPS_MESSAGE =
  'ROS_REST_BASE_URL/ROS_AUTHORIZATION_BASE_URL/ROS_CLIENT_ID/ROS_CLIENT_SECRET/ROS_MCP_AUDIT_ORIGIN/ROS_MCP_AUDIT_USERNAME deben estar configurados para ejecutar (el preview sigue disponible sin esto).';

async function buildPreview(client: RosClientLike, input: ExecuteFlowInput): Promise<{ summary: string; warnings: string[] }> {
  const warnings: string[] = ['Esto programa un job en el mass-scheduler; no es una ejecución síncrona inmediata.'];
  if (input.emails && input.emails.length > 0) {
    warnings.push(`Se notificará a: ${input.emails.join(', ')}.`);
  }

  if (input.flowId !== undefined) {
    const flowInfo = await getFlow(client, { flowId: input.flowId });
    if (!flowInfo?.flow) {
      return { summary: `Flow ${input.flowId} no encontrado — ROS lo validará al ejecutar.`, warnings };
    }
    return {
      summary: `Ejecutará el flow ${input.flowId} (${flowInfo.flow.flowCode} — "${flowInfo.flow.flowDes}", activo: ${flowInfo.flow.activeFlag}, mass: ${flowInfo.flow.massFlag}).`,
      warnings,
    };
  }

  warnings.push('flowCode no resuelto localmente — ROS lo validará al ejecutar.');
  return { summary: `Ejecutará el flow con flowCode "${input.flowCode}".`, warnings };
}

async function callCreateJobWithRetry(restDeps: ExecuteFlowDeps, body: CreateJobBody): Promise<CreateJobResponse> {
  const token = await restDeps.authClient.getToken();
  try {
    return await createJob(restDeps.restBaseUrl, token, body, restDeps.httpTimeoutMs);
  } catch (err) {
    if (err instanceof RosAuthError) {
      const freshToken = await restDeps.authClient.getToken(true);
      return await createJob(restDeps.restBaseUrl, freshToken, body, restDeps.httpTimeoutMs);
    }
    throw err;
  }
}

export async function executeFlow(client: RosClientLike, restDeps: ExecuteFlowDeps | undefined, input: ExecuteFlowInput): Promise<ExecuteFlowResult> {
  if (input.flowId === undefined && input.flowCode === undefined) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: 'Either flowId or flowCode is required.' },
    };
  }

  const preview = await buildPreview(client, input);

  if (!input.confirm) {
    return { applied: false, preview };
  }

  if (!restDeps) {
    return { applied: false, preview, error: { message: MISSING_REST_DEPS_MESSAGE } };
  }

  const body: CreateJobBody = {
    audit: { origin: restDeps.auditOrigin, username: restDeps.auditUsername },
    flowId: input.flowId,
    flowCode: input.flowCode,
    notification: input.emails && input.emails.length > 0 ? { email: input.emails } : undefined,
  };

  const response = await callCreateJobWithRetry(restDeps, body);

  if (response.responseStatus.status === 100) {
    return {
      applied: true,
      preview,
      result: { jobId: response.jobId as number, jobStatusCode: response.jobStatusCode as string },
    };
  }

  return { applied: false, preview, error: { message: response.responseStatus.statusMessage } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- executeFlow.test.ts`
Expected: PASS (all 10 cases)

- [ ] **Step 5: Commit**

```bash
git add src/tools/executeFlow.ts test/tools/executeFlow.test.ts
git commit -m "feat(tools): add execute_flow preview/confirm logic"
```

---

### Task 5: Wire `execute_flow` into `server.ts` and `index.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `test/server.test.ts`

**Interfaces:**
- Consumes: `executeFlow`, `ExecuteFlowDeps`, `ExecuteFlowInput` from Task 4; `RosAuthClient` from Task 2; `RosConfig`'s 6 new fields from Task 1.
- Produces: `RegisterToolsOptions` gains `restDeps?: ExecuteFlowDeps`; `registerTools` registers `execute_flow` under the existing `if (options.enableWrite)` block.

- [ ] **Step 1: Write the failing tests**

Add to `test/server.test.ts` (below the existing `save_action` tests, keep everything else unchanged — no new imports are needed, the existing `fakeClient`/`FakeMcpServer`/`registerTools` imports cover these cases too):

```typescript
// ... inside describe('registerTools', () => { ... }), add:

  it('does NOT register execute_flow when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'execute_flow')).toBe(false);

    const server2 = new FakeMcpServer();
    registerTools(server2, fakeClient(), { enableWrite: false });
    expect(server2.registered.some((tool) => tool.name === 'execute_flow')).toBe(false);
  });

  it('registers execute_flow when enableWrite is true, with or without restDeps', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'execute_flow')).toBe(true);
  });

  it('execute_flow handler returns preview-only MCP text content without restDeps', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { flow: { flowId: 34606, flowCode: 'X', flowDes: 'x', activeFlag: 'Y', massFlag: 'N' } } }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const tool = server.registered.find((t) => t.name === 'execute_flow')!;
    const result = await tool.handler({ flowId: 34606 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(false);
    expect(parsed.preview.summary).toContain('X');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server.test.ts`
Expected: FAIL — `execute_flow` is not a registered tool name yet.

- [ ] **Step 3: Wire it into `server.ts`**

In `src/server.ts`, add the import:

```typescript
import { executeFlow, type ExecuteFlowDeps, type ExecuteFlowInput } from './tools/executeFlow.js';
```

Extend `RegisterToolsOptions`:

```typescript
export interface RegisterToolsOptions {
  enableWrite?: boolean;
  restDeps?: ExecuteFlowDeps;
}
```

Inside the existing `if (options.enableWrite) { ... }` block, after the `save_action` registration, add:

```typescript
    server.tool(
      'execute_flow',
      'Schedule a ROS flow for execution via ros-rest (creates a mass-scheduler job), with mandatory human-approval preview. Without confirm:true, returns a preview and never calls ros-rest; call again with confirm:true only after the user has approved the preview.',
      {
        flowId: z.number().optional(),
        flowCode: z.string().optional(),
        emails: z.array(z.string()).optional(),
        confirm: z.boolean().optional(),
      },
      async (args) => {
        try {
          return ok(await executeFlow(client, options.restDeps, args as ExecuteFlowInput));
        } catch (err) {
          return fail(err);
        }
      }
    );
```

- [ ] **Step 4: Wire config → deps in `index.ts`**

In `src/index.ts`, add imports:

```typescript
import { RosAuthClient } from './rosClient/rosAuthClient.js';
import type { ExecuteFlowDeps } from './tools/executeFlow.js';
```

Before the `registerTools(...)` call, build `restDeps`:

```typescript
  const restDeps: ExecuteFlowDeps | undefined =
    config.rosRestBaseUrl && config.rosAuthorizationBaseUrl && config.rosClientId && config.rosClientSecret && config.auditOrigin && config.auditUsername
      ? {
          restBaseUrl: config.rosRestBaseUrl,
          authClient: new RosAuthClient({
            baseUrl: config.rosAuthorizationBaseUrl,
            clientId: config.rosClientId,
            clientSecret: config.rosClientSecret,
            httpTimeoutMs: config.httpTimeoutMs,
          }),
          auditOrigin: config.auditOrigin,
          auditUsername: config.auditUsername,
          httpTimeoutMs: config.httpTimeoutMs,
        }
      : undefined;
```

Update the `registerTools` call:

```typescript
  registerTools(server as unknown as McpServerLike, client, { enableWrite: config.enableWrite, restDeps });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — full suite green, including the new `server.test.ts` cases.

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/index.ts test/server.test.ts
git commit -m "feat(server): register execute_flow behind ROS_MCP_ENABLE_WRITE"
```

---

## Post-plan notes (not a task — do not skip reading)

- No live verification against real `ros-rest`/`ros-authorization` is part of this plan. Per the spec's Rollout section, that requires the user to explicitly provide/create a real `clientId`/`clientSecret` and confirm the DEV/QA host:port for both services — none of which is available yet. Do not attempt a real call as part of "finishing" this plan.
- Do not delete `ts-skills-1/.superpowers/sdd/2026-09-04-ros-ai-mcp-phase6-execute-flow/` at the end, per the Global Constraints above.
- Do not commit anything in either repo beyond what each task's own Step explicitly does, and do not push, without the user asking first.

# ros-ai-mcp Phase 7 — get_job_status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated, read-only `get_job_status` MCP tool to `ros-ai-mcp` that looks up a mass-scheduler job's status/progress via `ros-rest`'s `GET /jobDetail`, using the JWT auth infra Phase 6 already built.

**Architecture:** One new function, `getJobDetail`, added to the existing `rosRestClient.ts` (sibling to Phase 6's `createJob`) wraps `GET /jobDetail?jobId=X`. A new `getJobStatus` tool composes it with the existing `RosAuthClient`/`ExecuteFlowDeps` — no new client, no new deps shape. Unlike `save_action`/`execute_flow`, there is no preview/`confirm:true` gate: this tool only reads, so it calls through immediately.

**Tech Stack:** TypeScript, Node.js `fetch` via the existing `rawRequest`/`mapHttpError` helpers in `src/rosClient/httpClient.ts`, Vitest (`vi.spyOn`), Zod for the MCP tool schema.

## Global Constraints

- Only `GET /jobDetail?jobId=X` is in scope. `GET /job` (search/list by flowId/statusId/date range, paginated) is explicitly out of scope — confirmed with the user during brainstorming; the real use case is "I have a jobId from `execute_flow`, what happened to it," not a generic job browser.
- `ChangeJobStatus` (`POST`, reschedule/cancel a job) is out of scope — that is a write, not a status read.
- `get_job_status` is gated by `ROS_MCP_ENABLE_WRITE` **AND** requires `restDeps` to be defined (i.e. all 6 `ros-rest`/`ros-authorization`/audit env vars from Phase 6 must be set) — unlike `execute_flow`, which registers even without `restDeps` and only fails at `confirm:true`, there is no sensible "preview-only" mode for a pure read tool with no working data source, so it simply isn't registered at all in that case.
- No `confirm`/preview gate on this tool — it never mutates ROS state, so it calls through immediately, unlike `save_action`/`execute_flow`.
- Passthrough mapping of `SearchJobDetailResponse`'s verified fields — no curation/summarization, matching the style of Phase 1's `get_flow`/`get_action`.
- ROS itself does not throw or return an explicit "not found" for an unknown `jobId` — it returns HTTP 200 with a near-empty body (only `responseStatus`, no `statusId`/`flowId`). This tool must detect that case itself and surface `found: false`, rather than passing back an ambiguous near-empty object.
- Validation and business-outcome failures are returned as `{ found: false, error }` data, never thrown — matching `saveAction`'s/`executeFlow`'s existing convention in this codebase. Real transport/timeout/5xx/auth errors are thrown (propagate as exceptions) after the single retry below, exactly like every other tool.
- Exactly one retry-with-fresh-token on a 401 from `getJobDetail`; no retry loop — same pattern as `executeFlow`'s `callCreateJobWithRetry`.
- Do not modify `RosClient`, `session.ts`, `config.ts`, `index.ts`, `rosAuthClient.ts`, or any Phase 1-6 tool file, other than extending `rosRestClient.ts`, `types.ts`, and `server.ts` to add the new piece. `config.ts`/`index.ts` already have everything `get_job_status` needs (the 6 Phase 6 env vars, the `restDeps` construction) — no changes required there.
- At the end of this plan's execution, **preserve** the SDD workspace (`ts-skills-1/.superpowers/sdd/2026-09-06-ros-ai-mcp-phase7-job-status/`) — do not delete it, per the established precedent for this two-repo (`ts-skills-1` plan / `ros-ai-mcp` code) project.

---

## File Structure

```
src/
  server.ts                  # MODIFY — registers get_job_status under enableWrite && restDeps
  rosClient/
    rosRestClient.ts          # MODIFY — add getJobDetail(): GET /jobDetail?jobId=X
    types.ts                  # MODIFY — add JobDetailResponse + MonitorProcessJobItem/HistoryJobItem/ErrorCodeGroupItem
  tools/
    getJobStatus.ts            # NEW — validation, retry-on-401, found:false heuristic, field mapping
test/
  server.test.ts              # MODIFY — get_job_status gating + handler cases
  rosClient/
    rosRestClient.test.ts      # MODIFY — getJobDetail cases
  tools/
    getJobStatus.test.ts        # NEW
```

---

### Task 1: `types.ts` job-detail types + `rosRestClient.ts`'s `getJobDetail`

**Files:**
- Modify: `src/rosClient/types.ts`
- Modify: `src/rosClient/rosRestClient.ts`
- Modify: `test/rosClient/rosRestClient.test.ts`

**Interfaces:**
- Produces: `JobDetailResponse` (and its nested `MonitorProcessJobItem`, `HistoryJobItem`, `ErrorCodeGroupItem` types) in `src/rosClient/types.ts`. `getJobDetail(baseUrl: string, token: string, jobId: number, timeoutMs: number): Promise<JobDetailResponse>` in `src/rosClient/rosRestClient.ts`, exported alongside the existing `createJob`.

- [ ] **Step 1: Write the failing types + client test**

Add to `src/rosClient/types.ts` (append at the end of the file):

```typescript
export interface MonitorProcessJobItem {
  stepId: number;
  actionId: number;
  actionCode: string;
  actionDes: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  items: number;
}

export interface HistoryJobItem {
  histId: number;
  statusDate: string;
  modUser: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  startDate: string;
}

export interface ErrorCodeGroupItem {
  errorCode: string;
  items: number;
  actionId: number;
  actionDes: string;
  areSubflows: boolean;
  isEvaluatorAction: boolean;
  errorType: string;
}

// GET /jobDetail?jobId=X on ros-rest (RosInterfaceRestController.searchJobDetail).
// Always carries responseStatus (extends BaseResponse). When jobId doesn't exist
// in MassScheduler nor MassSchedulerHist, ROS does NOT error — it silently
// returns a response with only responseStatus populated; every other field is
// absent. errorCodeGroup/monitorProcessJobHist are only populated for
// non-historical (in-progress) jobs — see SearchJobDetailOperation.java.
export interface JobDetailResponse {
  responseStatus: { status: number; statusCode: string; statusMessage: string };
  jobId?: number;
  flowId?: number;
  flowCode?: string;
  flowDes?: string;
  filename?: string;
  createUser?: string;
  statusId?: number;
  statusCode?: string;
  statusDes?: string;
  entryDate?: string;
  startDate?: string;
  items?: number;
  progressPercentage?: number;
  historyDetails?: boolean;
  schedulerNotification?: { notificationId?: number; email?: string[] };
  monitorProcessJob?: { item: MonitorProcessJobItem[] };
  monitorProcessJobHist?: { item: MonitorProcessJobItem[] };
  historyJob?: { item: HistoryJobItem[] };
  errorCodeGroup?: { errorItem: ErrorCodeGroupItem[] };
}
```

Add to `test/rosClient/rosRestClient.test.ts` (below the existing `createJob` describe block, same file — keep the existing `jsonResponse` helper and imports, add `getJobDetail` to the import from `'../../src/rosClient/rosRestClient.js'`):

```typescript
describe('getJobDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fullBody = {
    responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
    jobId: 98765,
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    filename: null,
    createUser: 'jyanez',
    statusId: 90,
    statusCode: 'FINISHED',
    statusDes: 'Finalizado',
    entryDate: '2026-09-05T10:00:00Z',
    startDate: '2026-09-05T10:00:05Z',
    items: 120,
    progressPercentage: 100,
    historyDetails: true,
    schedulerNotification: { notificationId: 1, email: ['a@x.com'] },
    monitorProcessJob: { item: [{ stepId: 1, actionId: 2, actionCode: 'A', actionDes: 'Action A', statusId: 100, statusCode: 'SUCCESS', statusDes: 'ok', items: 120 }] },
    historyJob: { item: [{ histId: 1, statusDate: '2026-09-05T10:00:00Z', modUser: 'system', statusId: 0, statusCode: 'SCHEDULED', statusDes: 'Programado', startDate: '2026-09-05T10:00:05Z' }] },
  };

  it('sends the Bearer token to GET /jobDetail?jobId=X', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, fullBody));

    await getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000);

    expect(spy).toHaveBeenCalledWith('http://ros-rest.local/jobDetail?jobId=98765', { method: 'GET', headers: { Authorization: 'Bearer jwt-1' } }, 5000);
  });

  it('returns the parsed response on success, including nested arrays', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, fullBody));

    const result = await getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000);

    expect(result).toEqual(fullBody);
  });

  it('returns the parsed response as-is when the job was not found (only responseStatus present)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' } }));

    const result = await getJobDetail('http://ros-rest.local', 'jwt-1', 999999999, 5000);

    expect(result.jobId).toBeUndefined();
    expect(result.statusId).toBeUndefined();
  });

  it('throws RosAuthError on HTTP 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: '{"errorCode":401,"errorMessage":"Unauthorized"}' });

    await expect(getJobDetail('http://ros-rest.local', 'expired-jwt', 98765, 5000)).rejects.toBeInstanceOf(RosAuthError);
  });

  it('throws RosServerError on HTTP 500', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosServerError);
  });

  it('throws RosUnexpectedResponseError (not a TypeError) on HTTP 200 with a body missing responseStatus', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { jobId: 1 }));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with responseStatus: null', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { responseStatus: null }));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with a fully null body', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, null));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});
```

Also update the top-of-file import line in `test/rosClient/rosRestClient.test.ts` from:
```typescript
import { createJob } from '../../src/rosClient/rosRestClient.js';
```
to:
```typescript
import { createJob, getJobDetail } from '../../src/rosClient/rosRestClient.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- rosRestClient.test.ts`
Expected: FAIL — `getJobDetail` is not exported yet (`TypeError: getJobDetail is not a function` or a TS compile error).

- [ ] **Step 3: Implement `getJobDetail`**

In `src/rosClient/rosRestClient.ts`, add the import and function (append below the existing `createJob`):

```typescript
import type { JobDetailResponse } from './types.js';
```

```typescript
// A thin wrapper around GET /jobDetail — like createJob, it does not interpret
// responseStatus or decide "found"; that heuristic (statusId/flowId both
// absent means the jobId doesn't exist in ROS) lives in getJobStatus, not here.
export async function getJobDetail(baseUrl: string, token: string, jobId: number, timeoutMs: number): Promise<JobDetailResponse> {
  const url = `${baseUrl}/jobDetail?jobId=${jobId}`;
  const response = await rawRequest(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, timeoutMs);

  if (response.status < 200 || response.status >= 300) {
    throw mapHttpError(url, response.status, response.text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (err) {
    throw new RosUnexpectedResponseError(`Expected JSON from ${url} but could not parse the response`, response.text, err);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as JobDetailResponse).responseStatus !== 'object' ||
    (parsed as JobDetailResponse).responseStatus === null ||
    typeof (parsed as JobDetailResponse).responseStatus.status !== 'number'
  ) {
    throw new RosUnexpectedResponseError(`${url} returned an unexpected response shape (missing responseStatus.status)`, response.text);
  }

  return parsed as JobDetailResponse;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- rosRestClient.test.ts`
Expected: PASS (all `createJob` tests still pass, all new `getJobDetail` tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/types.ts src/rosClient/rosRestClient.ts test/rosClient/rosRestClient.test.ts
git commit -m "feat(rosClient): add getJobDetail for ros-rest GET /jobDetail"
```

---

### Task 2: `getJobStatus` tool

**Files:**
- Create: `src/tools/getJobStatus.ts`
- Create: `test/tools/getJobStatus.test.ts`

**Interfaces:**
- Consumes: `getJobDetail(baseUrl, token, jobId, timeoutMs): Promise<JobDetailResponse>` (Task 1). `ExecuteFlowDeps` (`{ restBaseUrl: string; authClient: RosAuthClientLike; auditOrigin: string; auditUsername: string; httpTimeoutMs: number }`, from `src/tools/executeFlow.ts`, already exists). `RosAuthClientLike.getToken(forceRefresh?: boolean): Promise<string>` (already exists). `RosAuthError` (from `src/errors.ts`, already exists).
- Produces: `GetJobStatusInput` (`{ jobId: number }`), `GetJobStatusResult`, and `getJobStatus(restDeps: ExecuteFlowDeps, input: GetJobStatusInput): Promise<GetJobStatusResult>` — all from `src/tools/getJobStatus.ts`. Task 3 imports these three names.

- [ ] **Step 1: Write the failing tests**

Create `test/tools/getJobStatus.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJobStatus } from '../../src/tools/getJobStatus.js';
import type { ExecuteFlowDeps } from '../../src/tools/executeFlow.js';
import * as rosRestClient from '../../src/rosClient/rosRestClient.js';
import type { RosAuthClientLike } from '../../src/rosClient/rosAuthClient.js';
import type { JobDetailResponse } from '../../src/rosClient/types.js';
import { RosAuthError } from '../../src/errors.js';

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

const inProgressJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
  jobId: 98765,
  flowId: 34606,
  flowCode: 'ALTA_SERVICIO_X',
  flowDes: 'Alta de servicio X',
  createUser: 'jyanez',
  statusId: 10,
  statusCode: 'STARTED',
  statusDes: 'En curso',
  entryDate: '2026-09-05T10:00:00Z',
  startDate: '2026-09-05T10:00:05Z',
  items: 120,
  progressPercentage: 40,
  historyDetails: false,
  monitorProcessJob: { item: [{ stepId: 1, actionId: 2, actionCode: 'A', actionDes: 'Action A', statusId: 10, statusCode: 'STARTED', statusDes: 'En curso', items: 48 }] },
  monitorProcessJobHist: { item: [] },
  errorCodeGroup: { errorItem: [{ errorCode: 'ERR1', items: 2, actionId: 2, actionDes: 'Action A', areSubflows: false, isEvaluatorAction: false, errorType: 'BUSINESS' }] },
};

const historicalJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
  jobId: 11111,
  flowId: 34606,
  flowCode: 'ALTA_SERVICIO_X',
  flowDes: 'Alta de servicio X',
  createUser: 'jyanez',
  statusId: 90,
  statusCode: 'FINISHED',
  statusDes: 'Finalizado',
  entryDate: '2026-09-05T09:00:00Z',
  startDate: '2026-09-05T09:00:05Z',
  items: 50,
  progressPercentage: 100,
  historyDetails: true,
  historyJob: { item: [{ histId: 1, statusDate: '2026-09-05T09:00:00Z', modUser: 'system', statusId: 0, statusCode: 'SCHEDULED', statusDes: 'Programado', startDate: '2026-09-05T09:00:05Z' }] },
  // errorCodeGroup and monitorProcessJobHist deliberately absent — ROS never
  // populates them for historyDetails:true jobs.
};

const notFoundJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
};

describe('getJobStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns found:false with an error and never calls authClient/getJobDetail when jobId is not a positive integer', async () => {
    const deps = restDeps();
    const spy = vi.spyOn(rosRestClient, 'getJobDetail');

    for (const badJobId of [0, -5, 1.5]) {
      const result = await getJobStatus(deps, { jobId: badJobId });
      expect(result.found).toBe(false);
      expect(result.error?.message).toMatch(/jobId/);
    }

    expect(deps.authClient.getToken).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('found:true for an in-progress job, mapping all fields including monitorProcessJob/monitorProcessJobHist/errorCodeGroup', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(inProgressJob);

    const result = await getJobStatus(restDeps(), { jobId: 98765 });

    expect(result.found).toBe(true);
    expect(result.jobId).toBe(98765);
    expect(result.statusCode).toBe('STARTED');
    expect(result.progressPercentage).toBe(40);
    expect(result.monitorProcessJob).toEqual(inProgressJob.monitorProcessJob);
    expect(result.monitorProcessJobHist).toEqual(inProgressJob.monitorProcessJobHist);
    expect(result.errorCodeGroup).toEqual(inProgressJob.errorCodeGroup);
  });

  it('found:true for a historical job, leaving errorCodeGroup/monitorProcessJobHist undefined', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(historicalJob);

    const result = await getJobStatus(restDeps(), { jobId: 11111 });

    expect(result.found).toBe(true);
    expect(result.historyDetails).toBe(true);
    expect(result.historyJob).toEqual(historicalJob.historyJob);
    expect(result.errorCodeGroup).toBeUndefined();
    expect(result.monitorProcessJobHist).toBeUndefined();
  });

  it('found:false when ROS returns only responseStatus (job does not exist)', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(notFoundJob);

    const result = await getJobStatus(restDeps(), { jobId: 999999999 });

    expect(result.found).toBe(false);
    expect(result.jobId).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('passes restBaseUrl/token/jobId/timeoutMs through to getJobDetail', async () => {
    const spy = vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(inProgressJob);

    await getJobStatus(restDeps({ restBaseUrl: 'http://ros-rest.local', httpTimeoutMs: 7000 }), { jobId: 98765 });

    expect(spy).toHaveBeenCalledWith('http://ros-rest.local', 'jwt-1', 98765, 7000);
  });

  it('a 401 from getJobDetail retries once with a fresh token and succeeds', async () => {
    const getToken = vi.fn().mockResolvedValueOnce('stale-jwt').mockResolvedValueOnce('fresh-jwt');
    const deps = restDeps({ authClient: { getToken } });

    vi.spyOn(rosRestClient, 'getJobDetail').mockRejectedValueOnce(new RosAuthError('ROS rejected the request (HTTP 401)')).mockResolvedValueOnce(inProgressJob);

    const result = await getJobStatus(deps, { jobId: 98765 });

    expect(result.found).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(rosRestClient.getJobDetail).toHaveBeenCalledTimes(2);
  });

  it('a 401 twice propagates the exception (not swallowed as found:false)', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockRejectedValue(new RosAuthError('ROS rejected the request (HTTP 401)'));

    await expect(getJobStatus(restDeps(), { jobId: 98765 })).rejects.toBeInstanceOf(RosAuthError);
    expect(rosRestClient.getJobDetail).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- getJobStatus.test.ts`
Expected: FAIL — `src/tools/getJobStatus.ts` doesn't exist yet (module not found / TS compile error).

- [ ] **Step 3: Implement `getJobStatus`**

Create `src/tools/getJobStatus.ts`:

```typescript
import { getJobDetail } from '../rosClient/rosRestClient.js';
import type { ExecuteFlowDeps } from './executeFlow.js';
import type { JobDetailResponse } from '../rosClient/types.js';
import { RosAuthError } from '../errors.js';

export interface GetJobStatusInput {
  jobId: number;
}

export interface GetJobStatusResult {
  found: boolean;
  jobId?: number;
  flowId?: number;
  flowCode?: string;
  flowDes?: string;
  filename?: string;
  createUser?: string;
  statusId?: number;
  statusCode?: string;
  statusDes?: string;
  entryDate?: string;
  startDate?: string;
  items?: number;
  progressPercentage?: number;
  historyDetails?: boolean;
  schedulerNotification?: JobDetailResponse['schedulerNotification'];
  monitorProcessJob?: JobDetailResponse['monitorProcessJob'];
  monitorProcessJobHist?: JobDetailResponse['monitorProcessJobHist'];
  historyJob?: JobDetailResponse['historyJob'];
  errorCodeGroup?: JobDetailResponse['errorCodeGroup'];
  error?: { message: string };
}

async function callGetJobDetailWithRetry(restDeps: ExecuteFlowDeps, jobId: number): Promise<JobDetailResponse> {
  const token = await restDeps.authClient.getToken();
  try {
    return await getJobDetail(restDeps.restBaseUrl, token, jobId, restDeps.httpTimeoutMs);
  } catch (err) {
    if (err instanceof RosAuthError) {
      const freshToken = await restDeps.authClient.getToken(true);
      return await getJobDetail(restDeps.restBaseUrl, freshToken, jobId, restDeps.httpTimeoutMs);
    }
    throw err;
  }
}

export async function getJobStatus(restDeps: ExecuteFlowDeps, input: GetJobStatusInput): Promise<GetJobStatusResult> {
  if (!Number.isInteger(input.jobId) || input.jobId <= 0) {
    return { found: false, error: { message: 'jobId must be a positive integer.' } };
  }

  const response = await callGetJobDetailWithRetry(restDeps, input.jobId);

  if (response.statusId === undefined && response.flowId === undefined) {
    return { found: false };
  }

  return {
    found: true,
    jobId: response.jobId,
    flowId: response.flowId,
    flowCode: response.flowCode,
    flowDes: response.flowDes,
    filename: response.filename,
    createUser: response.createUser,
    statusId: response.statusId,
    statusCode: response.statusCode,
    statusDes: response.statusDes,
    entryDate: response.entryDate,
    startDate: response.startDate,
    items: response.items,
    progressPercentage: response.progressPercentage,
    historyDetails: response.historyDetails,
    schedulerNotification: response.schedulerNotification,
    monitorProcessJob: response.monitorProcessJob,
    monitorProcessJobHist: response.monitorProcessJobHist,
    historyJob: response.historyJob,
    errorCodeGroup: response.errorCodeGroup,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- getJobStatus.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/tools/getJobStatus.ts test/tools/getJobStatus.test.ts
git commit -m "feat(tools): add get_job_status wrapping ros-rest GET /jobDetail"
```

---

### Task 3: Register `get_job_status` in `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`

**Interfaces:**
- Consumes: `getJobStatus(restDeps: ExecuteFlowDeps, input: GetJobStatusInput): Promise<GetJobStatusResult>` (Task 2). `RegisterToolsOptions` (`{ enableWrite?: boolean; restDeps?: ExecuteFlowDeps }`, already exists in `src/server.ts`).
- Produces: `registerTools` now also registers an MCP tool named `get_job_status` when `options.enableWrite && options.restDeps` are both truthy.

- [ ] **Step 1: Write the failing tests**

Add to `test/server.test.ts` (below the existing `execute_flow` tests, same `describe('registerTools', ...)` block):

```typescript
it('does NOT register get_job_status when enableWrite is false or omitted', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient());
  expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);

  const server2 = new FakeMcpServer();
  registerTools(server2, fakeClient(), { enableWrite: false });
  expect(server2.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);
});

it('does NOT register get_job_status when enableWrite is true but restDeps is missing', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), { enableWrite: true });
  expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);
});

it('registers get_job_status when enableWrite is true and restDeps is present', () => {
  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), {
    enableWrite: true,
    restDeps: { restBaseUrl: 'http://ros-rest.local', authClient: { getToken: vi.fn() }, auditOrigin: 'ros-ai-mcp', auditUsername: 'jyanez', httpTimeoutMs: 5000 },
  });
  expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(true);
});

it('get_job_status handler returns MCP text content on success', async () => {
  const rosRestClient = await import('../src/rosClient/rosRestClient.js');
  vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue({
    responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
    jobId: 98765,
    flowId: 34606,
    statusId: 90,
    statusCode: 'FINISHED',
  });

  const server = new FakeMcpServer();
  registerTools(server, fakeClient(), {
    enableWrite: true,
    restDeps: { restBaseUrl: 'http://ros-rest.local', authClient: { getToken: vi.fn().mockResolvedValue('jwt-1') }, auditOrigin: 'ros-ai-mcp', auditUsername: 'jyanez', httpTimeoutMs: 5000 },
  });

  const tool = server.registered.find((t) => t.name === 'get_job_status')!;
  const result = await tool.handler({ jobId: 98765 });

  expect(result.isError).toBeFalsy();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed.found).toBe(true);
  expect(parsed.jobId).toBe(98765);

  vi.restoreAllMocks();
});
```

Also update the "registers all Phase-1/2/3 tools" test's expected name list — it must stay unaffected since `get_job_status` is gated and that test calls `registerTools(server, fakeClient())` with no options (so `enableWrite` is falsy and the new tool must NOT appear); no change needed to that test's expected array, but re-read it after Step 3 to confirm it still passes unmodified.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server.test.ts`
Expected: FAIL — `get_job_status` is never registered yet, so the "registers ... when enableWrite is true and restDeps is present" and "handler returns MCP text content" tests fail (tool not found / `undefined.handler`).

- [ ] **Step 3: Register the tool**

In `src/server.ts`, add the import (alongside the other tool imports):

```typescript
import { getJobStatus } from './tools/getJobStatus.js';
```

Add a new gated block after the existing `if (options.enableWrite) { ... }` block that registers `save_action`/`execute_flow` (i.e. as a sibling block, not nested inside it — this one has its own, stricter condition):

```typescript
  if (options.enableWrite && options.restDeps) {
    // Captured into a local const so it narrows to ExecuteFlowDeps (not
    // ExecuteFlowDeps | undefined) inside the handler closure below — an
    // optional property read directly off `options` doesn't stay narrowed
    // across a nested function boundary.
    const restDeps = options.restDeps;
    server.tool(
      'get_job_status',
      "Get the status/progress of a ROS mass-scheduler job (e.g. one created by execute_flow): current status, item progress, per-step monitor counts, status-change history, and error breakdown when available. Returns found:false if the jobId doesn't exist.",
      { jobId: z.number() },
      async (args) => {
        try {
          return ok(await getJobStatus(restDeps, { jobId: args.jobId as number }));
        } catch (err) {
          return fail(err);
        }
      }
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server.test.ts`
Expected: PASS (all existing tests still pass, all new `get_job_status` tests pass).

Then run the full suite once to confirm nothing else broke:

Run: `npm test`
Expected: PASS, all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat(server): register get_job_status behind ROS_MCP_ENABLE_WRITE + restDeps"
```

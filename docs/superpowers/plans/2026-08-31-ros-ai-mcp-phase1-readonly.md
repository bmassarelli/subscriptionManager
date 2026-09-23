# ROS AI MCP Server — Phase 1 (Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only MCP server, `ros-ai-mcp`, that lets Claude Code inspect ThinkSkink ROS (`masros-gui`) Flows, Actions, and Items over HTTP, using 9 verified endpoints, so that "Analiza el Flow 34606" and "Analiza el Item 24378914" work end-to-end without touching Postman/FSearch.

**Architecture:** A brand-new local Node.js + TypeScript repo at `C:\Users\52554\Documents\ros-ai-mcp` (git-initialized, no remote yet). A layered design: `rosClient/` owns HTTP + session-cookie plumbing and knows nothing about MCP; `tools/` are plain async functions (`(client, input) => output`) that call `rosClient` and apply any client-side combination/filtering logic; `server.ts` is the only file that imports `@modelcontextprotocol/sdk` and wires the 9 tool functions to MCP tool registrations. This keeps every tool independently unit-testable with a fake client, with no real HTTP or MCP transport involved in tests.

**Tech Stack:** Node.js ≥18.15 (for `Headers.getSetCookie()`), TypeScript, `@modelcontextprotocol/sdk` + `zod` for MCP tool schemas, `vitest` for tests, native `fetch`/`AbortController` for HTTP (no axios/undici direct dependency needed).

## Global Constraints

- Read-only only. No WRITE endpoint (`saveAction`, `saveFlowDetail`, `updateCommand`, `executeImportFlow`, etc.) may be called from this repo — that is explicitly Phase 5+ and out of scope.
- Never log `ROS_PASSWORD` or the `JSESSIONID` cookie value at any log level.
- Credentials come only from environment variables (`ROS_BASE_URL`, `ROS_USERNAME`, `ROS_PASSWORD`), loaded via `.env` (git-ignored) — never hard-coded, never prompted for in a tool call.
- All outbound HTTP calls must have a timeout (`ROS_HTTP_TIMEOUT_MS`, default 15000ms) — masros-gui DEV/QA is only reachable over Ivanti Secure Access VPN, so hangs are a real failure mode, not a hypothetical.
- Any test/script that hits the real DEV/QA server (`scripts/smoke.ts`) must be gated behind an explicit `RUN_SMOKE_TESTS=true` env var and must never run as part of `npm test` or any automatic CI-style step.
- Every endpoint contract used in this plan is drawn from `C:\Users\52554\Documents\masros\ros5\` source (Java DTOs, JS call sites, or the WSDL/XSD at `ros-web-common/src/main/resources/wsdl/ros_interface-xsd.xsd`) — do not add fields or endpoints beyond what a task's code specifies without re-reading that source first.
- Do not add a 10th tool, a write path, or `execute_flow` in this plan — those are later phases per the user's explicit phased rollout.

---

## File Structure

```
ros-ai-mcp/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  .env.example
  README.md
  src/
    config.ts                 # env var loading/validation
    errors.ts                 # RosError hierarchy
    rosClient/
      httpClient.ts            # timeout-aware fetch wrapper + HTTP status → error mapping
      session.ts               # login (POST /dologin), JSESSIONID cookie storage
      rosClient.ts             # facade: getJson/postJson/postForm with auto-relogin-once
      types.ts                 # RosFlow, FlowInfo, StepOptimistic, SearchRosItem, RosAction, etc.
    tools/
      getFlow.ts
      getFlowSteps.ts
      searchFlows.ts
      searchActions.ts
      getAction.ts
      getActionCommand.ts
      getActionTemplate.ts
      getItemInfo.ts
      searchRosItems.ts
    server.ts                  # registers the 9 tools against an McpServer instance
    index.ts                   # entrypoint: load config, build RosClient, build server, connect stdio
  scripts/
    smoke.ts                   # RUN_SMOKE_TESTS-gated real-DEV/QA check (Flow 34606, Item 24378914)
  test/
    config.test.ts
    errors.test.ts
    rosClient/
      httpClient.test.ts
      session.test.ts
      rosClient.test.ts
    tools/
      getFlow.test.ts
      getFlowSteps.test.ts
      searchFlows.test.ts
      searchActions.test.ts
      getAction.test.ts
      getActionCommand.test.ts
      getActionTemplate.test.ts
      getItemInfo.test.ts
      searchRosItems.test.ts
    server.test.ts
```

Each `tools/*.ts` file takes a `RosClientLike` (an interface, not the concrete `RosClient`) as its first argument, so tests inject a fake client and never touch real HTTP, sessions, or timeouts.

---

### Task 1: Scaffold the repo

**Files:**
- Create: `C:\Users\52554\Documents\ros-ai-mcp\package.json`
- Create: `C:\Users\52554\Documents\ros-ai-mcp\tsconfig.json`
- Create: `C:\Users\52554\Documents\ros-ai-mcp\vitest.config.ts`
- Create: `C:\Users\52554\Documents\ros-ai-mcp\.gitignore`
- Create: `C:\Users\52554\Documents\ros-ai-mcp\.env.example`
- Create: `C:\Users\52554\Documents\ros-ai-mcp\README.md`

**Interfaces:**
- Produces: an `npm test` command that runs vitest, an `npm run build` command that runs `tsc`, and a `npm run dev` command that runs `src/index.ts` via `tsx`. All later tasks assume these three scripts exist.

- [ ] **Step 1: Create the directory and initialize git**

```bash
mkdir -p "C:\Users\52554\Documents\ros-ai-mcp\src\rosClient" "C:\Users\52554\Documents\ros-ai-mcp\src\tools" "C:\Users\52554\Documents\ros-ai-mcp\scripts" "C:\Users\52554\Documents\ros-ai-mcp\test\rosClient" "C:\Users\52554\Documents\ros-ai-mcp\test\tools"
cd "C:\Users\52554\Documents\ros-ai-mcp"
git init
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "ros-ai-mcp",
  "version": "0.1.0",
  "private": true,
  "description": "Read-only MCP server for ThinkSkink ROS (masros-gui)",
  "type": "module",
  "engines": {
    "node": ">=18.15.0"
  },
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "smoke": "tsx scripts/smoke.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 6: Write `.env.example`**

```
ROS_BASE_URL=http://172.19.91.145:8081/masros-gui
ROS_USERNAME=
ROS_PASSWORD=
ROS_HTTP_TIMEOUT_MS=15000
RUN_SMOKE_TESTS=false
ROS_SMOKE_FLOW_ID=34606
ROS_SMOKE_ITEM_ID=24378914
```

- [ ] **Step 7: Write `README.md`**

```markdown
# ros-ai-mcp

Read-only MCP server exposing ThinkSkink ROS (`masros-gui`) Flows, Actions,
and Items to Claude Code.

## Setup

1. Copy `.env.example` to `.env` and fill in `ROS_USERNAME`/`ROS_PASSWORD`.
   `ROS_BASE_URL` defaults to the DEV/QA `masros-gui` — you must be connected
   to the Ivanti Secure Access VPN for requests to succeed.
2. `npm install`
3. `npm test` — runs the full unit test suite (no VPN/network required; all
   HTTP is mocked).
4. `npm run build && npm run dev` — starts the MCP server over stdio.

## Smoke-testing against real DEV/QA

`npm run smoke` exercises the two MVP checks (`get_flow` on
`ROS_SMOKE_FLOW_ID`, `get_item_info` on `ROS_SMOKE_ITEM_ID`) against the real
server. It only runs when `RUN_SMOKE_TESTS=true` is set, and requires the VPN
to be connected — it is never run as part of `npm test`.

## Registering with Claude Code

See the "Registering with Claude Code" section of the implementation plan
(`docs/superpowers/plans/2026-08-31-ros-ai-mcp-phase1-readonly.md` in the
`ts-skills-1` repo) for the `claude mcp add` command.

## Scope

Phase 1 only: 9 read-only tools (`search_flows`, `get_flow`, `get_flow_steps`,
`search_actions`, `get_action`, `get_action_command`, `get_action_template`,
`get_item_info`, `search_ros_items`). No write operations, no `execute_flow`.
```

- [ ] **Step 8: Install dependencies**

```bash
cd "C:\Users\52554\Documents\ros-ai-mcp"
npm install
```

Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example README.md
git commit -m "chore: scaffold ros-ai-mcp repo"
```

---

### Task 2: Config loader

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces: `interface RosConfig { baseUrl: string; username: string; password: string; httpTimeoutMs: number }`, `class ConfigError extends Error`, `function loadRosConfig(env?: NodeJS.ProcessEnv): RosConfig`. All later tasks that need config call `loadRosConfig()`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/config.test.ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadRosConfig } from '../src/config.js';

const validEnv = {
  ROS_BASE_URL: 'http://172.19.91.145:8081/masros-gui/',
  ROS_USERNAME: 'jyanez',
  ROS_PASSWORD: 'secret',
};

describe('loadRosConfig', () => {
  it('loads and strips a trailing slash from baseUrl', () => {
    const config = loadRosConfig(validEnv);
    expect(config).toEqual({
      baseUrl: 'http://172.19.91.145:8081/masros-gui',
      username: 'jyanez',
      password: 'secret',
      httpTimeoutMs: 15000,
    });
  });

  it('uses ROS_HTTP_TIMEOUT_MS when provided', () => {
    const config = loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '5000' });
    expect(config.httpTimeoutMs).toBe(5000);
  });

  it('throws ConfigError when ROS_BASE_URL is missing', () => {
    const { ROS_BASE_URL, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_USERNAME is missing', () => {
    const { ROS_USERNAME, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_PASSWORD is missing', () => {
    const { ROS_PASSWORD, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_HTTP_TIMEOUT_MS is not a positive number', () => {
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: 'abc' })).toThrow(ConfigError);
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '0' })).toThrow(ConfigError);
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '-5' })).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config.test.ts`
Expected: FAIL — `src/config.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/config.ts
export interface RosConfig {
  baseUrl: string;
  username: string;
  password: string;
  httpTimeoutMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadRosConfig(env: Record<string, string | undefined> = process.env): RosConfig {
  const baseUrl = env.ROS_BASE_URL;
  const username = env.ROS_USERNAME;
  const password = env.ROS_PASSWORD;

  if (!baseUrl) throw new ConfigError('ROS_BASE_URL is required');
  if (!username) throw new ConfigError('ROS_USERNAME is required');
  if (!password) throw new ConfigError('ROS_PASSWORD is required');

  const timeoutRaw = env.ROS_HTTP_TIMEOUT_MS;
  const httpTimeoutMs = timeoutRaw === undefined ? 15000 : Number(timeoutRaw);
  if (!Number.isFinite(httpTimeoutMs) || httpTimeoutMs <= 0) {
    throw new ConfigError('ROS_HTTP_TIMEOUT_MS must be a positive number');
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    username,
    password,
    httpTimeoutMs,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: add ROS config loader"
```

---

### Task 3: Error hierarchy

**Files:**
- Create: `src/errors.ts`
- Test: `test/errors.test.ts`

**Interfaces:**
- Produces: `class RosError extends Error`, `class RosAuthError extends RosError`, `class RosNotFoundError extends RosError`, `class RosServerError extends RosError` (with `status: number`), `class RosTimeoutError extends RosError`, `class RosUnexpectedResponseError extends RosError` (with `body: string`). `src/rosClient/httpClient.ts` (Task 4) and `src/rosClient/rosClient.ts` (Task 6) throw these.

- [ ] **Step 1: Write the failing test**

```typescript
// test/errors.test.ts
import { describe, expect, it } from 'vitest';
import {
  RosAuthError,
  RosError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../src/errors.js';

describe('RosError hierarchy', () => {
  it('RosAuthError is a RosError with the right name and message', () => {
    const err = new RosAuthError('bad credentials');
    expect(err).toBeInstanceOf(RosError);
    expect(err.name).toBe('RosAuthError');
    expect(err.message).toBe('bad credentials');
  });

  it('RosNotFoundError is a RosError', () => {
    expect(new RosNotFoundError('flow 999 not found')).toBeInstanceOf(RosError);
  });

  it('RosServerError carries the HTTP status', () => {
    const err = new RosServerError('boom', 503);
    expect(err).toBeInstanceOf(RosError);
    expect(err.status).toBe(503);
  });

  it('RosTimeoutError is a RosError', () => {
    expect(new RosTimeoutError('timed out')).toBeInstanceOf(RosError);
  });

  it('RosUnexpectedResponseError carries the raw response body', () => {
    const err = new RosUnexpectedResponseError('not JSON', '<html>login</html>');
    expect(err).toBeInstanceOf(RosError);
    expect(err.body).toBe('<html>login</html>');
  });

  it('preserves an optional cause', () => {
    const cause = new Error('network down');
    const err = new RosServerError('boom', 0, cause);
    expect(err.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- errors.test.ts`
Expected: FAIL — `src/errors.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/errors.ts
export class RosError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

export class RosAuthError extends RosError {}

export class RosNotFoundError extends RosError {}

export class RosServerError extends RosError {
  constructor(message: string, public readonly status: number, cause?: unknown) {
    super(message, cause);
  }
}

export class RosTimeoutError extends RosError {}

export class RosUnexpectedResponseError extends RosError {
  constructor(message: string, public readonly body: string, cause?: unknown) {
    super(message, cause);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- errors.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "feat: add RosError hierarchy"
```

---

### Task 4: Low-level HTTP client

**Files:**
- Create: `src/rosClient/httpClient.ts`
- Test: `test/rosClient/httpClient.test.ts`

**Interfaces:**
- Consumes: `RosTimeoutError`, `RosServerError`, `RosAuthError`, `RosNotFoundError`, `RosUnexpectedResponseError` from `../errors.js` (Task 3).
- Produces: `interface RawResponse { status: number; headers: Headers; text: string }`, `function rawRequest(url: string, init: RequestInit, timeoutMs: number): Promise<RawResponse>`, `function mapHttpError(url: string, status: number, text: string): RosError`. Consumed by `src/rosClient/session.ts` (Task 5) and `src/rosClient/rosClient.ts` (Task 6).

- [ ] **Step 1: Write the failing test**

```typescript
// test/rosClient/httpClient.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapHttpError, rawRequest } from '../../src/rosClient/httpClient.js';
import {
  RosAuthError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../../src/errors.js';

describe('rawRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns status, headers, and text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'x-test': '1' } }))
    );

    const result = await rawRequest('http://ros.local/getFlowInfo', { method: 'GET' }, 1000);

    expect(result.status).toBe(200);
    expect(result.text).toBe('{"ok":true}');
    expect(result.headers.get('x-test')).toBe('1');
  });

  it('throws RosTimeoutError when the request is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      )
    );

    await expect(rawRequest('http://ros.local/slow', { method: 'GET' }, 20)).rejects.toBeInstanceOf(
      RosTimeoutError
    );
  });

  it('throws RosServerError with status 0 when fetch fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const error = await rawRequest('http://ros.local/unreachable', { method: 'GET' }, 1000).catch((e) => e);
    expect(error).toBeInstanceOf(RosServerError);
    expect((error as RosServerError).status).toBe(0);
  });
});

describe('mapHttpError', () => {
  it('maps 401 and 403 to RosAuthError', () => {
    expect(mapHttpError('http://x', 401, '')).toBeInstanceOf(RosAuthError);
    expect(mapHttpError('http://x', 403, '')).toBeInstanceOf(RosAuthError);
  });

  it('maps 404 to RosNotFoundError', () => {
    expect(mapHttpError('http://x', 404, '')).toBeInstanceOf(RosNotFoundError);
  });

  it('maps 5xx to RosServerError with the status attached', () => {
    const error = mapHttpError('http://x', 503, 'boom') as RosServerError;
    expect(error).toBeInstanceOf(RosServerError);
    expect(error.status).toBe(503);
  });

  it('maps other non-2xx statuses to RosUnexpectedResponseError', () => {
    expect(mapHttpError('http://x', 418, 'teapot')).toBeInstanceOf(RosUnexpectedResponseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- httpClient.test.ts`
Expected: FAIL — `src/rosClient/httpClient.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/rosClient/httpClient.ts
import {
  RosAuthError,
  RosError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../errors.js';

export interface RawResponse {
  status: number;
  headers: Headers;
  text: string;
}

export async function rawRequest(url: string, init: RequestInit, timeoutMs: number): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new RosTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`, err);
    }
    throw new RosServerError(`Failed to reach ${url}: ${(err as Error).message}`, 0, err);
  } finally {
    clearTimeout(timer);
  }
}

export function mapHttpError(url: string, status: number, text: string): RosError {
  if (status === 401 || status === 403) {
    return new RosAuthError(`ROS rejected the request to ${url} (HTTP ${status})`);
  }
  if (status === 404) {
    return new RosNotFoundError(`ROS returned 404 for ${url}`);
  }
  if (status >= 500) {
    return new RosServerError(`ROS returned HTTP ${status} for ${url}`, status);
  }
  return new RosUnexpectedResponseError(`ROS returned unexpected HTTP ${status} for ${url}`, text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- httpClient.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/httpClient.ts test/rosClient/httpClient.test.ts
git commit -m "feat: add timeout-aware HTTP client with error mapping"
```

---

### Task 5: Session manager (login + cookie)

**Files:**
- Create: `src/rosClient/session.ts`
- Test: `test/rosClient/session.test.ts`

**Interfaces:**
- Consumes: `rawRequest` from `./httpClient.js` (Task 4), `RosAuthError` from `../errors.js` (Task 3).
- Produces: `interface SessionLike { hasSession(): boolean; getCookie(): string | null; clear(): void; login(): Promise<void> }`, `class SessionManager implements SessionLike`, `function extractJsessionId(headers: Headers): string | null`. Consumed by `src/rosClient/rosClient.ts` (Task 6).

**Verified contract:** `POST /dologin` (root-relative to `ROS_BASE_URL`, so full path is `${baseUrl}/dologin`), form-encoded body `username=...&password=...`, session returned via a `Set-Cookie: JSESSIONID=...` header — masros-gui has no Spring Security and sets no distinct HTTP status for a failed login, so "no `JSESSIONID` in the response" is the only reliable failure signal.

- [ ] **Step 1: Write the failing test**

```typescript
// test/rosClient/session.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { extractJsessionId, SessionManager } from '../../src/rosClient/session.js';
import { RosAuthError } from '../../src/errors.js';

describe('extractJsessionId', () => {
  it('finds JSESSIONID among multiple set-cookie values', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'OTHERCOOKIE=abc; Path=/');
    headers.append('set-cookie', 'JSESSIONID=xyz123; Path=/; HttpOnly');
    expect(extractJsessionId(headers)).toBe('JSESSIONID=xyz123');
  });

  it('returns null when no JSESSIONID cookie is present', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'OTHERCOOKIE=abc; Path=/');
    expect(extractJsessionId(headers)).toBeNull();
  });

  it('returns null when there are no set-cookie headers at all', () => {
    expect(extractJsessionId(new Headers())).toBeNull();
  });
});

describe('SessionManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the JSESSIONID cookie after a successful login', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/masros-gui; HttpOnly');
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'secret', 1000);
    expect(session.hasSession()).toBe(false);

    await session.login();

    expect(session.hasSession()).toBe(true);
    expect(session.getCookie()).toBe('JSESSIONID=abc123');
  });

  it('sends username/password form-encoded to /dologin', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/');
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'p@ss w/ord', 1000);
    await session.login();

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/dologin',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=jyanez&password=p%40ss+w%2Ford',
      }),
      1000
    );
  });

  it('throws RosAuthError when no JSESSIONID cookie comes back', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: '<html/>' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'wrong', 1000);
    await expect(session.login()).rejects.toBeInstanceOf(RosAuthError);
    expect(session.hasSession()).toBe(false);
  });

  it('clear() drops the stored cookie', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/');
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'secret', 1000);
    await session.login();
    session.clear();

    expect(session.hasSession()).toBe(false);
    expect(session.getCookie()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session.test.ts`
Expected: FAIL — `src/rosClient/session.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/rosClient/session.ts
import { rawRequest } from './httpClient.js';
import { RosAuthError } from '../errors.js';

export interface SessionLike {
  hasSession(): boolean;
  getCookie(): string | null;
  clear(): void;
  login(): Promise<void>;
}

export function extractJsessionId(headers: Headers): string | null {
  const setCookieValues =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const value of setCookieValues) {
    const match = value.match(/^JSESSIONID=[^;]+/);
    if (match) return match[0];
  }
  return null;
}

export class SessionManager implements SessionLike {
  private cookie: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly timeoutMs: number
  ) {}

  hasSession(): boolean {
    return this.cookie !== null;
  }

  getCookie(): string | null {
    return this.cookie;
  }

  clear(): void {
    this.cookie = null;
  }

  async login(): Promise<void> {
    const url = `${this.baseUrl}/dologin`;
    const body = new URLSearchParams({ username: this.username, password: this.password }).toString();

    const response = await rawRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      this.timeoutMs
    );

    const jsessionId = extractJsessionId(response.headers);
    if (!jsessionId) {
      throw new RosAuthError('Login to ROS did not return a JSESSIONID cookie — check ROS_USERNAME/ROS_PASSWORD');
    }
    this.cookie = jsessionId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/session.ts test/rosClient/session.test.ts
git commit -m "feat: add ROS session manager with dologin cookie handling"
```

---

### Task 6: RosClient facade

**Files:**
- Create: `src/rosClient/rosClient.ts`
- Test: `test/rosClient/rosClient.test.ts`

**Interfaces:**
- Consumes: `rawRequest`, `mapHttpError` from `./httpClient.js` (Task 4); `SessionLike`, `SessionManager` from `./session.js` (Task 5); `RosConfig` from `../config.js` (Task 2); `RosUnexpectedResponseError` from `../errors.js` (Task 3).
- Produces: `interface RosClientLike { getJson<T>(path: string, query?: Record<string, string | number>): Promise<T>; postJson<T>(path: string, body: unknown): Promise<T>; postForm<T>(path: string, form: Record<string, string | number>): Promise<T> }`, `class RosClient implements RosClientLike`. Every tool in Tasks 8–16 takes a `RosClientLike` as its first argument.

**Behavior:** logs in lazily on first use; if a response body looks like the masros-gui login HTML page (session expired), clears the session, re-logs-in, and retries the same request exactly once before giving up.

- [ ] **Step 1: Write the failing test**

```typescript
// test/rosClient/rosClient.test.ts
import { describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { RosClient } from '../../src/rosClient/rosClient.js';
import type { SessionLike } from '../../src/rosClient/session.js';
import { RosNotFoundError, RosServerError, RosUnexpectedResponseError } from '../../src/errors.js';
import type { RosConfig } from '../../src/config.js';

const config: RosConfig = {
  baseUrl: 'http://ros.local/masros-gui',
  username: 'jyanez',
  password: 'secret',
  httpTimeoutMs: 1000,
};

class FakeSession implements SessionLike {
  cookie: string | null = null;
  loginCalls = 0;

  hasSession(): boolean {
    return this.cookie !== null;
  }
  getCookie(): string | null {
    return this.cookie;
  }
  clear(): void {
    this.cookie = null;
  }
  async login(): Promise<void> {
    this.loginCalls += 1;
    this.cookie = `JSESSIONID=session-${this.loginCalls}`;
  }
}

function jsonResponse(status: number, data: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(data) };
}

describe('RosClient', () => {
  it('logs in before the first request when no session exists', async () => {
    const session = new FakeSession();
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: { flowId: 34606 } }));

    const client = new RosClient(config, session);
    await client.getJson('/getFlowInfo', { flowId: 34606 });

    expect(session.loginCalls).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getFlowInfo?flowId=34606',
      expect.objectContaining({ method: 'GET', headers: { Cookie: 'JSESSIONID=session-1' } }),
      1000
    );
  });

  it('does not log in again when a session already exists', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.getJson('/getAllFlowInfo');

    expect(session.loginCalls).toBe(1);
  });

  it('postJson sends a JSON body with the right content-type', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.postJson('/getRosActions', { actionType: ['ACTION'] });

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getRosActions',
      expect.objectContaining({
        method: 'POST',
        headers: { Cookie: 'JSESSIONID=session-1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: ['ACTION'] }),
      }),
      1000
    );
  });

  it('postForm sends a form-encoded body with the right content-type', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.postForm('/getFlowStepInfo', { flowId: 34606 });

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getFlowStepInfo',
      expect.objectContaining({
        method: 'POST',
        headers: { Cookie: 'JSESSIONID=session-1', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'flowId=34606',
      }),
      1000
    );
  });

  it('re-logs-in once and retries when the response looks like the login page', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce({ status: 200, headers: new Headers(), text: '<form action="/dologin"><input name="password"/></form>' })
      .mockResolvedValueOnce(jsonResponse(200, { requestData: { flowId: 34606 } }));

    const client = new RosClient(config, session);
    const result = await client.getJson<{ requestData: { flowId: number } }>('/getFlowInfo', { flowId: 34606 });

    expect(session.loginCalls).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.requestData.flowId).toBe(34606);
  });

  it('throws RosUnexpectedResponseError if the login page keeps coming back after retry', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: '<form action="/dologin"><input name="password"/></form>',
    });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
    expect(session.loginCalls).toBe(2);
  });

  it('throws RosNotFoundError on a 404', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 404, headers: new Headers(), text: '' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 999999 })).rejects.toBeInstanceOf(RosNotFoundError);
  });

  it('throws RosServerError on a 500', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosServerError);
  });

  it('throws RosUnexpectedResponseError when the body is not valid JSON', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: 'not json at all' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rosClient.test.ts`
Expected: FAIL — `src/rosClient/rosClient.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/rosClient/rosClient.ts
import { mapHttpError, rawRequest } from './httpClient.js';
import { SessionLike, SessionManager } from './session.js';
import type { RosConfig } from '../config.js';
import { RosUnexpectedResponseError } from '../errors.js';

export interface RosClientLike {
  getJson<T>(path: string, query?: Record<string, string | number>): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  postForm<T>(path: string, form: Record<string, string | number>): Promise<T>;
}

interface RequestOptions {
  query?: Record<string, string | number>;
  jsonBody?: unknown;
  formBody?: Record<string, string | number>;
}

export class RosClient implements RosClientLike {
  private readonly session: SessionLike;

  constructor(
    private readonly config: RosConfig,
    session?: SessionLike
  ) {
    this.session = session ?? new SessionManager(config.baseUrl, config.username, config.password, config.httpTimeoutMs);
  }

  async getJson<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { jsonBody: body });
  }

  async postForm<T>(path: string, form: Record<string, string | number>): Promise<T> {
    return this.request<T>('POST', path, { formBody: form });
  }

  private async request<T>(method: 'GET' | 'POST', path: string, opts: RequestOptions): Promise<T> {
    if (!this.session.hasSession()) {
      await this.session.login();
    }
    const text = await this.attempt(method, path, opts, false);
    return this.parseJson<T>(text, path);
  }

  private async attempt(method: 'GET' | 'POST', path: string, opts: RequestOptions, isRetry: boolean): Promise<string> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = { Cookie: this.session.getCookie() ?? '' };
    let body: string | undefined;

    if (opts.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.jsonBody);
    } else if (opts.formBody !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(
        Object.fromEntries(Object.entries(opts.formBody).map(([key, value]) => [key, String(value)]))
      ).toString();
    }

    const response = await rawRequest(url, { method, headers, body }, this.config.httpTimeoutMs);

    if (looksLikeLoginPage(response.text) && !isRetry) {
      this.session.clear();
      await this.session.login();
      return this.attempt(method, path, opts, true);
    }

    if (response.status < 200 || response.status >= 300) {
      throw mapHttpError(url, response.status, response.text);
    }

    return response.text;
  }

  private buildUrl(path: string, query?: Record<string, string | number>): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private parseJson<T>(text: string, path: string): T {
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new RosUnexpectedResponseError(`Expected JSON from ${path} but could not parse the response`, text, err);
    }
  }
}

function looksLikeLoginPage(text: string): boolean {
  return /action=["']?\/?dologin/i.test(text) || /name=["']?password["']?/i.test(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rosClient.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/rosClient/rosClient.ts test/rosClient/rosClient.test.ts
git commit -m "feat: add RosClient facade with auto-relogin-once on expired session"
```

---

### Task 7: Domain types

**Files:**
- Create: `src/rosClient/types.ts`

**Interfaces:**
- Produces every DTO type used by Tasks 8–16: `RequestPaginationData<T>`, `RosFlow`, `RosFlowNotification`, `RosFlowRouting`, `FlowGroup`, `RosSchemaData`, `RosFlowActionError`, `RosAction`, `RosActionHist`, `Business`, `RosFlowOnErrorDto`, `FlowInfo`, `StepOptimistic`, `UserFlowSummary`, `ActionDBConfig`, `ItemAlert`, `StepData`, `SearchRosItemParam`, `SearchRosItem`, `StepDataExtraDetailEntry`.

No test file for this task — it is pure type declarations with no runtime behavior. The task is verified by `tsc --noEmit` succeeding once Task 8 imports it.

- [ ] **Step 1: Write `src/rosClient/types.ts`**

```typescript
// src/rosClient/types.ts

// Generic envelope every masros-gui @ResponseBody controller wraps its payload in.
export interface RequestPaginationData<T> {
  requestData: T;
  resultSize?: number;
  pageSize?: number;
  pageNumber?: number;
  from?: number;
  to?: number;
  successMessage?: string;
  errorMessage?: string;
  responseStatus?: number;
  redirect?: string;
}

export interface RosFlow {
  flowId: number;
  flowCode: string;
  flowDes: string;
  priority: number;
  activeFlag: string;
  massFlag: string;
  rosFlag: string;
  inMemoryFlag: string;
  dbReprocessFlag: string;
  syncBy: string;
  version: number;
  modDate: string;
  userName: string;
  eagerFlag: string;
}

export interface RosFlowNotification {
  notificationId: number;
  flowId: number;
  email: string;
  version: number;
  modDate: string;
  userName: string;
}

export interface RosFlowRouting {
  routingId: number;
  flowId: number;
  httpMethod: string;
  urlExp: string;
  version: number;
  modDate: string;
  userName: string;
  domain: string;
  authorizationType: string;
  httpResponseSuccess: string;
  httpResponseError: string;
  soapHeaderReqProperty: string | null;
  soapHeaderResProperty: string | null;
  soapBodyReqProperty: string | null;
  soapBodyResProperty: string | null;
  soapHeaderReqNamespace: string | null;
  soapHeaderResNamespace: string | null;
  soapBodyReqNamespace: string | null;
  soapBodyResNamespace: string | null;
}

export interface FlowGroup {
  flowGroupId: number;
  name: string;
  flowGroupCode: string;
  flowGroupDes: string;
}

export interface RosSchemaData {
  rosSchemaDataId: number;
  schemaId: number;
  seqno: number;
  property: string;
  propertyType: string;
  refSchemaId: number | null;
  description: string | null;
  required: string | null;
  version: number;
  modDate: string;
  userName: string;
  examplePropertyValue: string | null;
  format: string | null;
}

export interface RosFlowActionError {
  flowId: number;
  actionId: number;
  version: number;
  modDate: string;
  userName: string;
}

export interface RosAction {
  actionId: number;
  actionCode: string;
  actionDes: string;
  syncBy: string;
  workerClass: string;
  command: string;
  actionType: string;
  commandType: string;
  domain: string;
  protocol: string;
  method: string;
  contentType: string;
  version: number;
  modDate: string;
  userName: string;
  eager: string;
  hash: string;
  actionYmlConfig: Record<string, unknown>;
}

export interface RosActionHist extends RosAction {
  histId: number;
}

export interface Business {
  owner: string;
  manager: string;
  name: string;
  etomProcessId: string;
  etomProcessName: string;
  purpose: string;
}

export interface RosFlowOnErrorDto {
  actionId: number | null;
  force: boolean | null;
}

export interface FlowInfo {
  flow: RosFlow;
  flowNotification: RosFlowNotification | null;
  allAvailableRoutes: RosFlowRouting[];
  availableFlowGroup: FlowGroup[];
  selectFlowGroup: FlowGroup[];
  allFlowSchemaDatasPath: Record<string, RosSchemaData>;
  flowActionError: RosFlowActionError | null;
  actionErrorDetail: RosAction | null;
  businessInfo: Business | null;
  isInMemory: boolean;
  jobProcessedAction: number | null;
  jobFinishedAction: number | null;
  onCancelAction: RosFlowOnErrorDto;
  onCancelAllAction: RosFlowOnErrorDto;
  description: string | null;
}

export interface StepOptimistic {
  flowId: number;
  stepId: number;
  parentStepId: number;
  actionId: number;
  flowActionDes: string;
  action: RosAction;
  preActionId: number | null;
  preAction: RosAction | null;
  flow: RosFlow | null;
  multiplyArrProp: string | null;
  decisionCriteria: string | null;
  decision: string | null;
  version: number;
  modDate: string;
  userName: string;
  bypass: string;
  switchPropertyPath: string | null;
  sizeRos: string;
  sizeMass: string;
  syncStep: string;
  modDateYmls: number | null;
  ymlConfig: unknown;
  alerts: unknown;
}

// requestData shape of POST /getUserFlows — used by search_flows.
export interface UserFlowSummary {
  flowId: number;
  flowCode: string;
  flowDes: string;
  priority: number;
  activeFlag: string;
  massFlag: string;
  rosFlag: string;
  syncBy: string;
  inMemoryFlag: string;
  dbReprocessFlag: string;
  permisionLevelCode: string;
  routings?: string;
}

// GET /actionDBConfig/{actionId} — has no envelope, no pagination fields.
export interface ActionDBConfig {
  version: number;
  modDate: string;
  userName: string;
  config: Record<
    string,
    {
      SYSTEM?: string;
      READ_TIMEOUT?: number;
      CONNECT_TIMEOUT?: number;
      DESCRIPTION?: string;
      REST_HEADERS?: Record<string, string>;
      KPI?: unknown;
      CIRCUIT_BREAKER_CONFIG?: unknown;
      TOPIC_KEY?: string;
    }
  >;
}

// GET /actionTemplate/{commandType} — has no envelope either.
export interface ActionTemplateResponse {
  availableCodes: Array<{
    key: string;
    label: string;
    value: string;
    methodToInvoke: string;
  }>;
}

export interface ItemAlert {
  hasNotErrorParser: boolean;
  retries: number;
  process: string;
  notify: number;
  countAlerts: number;
}

export interface StepData {
  stepId: number;
  statusCode: string;
  statusDes: string;
  statusDate: string;
  transactionDate: string | null;
  startDateWorker: string | null;
  endDate: string | null;
  previousStepId: number | null;
  actionElapsedMillis: number | null;
  alerts: ItemAlert | null;
  workerInstance: string | null;
  actionVersion: number | null;
}

export interface SearchRosItemParam {
  seqId: number;
  stepId: number | null;
  actionId: number | null;
  actionCode: string | null;
  actionDes: string | null;
  rosSchemaDataId: number | null;
  schemaId: number | null;
  propertyPath: string | null;
  propertyValueType: number | null;
  propertyValueDate: string | null;
  propertyValueString: string | null;
  propertyValueClob: string | null;
  propertyValueNumber: number | null;
  propertyValueBoolean: boolean | null;
  propertyValueId: number | null;
  entryDate: string | null;
}

export interface SearchRosItem {
  itemId: string;
  rootItemId: number | null;
  executionDate: string;
  futureExecution: boolean;
  statusDate: string;
  actionId: number | null;
  actionCode: string;
  actionDes: string;
  actionCustomDes: string | null;
  flowId: number;
  flowCode: string;
  flowDes: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  statusSublevelsCode: string | null;
  origin: string | null;
  stepId: number;
  historyDetails: boolean | null;
  orderno: string | null;
  externalId: string | null;
  externalType: string | null;
  customerId: string | null;
  coId: string | null;
  actionType: string;
  recVersion: number;
  retriesLeft: number | null;
  retries: number | null;
  reasonId: number | null;
  reasonCode: string | null;
  reasonDesc: string | null;
  stepComment: string | null;
  schedulerId: number | null;
  priority: number | null;
  userName: string | null;
  newCustomerId: string | null;
  newCoId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errConfId: number | null;
  errActionId: number | null;
  errActionStatusId: number | null;
  rfsVersion: number | null;
  listRosItemParam: { itemParam: SearchRosItemParam[] } | null;
  splitItemId: number | null;
  histSteps: { step: StepData[] } | null;
  messageId: string | null;
  processTransaction: number | null;
  transactionDate: string | null;
  errActionCode: string | null;
  errActionDes: string | null;
  circuitBreakerStatus: string | null;
  itemType: string | null;
  expiryDate: string | null;
  transferredFrom: string | null;
  transferredTo: string | null;
  groupMembers?: unknown;
  cloneMembers?: unknown;
  parentMembers?: unknown;
  subprocessMembers?: unknown;
  splitMembers?: unknown;
  staticParams?: unknown;
  deepStatusLevelList?: unknown;
  deepStatusLevelIndependentList?: unknown;
  flowItem?: unknown;
}

// requestData entry shape of POST /getStepDataExtraDetails with searchInMemory:true
// (the Elasticsearch branch — the only branch this MCP server uses; see the DB
// branch's different field set and opposite sort order in the implementation plan
// if that branch is ever added later).
export interface StepDataExtraDetailEntry {
  STEP_ID: number;
  ACTION_DES: string;
  STATUS_ID: number;
  STATUS_DATE: string;
  TRANSACTION_DATE: string | null;
  REC_VERSION: number;
  RETRIES: number | null;
  WORKER_INSTANCE: string | null;
  ERROR_MESSAGE: string | null;
  PREV_ACTION_ID: number | null;
  PREV_STEP_ID: number | null;
  PREV_ACTION_ELAPSED_MILLIS: number | null;
  PROCESS_TRANSACTION: number | null;
  EXPIRY_DATE: string | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (this file has no other dependents yet, so this just checks the file is syntactically and structurally valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add src/rosClient/types.ts
git commit -m "feat: add ROS domain DTO types"
```

---

### Task 8: `get_flow` tool

**Files:**
- Create: `src/tools/getFlow.ts`
- Test: `test/tools/getFlow.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` from `../rosClient/rosClient.js` (Task 6); `FlowInfo`, `RequestPaginationData` from `../rosClient/types.js` (Task 7).
- Produces: `interface GetFlowInput { flowId: number }`, `function getFlow(client: RosClientLike, input: GetFlowInput): Promise<FlowInfo>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** `GET /getFlowInfo?flowId=` → `RequestPaginationData<FlowInfo>`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getFlow.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getFlow } from '../../src/tools/getFlow.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RequestPaginationData } from '../../src/rosClient/types.js';

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

describe('getFlow', () => {
  it('requests /getFlowInfo with the given flowId and returns requestData', async () => {
    const client = fakeClient((path, query) => {
      expect(path).toBe('/getFlowInfo');
      expect(query).toEqual({ flowId: 34606 });
      return { requestData: flowInfoFixture } satisfies RequestPaginationData<FlowInfo>;
    });

    const result = await getFlow(client, { flowId: 34606 });

    expect(result).toEqual(flowInfoFixture);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getFlow.test.ts`
Expected: FAIL — `src/tools/getFlow.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getFlow.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { FlowInfo, RequestPaginationData } from '../rosClient/types.js';

export interface GetFlowInput {
  flowId: number;
}

export async function getFlow(client: RosClientLike, input: GetFlowInput): Promise<FlowInfo> {
  const response = await client.getJson<RequestPaginationData<FlowInfo>>('/getFlowInfo', { flowId: input.flowId });
  return response.requestData;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getFlow.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getFlow.ts test/tools/getFlow.test.ts
git commit -m "feat: add get_flow tool"
```

---

### Task 9: `get_flow_steps` tool

**Files:**
- Create: `src/tools/getFlowSteps.ts`
- Test: `test/tools/getFlowSteps.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `StepOptimistic`, `RequestPaginationData` (Task 7).
- Produces: `interface GetFlowStepsInput { flowId: number; rfsVersion?: number }`, `function getFlowSteps(client: RosClientLike, input: GetFlowStepsInput): Promise<StepOptimistic[]>`. Consumed by `src/server.ts` (Task 17) and `src/tools/getItemInfo.ts` (Task 15, for stepId→action name mapping).

**Verified contract:** `POST /getFlowStepInfo`, form-encoded (`flowId`, optional `rfsVersion`) → `RequestPaginationData<StepOptimistic[]>`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getFlowSteps.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getFlowSteps } from '../../src/tools/getFlowSteps.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAction, StepOptimistic } from '../../src/rosClient/types.js';

function fakeClient(postFormImpl: (path: string, form: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(postFormImpl) as RosClientLike['postForm'],
  };
}

const action: RosAction = {
  actionId: 1,
  actionCode: 'VALIDATE_REQUEST',
  actionDes: 'Validate request',
  syncBy: 'admin',
  workerClass: 'GroovyWorker',
  command: 'return true',
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
  hash: 'abc',
  actionYmlConfig: {},
};

const step: StepOptimistic = {
  flowId: 34606,
  stepId: 1,
  parentStepId: 0,
  actionId: 1,
  flowActionDes: 'Validate',
  action,
  preActionId: null,
  preAction: null,
  flow: null,
  multiplyArrProp: null,
  decisionCriteria: null,
  decision: null,
  version: 1,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  bypass: 'N',
  switchPropertyPath: null,
  sizeRos: '1',
  sizeMass: '1',
  syncStep: 'Y',
  modDateYmls: null,
  ymlConfig: null,
  alerts: null,
};

describe('getFlowSteps', () => {
  it('posts flowId form-encoded to /getFlowStepInfo and returns requestData', async () => {
    const client = fakeClient((path, form) => {
      expect(path).toBe('/getFlowStepInfo');
      expect(form).toEqual({ flowId: 34606 });
      return { requestData: [step] };
    });

    const result = await getFlowSteps(client, { flowId: 34606 });

    expect(result).toEqual([step]);
  });

  it('includes rfsVersion in the form body when provided', async () => {
    const client = fakeClient((_path, form) => {
      expect(form).toEqual({ flowId: 34606, rfsVersion: 2 });
      return { requestData: [step] };
    });

    await getFlowSteps(client, { flowId: 34606, rfsVersion: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getFlowSteps.test.ts`
Expected: FAIL — `src/tools/getFlowSteps.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getFlowSteps.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, StepOptimistic } from '../rosClient/types.js';

export interface GetFlowStepsInput {
  flowId: number;
  rfsVersion?: number;
}

export async function getFlowSteps(client: RosClientLike, input: GetFlowStepsInput): Promise<StepOptimistic[]> {
  const form: Record<string, string | number> = { flowId: input.flowId };
  if (input.rfsVersion !== undefined) {
    form.rfsVersion = input.rfsVersion;
  }

  const response = await client.postForm<RequestPaginationData<StepOptimistic[]>>('/getFlowStepInfo', form);
  return response.requestData;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getFlowSteps.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getFlowSteps.ts test/tools/getFlowSteps.test.ts
git commit -m "feat: add get_flow_steps tool"
```

---

### Task 10: `search_flows` tool

**Files:**
- Create: `src/tools/searchFlows.ts`
- Test: `test/tools/searchFlows.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `UserFlowSummary`, `RequestPaginationData` (Task 7).
- Produces: `interface SearchFlowsInput { query?: string; isActive?: boolean; isMassFlag?: boolean; isRosFlag?: boolean; hasInputSchema?: boolean; permission?: 'EDIT' | 'READ' }`, `function searchFlows(client: RosClientLike, input?: SearchFlowsInput): Promise<UserFlowSummary[]>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** `POST /getUserFlows` (lives in `AdminController.java`, not `FlowController.java`), JSON body with all-optional filter fields, → `RequestPaginationData<UserFlowSummary[]>`, permission-scoped to the logged-in user. No server-side text search exists — `query` is applied client-side against `flowCode`/`flowDes`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/searchFlows.test.ts
import { describe, expect, it, vi } from 'vitest';
import { searchFlows } from '../../src/tools/searchFlows.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

const flows: UserFlowSummary[] = [
  {
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
  },
  {
    flowId: 40000,
    flowCode: 'BAJA_SERVICIO_Y',
    flowDes: 'Baja de servicio Y',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'READ',
  },
];

describe('searchFlows', () => {
  it('posts to /getUserFlows with includeRoutings:false by default', async () => {
    const client = fakeClient((path, body) => {
      expect(path).toBe('/getUserFlows');
      expect(body).toEqual({ includeRoutings: false });
      return { requestData: flows };
    });

    const result = await searchFlows(client);

    expect(result).toEqual(flows);
  });

  it('passes through isActive/isMassFlag/isRosFlag/hasInputSchema/permission filters', async () => {
    const client = fakeClient((_path, body) => {
      expect(body).toEqual({
        includeRoutings: false,
        isActive: true,
        isMassFlag: false,
        isRosFlag: true,
        hasInputSchema: true,
        permission: 'EDIT',
      });
      return { requestData: flows };
    });

    await searchFlows(client, {
      isActive: true,
      isMassFlag: false,
      isRosFlag: true,
      hasInputSchema: true,
      permission: 'EDIT',
    });
  });

  it('filters client-side by flowCode or flowDes substring, case-insensitively', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await searchFlows(client, { query: 'servicio x' });

    expect(result).toEqual([flows[0]]);
  });

  it('returns every flow when no query is given', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await searchFlows(client);

    expect(result).toEqual(flows);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- searchFlows.test.ts`
Expected: FAIL — `src/tools/searchFlows.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/searchFlows.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, UserFlowSummary } from '../rosClient/types.js';

export interface SearchFlowsInput {
  query?: string;
  isActive?: boolean;
  isMassFlag?: boolean;
  isRosFlag?: boolean;
  hasInputSchema?: boolean;
  permission?: 'EDIT' | 'READ';
}

export async function searchFlows(client: RosClientLike, input: SearchFlowsInput = {}): Promise<UserFlowSummary[]> {
  const body: Record<string, unknown> = { includeRoutings: false };
  if (input.isActive !== undefined) body.isActive = input.isActive;
  if (input.isMassFlag !== undefined) body.isMassFlag = input.isMassFlag;
  if (input.isRosFlag !== undefined) body.isRosFlag = input.isRosFlag;
  if (input.hasInputSchema !== undefined) body.hasInputSchema = input.hasInputSchema;
  if (input.permission !== undefined) body.permission = input.permission;

  const response = await client.postJson<RequestPaginationData<UserFlowSummary[]>>('/getUserFlows', body);
  const flows = response.requestData;

  if (!input.query) return flows;

  const needle = input.query.toLowerCase();
  return flows.filter(
    (flow) => flow.flowCode.toLowerCase().includes(needle) || flow.flowDes.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- searchFlows.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/searchFlows.ts test/tools/searchFlows.test.ts
git commit -m "feat: add search_flows tool"
```

---

### Task 11: `search_actions` tool

**Files:**
- Create: `src/tools/searchActions.ts`
- Test: `test/tools/searchActions.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `RosAction`, `RequestPaginationData` (Task 7).
- Produces: `interface SearchActionsInput { query?: string; actionType?: string[]; commandType?: string[]; scope?: 'user' | 'admin' }`, `function searchActions(client: RosClientLike, input?: SearchActionsInput): Promise<RosAction[]>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** default scope → `POST /getRosActions`, JSON body `{actionType?, commandType?}` → `RequestPaginationData<RosAction[]>` (no real pagination, `command`/`actionYmlConfig` blanked). `scope: 'admin'` → `GET /getActionsAdmin` (no params) → bare `{adminActions: RosAction[], ...}` (NOTIFY/PROV/LIBRARY/PARSERLIB types only). No server-side text filter either way.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/searchActions.test.ts
import { describe, expect, it, vi } from 'vitest';
import { searchActions } from '../../src/tools/searchActions.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAction } from '../../src/rosClient/types.js';

function fakeClient(
  getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown,
  postJsonImpl: (path: string, body: unknown) => unknown
): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

function makeAction(overrides: Partial<RosAction>): RosAction {
  return {
    actionId: 1,
    actionCode: 'GET_CUSTOMER',
    actionDes: 'Get customer data',
    syncBy: 'admin',
    workerClass: '',
    command: '',
    actionType: 'ACTION',
    commandType: 'REST',
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
    ...overrides,
  };
}

const actions = [
  makeAction({ actionId: 1, actionCode: 'GET_CUSTOMER', actionDes: 'Get customer data' }),
  makeAction({ actionId: 2, actionCode: 'CHECK_AVAILABILITY', actionDes: 'Check network availability' }),
];

describe('searchActions', () => {
  it('defaults to POST /getRosActions with an empty body', async () => {
    const client = fakeClient(vi.fn(), (path, body) => {
      expect(path).toBe('/getRosActions');
      expect(body).toEqual({});
      return { requestData: actions };
    });

    const result = await searchActions(client);

    expect(result).toEqual(actions);
  });

  it('passes actionType/commandType through to the request body', async () => {
    const client = fakeClient(vi.fn(), (_path, body) => {
      expect(body).toEqual({ actionType: ['ACTION'], commandType: ['REST', 'GROOVY'] });
      return { requestData: actions };
    });

    await searchActions(client, { actionType: ['ACTION'], commandType: ['REST', 'GROOVY'] });
  });

  it('uses GET /getActionsAdmin when scope is admin', async () => {
    const client = fakeClient(
      (path) => {
        expect(path).toBe('/getActionsAdmin');
        return { adminActions: actions };
      },
      vi.fn()
    );

    const result = await searchActions(client, { scope: 'admin' });

    expect(result).toEqual(actions);
  });

  it('filters client-side by actionCode or actionDes substring, case-insensitively', async () => {
    const client = fakeClient(vi.fn(), () => ({ requestData: actions }));

    const result = await searchActions(client, { query: 'availability' });

    expect(result).toEqual([actions[1]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- searchActions.test.ts`
Expected: FAIL — `src/tools/searchActions.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/searchActions.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, RosAction } from '../rosClient/types.js';

export interface SearchActionsInput {
  query?: string;
  actionType?: string[];
  commandType?: string[];
  scope?: 'user' | 'admin';
}

export async function searchActions(client: RosClientLike, input: SearchActionsInput = {}): Promise<RosAction[]> {
  let actions: RosAction[];

  if (input.scope === 'admin') {
    const response = await client.getJson<{ adminActions: RosAction[] }>('/getActionsAdmin');
    actions = response.adminActions;
  } else {
    const body: Record<string, string[]> = {};
    if (input.actionType) body.actionType = input.actionType;
    if (input.commandType) body.commandType = input.commandType;

    const response = await client.postJson<RequestPaginationData<RosAction[]>>('/getRosActions', body);
    actions = response.requestData;
  }

  if (!input.query) return actions;

  const needle = input.query.toLowerCase();
  return actions.filter(
    (action) => action.actionCode.toLowerCase().includes(needle) || action.actionDes.toLowerCase().includes(needle)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- searchActions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/searchActions.ts test/tools/searchActions.test.ts
git commit -m "feat: add search_actions tool"
```

---

### Task 12: `get_action` tool

**Files:**
- Create: `src/tools/getAction.ts`
- Test: `test/tools/getAction.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `RosAction`, `RosActionHist`, `ActionDBConfig`, `RequestPaginationData` (Task 7).
- Produces: `interface GetActionInput { actionId: number; actionVersion?: number }`, `interface ActionDetail { action: RosAction | RosActionHist; config: ActionDBConfig }`, `function getAction(client: RosClientLike, input: GetActionInput): Promise<ActionDetail>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** `GET /actionInformation/{actionId}` (or `/{actionId}/{actionVersion}`, a second path segment) → `RequestPaginationData<RosAction | RosActionHist>` with `command` inline; protocol-specific config is never inline and always requires a separate `GET /actionDBConfig/{actionId}` call (bare object, no envelope). The frontend always fetches both in parallel for a "full action" view — this tool does the same.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getAction.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getAction } from '../../src/tools/getAction.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { ActionDBConfig, RosAction } from '../../src/rosClient/types.js';

const action: RosAction = {
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

const config: ActionDBConfig = {
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

function fakeClient(getJsonImpl: (path: string) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getAction', () => {
  it('fetches /actionInformation/{actionId} and /actionDBConfig/{actionId} and combines them', async () => {
    const paths: string[] = [];
    const client = fakeClient((path) => {
      paths.push(path);
      if (path === '/actionInformation/42') return { requestData: action };
      if (path === '/actionDBConfig/42') return config;
      throw new Error(`unexpected path ${path}`);
    });

    const result = await getAction(client, { actionId: 42 });

    expect(paths.sort()).toEqual(['/actionDBConfig/42', '/actionInformation/42']);
    expect(result).toEqual({ action, config });
  });

  it('uses the versioned path when actionVersion is given', async () => {
    const client = fakeClient((path) => {
      if (path === '/actionInformation/42/2') return { requestData: { ...action, histId: 501 } };
      if (path === '/actionDBConfig/42') return config;
      throw new Error(`unexpected path ${path}`);
    });

    const result = await getAction(client, { actionId: 42, actionVersion: 2 });

    expect(result.action).toEqual({ ...action, histId: 501 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getAction.test.ts`
Expected: FAIL — `src/tools/getAction.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getAction.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { ActionDBConfig, RequestPaginationData, RosAction, RosActionHist } from '../rosClient/types.js';

export interface GetActionInput {
  actionId: number;
  actionVersion?: number;
}

export interface ActionDetail {
  action: RosAction | RosActionHist;
  config: ActionDBConfig;
}

export async function getAction(client: RosClientLike, input: GetActionInput): Promise<ActionDetail> {
  const actionPath =
    input.actionVersion !== undefined
      ? `/actionInformation/${input.actionId}/${input.actionVersion}`
      : `/actionInformation/${input.actionId}`;

  const [actionResponse, config] = await Promise.all([
    client.getJson<RequestPaginationData<RosAction | RosActionHist>>(actionPath),
    client.getJson<ActionDBConfig>(`/actionDBConfig/${input.actionId}`),
  ]);

  return { action: actionResponse.requestData, config };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getAction.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getAction.ts test/tools/getAction.test.ts
git commit -m "feat: add get_action tool"
```

---

### Task 13: `get_action_command` tool

**Files:**
- Create: `src/tools/getActionCommand.ts`
- Test: `test/tools/getActionCommand.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `RequestPaginationData` (Task 7).
- Produces: `interface GetActionCommandInput { actionId: number }`, `function getActionCommand(client: RosClientLike, input: GetActionCommandInput): Promise<string>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** `GET /actionDetail/getCurrentCommand?actionId=` — despite a Java-level `AjaxData` return type, `executeController` always actually builds a `RequestPaginationData`, so the command string is under `requestData` (a bare string).

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getActionCommand.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getActionCommand } from '../../src/tools/getActionCommand.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';

function fakeClient(getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getActionCommand', () => {
  it('requests /actionDetail/getCurrentCommand with actionId and returns requestData as a string', async () => {
    const client = fakeClient((path, query) => {
      expect(path).toBe('/actionDetail/getCurrentCommand');
      expect(query).toEqual({ actionId: 42 });
      return { requestData: 'def validate() {\n  return true\n}' };
    });

    const result = await getActionCommand(client, { actionId: 42 });

    expect(result).toBe('def validate() {\n  return true\n}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getActionCommand.test.ts`
Expected: FAIL — `src/tools/getActionCommand.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getActionCommand.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData } from '../rosClient/types.js';

export interface GetActionCommandInput {
  actionId: number;
}

export async function getActionCommand(client: RosClientLike, input: GetActionCommandInput): Promise<string> {
  const response = await client.getJson<RequestPaginationData<string>>('/actionDetail/getCurrentCommand', {
    actionId: input.actionId,
  });
  return response.requestData;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getActionCommand.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getActionCommand.ts test/tools/getActionCommand.test.ts
git commit -m "feat: add get_action_command tool"
```

---

### Task 14: `get_action_template` tool

**Files:**
- Create: `src/tools/getActionTemplate.ts`
- Test: `test/tools/getActionTemplate.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `ActionTemplateResponse` (Task 7).
- Produces: `interface GetActionTemplateInput { commandType: 'GROOVY' | 'PYTHON' }`, `function getActionTemplate(client: RosClientLike, input: GetActionTemplateInput): Promise<ActionTemplateResponse['availableCodes']>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** `GET /actionTemplate/{commandType}` returns a bare `{availableCodes: [...]}` (no envelope at all), each entry `{key, label, value, methodToInvoke}`. The real endpoint throws an uncaught NPE server-side for any `commandType` other than `GROOVY`/`PYTHON` — this tool restricts its input type to those two values so that failure mode can't be triggered from this MCP server.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getActionTemplate.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getActionTemplate } from '../../src/tools/getActionTemplate.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';

function fakeClient(getJsonImpl: (path: string) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getActionTemplate', () => {
  it('requests /actionTemplate/{commandType} and returns availableCodes', async () => {
    const availableCodes = [{ key: 'basic', label: 'Basic Groovy Action', value: 'def execute() {}', methodToInvoke: 'execute' }];
    const client = fakeClient((path) => {
      expect(path).toBe('/actionTemplate/GROOVY');
      return { availableCodes };
    });

    const result = await getActionTemplate(client, { commandType: 'GROOVY' });

    expect(result).toEqual(availableCodes);
  });

  it('builds the path for PYTHON templates', async () => {
    const client = fakeClient((path) => {
      expect(path).toBe('/actionTemplate/PYTHON');
      return { availableCodes: [] };
    });

    await getActionTemplate(client, { commandType: 'PYTHON' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getActionTemplate.test.ts`
Expected: FAIL — `src/tools/getActionTemplate.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getActionTemplate.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { ActionTemplateResponse } from '../rosClient/types.js';

export interface GetActionTemplateInput {
  commandType: 'GROOVY' | 'PYTHON';
}

export async function getActionTemplate(
  client: RosClientLike,
  input: GetActionTemplateInput
): Promise<ActionTemplateResponse['availableCodes']> {
  const response = await client.getJson<ActionTemplateResponse>(`/actionTemplate/${input.commandType}`);
  return response.availableCodes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getActionTemplate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getActionTemplate.ts test/tools/getActionTemplate.test.ts
git commit -m "feat: add get_action_template tool"
```

---

### Task 15: `get_item_info` tool

**Files:**
- Create: `src/tools/getItemInfo.ts`
- Test: `test/tools/getItemInfo.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `SearchRosItem`, `StepOptimistic`, `StepDataExtraDetailEntry`, `RequestPaginationData` (Task 7).
- Produces: `interface GetItemInfoInput { itemId: string }`, `interface ItemInfo { item: SearchRosItem; flowSteps: StepOptimistic[]; recentHistory: StepDataExtraDetailEntry[] }`, `function getItemInfo(client: RosClientLike, input: GetItemInfoInput): Promise<ItemInfo>`. Consumed by `src/server.ts` (Task 17). This is the tool the user's MVP criterion ("Analiza el Item 24378914") exercises.

**Verified contract — no single "full item" endpoint exists.** This tool combines three calls, exactly matching the pattern found in `ros_item_monitor.js`/`skMonitor.js`:
1. `POST /searchros` with `{itemId, searchHistory: true, searchInMemory: false, pageNumber: 1, pageSize: 1, searchProperties: false, includeRootItemId: true}` → `RequestPaginationData<SearchRosItem[]>` (a one-element array) — gives current step/action/status/error plus `histSteps` (previousStepId chain, no action names).
2. `POST /getFlowStepInfo` with `{flowId: <from step 1>}` (form-encoded) → the flow's step topology, so `histSteps` step IDs can be matched to action names.
3. `POST /getStepDataExtraDetails` with `{itemId, searchInMemory: true}` → the Elasticsearch branch's raw `PREV_STEP_ID`/`PREV_ACTION_ID`, most-recent-first (index `[0]` is the latest history entry).

If `POST /searchros` returns zero items for the given `itemId`, this tool throws `RosNotFoundError` itself (the endpoint returns 200 with an empty array rather than 404, so the empty-array case must be translated explicitly).

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/getItemInfo.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getItemInfo } from '../../src/tools/getItemInfo.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAction, SearchRosItem, StepOptimistic } from '../../src/rosClient/types.js';
import { RosNotFoundError } from '../../src/errors.js';

const action: RosAction = {
  actionId: 5,
  actionCode: 'CONFIG_NETWORK',
  actionDes: 'Configure network element',
  syncBy: 'admin',
  workerClass: '',
  command: '',
  actionType: 'ACTION',
  commandType: 'REST',
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

const step: StepOptimistic = {
  flowId: 34606,
  stepId: 5,
  parentStepId: 4,
  actionId: 5,
  flowActionDes: 'Config network',
  action,
  preActionId: null,
  preAction: null,
  flow: null,
  multiplyArrProp: null,
  decisionCriteria: null,
  decision: null,
  version: 1,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  bypass: 'N',
  switchPropertyPath: null,
  sizeRos: '1',
  sizeMass: '1',
  syncStep: 'Y',
  modDateYmls: null,
  ymlConfig: null,
  alerts: null,
};

function makeItem(overrides: Partial<SearchRosItem> = {}): SearchRosItem {
  return {
    itemId: '24378914',
    rootItemId: null,
    executionDate: '2026-08-20T10:00:00Z',
    futureExecution: false,
    statusDate: '2026-08-20T10:05:00Z',
    actionId: 5,
    actionCode: 'CONFIG_NETWORK',
    actionDes: 'Configure network element',
    actionCustomDes: null,
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    statusId: 3,
    statusCode: 'ERROR',
    statusDes: 'Error',
    statusSublevelsCode: null,
    origin: null,
    stepId: 5,
    historyDetails: null,
    orderno: null,
    externalId: null,
    externalType: null,
    customerId: null,
    coId: null,
    actionType: 'ACTION',
    recVersion: 1,
    retriesLeft: 0,
    retries: 3,
    reasonId: null,
    reasonCode: null,
    reasonDesc: null,
    stepComment: null,
    schedulerId: null,
    priority: null,
    userName: null,
    newCustomerId: null,
    newCoId: null,
    errorCode: 'NCE-500',
    errorMessage: 'Timeout calling NCE',
    errConfId: null,
    errActionId: null,
    errActionStatusId: null,
    rfsVersion: 1,
    listRosItemParam: null,
    splitItemId: null,
    histSteps: { step: [{ stepId: 4, statusCode: 'OK', statusDes: 'OK', statusDate: '2026-08-20T10:04:00Z', transactionDate: null, startDateWorker: null, endDate: null, previousStepId: 3, actionElapsedMillis: 120, alerts: null, workerInstance: null, actionVersion: 1 }] },
    messageId: null,
    processTransaction: null,
    transactionDate: null,
    errActionCode: null,
    errActionDes: null,
    circuitBreakerStatus: null,
    itemType: null,
    expiryDate: null,
    transferredFrom: null,
    transferredTo: null,
    ...overrides,
  };
}

function fakeClient(opts: {
  postJsonImpl: (path: string, body: unknown) => unknown;
  postFormImpl: (path: string, form: Record<string, string | number>) => unknown;
}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(opts.postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(opts.postFormImpl) as RosClientLike['postForm'],
  };
}

describe('getItemInfo', () => {
  it('combines searchros + getFlowStepInfo + getStepDataExtraDetails', async () => {
    const item = makeItem();
    const recentHistory = [
      { STEP_ID: 5, ACTION_DES: 'Configure network element', STATUS_ID: 3, STATUS_DATE: '2026-08-20T10:05:00Z', TRANSACTION_DATE: null, REC_VERSION: 1, RETRIES: 3, WORKER_INSTANCE: null, ERROR_MESSAGE: 'Timeout calling NCE', PREV_ACTION_ID: 4, PREV_STEP_ID: 4, PREV_ACTION_ELAPSED_MILLIS: 120, PROCESS_TRANSACTION: null, EXPIRY_DATE: null },
    ];

    const client = fakeClient({
      postJsonImpl: (path, body) => {
        if (path === '/searchros') {
          expect(body).toEqual({
            itemId: '24378914',
            searchHistory: true,
            searchInMemory: false,
            pageNumber: 1,
            pageSize: 1,
            searchProperties: false,
            includeRootItemId: true,
          });
          return { requestData: [item] };
        }
        if (path === '/getStepDataExtraDetails') {
          expect(body).toEqual({ itemId: '24378914', searchInMemory: true });
          return { requestData: recentHistory };
        }
        throw new Error(`unexpected postJson path ${path}`);
      },
      postFormImpl: (path, form) => {
        expect(path).toBe('/getFlowStepInfo');
        expect(form).toEqual({ flowId: 34606 });
        return { requestData: [step] };
      },
    });

    const result = await getItemInfo(client, { itemId: '24378914' });

    expect(result.item).toEqual(item);
    expect(result.flowSteps).toEqual([step]);
    expect(result.recentHistory).toEqual(recentHistory);
  });

  it('throws RosNotFoundError when searchros returns no items', async () => {
    const client = fakeClient({
      postJsonImpl: (path) => {
        if (path === '/searchros') return { requestData: [] };
        throw new Error(`unexpected postJson path ${path}`);
      },
      postFormImpl: () => {
        throw new Error('should not fetch flow steps when the item does not exist');
      },
    });

    await expect(getItemInfo(client, { itemId: 'does-not-exist' })).rejects.toBeInstanceOf(RosNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- getItemInfo.test.ts`
Expected: FAIL — `src/tools/getItemInfo.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/getItemInfo.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SearchRosItem, StepDataExtraDetailEntry, StepOptimistic } from '../rosClient/types.js';
import { RosNotFoundError } from '../errors.js';

export interface GetItemInfoInput {
  itemId: string;
}

export interface ItemInfo {
  item: SearchRosItem;
  flowSteps: StepOptimistic[];
  recentHistory: StepDataExtraDetailEntry[];
}

export async function getItemInfo(client: RosClientLike, input: GetItemInfoInput): Promise<ItemInfo> {
  const searchResponse = await client.postJson<RequestPaginationData<SearchRosItem[]>>('/searchros', {
    itemId: input.itemId,
    searchHistory: true,
    searchInMemory: false,
    pageNumber: 1,
    pageSize: 1,
    searchProperties: false,
    includeRootItemId: true,
  });

  const item = searchResponse.requestData[0];
  if (!item) {
    throw new RosNotFoundError(`No ROS item found with itemId ${input.itemId}`);
  }

  const [flowStepsResponse, historyResponse] = await Promise.all([
    client.postForm<RequestPaginationData<StepOptimistic[]>>('/getFlowStepInfo', { flowId: item.flowId }),
    client.postJson<RequestPaginationData<StepDataExtraDetailEntry[]>>('/getStepDataExtraDetails', {
      itemId: input.itemId,
      searchInMemory: true,
    }),
  ]);

  return {
    item,
    flowSteps: flowStepsResponse.requestData,
    recentHistory: historyResponse.requestData,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- getItemInfo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/getItemInfo.ts test/tools/getItemInfo.test.ts
git commit -m "feat: add get_item_info tool combining searchros, getFlowStepInfo, getStepDataExtraDetails"
```

---

### Task 16: `search_ros_items` tool

**Files:**
- Create: `src/tools/searchRosItems.ts`
- Test: `test/tools/searchRosItems.test.ts`

**Interfaces:**
- Consumes: `RosClientLike` (Task 6); `SearchRosItem`, `RequestPaginationData` (Task 7).
- Produces: `interface SearchRosItemsInput { flowId?: number; statusId?: number; actionId?: number; customerId?: string; contractId?: string; errorCode?: string; errorMessage?: string; externalId?: string; externalType?: string; orderno?: string; origin?: string; messageId?: string; step?: number; initialExecutionDate?: string; finalExecutionDate?: string; startDate?: string; endDate?: string; searchHistory?: boolean; searchInMemory?: boolean; searchInRos?: boolean; searchInMass?: boolean; searchSubItems?: boolean; noSearchSubItems?: boolean; pageNumber?: number; pageSize?: number }`, `function searchRosItems(client: RosClientLike, input?: SearchRosItemsInput): Promise<SearchRosItem[]>`. Consumed by `src/server.ts` (Task 17).

**Verified contract:** same `POST /searchros` endpoint as `get_item_info`, called without `itemId` — every field above is a real, confirmed `SearchRosItemsRequest` XSD field (`ros_interface-xsd.xsd:144-190`) except `pageNumber`, which mirrors the pattern the confirmed single-item call already uses alongside `pageSize`. Defaults: `pageNumber: 1`, `pageSize: 20`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/searchRosItems.test.ts
import { describe, expect, it, vi } from 'vitest';
import { searchRosItems } from '../../src/tools/searchRosItems.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { SearchRosItem } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

const items = [] as SearchRosItem[];

describe('searchRosItems', () => {
  it('posts to /searchros with default pageNumber/pageSize and no itemId', async () => {
    const client = fakeClient((path, body) => {
      expect(path).toBe('/searchros');
      expect(body).toEqual({ pageNumber: 1, pageSize: 20 });
      return { requestData: items };
    });

    await searchRosItems(client);
  });

  it('passes through provided filter criteria verbatim', async () => {
    const client = fakeClient((_path, body) => {
      expect(body).toEqual({
        pageNumber: 2,
        pageSize: 50,
        flowId: 34606,
        statusId: 3,
        errorCode: 'NCE-500',
        customerId: 'CUST-1',
      });
      return { requestData: items };
    });

    await searchRosItems(client, {
      pageNumber: 2,
      pageSize: 50,
      flowId: 34606,
      statusId: 3,
      errorCode: 'NCE-500',
      customerId: 'CUST-1',
    });
  });

  it('returns requestData as-is', async () => {
    const client = fakeClient(() => ({ requestData: items }));

    const result = await searchRosItems(client);

    expect(result).toBe(items);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- searchRosItems.test.ts`
Expected: FAIL — `src/tools/searchRosItems.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/searchRosItems.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SearchRosItem } from '../rosClient/types.js';

export interface SearchRosItemsInput {
  flowId?: number;
  statusId?: number;
  actionId?: number;
  customerId?: string;
  contractId?: string;
  errorCode?: string;
  errorMessage?: string;
  externalId?: string;
  externalType?: string;
  orderno?: string;
  origin?: string;
  messageId?: string;
  step?: number;
  initialExecutionDate?: string;
  finalExecutionDate?: string;
  startDate?: string;
  endDate?: string;
  searchHistory?: boolean;
  searchInMemory?: boolean;
  searchInRos?: boolean;
  searchInMass?: boolean;
  searchSubItems?: boolean;
  noSearchSubItems?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

export async function searchRosItems(client: RosClientLike, input: SearchRosItemsInput = {}): Promise<SearchRosItem[]> {
  const { pageNumber = 1, pageSize = 20, ...criteria } = input;

  const body: Record<string, unknown> = { pageNumber, pageSize };
  for (const [key, value] of Object.entries(criteria)) {
    if (value !== undefined) {
      body[key] = value;
    }
  }

  const response = await client.postJson<RequestPaginationData<SearchRosItem[]>>('/searchros', body);
  return response.requestData;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- searchRosItems.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/searchRosItems.ts test/tools/searchRosItems.test.ts
git commit -m "feat: add search_ros_items tool"
```

---

### Task 17: MCP server wiring

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: all 9 tool functions from `src/tools/*.ts` (Tasks 8–16); `RosClientLike` (Task 6); `RosError` (Task 3); `RosConfig`, `loadRosConfig` (Task 2); `RosClient` (Task 6).
- Produces: `function registerTools(server: McpServerLike, client: RosClientLike): void`, where `McpServerLike` is the minimal interface this file needs from `@modelcontextprotocol/sdk`'s `McpServer`. `src/index.ts` is the process entrypoint (not imported by anything, so it has no "Produces" contract — it is exercised only by `npm run dev`/`npm run smoke`, not by unit tests).

**Important:** `@modelcontextprotocol/sdk`'s exact tool-registration method signature can vary between versions. Before finalizing Step 3 below, open `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` (or the package's README) in the installed version and confirm the real signature of `McpServer.prototype.tool`. The code below uses the long-stable 4-argument form (`name, description, zodRawShape, handler`) — adjust only if the installed version has genuinely changed it, and keep `registerTools`'s own signature (`(server, client) => void`) unchanged so Task 17's test does not need to change.

- [ ] **Step 1: Write the failing test**

```typescript
// test/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { registerTools } from '../src/server.js';
import type { RosClientLike } from '../src/rosClient/rosClient.js';

interface RegisteredTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

class FakeMcpServer {
  registered: RegisteredTool[] = [];

  tool(name: string, description: string, _schema: unknown, handler: RegisteredTool['handler']): void {
    this.registered.push({ name, description, handler });
  }
}

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

describe('registerTools', () => {
  it('registers all 9 Phase-1 read-only tools', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());

    const names = server.registered.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        'get_action',
        'get_action_command',
        'get_action_template',
        'get_flow',
        'get_flow_steps',
        'get_item_info',
        'search_actions',
        'search_flows',
        'search_ros_items',
      ].sort()
    );
  });

  it('a tool handler calls the client and returns MCP text content on success', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { flow: { flowId: 34606 } } }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client);

    const getFlowTool = server.registered.find((tool) => tool.name === 'get_flow')!;
    const result = await getFlowTool.handler({ flowId: 34606 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ flow: { flowId: 34606 } });
  });

  it('a tool handler returns isError:true with the message when the client throws a RosError', async () => {
    const { RosNotFoundError } = await import('../src/errors.js');
    const client = fakeClient({
      getJson: vi.fn().mockRejectedValue(new RosNotFoundError('flow 999999 not found')),
    });
    const server = new FakeMcpServer();
    registerTools(server, client);

    const getFlowTool = server.registered.find((tool) => tool.name === 'get_flow')!;
    const result = await getFlowTool.handler({ flowId: 999999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('flow 999999 not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server.test.ts`
Expected: FAIL — `src/server.ts` does not exist yet.

- [ ] **Step 3: Write `src/server.ts`**

```typescript
// src/server.ts
import { z } from 'zod';
import type { RosClientLike } from './rosClient/rosClient.js';
import { RosError } from './errors.js';
import { getFlow } from './tools/getFlow.js';
import { getFlowSteps } from './tools/getFlowSteps.js';
import { searchFlows } from './tools/searchFlows.js';
import { searchActions } from './tools/searchActions.js';
import { getAction } from './tools/getAction.js';
import { getActionCommand } from './tools/getActionCommand.js';
import { getActionTemplate } from './tools/getActionTemplate.js';
import { getItemInfo } from './tools/getItemInfo.js';
import { searchRosItems } from './tools/searchRosItems.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpServerLike {
  tool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: Record<string, unknown>) => Promise<McpToolResult>
  ): void;
}

function ok(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): McpToolResult {
  const message = err instanceof RosError ? err.message : `Unexpected error: ${(err as Error).message}`;
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function registerTools(server: McpServerLike, client: RosClientLike): void {
  server.tool('get_flow', 'Get a ROS flow by flowId, including groups, routing, and schema info.', { flowId: z.number() }, async (args) => {
    try {
      return ok(await getFlow(client, { flowId: args.flowId as number }));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'get_flow_steps',
    'Get the steps of a ROS flow (parent/child tree, actions, decisions, bypass) to reconstruct its graph.',
    { flowId: z.number(), rfsVersion: z.number().optional() },
    async (args) => {
      try {
        return ok(await getFlowSteps(client, { flowId: args.flowId as number, rfsVersion: args.rfsVersion as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_flows',
    'Search ROS flows visible to the configured user, optionally filtered by a text query and flags.',
    {
      query: z.string().optional(),
      isActive: z.boolean().optional(),
      isMassFlag: z.boolean().optional(),
      isRosFlag: z.boolean().optional(),
      hasInputSchema: z.boolean().optional(),
      permission: z.enum(['EDIT', 'READ']).optional(),
    },
    async (args) => {
      try {
        return ok(await searchFlows(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_actions',
    'Search ROS actions, optionally filtered by a text query, actionType, commandType, or admin scope.',
    {
      query: z.string().optional(),
      actionType: z.array(z.string()).optional(),
      commandType: z.array(z.string()).optional(),
      scope: z.enum(['user', 'admin']).optional(),
    },
    async (args) => {
      try {
        return ok(await searchActions(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_action',
    'Get the full configuration of a ROS action (identity, command/code, and protocol-specific config).',
    { actionId: z.number(), actionVersion: z.number().optional() },
    async (args) => {
      try {
        return ok(await getAction(client, { actionId: args.actionId as number, actionVersion: args.actionVersion as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool('get_action_command', 'Get the raw command/code (e.g. Groovy) of a ROS action.', { actionId: z.number() }, async (args) => {
    try {
      return ok(await getActionCommand(client, { actionId: args.actionId as number }));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'get_action_template',
    'Get available Groovy or Python code templates for building new ROS actions.',
    { commandType: z.enum(['GROOVY', 'PYTHON']) },
    async (args) => {
      try {
        return ok(await getActionTemplate(client, { commandType: args.commandType as 'GROOVY' | 'PYTHON' }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_item_info',
    'Get everything needed to diagnose a ROS item: current state, flow step topology, and recent step history with previous-step linkage.',
    { itemId: z.string() },
    async (args) => {
      try {
        return ok(await getItemInfo(client, { itemId: args.itemId as string }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'search_ros_items',
    'Search ROS items by flow, status, action, customer, error code, and other criteria.',
    {
      flowId: z.number().optional(),
      statusId: z.number().optional(),
      actionId: z.number().optional(),
      customerId: z.string().optional(),
      contractId: z.string().optional(),
      errorCode: z.string().optional(),
      errorMessage: z.string().optional(),
      externalId: z.string().optional(),
      externalType: z.string().optional(),
      orderno: z.string().optional(),
      origin: z.string().optional(),
      messageId: z.string().optional(),
      step: z.number().optional(),
      initialExecutionDate: z.string().optional(),
      finalExecutionDate: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      searchHistory: z.boolean().optional(),
      searchInMemory: z.boolean().optional(),
      searchInRos: z.boolean().optional(),
      searchInMass: z.boolean().optional(),
      searchSubItems: z.boolean().optional(),
      noSearchSubItems: z.boolean().optional(),
      pageNumber: z.number().optional(),
      pageSize: z.number().optional(),
    },
    async (args) => {
      try {
        return ok(await searchRosItems(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/index.ts`**

Consult the installed `@modelcontextprotocol/sdk` version's actual exports (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` and `.../server/stdio.d.ts`) before finalizing this file — `McpServer` and `StdioServerTransport` are the long-stable class names, but adjust the constructor options below if the installed version's types disagree.

```typescript
// src/index.ts
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadRosConfig } from './config.js';
import { RosClient } from './rosClient/rosClient.js';
import { registerTools } from './server.js';

async function main(): Promise<void> {
  const config = loadRosConfig();
  const client = new RosClient(config);

  const server = new McpServer({ name: 'ros-ai-mcp', version: '0.1.0' });
  registerTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('ros-ai-mcp failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify the entrypoint builds and starts**

Run: `npm run build`
Expected: no TypeScript errors.

Run (with a real or dummy `.env` present so `loadRosConfig` doesn't throw): `npm run dev`
Expected: the process starts and blocks waiting on stdio (Ctrl+C to stop) — it should not crash immediately. This does not require the VPN or a real login, since no tool has been invoked yet.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/index.ts test/server.test.ts
git commit -m "feat: wire the 9 read-only tools into an MCP server over stdio"
```

---

### Task 18: Smoke test script (real DEV/QA, gated)

**Files:**
- Create: `scripts/smoke.ts`

**Interfaces:**
- Consumes: `loadRosConfig` (Task 2), `RosClient` (Task 6), `getFlow` (Task 8), `getItemInfo` (Task 15).
- Produces: nothing consumed elsewhere — this is a standalone script run via `npm run smoke`. This task is the one that actually exercises the user's two MVP criteria against the real server.

No unit test for this task (by design, it only makes sense against the real network) — its "test" is the manual verification in Step 2, gated by the user actually running it with the VPN connected.

- [ ] **Step 1: Write `scripts/smoke.ts`**

```typescript
// scripts/smoke.ts
import 'dotenv/config';
import { loadRosConfig } from '../src/config.js';
import { RosClient } from '../src/rosClient/rosClient.js';
import { getFlow } from '../src/tools/getFlow.js';
import { getItemInfo } from '../src/tools/getItemInfo.js';

async function main(): Promise<void> {
  if (process.env.RUN_SMOKE_TESTS !== 'true') {
    console.log('Skipping smoke test — set RUN_SMOKE_TESTS=true (and connect to the VPN) to run it.');
    return;
  }

  const config = loadRosConfig();
  const client = new RosClient(config);

  const flowId = Number(process.env.ROS_SMOKE_FLOW_ID ?? '34606');
  const itemId = process.env.ROS_SMOKE_ITEM_ID ?? '24378914';

  console.log(`Fetching flow ${flowId}...`);
  const flow = await getFlow(client, { flowId });
  console.log(`OK — flow ${flow.flow.flowCode} (${flow.flow.flowDes}), active=${flow.flow.activeFlag}`);

  console.log(`Fetching item ${itemId}...`);
  const itemInfo = await getItemInfo(client, { itemId });
  console.log(
    `OK — item ${itemInfo.item.itemId} is at step ${itemInfo.item.stepId} (${itemInfo.item.actionDes}), status ${itemInfo.item.statusDes}` +
      (itemInfo.item.errorMessage ? `, error: ${itemInfo.item.errorMessage}` : '')
  );
}

main().catch((err) => {
  console.error('Smoke test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it manually against real DEV/QA (requires VPN)**

```bash
cd "C:\Users\52554\Documents\ros-ai-mcp"
# ensure .env has real ROS_USERNAME/ROS_PASSWORD and RUN_SMOKE_TESTS=true
npm run smoke
```

Expected: two `OK —` lines are printed, one for Flow 34606 and one for Item 24378914, with no thrown errors. **This is the concrete check that satisfies the user's stated MVP success criteria** — do not consider Phase 1 done until this passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.ts
git commit -m "feat: add gated smoke test against real DEV/QA for the MVP criteria"
```

---

### Task 19: Register with Claude Code

**Files:**
- Modify: `README.md` (append the registration command under "Registering with Claude Code")

**Interfaces:** none — this is a one-time local CLI configuration step, not code.

- [ ] **Step 1: Build the project**

```bash
cd "C:\Users\52554\Documents\ros-ai-mcp"
npm run build
```

- [ ] **Step 2: Register the MCP server with Claude Code**

```bash
claude mcp add ros-ai-mcp -- node "C:\Users\52554\Documents\ros-ai-mcp\dist\index.js"
```

Verify with:

```bash
claude mcp list
```

Expected: `ros-ai-mcp` appears in the list. `ROS_USERNAME`/`ROS_PASSWORD` continue to be read from `C:\Users\52554\Documents\ros-ai-mcp\.env` at process start (via `dotenv/config` in `src/index.ts`) — no credentials are passed on the `claude mcp add` command line.

- [ ] **Step 3: Update `README.md`**

Append under the existing "Registering with Claude Code" heading (replacing the pointer to this plan file):

```markdown
## Registering with Claude Code

```bash
npm run build
claude mcp add ros-ai-mcp -- node "C:\Users\52554\Documents\ros-ai-mcp\dist\index.js"
```

Credentials are read from `.env` in this repo at process start — nothing is passed
on the `claude mcp add` command line.
```

- [ ] **Step 4: Manually verify the two MVP prompts from Claude Code**

In a Claude Code session (in any working directory, since the MCP server is registered globally), run:

```
Analiza el Flow 34606.
```

Expected: Claude calls `get_flow` and `get_flow_steps`, and explains the flow's steps/actions.

```
Analiza el Item 24378914.
```

Expected: Claude calls `get_item_info` and explains current step, current action, status, error, and previous step — this is the user's literal MVP success criterion.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add Claude Code MCP registration instructions"
```

---

## Self-Review Notes

- **Spec coverage:** all 9 Phase-1 tools from the user's spec (`search_flows`, `get_flow`, `get_flow_steps`, `search_actions`, `get_action`, `get_action_command`, `get_action_template`, `get_item_info`, `search_ros_items`) map to Tasks 8–16. Session/cookie handling (Task 5), HTTP error taxonomy (Tasks 3–4), env-var-only credentials (Task 2), and a hard READ-only boundary (Global Constraints, no write endpoints anywhere in this plan) are all covered. The MVP acceptance criteria (Flow 34606, Item 24378914) are the explicit deliverable of Task 18/19, not left implicit.
- **Deferred to later phases (intentionally, per the user's phased rollout):** `find_similar_flows`/`find_similar_actions`/`analyze_flow`/`analyze_item` (Phase 2 — these are prompting/reasoning tasks Claude performs *using* these 9 tools, not new endpoints), design/generation phases (Phase 3–4), all WRITE tools and human-approval workflow (Phase 5), `execute_flow` and the clientId/clientSecret JWT flow (Phase 6), and `checkYMLFileImportDiff`/`executeImportFlow` (also Phase 5/6). None of these are implemented here.
- **Type consistency check:** `RosClientLike` (Task 6) is the single interface every tool (Tasks 8–16) and `server.ts` (Task 17) depends on — verified its three method names (`getJson`, `postJson`, `postForm`) and generic signatures are used identically everywhere above. `RequestPaginationData<T>` (Task 7) wraps every envelope-using response consistently. `SearchRosItem`/`StepOptimistic`/`StepDataExtraDetailEntry` field names in Task 15/16's code match Task 7's type declarations exactly (both were written from the same XSD/DTO research pass).

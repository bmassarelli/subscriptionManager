# ros-ai-mcp — Fase 2: Intelligence Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 read-only "intelligence" MCP tools (`find_similar_flows`, `find_similar_actions`, `analyze_flow`, `analyze_item`) to the existing `ros-ai-mcp` server, built entirely on top of Phase 1's 9 tools with zero new ROS endpoints.

**Architecture:** Same layering as Phase 1: pure `(client: RosClientLike, input) => output` functions in `src/tools/`, unit-tested against a fake client, registered in `src/server.ts`. `find_similar_flows`/`find_similar_actions` share a small keyword-scoring utility (`src/tools/similarity.ts`). `analyze_flow` reconstructs the step tree from `get_flow`+`get_flow_steps`. `analyze_item` cross-references `get_item_info`'s three data sources into resolved `currentStep`/`previousStep` objects and flattens the four "related items" wire shapes (newly typed in this plan, verified against the real ROS XSD) into plain arrays.

**Tech Stack:** Same as Phase 1 — TypeScript, vitest, zod (already installed dependencies, no new ones needed).

## Global Constraints

- Read-only only. No WRITE endpoint may be called from any of these tools.
- No new ROS HTTP endpoints — every tool in this plan is built by combining/transforming data already returned by Phase 1's `getFlow`, `getFlowSteps`, `searchFlows`, `searchActions`, `getItemInfo`.
- None of these tools may invent unverified ROS business rules (e.g. "error code X means Y"). They structure and cross-reference facts only; narrative diagnosis/explanation is left to the caller (Claude) reading the structured output — exactly like Phase 1's `get_item_info` already works.
- `MemberItem.itemId` is `number` (from XSD `xsd:decimal`) while `SplitMemberItem.itemId`, `SubprocessMemberItem.itemId`, and `RelatedItem.itemId` are all `string` (from XSD `xsd:string`) — this is a real inconsistency in the ROS schema and must be preserved exactly, not "fixed" to be uniform.
- Every new/modified file follows the existing `ros-ai-mcp` repo conventions (ESM imports with `.js` extensions, `RosClientLike` dependency injection, no direct `RosClient` imports in tool files).

---

## File Structure

```
ros-ai-mcp/
  src/
    rosClient/
      types.ts                  # MODIFIED: add MemberItem, SplitMemberItem,
                                 # SubprocessMemberItem, RelatedItem; retype
                                 # SearchRosItem's groupMembers/cloneMembers/
                                 # parentMembers/splitMembers/subprocessMembers/
                                 # flowItem from `unknown` to these real shapes
    tools/
      similarity.ts              # NEW: tokenize() + scoreByKeywordOverlap()
      findSimilarFlows.ts        # NEW
      findSimilarActions.ts      # NEW
      analyzeFlow.ts             # NEW
      analyzeItem.ts             # NEW
    server.ts                    # MODIFIED: registerTools gains 4 more server.tool() calls
  test/
    tools/
      similarity.test.ts         # NEW
      findSimilarFlows.test.ts   # NEW
      findSimilarActions.test.ts # NEW
      analyzeFlow.test.ts        # NEW
      analyzeItem.test.ts        # NEW
    server.test.ts               # MODIFIED: expected tool-name list grows from 9 to 13
```

---

### Task 1: Shared keyword-similarity utility

**Files:**
- Create: `src/tools/similarity.ts`
- Test: `test/tools/similarity.test.ts`

**Interfaces:**
- Produces: `function tokenize(text: string): string[]`, `interface ScoredItem<T> { item: T; score: number }`, `function scoreByKeywordOverlap<T>(keywords: string[], items: T[], getText: (item: T) => string): ScoredItem<T>[]`. Consumed by `src/tools/findSimilarFlows.ts` (Task 2) and `src/tools/findSimilarActions.ts` (Task 3).

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/similarity.test.ts
import { describe, expect, it } from 'vitest';
import { scoreByKeywordOverlap, tokenize } from '../../src/tools/similarity.js';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('Alta de Servicio-Internet')).toEqual(['alta', 'servicio', 'internet']);
  });

  it('removes Spanish and English stopwords', () => {
    expect(tokenize('la alta de un servicio para el cliente')).toEqual(['alta', 'servicio', 'cliente']);
  });

  it('returns an empty array for a string with only stopwords', () => {
    expect(tokenize('de la el')).toEqual([]);
  });

  it('preserves accented Spanish characters as part of a token', () => {
    expect(tokenize('configuración de red')).toEqual(['configuración', 'red']);
  });
});

describe('scoreByKeywordOverlap', () => {
  const items = [
    { label: 'Alta de servicio de Internet' },
    { label: 'Alta de servicio POTS' },
    { label: 'Reporte mensual de ventas' },
  ];

  it('scores each item by how many keywords appear in its text, case-insensitively', () => {
    const result = scoreByKeywordOverlap(['alta', 'servicio', 'internet'], items, (i) => i.label);
    expect(result).toEqual([
      { item: items[0], score: 3 },
      { item: items[1], score: 2 },
      { item: items[2], score: 0 },
    ]);
  });

  it('returns score 0 for every item when there are no keywords', () => {
    const result = scoreByKeywordOverlap([], items, (i) => i.label);
    expect(result.every((r) => r.score === 0)).toBe(true);
  });

  it('preserves input order and returns one entry per item, including zero scores', () => {
    const result = scoreByKeywordOverlap(['ventas'], items, (i) => i.label);
    expect(result.map((r) => r.item)).toEqual(items);
    expect(result.map((r) => r.score)).toEqual([0, 0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- similarity.test.ts`
Expected: FAIL — `src/tools/similarity.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/similarity.ts
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'para', 'con', 'en', 'un', 'una', 'y', 'o', 'del', 'al', 'que', 'se',
  'the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'is', 'are', 'be',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

export interface ScoredItem<T> {
  item: T;
  score: number;
}

export function scoreByKeywordOverlap<T>(
  keywords: string[],
  items: T[],
  getText: (item: T) => string
): ScoredItem<T>[] {
  return items.map((item) => {
    const haystack = getText(item).toLowerCase();
    const score = keywords.reduce((count, keyword) => (haystack.includes(keyword) ? count + 1 : count), 0);
    return { item, score };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- similarity.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/similarity.ts test/tools/similarity.test.ts
git commit -m "feat: add shared keyword-overlap similarity utility"
```

---

### Task 2: `find_similar_flows` tool

**Files:**
- Create: `src/tools/findSimilarFlows.ts`
- Test: `test/tools/findSimilarFlows.test.ts`

**Interfaces:**
- Consumes: `searchFlows` from `./searchFlows.js` (Phase 1 Task 10); `tokenize`, `scoreByKeywordOverlap` from `./similarity.js` (Task 1); `RosClientLike` (Phase 1 Task 6); `UserFlowSummary` (Phase 1 Task 7).
- Produces: `interface FindSimilarFlowsInput { requirement: string; limit?: number }`, `interface ScoredFlow { flow: UserFlowSummary; score: number }`, `function findSimilarFlows(client: RosClientLike, input: FindSimilarFlowsInput): Promise<ScoredFlow[]>`. Consumed by `src/server.ts` (Task 7).

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/findSimilarFlows.test.ts
import { describe, expect, it, vi } from 'vitest';
import { findSimilarFlows } from '../../src/tools/findSimilarFlows.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

function makeFlow(overrides: Partial<UserFlowSummary>): UserFlowSummary {
  return {
    flowId: 1,
    flowCode: 'X',
    flowDes: 'X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
    ...overrides,
  };
}

const flows = [
  makeFlow({ flowId: 1, flowCode: 'ALTA_SERVICIO_INTERNET', flowDes: 'Alta de servicio de Internet' }),
  makeFlow({ flowId: 2, flowCode: 'ALTA_SERVICIO_POTS', flowDes: 'Alta de servicio POTS' }),
  makeFlow({ flowId: 3, flowCode: 'REPORTE_VENTAS', flowDes: 'Reporte mensual de ventas' }),
];

describe('findSimilarFlows', () => {
  it('ranks flows by keyword overlap with the requirement, descending, excluding zero scores', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'necesito dar de alta un servicio de internet' });

    expect(result).toEqual([
      { flow: flows[0], score: 3 },
      { flow: flows[1], score: 2 },
    ]);
  });

  it('returns an empty array when no flow matches any keyword', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'facturación de roaming internacional' });

    expect(result).toEqual([]);
  });

  it('caps results at the given limit', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'alta de servicio', limit: 1 });

    expect(result).toEqual([{ flow: flows[0], score: 2 }]);
  });

  it('defaults to a limit of 10', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'alta de servicio' });

    expect(result.length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- findSimilarFlows.test.ts`
Expected: FAIL — `src/tools/findSimilarFlows.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/findSimilarFlows.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { UserFlowSummary } from '../rosClient/types.js';
import { searchFlows } from './searchFlows.js';
import { scoreByKeywordOverlap, tokenize } from './similarity.js';

export interface FindSimilarFlowsInput {
  requirement: string;
  limit?: number;
}

export interface ScoredFlow {
  flow: UserFlowSummary;
  score: number;
}

export async function findSimilarFlows(client: RosClientLike, input: FindSimilarFlowsInput): Promise<ScoredFlow[]> {
  const flows = await searchFlows(client, {});
  const keywords = tokenize(input.requirement);
  const limit = input.limit ?? 10;

  return scoreByKeywordOverlap(keywords, flows, (flow) => `${flow.flowCode} ${flow.flowDes}`)
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => ({ flow: scored.item, score: scored.score }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- findSimilarFlows.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/findSimilarFlows.ts test/tools/findSimilarFlows.test.ts
git commit -m "feat: add find_similar_flows tool"
```

---

### Task 3: `find_similar_actions` tool

**Files:**
- Create: `src/tools/findSimilarActions.ts`
- Test: `test/tools/findSimilarActions.test.ts`

**Interfaces:**
- Consumes: `searchActions` from `./searchActions.js` (Phase 1 Task 11); `tokenize`, `scoreByKeywordOverlap` from `./similarity.js` (Task 1); `RosClientLike` (Phase 1 Task 6); `RosAction` (Phase 1 Task 7).
- Produces: `interface FindSimilarActionsInput { requirement: string; limit?: number }`, `interface ScoredAction { action: RosAction; score: number }`, `function findSimilarActions(client: RosClientLike, input: FindSimilarActionsInput): Promise<ScoredAction[]>`. Consumed by `src/server.ts` (Task 7).

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/findSimilarActions.test.ts
import { describe, expect, it, vi } from 'vitest';
import { findSimilarActions } from '../../src/tools/findSimilarActions.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAction } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

function makeAction(overrides: Partial<RosAction>): RosAction {
  return {
    actionId: 1,
    actionCode: 'X',
    actionDes: 'X',
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
  makeAction({ actionId: 1, actionCode: 'GET_CUSTOMER', actionDes: 'Get customer data from CRM' }),
  makeAction({ actionId: 2, actionCode: 'GET_CUSTOMER_BALANCE', actionDes: 'Get customer balance' }),
  makeAction({ actionId: 3, actionCode: 'SEND_SMS', actionDes: 'Send an SMS notification' }),
];

describe('findSimilarActions', () => {
  it('ranks actions by keyword overlap with the requirement, descending, excluding zero scores', async () => {
    const client = fakeClient(() => ({ requestData: actions }));

    const result = await findSimilarActions(client, { requirement: 'customer data' });

    expect(result).toEqual([
      { action: actions[0], score: 2 },
      { action: actions[1], score: 1 },
    ]);
  });

  it('returns an empty array when no action matches any keyword', async () => {
    const client = fakeClient(() => ({ requestData: actions }));

    const result = await findSimilarActions(client, { requirement: 'facturación de roaming' });

    expect(result).toEqual([]);
  });

  it('caps results at the given limit', async () => {
    const client = fakeClient(() => ({ requestData: actions }));

    const result = await findSimilarActions(client, { requirement: 'customer data', limit: 1 });

    expect(result).toEqual([{ action: actions[0], score: 2 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- findSimilarActions.test.ts`
Expected: FAIL — `src/tools/findSimilarActions.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/findSimilarActions.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RosAction } from '../rosClient/types.js';
import { searchActions } from './searchActions.js';
import { scoreByKeywordOverlap, tokenize } from './similarity.js';

export interface FindSimilarActionsInput {
  requirement: string;
  limit?: number;
}

export interface ScoredAction {
  action: RosAction;
  score: number;
}

export async function findSimilarActions(client: RosClientLike, input: FindSimilarActionsInput): Promise<ScoredAction[]> {
  const actions = await searchActions(client, {});
  const keywords = tokenize(input.requirement);
  const limit = input.limit ?? 10;

  return scoreByKeywordOverlap(keywords, actions, (action) => `${action.actionCode} ${action.actionDes}`)
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((scored) => ({ action: scored.item, score: scored.score }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- findSimilarActions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/findSimilarActions.ts test/tools/findSimilarActions.test.ts
git commit -m "feat: add find_similar_actions tool"
```

---

### Task 4: Type the "related items" wire shapes

**Files:**
- Modify: `src/rosClient/types.ts`

**Interfaces:**
- Produces: `interface MemberItem`, `interface SplitMemberItem`, `interface SubprocessMemberItem`, `interface RelatedItem`. Retypes `SearchRosItem`'s `groupMembers`, `cloneMembers`, `parentMembers`, `splitMembers`, `subprocessMembers`, `flowItem` fields. Consumed by `src/tools/analyzeItem.ts` (Task 6).

**Verified contract (`ros_interface-xsd.xsd:306-422`):** `groupMembers`/`cloneMembers`/`parentMembers` → `ws:MemberList` → `{member: MemberItem[]}` where `MemberItem.itemId` is `xsd:decimal` (→ TS `number`) — the one field in this whole schema where itemId is numeric, not string. `splitMembers` → `ws:SplitMemberList` → `{member: SplitMemberItem[]}`, `itemId: xsd:string`. `subprocessMembers` → `ws:SubprocessMemberList` → `{member: SubprocessMemberItem[]}`, `itemId: xsd:string`, no `histSteps` field. `flowItem` → `ws:RelatedItem` directly (not a list wrapper), `itemId: xsd:string`.

No test file for this task — pure type declarations, verified by `tsc --noEmit`, same pattern as Phase 1 Task 7.

- [ ] **Step 1: Add the four new interfaces to `src/rosClient/types.ts`**

Insert immediately after the `SearchRosItemParam` interface and before the `SearchRosItem` interface:

```typescript
export interface MemberItem {
  itemId: number;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  histSteps?: { step: StepData[] } | null;
}

export interface SplitMemberItem {
  forStepId: number;
  itemId: string;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  histSteps?: { step: StepData[] } | null;
}

export interface SubprocessMemberItem {
  forStepId: number;
  itemId: string;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  rfsVersion: number;
}

export interface RelatedItem {
  itemId: string;
  flowCode: string;
  statusCode: string;
  statusDes: string;
  schedulerId: number | null;
  refItemStepId: number | null;
}
```

- [ ] **Step 2: Retype the six fields on `SearchRosItem`**

Find this block inside the `SearchRosItem` interface:

```typescript
  groupMembers?: unknown;
  cloneMembers?: unknown;
  parentMembers?: unknown;
  subprocessMembers?: unknown;
  splitMembers?: unknown;
  staticParams?: unknown;
  deepStatusLevelList?: unknown;
  deepStatusLevelIndependentList?: unknown;
  flowItem?: unknown;
```

Replace it with:

```typescript
  groupMembers?: { member: MemberItem[] } | null;
  cloneMembers?: { member: MemberItem[] } | null;
  parentMembers?: { member: MemberItem[] } | null;
  subprocessMembers?: { member: SubprocessMemberItem[] } | null;
  splitMembers?: { member: SplitMemberItem[] } | null;
  staticParams?: unknown;
  deepStatusLevelList?: unknown;
  deepStatusLevelIndependentList?: unknown;
  flowItem?: RelatedItem | null;
```

(`staticParams`, `deepStatusLevelList`, `deepStatusLevelIndependentList` stay `unknown` — out of scope for this plan, not used by any Phase 2 tool.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/rosClient/types.ts
git commit -m "feat: type SearchRosItem's related-item fields per verified XSD shapes"
```

---

### Task 5: `analyze_flow` tool

**Files:**
- Create: `src/tools/analyzeFlow.ts`
- Test: `test/tools/analyzeFlow.test.ts`

**Interfaces:**
- Consumes: `getFlow` from `./getFlow.js` (Phase 1 Task 8); `getFlowSteps` from `./getFlowSteps.js` (Phase 1 Task 9); `RosClientLike` (Phase 1 Task 6); `FlowInfo`, `StepOptimistic` (Phase 1 Task 7).
- Produces: `interface AnalyzeFlowInput { flowId: number }`, `interface FlowStepNode { stepId: number; actionId: number; action: RosAction; decision: string | null; decisionCriteria: string | null; bypass: string; children: FlowStepNode[] }`, `interface AnalyzeFlowResult { flow: FlowInfo; graph: FlowStepNode[] }`, `function analyzeFlow(client: RosClientLike, input: AnalyzeFlowInput): Promise<AnalyzeFlowResult>`. Consumed by `src/server.ts` (Task 7).

**Verified contract:** `StepOptimistic.parentStepId` is a non-nullable `long`; the flow's root step(s) use `parentStepId === 0` as the sentinel (confirmed by Phase 1's `test/tools/getFlowSteps.test.ts` fixture and the real ROS frontend). Branches (DECISION/SWITCH) are multiple `StepOptimistic` rows sharing the same `parentStepId`, disambiguated by the `decision` field — there is no separate edge list, the tree is derived purely from `parentStepId`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/analyzeFlow.test.ts
import { describe, expect, it, vi } from 'vitest';
import { analyzeFlow } from '../../src/tools/analyzeFlow.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RosAction, StepOptimistic } from '../../src/rosClient/types.js';

function fakeClient(opts: {
  getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown;
  postFormImpl: (path: string, form: Record<string, string | number>) => unknown;
}): RosClientLike {
  return {
    getJson: vi.fn(opts.getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(opts.postFormImpl) as RosClientLike['postForm'],
  };
}

function makeAction(overrides: Partial<RosAction>): RosAction {
  return {
    actionId: 1,
    actionCode: 'X',
    actionDes: 'X',
    syncBy: 'admin',
    workerClass: '',
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
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepOptimistic>): StepOptimistic {
  return {
    flowId: 34606,
    stepId: 1,
    parentStepId: 0,
    actionId: 1,
    flowActionDes: '',
    action: makeAction({}),
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
    ...overrides,
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 34606,
    flowCode: 'X',
    flowDes: 'X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'admin',
    version: 1,
    modDate: '2026-01-01T00:00:00Z',
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

describe('analyzeFlow', () => {
  it('fetches getFlow and getFlowSteps in parallel and returns the flow plus a step tree', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'START' }) }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'DO_WORK' }) }),
    ];
    const client = fakeClient({
      getJsonImpl: () => ({ requestData: flowInfoFixture }),
      postFormImpl: () => ({ requestData: steps }),
    });

    const result = await analyzeFlow(client, { flowId: 34606 });

    expect(result.flow).toEqual(flowInfoFixture);
    expect(result.graph).toEqual([
      {
        stepId: 1,
        actionId: 1,
        action: steps[0].action,
        decision: null,
        decisionCriteria: null,
        bypass: 'N',
        children: [
          {
            stepId: 2,
            actionId: 1,
            action: steps[1].action,
            decision: null,
            decisionCriteria: null,
            bypass: 'N',
            children: [],
          },
        ],
      },
    ]);
  });

  it('groups DECISION branches sharing a parentStepId as separate children disambiguated by decision', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'CHECK_ELIGIBILITY', actionType: 'DECISION' }) }),
      makeStep({ stepId: 2, parentStepId: 1, decision: 'SI', action: makeAction({ actionCode: 'APPROVE' }) }),
      makeStep({ stepId: 3, parentStepId: 1, decision: 'NO', action: makeAction({ actionCode: 'REJECT' }) }),
    ];
    const client = fakeClient({
      getJsonImpl: () => ({ requestData: flowInfoFixture }),
      postFormImpl: () => ({ requestData: steps }),
    });

    const result = await analyzeFlow(client, { flowId: 34606 });

    expect(result.graph[0].children).toHaveLength(2);
    expect(result.graph[0].children.map((c) => c.decision)).toEqual(['SI', 'NO']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analyzeFlow.test.ts`
Expected: FAIL — `src/tools/analyzeFlow.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/analyzeFlow.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { FlowInfo, StepOptimistic } from '../rosClient/types.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';

export interface AnalyzeFlowInput {
  flowId: number;
}

export interface FlowStepNode {
  stepId: number;
  actionId: number;
  action: StepOptimistic['action'];
  decision: string | null;
  decisionCriteria: string | null;
  bypass: string;
  children: FlowStepNode[];
}

export interface AnalyzeFlowResult {
  flow: FlowInfo;
  graph: FlowStepNode[];
}

export async function analyzeFlow(client: RosClientLike, input: AnalyzeFlowInput): Promise<AnalyzeFlowResult> {
  const [flow, steps] = await Promise.all([
    getFlow(client, { flowId: input.flowId }),
    getFlowSteps(client, { flowId: input.flowId }),
  ]);

  return { flow, graph: buildStepTree(steps) };
}

function buildStepTree(steps: StepOptimistic[]): FlowStepNode[] {
  const childrenByParent = new Map<number, StepOptimistic[]>();
  for (const step of steps) {
    const siblings = childrenByParent.get(step.parentStepId) ?? [];
    siblings.push(step);
    childrenByParent.set(step.parentStepId, siblings);
  }

  function buildNode(step: StepOptimistic): FlowStepNode {
    const children = (childrenByParent.get(step.stepId) ?? []).map(buildNode);
    return {
      stepId: step.stepId,
      actionId: step.actionId,
      action: step.action,
      decision: step.decision,
      decisionCriteria: step.decisionCriteria,
      bypass: step.bypass,
      children,
    };
  }

  return (childrenByParent.get(0) ?? []).map(buildNode);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- analyzeFlow.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/analyzeFlow.ts test/tools/analyzeFlow.test.ts
git commit -m "feat: add analyze_flow tool with step-tree reconstruction"
```

---

### Task 6: `analyze_item` tool

**Files:**
- Create: `src/tools/analyzeItem.ts`
- Test: `test/tools/analyzeItem.test.ts`

**Interfaces:**
- Consumes: `getItemInfo` from `./getItemInfo.js` (Phase 1 Task 15); `RosClientLike` (Phase 1 Task 6); `SearchRosItem`, `RosAction`, `MemberItem`, `SplitMemberItem`, `SubprocessMemberItem`, `RelatedItem` (Phase 1 Task 7 + this plan's Task 4).
- Produces: `interface AnalyzeItemInput { itemId: string }`, `interface ResolvedStep { stepId: number; action: RosAction }`, `interface AnalyzeItemRelatedItems { groupMembers: MemberItem[]; cloneMembers: MemberItem[]; parentMembers: MemberItem[]; splitMembers: SplitMemberItem[]; subprocessMembers: SubprocessMemberItem[]; flowItem: RelatedItem | null }`, `interface AnalyzeItemResult { item: SearchRosItem; currentStep: ResolvedStep | null; previousStep: (ResolvedStep & { elapsedMillis: number | null }) | null; relatedItems: AnalyzeItemRelatedItems }`, `function analyzeItem(client: RosClientLike, input: AnalyzeItemInput): Promise<AnalyzeItemResult>`. Consumed by `src/server.ts` (Task 7). This is the tool that answers the user's original "analiza el item" use case at the Fase 2 level of detail.

**Verified contract:** `getItemInfo`'s `recentHistory` (the Elasticsearch branch of `getStepDataExtraDetails`) is sorted most-recent-first, so `recentHistory[0]` is the latest historical entry, carrying `PREV_STEP_ID`/`PREV_ACTION_ID`/`PREV_ACTION_ELAPSED_MILLIS` as raw IDs that must be cross-referenced against `flowSteps` (by `stepId`) to resolve the actual action. If `recentHistory` is empty or the referenced step isn't found in `flowSteps`, `previousStep` is `null` — never invented or defaulted.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/analyzeItem.test.ts
import { describe, expect, it, vi } from 'vitest';
import { analyzeItem } from '../../src/tools/analyzeItem.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAction, SearchRosItem, StepDataExtraDetailEntry, StepOptimistic } from '../../src/rosClient/types.js';

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

function makeAction(overrides: Partial<RosAction>): RosAction {
  return {
    actionId: 1,
    actionCode: 'X',
    actionDes: 'X',
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

function makeStep(overrides: Partial<StepOptimistic>): StepOptimistic {
  return {
    flowId: 34606,
    stepId: 1,
    parentStepId: 0,
    actionId: 1,
    flowActionDes: '',
    action: makeAction({}),
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
    ...overrides,
  };
}

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
    histSteps: null,
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

describe('analyzeItem', () => {
  it('resolves currentStep and previousStep by cross-referencing flowSteps, and flattens relatedItems', async () => {
    const currentAction = makeAction({ actionId: 5, actionCode: 'CONFIG_NETWORK' });
    const previousAction = makeAction({ actionId: 4, actionCode: 'GET_CUSTOMER' });
    const flowSteps = [
      makeStep({ stepId: 4, actionId: 4, action: previousAction }),
      makeStep({ stepId: 5, actionId: 5, action: currentAction, parentStepId: 4 }),
    ];
    const recentHistory: StepDataExtraDetailEntry[] = [
      {
        STEP_ID: 5,
        ACTION_DES: 'Configure network element',
        STATUS_ID: 3,
        STATUS_DATE: '2026-08-20T10:05:00Z',
        TRANSACTION_DATE: null,
        REC_VERSION: 1,
        RETRIES: 3,
        WORKER_INSTANCE: null,
        ERROR_MESSAGE: 'Timeout calling NCE',
        PREV_ACTION_ID: 4,
        PREV_STEP_ID: 4,
        PREV_ACTION_ELAPSED_MILLIS: 120,
        PROCESS_TRANSACTION: null,
        EXPIRY_DATE: null,
      },
    ];
    const item = makeItem({
      groupMembers: { member: [{ itemId: 24378900, flowCode: 'X', flowDes: 'X', statusCode: 'OK', statusDes: 'OK' }] },
      parentMembers: { member: [{ itemId: 24378800, flowCode: 'Y', flowDes: 'Y', statusCode: 'OK', statusDes: 'OK' }] },
    });

    const client = fakeClient({
      postJsonImpl: (path) => {
        if (path === '/searchros') return { requestData: [item] };
        if (path === '/getStepDataExtraDetails') return { requestData: recentHistory };
        throw new Error(`unexpected postJson path ${path}`);
      },
      postFormImpl: () => ({ requestData: flowSteps }),
    });

    const result = await analyzeItem(client, { itemId: '24378914' });

    expect(result.currentStep).toEqual({ stepId: 5, action: currentAction });
    expect(result.previousStep).toEqual({ stepId: 4, action: previousAction, elapsedMillis: 120 });
    expect(result.relatedItems.groupMembers).toEqual([
      { itemId: 24378900, flowCode: 'X', flowDes: 'X', statusCode: 'OK', statusDes: 'OK' },
    ]);
    expect(result.relatedItems.parentMembers).toEqual([
      { itemId: 24378800, flowCode: 'Y', flowDes: 'Y', statusCode: 'OK', statusDes: 'OK' },
    ]);
    expect(result.relatedItems.cloneMembers).toEqual([]);
    expect(result.relatedItems.splitMembers).toEqual([]);
    expect(result.relatedItems.subprocessMembers).toEqual([]);
    expect(result.relatedItems.flowItem).toBeNull();
  });

  it('returns null currentStep/previousStep when no match exists, without throwing', async () => {
    const item = makeItem({ stepId: 99, histSteps: null });
    const client = fakeClient({
      postJsonImpl: (path) => {
        if (path === '/searchros') return { requestData: [item] };
        if (path === '/getStepDataExtraDetails') return { requestData: [] };
        throw new Error(`unexpected postJson path ${path}`);
      },
      postFormImpl: () => ({ requestData: [] }),
    });

    const result = await analyzeItem(client, { itemId: '24378914' });

    expect(result.currentStep).toBeNull();
    expect(result.previousStep).toBeNull();
    expect(result.relatedItems).toEqual({
      groupMembers: [],
      cloneMembers: [],
      parentMembers: [],
      splitMembers: [],
      subprocessMembers: [],
      flowItem: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analyzeItem.test.ts`
Expected: FAIL — `src/tools/analyzeItem.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/analyzeItem.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { MemberItem, RelatedItem, RosAction, SearchRosItem, SplitMemberItem, SubprocessMemberItem } from '../rosClient/types.js';
import { getItemInfo } from './getItemInfo.js';

export interface AnalyzeItemInput {
  itemId: string;
}

export interface ResolvedStep {
  stepId: number;
  action: RosAction;
}

export interface AnalyzeItemRelatedItems {
  groupMembers: MemberItem[];
  cloneMembers: MemberItem[];
  parentMembers: MemberItem[];
  splitMembers: SplitMemberItem[];
  subprocessMembers: SubprocessMemberItem[];
  flowItem: RelatedItem | null;
}

export interface AnalyzeItemResult {
  item: SearchRosItem;
  currentStep: ResolvedStep | null;
  previousStep: (ResolvedStep & { elapsedMillis: number | null }) | null;
  relatedItems: AnalyzeItemRelatedItems;
}

export async function analyzeItem(client: RosClientLike, input: AnalyzeItemInput): Promise<AnalyzeItemResult> {
  const { item, flowSteps, recentHistory } = await getItemInfo(client, { itemId: input.itemId });

  const stepById = new Map(flowSteps.map((step) => [step.stepId, step]));

  const currentStepMatch = stepById.get(item.stepId);
  const currentStep: ResolvedStep | null = currentStepMatch
    ? { stepId: currentStepMatch.stepId, action: currentStepMatch.action }
    : null;

  const latestHistory = recentHistory[0];
  const previousStepMatch = latestHistory ? stepById.get(latestHistory.PREV_STEP_ID ?? -1) : undefined;
  const previousStep =
    latestHistory && previousStepMatch
      ? {
          stepId: previousStepMatch.stepId,
          action: previousStepMatch.action,
          elapsedMillis: latestHistory.PREV_ACTION_ELAPSED_MILLIS,
        }
      : null;

  return {
    item,
    currentStep,
    previousStep,
    relatedItems: {
      groupMembers: item.groupMembers?.member ?? [],
      cloneMembers: item.cloneMembers?.member ?? [],
      parentMembers: item.parentMembers?.member ?? [],
      splitMembers: item.splitMembers?.member ?? [],
      subprocessMembers: item.subprocessMembers?.member ?? [],
      flowItem: item.flowItem ?? null,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- analyzeItem.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/analyzeItem.ts test/tools/analyzeItem.test.ts
git commit -m "feat: add analyze_item tool with step cross-referencing and related-item flattening"
```

---

### Task 7: Register the 4 new tools in the MCP server

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`

**Interfaces:**
- Consumes: `findSimilarFlows` (Task 2), `findSimilarActions` (Task 3), `analyzeFlow` (Task 5), `analyzeItem` (Task 6).
- Produces: nothing new — `registerTools`'s signature is unchanged, it just registers 4 more tools alongside Phase 1's 9.

- [ ] **Step 1: Update the failing assertion in `test/server.test.ts`**

In `test/server.test.ts`, find the first test's expected names array:

```typescript
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
```

Replace it with:

```typescript
    const names = server.registered.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        'analyze_flow',
        'analyze_item',
        'find_similar_actions',
        'find_similar_flows',
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- server.test.ts`
Expected: FAIL — only 9 tools are registered, the assertion now expects 13.

- [ ] **Step 3: Add the 4 new imports to `src/server.ts`**

Find this import block:

```typescript
import { getItemInfo } from './tools/getItemInfo.js';
import { searchRosItems } from './tools/searchRosItems.js';
```

Replace it with:

```typescript
import { getItemInfo } from './tools/getItemInfo.js';
import { searchRosItems } from './tools/searchRosItems.js';
import { findSimilarFlows } from './tools/findSimilarFlows.js';
import { findSimilarActions } from './tools/findSimilarActions.js';
import { analyzeFlow } from './tools/analyzeFlow.js';
import { analyzeItem } from './tools/analyzeItem.js';
```

- [ ] **Step 4: Register the 4 new tools**

Find the closing brace of `registerTools` — the line immediately after the `search_ros_items` `server.tool(...)` call ends:

```typescript
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

Replace it with:

```typescript
    async (args) => {
      try {
        return ok(await searchRosItems(client, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'find_similar_flows',
    'Find existing ROS flows similar to a natural-language requirement, ranked by keyword overlap.',
    { requirement: z.string(), limit: z.number().optional() },
    async (args) => {
      try {
        return ok(await findSimilarFlows(client, { requirement: args.requirement as string, limit: args.limit as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'find_similar_actions',
    'Find existing ROS actions similar to a natural-language requirement, ranked by keyword overlap.',
    { requirement: z.string(), limit: z.number().optional() },
    async (args) => {
      try {
        return ok(await findSimilarActions(client, { requirement: args.requirement as string, limit: args.limit as number | undefined }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'analyze_flow',
    'Reconstruct a ROS flow as a step tree (parent/child, decisions, actions) for easy explanation.',
    { flowId: z.number() },
    async (args) => {
      try {
        return ok(await analyzeFlow(client, { flowId: args.flowId as number }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'analyze_item',
    'Diagnose a ROS item: current/previous step with resolved actions, and related items (group/parent/split/subprocess).',
    { itemId: z.string() },
    async (args) => {
      try {
        return ok(await analyzeItem(client, { itemId: args.itemId as string }));
      } catch (err) {
        return fail(err);
      }
    }
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full suite and build**

Run: `npm test`
Expected: all tests pass (Phase 1's 59 plus this plan's new ones).

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat: register find_similar_flows, find_similar_actions, analyze_flow, analyze_item"
```

---

## Self-Review Notes

- **Spec coverage:** all 4 Phase 2 tools from the design spec (`find_similar_flows`, `find_similar_actions`, `analyze_flow`, `analyze_item`) map to Tasks 2, 3, 5, 6. The shared similarity utility (Task 1) and the related-items type extension (Task 4) are the two pieces of shared infrastructure the design calls for. Registration (Task 7) closes the loop so the tools are actually reachable via MCP, matching Phase 1's exact pattern.
- **Global Constraints check:** no new ROS endpoints anywhere in Tasks 1-7 (only Phase 1 tool functions are called). No invented business rules — `analyzeItem` returns facts (`currentStep`, `previousStep`, `relatedItems`) with no "cause" or "diagnosis" field. `MemberItem.itemId: number` vs. the other three types' `itemId: string` is preserved exactly per the verified XSD, not unified.
- **Type consistency check:** `ScoredFlow`/`ScoredAction` (Tasks 2-3), `FlowStepNode`/`AnalyzeFlowResult` (Task 5), and `ResolvedStep`/`AnalyzeItemRelatedItems`/`AnalyzeItemResult` (Task 6) all reference exactly the type names defined in Phase 1's `types.ts` or this plan's Task 4 — no drift. `server.ts`'s Task 7 registrations use the exact input field names (`requirement`, `limit`, `flowId`, `itemId`) each tool function's `Input` interface declares.

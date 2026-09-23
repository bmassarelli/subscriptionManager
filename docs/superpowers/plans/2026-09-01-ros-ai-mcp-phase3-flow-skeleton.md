# ros-ai-mcp — Fase 3: Flow Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 1 read-only "design support" MCP tool (`summarize_flow_skeleton`) that classifies an existing flow's step tree into technical roles (subflow/decision/end/external_call/custom_code/flow_control/other), so Claude can see a similar flow's reusable pattern at a glance before proposing how to adapt it to a new requirement.

**Architecture:** Same layering as Phase 1/2: a pure `(client: RosClientLike, input) => output` function in `src/tools/`, unit-tested against a fake client, registered in `src/server.ts`. Built entirely on top of Phase 2's `analyzeFlow` — zero new ROS endpoints. Requires one small, additive extension to Phase 2's `FlowStepNode` (Task 1) discovered while writing this plan: the design spec assumed `step.flow` (which signals "this step invokes a subflow") was already exposed on `FlowStepNode`, but Phase 2 never surfaced it — only `stepId`/`actionId`/`action`/`decision`/`decisionCriteria`/`bypass`/`children` are there today. Task 1 closes that gap before Task 2 depends on it.

**Tech Stack:** Same as Phase 1/2 — TypeScript, vitest, zod (already installed, no new dependencies).

## Global Constraints

- Read-only only. No WRITE endpoint may be called from any of these tools.
- No new ROS HTTP endpoints — everything in this plan is built by extending/combining Phase 2's `analyzeFlow`, which itself only combines Phase 1's `getFlow`+`getFlowSteps`.
- Classification is **purely structural**: only `actionType`, `commandType`, `workerClass`, and the presence of `step.flow` decide the role. Never infer business meaning from an action's Groovy source or name. No hardcoded allowlist of "known framework actionCodes" (e.g. `TM_ST`/`TM_N`) — explicitly deferred per the design spec's Non-goals.
- Fixed classification precedence (a step can match more than one rule; the first match wins), and every step in this order must have its own test case proving the precedence: **subflow > decision > end > external_call > custom_code > flow_control > other**. No step is ever silently dropped — unrecognized shapes fall through to `other`, never omitted.
- Every new/modified file follows the existing `ros-ai-mcp` repo conventions (ESM imports with `.js` extensions, `RosClientLike` dependency injection, no direct `RosClient` imports in tool files).
- This plan assumes Phase 2 (`analyzeFlow` and the other 3 intelligence tools) is already committed to `master` before Task 1 starts — Task 1 modifies Phase 2's `analyzeFlow.ts`, so it needs a clean base to build on.

---

## File Structure

```
ros-ai-mcp/
  src/
    tools/
      analyzeFlow.ts               # MODIFIED (Phase 2): FlowStepNode gains `invokesFlow`
      summarizeFlowSkeleton.ts     # NEW
    server.ts                      # MODIFIED: registerTools gains 1 more server.tool() call
  test/
    tools/
      analyzeFlow.test.ts              # MODIFIED: existing assertions + 1 new test
      summarizeFlowSkeleton.test.ts    # NEW
    server.test.ts                     # MODIFIED: expected tool-name list grows from 13 to 14
  README.md                        # MODIFIED: Scope section gains the 14th tool
```

---

### Task 1: Extend `analyzeFlow`'s `FlowStepNode` with `invokesFlow`

**Files:**
- Modify: `src/tools/analyzeFlow.ts`
- Modify: `test/tools/analyzeFlow.test.ts`

**Interfaces:**
- Produces: `FlowStepNode.invokesFlow: { flowId: number; flowCode: string } | null` — a new field on the existing Phase 2 type, derived from `StepOptimistic.flow: RosFlow | null` (already returned by `getFlowSteps`, just not surfaced on `FlowStepNode` before now). Consumed by `src/tools/summarizeFlowSkeleton.ts` (Task 2).

- [ ] **Step 1: Write the failing test**

In `test/tools/analyzeFlow.test.ts`, find the first test's expected `result.graph`:

```typescript
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
```

Replace it with (adds `invokesFlow: null` to both nodes):

```typescript
    expect(result.graph).toEqual([
      {
        stepId: 1,
        actionId: 1,
        action: steps[0].action,
        decision: null,
        decisionCriteria: null,
        bypass: 'N',
        invokesFlow: null,
        children: [
          {
            stepId: 2,
            actionId: 1,
            action: steps[1].action,
            decision: null,
            decisionCriteria: null,
            bypass: 'N',
            invokesFlow: null,
            children: [],
          },
        ],
      },
    ]);
```

Then, at the end of the file, find:

```typescript
    expect(result.graph.map((n) => n.stepId)).toEqual([1]);
    expect(result.droppedStepIds.sort((a, b) => a - b)).toEqual([3, 10, 11]);
  });
});
```

Replace it with (adds a new test after the existing one, keeping the closing braces):

```typescript
    expect(result.graph.map((n) => n.stepId)).toEqual([1]);
    expect(result.droppedStepIds.sort((a, b) => a - b)).toEqual([3, 10, 11]);
  });

  it('resolves invokesFlow from a populated step.flow, and null when the step has no flow', async () => {
    const subflow = {
      flowId: 30405,
      flowCode: 'TS-TRANSACTION-MANAGER',
      flowDes: 'TS - Transaction Manager',
      priority: 10,
      activeFlag: 'Y',
      massFlag: 'Y',
      rosFlag: 'Y',
      inMemoryFlag: 'N',
      dbReprocessFlag: 'N',
      syncBy: 'NONE',
      version: 1,
      modDate: '2026-01-01T00:00:00Z',
      userName: 'admin',
      eagerFlag: 'N',
    };
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'INFLOW' }), flow: subflow }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'OUTFLOW' }) }),
    ];
    const client = fakeClient({
      getJsonImpl: () => ({ requestData: flowInfoFixture }),
      postFormImpl: () => ({ requestData: steps }),
    });

    const result = await analyzeFlow(client, { flowId: 34606 });

    expect(result.graph[0].invokesFlow).toEqual({ flowId: 30405, flowCode: 'TS-TRANSACTION-MANAGER' });
    expect(result.graph[0].children[0].invokesFlow).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- analyzeFlow.test.ts`
Expected: FAIL — `invokesFlow` doesn't exist on `FlowStepNode` yet, and the two updated `toEqual` assertions no longer match the actual (field-missing) output.

- [ ] **Step 3: Write the implementation**

In `src/tools/analyzeFlow.ts`, find:

```typescript
export interface FlowStepNode {
  stepId: number;
  actionId: number;
  action: StepOptimistic['action'];
  decision: string | null;
  decisionCriteria: string | null;
  bypass: string;
  children: FlowStepNode[];
}
```

Replace it with:

```typescript
export interface FlowStepNode {
  stepId: number;
  actionId: number;
  action: StepOptimistic['action'];
  decision: string | null;
  decisionCriteria: string | null;
  bypass: string;
  /** Non-null when this step clones into a subflow (StepOptimistic.flow populated), e.g. an INFLOW step. */
  invokesFlow: { flowId: number; flowCode: string } | null;
  children: FlowStepNode[];
}
```

Then find:

```typescript
  function buildNode(step: StepOptimistic): FlowStepNode {
    visited.add(step.stepId);
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
```

Replace it with:

```typescript
  function buildNode(step: StepOptimistic): FlowStepNode {
    visited.add(step.stepId);
    const children = (childrenByParent.get(step.stepId) ?? []).map(buildNode);
    return {
      stepId: step.stepId,
      actionId: step.actionId,
      action: step.action,
      decision: step.decision,
      decisionCriteria: step.decisionCriteria,
      bypass: step.bypass,
      invokesFlow: step.flow ? { flowId: step.flow.flowId, flowCode: step.flow.flowCode } : null,
      children,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- analyzeFlow.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/analyzeFlow.ts test/tools/analyzeFlow.test.ts
git commit -m "feat: expose invokesFlow on analyzeFlow's FlowStepNode for subflow detection"
```

---

### Task 2: `summarize_flow_skeleton` tool

**Files:**
- Create: `src/tools/summarizeFlowSkeleton.ts`
- Test: `test/tools/summarizeFlowSkeleton.test.ts`

**Interfaces:**
- Consumes: `analyzeFlow`, `FlowStepNode` from `./analyzeFlow.js` (Phase 2 + Task 1); `RosClientLike` (Phase 1).
- Produces: `interface SummarizeFlowSkeletonInput { flowId: number }`, `type FlowSkeletonRole = 'subflow' | 'decision' | 'end' | 'external_call' | 'custom_code' | 'flow_control' | 'other'`, `interface FlowSkeletonNode { stepId, role, actionCode, actionDes, invokesFlow, decisionCriteria, decision, terminal, protocol, domain, language, commandType, children }`, `interface FlowSkeletonResult { flow: {flowId,flowCode,flowDes}; skeleton: FlowSkeletonNode[]; droppedStepIds: number[] }`, `function summarizeFlowSkeleton(client: RosClientLike, input: SummarizeFlowSkeletonInput): Promise<FlowSkeletonResult>`. Consumed by `src/server.ts` (Task 3).

**Verified contract:** classification precedence is fixed (see Global Constraints): `invokesFlow` (from Task 1) wins over everything, then `actionType === 'DECISION'`, then `actionType === 'END'`, then `commandType === 'SOAP'|'REST'`, then `commandType === 'GROOVY'|'PYTHON'`, then `commandType === 'CLASS'`, then `other` as the catch-all that never drops a step.

- [ ] **Step 1: Write the failing test**

```typescript
// test/tools/summarizeFlowSkeleton.test.ts
import { describe, expect, it, vi } from 'vitest';
import { summarizeFlowSkeleton } from '../../src/tools/summarizeFlowSkeleton.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RosAction, RosFlow, StepOptimistic } from '../../src/rosClient/types.js';

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
    flowId: 64105,
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

function makeSubflow(overrides: Partial<RosFlow> = {}): RosFlow {
  return {
    flowId: 30405,
    flowCode: 'TS-TRANSACTION-MANAGER',
    flowDes: 'TS - Transaction Manager',
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'NONE',
    version: 1,
    modDate: '2026-01-01T00:00:00Z',
    userName: 'admin',
    eagerFlag: 'N',
    ...overrides,
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 64105,
    flowCode: 'SERVICE_ORDERING_PROVISIONING',
    flowDes: 'Service Ordering - Provisioning',
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'NONE',
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

function client(steps: StepOptimistic[]): RosClientLike {
  return fakeClient({
    getJsonImpl: () => ({ requestData: flowInfoFixture }),
    postFormImpl: () => ({ requestData: steps }),
  });
}

describe('summarizeFlowSkeleton', () => {
  it('returns a projected flow header and classifies a step with populated flow as subflow, even over DECISION', async () => {
    // Synthetic: actionType DECISION + a populated `flow` never happens on real INFLOW steps,
    // but this proves the precedence rule (subflow beats everything) rather than the realism of the fixture.
    const steps = [
      makeStep({
        stepId: 1,
        parentStepId: 0,
        action: makeAction({ actionCode: 'INFLOW', actionType: 'DECISION', commandType: 'CLASS' }),
        flow: makeSubflow(),
      }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.flow).toEqual({ flowId: 64105, flowCode: 'SERVICE_ORDERING_PROVISIONING', flowDes: 'Service Ordering - Provisioning' });
    expect(result.skeleton[0].role).toBe('subflow');
    expect(result.skeleton[0].invokesFlow).toEqual({ flowId: 30405, flowCode: 'TS-TRANSACTION-MANAGER' });
  });

  it('classifies a DECISION step as decision, propagating criteria and branch label, winning over commandType CLASS', async () => {
    const steps = [
      makeStep({
        stepId: 1,
        parentStepId: 0,
        action: makeAction({ actionCode: 'INLINEDEC', actionType: 'DECISION', commandType: 'CLASS' }),
        decisionCriteria: "binding.hasVariable('balance') && balance > 0",
        decision: 'SI',
      }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0]).toMatchObject({
      role: 'decision',
      decisionCriteria: "binding.hasVariable('balance') && balance > 0",
      decision: 'SI',
    });
  });

  it('classifies an END step as end, exposing workerClass as terminal, regardless of commandType', async () => {
    const steps = [makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'ES', actionType: 'END', workerClass: 'SUCCESS' }) })];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0]).toMatchObject({ role: 'end', terminal: 'SUCCESS' });
  });

  it('classifies SOAP and REST commandTypes as external_call, with protocol and domain', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'SOAP_CALL', commandType: 'SOAP', domain: '${URL.INU.SERVICIO}' }) }),
      makeStep({
        stepId: 2,
        parentStepId: 1,
        action: makeAction({ actionCode: 'REST_CALL', commandType: 'REST', domain: '${SERVICE_ORDERING_PROVISIONING.ENDPOINT.CALLBACK}' }),
      }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0]).toMatchObject({ role: 'external_call', protocol: 'soap', domain: '${URL.INU.SERVICIO}' });
    expect(result.skeleton[0].children[0]).toMatchObject({
      role: 'external_call',
      protocol: 'rest',
      domain: '${SERVICE_ORDERING_PROVISIONING.ENDPOINT.CALLBACK}',
    });
  });

  it('classifies GROOVY and PYTHON commandTypes as custom_code, with language', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'GROOVY_STEP', commandType: 'GROOVY' }) }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'PY_STEP', commandType: 'PYTHON' }) }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0]).toMatchObject({ role: 'custom_code', language: 'groovy' });
    expect(result.skeleton[0].children[0]).toMatchObject({ role: 'custom_code', language: 'python' });
  });

  it('classifies commandType CLASS steps that are not subflow/decision/end as flow_control (e.g. OUTFLOW)', async () => {
    const steps = [makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'OUTFLOW', actionType: 'ACTION', commandType: 'CLASS' }) })];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0].role).toBe('flow_control');
  });

  it('falls back to other for an unrecognized commandType, never dropping the step', async () => {
    const steps = [makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'MYSTERY', actionType: 'ACTION', commandType: 'CUSTOM_TYPE' }) })];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton).toHaveLength(1);
    expect(result.skeleton[0]).toMatchObject({ role: 'other', commandType: 'CUSTOM_TYPE' });
  });

  it('preserves nested children and passes droppedStepIds through unchanged from analyzeFlow', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'START' }) }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'CHILD' }) }),
      makeStep({ stepId: 3, parentStepId: 77, action: makeAction({ actionCode: 'DANGLING_PARENT' }) }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0].stepId).toBe(1);
    expect(result.skeleton[0].children[0].stepId).toBe(2);
    expect(result.droppedStepIds).toEqual([3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- summarizeFlowSkeleton.test.ts`
Expected: FAIL — `src/tools/summarizeFlowSkeleton.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/summarizeFlowSkeleton.ts
import type { RosClientLike } from '../rosClient/rosClient.js';
import { analyzeFlow } from './analyzeFlow.js';
import type { FlowStepNode } from './analyzeFlow.js';

export interface SummarizeFlowSkeletonInput {
  flowId: number;
}

export type FlowSkeletonRole = 'subflow' | 'decision' | 'end' | 'external_call' | 'custom_code' | 'flow_control' | 'other';

export interface FlowSkeletonNode {
  stepId: number;
  role: FlowSkeletonRole;
  actionCode: string;
  actionDes: string;
  invokesFlow: { flowId: number; flowCode: string } | null;
  decisionCriteria: string | null;
  decision: string | null;
  terminal: string | null;
  protocol: 'soap' | 'rest' | null;
  domain: string | null;
  language: 'groovy' | 'python' | null;
  commandType: string | null;
  children: FlowSkeletonNode[];
}

export interface FlowSkeletonResult {
  flow: { flowId: number; flowCode: string; flowDes: string };
  skeleton: FlowSkeletonNode[];
  droppedStepIds: number[];
}

const NULL_ROLE_FIELDS = {
  invokesFlow: null,
  decisionCriteria: null,
  decision: null,
  terminal: null,
  protocol: null,
  domain: null,
  language: null,
  commandType: null,
};

export async function summarizeFlowSkeleton(client: RosClientLike, input: SummarizeFlowSkeletonInput): Promise<FlowSkeletonResult> {
  const { flow, graph, droppedStepIds } = await analyzeFlow(client, { flowId: input.flowId });

  return {
    flow: { flowId: flow.flow.flowId, flowCode: flow.flow.flowCode, flowDes: flow.flow.flowDes },
    skeleton: graph.map(classifyNode),
    droppedStepIds,
  };
}

function classifyNode(node: FlowStepNode): FlowSkeletonNode {
  const children = node.children.map(classifyNode);
  const shared = {
    stepId: node.stepId,
    actionCode: node.action.actionCode,
    actionDes: node.action.actionDes,
    children,
  };

  if (node.invokesFlow) {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'subflow', invokesFlow: node.invokesFlow };
  }

  if (node.action.actionType === 'DECISION') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'decision', decisionCriteria: node.decisionCriteria, decision: node.decision };
  }

  if (node.action.actionType === 'END') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'end', terminal: node.action.workerClass };
  }

  if (node.action.commandType === 'SOAP' || node.action.commandType === 'REST') {
    return {
      ...shared,
      ...NULL_ROLE_FIELDS,
      role: 'external_call',
      protocol: node.action.commandType === 'SOAP' ? 'soap' : 'rest',
      domain: node.action.domain,
    };
  }

  if (node.action.commandType === 'GROOVY' || node.action.commandType === 'PYTHON') {
    return {
      ...shared,
      ...NULL_ROLE_FIELDS,
      role: 'custom_code',
      language: node.action.commandType === 'GROOVY' ? 'groovy' : 'python',
    };
  }

  if (node.action.commandType === 'CLASS') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'flow_control' };
  }

  return { ...shared, ...NULL_ROLE_FIELDS, role: 'other', commandType: node.action.commandType };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- summarizeFlowSkeleton.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/summarizeFlowSkeleton.ts test/tools/summarizeFlowSkeleton.test.ts
git commit -m "feat: add summarize_flow_skeleton tool for design-by-analogy"
```

---

### Task 3: Register `summarize_flow_skeleton` in the MCP server

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `summarizeFlowSkeleton` (Task 2).
- Produces: nothing new — `registerTools`'s signature is unchanged, it just registers 1 more tool alongside the existing 13.

- [ ] **Step 1: Update the failing assertion in `test/server.test.ts`**

Find:

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
        'summarize_flow_skeleton',
      ].sort()
    );
```

Also update the test's `it(...)` description just above (find `'registers all 9 Phase-1 read-only tools plus the 4 Phase-2 intelligence tools'`, replace with `'registers all 9 Phase-1 read-only tools, the 4 Phase-2 intelligence tools, and the Phase-3 skeleton tool'`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- server.test.ts`
Expected: FAIL — only 13 tools are registered, the assertion now expects 14.

- [ ] **Step 3: Add the import to `src/server.ts`**

Find:

```typescript
import { analyzeFlow } from './tools/analyzeFlow.js';
import { analyzeItem } from './tools/analyzeItem.js';
```

Replace it with:

```typescript
import { analyzeFlow } from './tools/analyzeFlow.js';
import { analyzeItem } from './tools/analyzeItem.js';
import { summarizeFlowSkeleton } from './tools/summarizeFlowSkeleton.js';
```

- [ ] **Step 4: Register the tool**

Find the closing brace of `registerTools` — the line right after the `analyze_item` `server.tool(...)` call ends:

```typescript
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

Replace it with:

```typescript
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

  server.tool(
    'summarize_flow_skeleton',
    'Classify a ROS flow\'s step tree into technical roles (subflow, decision, end, external_call, custom_code, flow_control, other) to see its reusable pattern at a glance.',
    { flowId: z.number() },
    async (args) => {
      try {
        return ok(await summarizeFlowSkeleton(client, { flowId: args.flowId as number }));
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

- [ ] **Step 6: Update `README.md`'s Scope section**

Find:

```markdown
**Phase 2 — intelligence (4 tools):** `find_similar_flows`,
`find_similar_actions`, `analyze_flow`, `analyze_item`. Built entirely on top
of Phase 1's tools — no new ROS HTTP endpoints.
```

Replace it with:

```markdown
**Phase 2 — intelligence (4 tools):** `find_similar_flows`,
`find_similar_actions`, `analyze_flow`, `analyze_item`. Built entirely on top
of Phase 1's tools — no new ROS HTTP endpoints.

**Phase 3 — design support (1 tool):** `summarize_flow_skeleton`. Classifies
an `analyze_flow` tree into technical roles (subflow/decision/end/
external_call/custom_code/flow_control/other) so a similar flow's reusable
pattern is visible at a glance. No new ROS HTTP endpoints, no business-rule
inference — purely structural classification.
```

Also find the line above the tool lists:

```markdown
13 read-only tools, no write operations, no `execute_flow`.
```

Replace it with:

```markdown
14 read-only tools, no write operations, no `execute_flow`.
```

- [ ] **Step 7: Run the full suite and build**

Run: `npm test`
Expected: all tests pass (93 total across 21 files: Phase 1+2's 84 plus this plan's 1 modified + 8 new).

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/server.ts test/server.test.ts README.md
git commit -m "feat: register summarize_flow_skeleton and update README scope"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's single tool (`summarize_flow_skeleton`) maps to Task 2, with its exact classification precedence and field shape. Task 1 is a plan-time addition, not a spec requirement — it closes a gap the spec's design section implicitly assumed away (`step.flow` "already" being on `FlowStepNode`), discovered while reading Phase 2's actual current code during planning. Task 3 closes the loop so the tool is reachable via MCP, matching Phase 1/2's exact registration pattern, plus keeps `README.md` accurate (per the precedent set fixing Phase 2's own stale README during its review fix wave).
- **Global Constraints check:** no new ROS endpoints anywhere in Tasks 1-3 (Task 1 only adds a field already present in `StepOptimistic`; Task 2 only calls `analyzeFlow`). No business-rule inference — classification only reads `actionType`/`commandType`/`workerClass`/`step.flow` presence, no actionCode allowlist. Precedence order is fixed and every branch has its own test proving it wins over the branches below it (subflow-over-decision, decision-over-flow_control-via-CLASS, end-over-any-commandType). No step is ever dropped — the `other` fallback test explicitly proves this.
- **Type consistency check:** `FlowSkeletonNode`/`FlowSkeletonResult`/`SummarizeFlowSkeletonInput` (Task 2) reference exactly `FlowStepNode.invokesFlow` as typed in Task 1 — no drift. `server.ts`'s Task 3 registration uses the exact input field name (`flowId`) that `SummarizeFlowSkeletonInput` declares, same pattern as `analyze_flow`'s existing registration.

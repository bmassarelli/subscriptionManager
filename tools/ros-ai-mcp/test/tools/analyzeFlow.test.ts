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

  it('reports unreachable steps (dangling parent or a cycle) as droppedStepIds instead of silently omitting them', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'START' }) }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'DO_WORK' }) }),
      makeStep({ stepId: 3, parentStepId: 77, action: makeAction({ actionCode: 'DANGLING_PARENT' }) }),
      makeStep({ stepId: 10, parentStepId: 11, action: makeAction({ actionCode: 'CYCLE_A' }) }),
      makeStep({ stepId: 11, parentStepId: 10, action: makeAction({ actionCode: 'CYCLE_B' }) }),
    ];
    const client = fakeClient({
      getJsonImpl: () => ({ requestData: flowInfoFixture }),
      postFormImpl: () => ({ requestData: steps }),
    });

    const result = await analyzeFlow(client, { flowId: 34606 });

    expect(result.graph.map((n) => n.stepId)).toEqual([1]);
    expect(result.droppedStepIds.sort((a, b) => a - b)).toEqual([3, 10, 11]);
  });

  it('terminates without recursing forever when a step loops back to an already-visited ancestor', async () => {
    const steps = [
      makeStep({ stepId: 1, parentStepId: 0, action: makeAction({ actionCode: 'START' }) }),
      makeStep({ stepId: 2, parentStepId: 1, action: makeAction({ actionCode: 'CHECK' }) }),
      makeStep({ stepId: 3, parentStepId: 2, action: makeAction({ actionCode: 'END' }) }),
      makeStep({ stepId: 1, parentStepId: 2, action: makeAction({ actionCode: 'START' }) }),
    ];
    const client = fakeClient({
      getJsonImpl: () => ({ requestData: flowInfoFixture }),
      postFormImpl: () => ({ requestData: steps }),
    });

    const result = await analyzeFlow(client, { flowId: 34606 });

    expect(result.graph).toHaveLength(1);
    expect(result.graph[0].stepId).toBe(1);
    const [checkNode] = result.graph[0].children;
    expect(checkNode.stepId).toBe(2);
    expect(checkNode.children.map((c) => c.stepId).sort()).toEqual([1, 3]);
    const loopBackNode = checkNode.children.find((c) => c.stepId === 1);
    expect(loopBackNode?.children).toEqual([]);
    expect(result.droppedStepIds).toEqual([]);
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

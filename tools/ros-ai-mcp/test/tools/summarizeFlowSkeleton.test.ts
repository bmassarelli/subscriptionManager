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

  it('propagates the DECISION branch label onto the children that carry it, not the DECISION step itself', async () => {
    const steps = [
      makeStep({
        stepId: 1,
        parentStepId: 0,
        action: makeAction({ actionCode: 'INLINEDEC', actionType: 'DECISION', commandType: 'CLASS' }),
        decisionCriteria: "binding.hasVariable('balance') && balance > 0",
        decision: null,
      }),
      makeStep({
        stepId: 2,
        parentStepId: 1,
        action: makeAction({ actionCode: 'YES_BRANCH', commandType: 'GROOVY' }),
        decision: 'SI',
      }),
      makeStep({
        stepId: 3,
        parentStepId: 1,
        action: makeAction({ actionCode: 'NO_BRANCH', commandType: 'GROOVY' }),
        decision: 'NO',
      }),
    ];

    const result = await summarizeFlowSkeleton(client(steps), { flowId: 64105 });

    expect(result.skeleton[0].children[0]).toMatchObject({ role: 'custom_code', decision: 'SI' });
    expect(result.skeleton[0].children[1]).toMatchObject({ role: 'custom_code', decision: 'NO' });
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

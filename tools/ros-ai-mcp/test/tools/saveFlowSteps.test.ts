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

  it('confirm:true treats a response with neither successMessage nor errorMessage as a failure, not a false success', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
      postJson: vi.fn().mockImplementation((path: string) => {
        if (path === '/getRosActions') return Promise.resolve({ requestData: [actionFixture('TM_ST')] });
        if (path === '/getUserFlows') return Promise.resolve({ requestData: [] });
        if (path === '/saveFlowStep') return Promise.resolve({}); // no successMessage, no errorMessage
        return Promise.resolve({});
      }),
    });

    const result = await saveFlowSteps(client, {
      flowId: 88001,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/did not confirm/i);
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

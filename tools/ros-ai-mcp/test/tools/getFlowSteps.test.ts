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

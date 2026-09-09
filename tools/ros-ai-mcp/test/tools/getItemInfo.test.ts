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

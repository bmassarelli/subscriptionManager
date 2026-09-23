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

  it('returns previousStep as null when PREV_STEP_ID does not resolve to any known flowStep (dangling reference)', async () => {
    const currentAction = makeAction({ actionId: 5, actionCode: 'CONFIG_NETWORK' });
    const flowSteps = [makeStep({ stepId: 5, actionId: 5, action: currentAction })];
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
        PREV_ACTION_ID: 99,
        PREV_STEP_ID: 99,
        PREV_ACTION_ELAPSED_MILLIS: 120,
        PROCESS_TRANSACTION: null,
        EXPIRY_DATE: null,
      },
    ];
    const item = makeItem();

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
    expect(result.previousStep).toBeNull();
  });

  it('flattens populated splitMembers, subprocessMembers, and flowItem', async () => {
    const item = makeItem({
      splitMembers: {
        member: [
          { forStepId: 3, itemId: '24378920', flowCode: 'X', flowDes: 'X', statusCode: 'OK', statusDes: 'OK' },
        ],
      },
      subprocessMembers: {
        member: [
          {
            forStepId: 3,
            itemId: '24378930',
            flowCode: 'X',
            flowDes: 'X',
            statusCode: 'OK',
            statusDes: 'OK',
            rfsVersion: 1,
          },
        ],
      },
      flowItem: {
        itemId: '24378940',
        flowCode: 'Y',
        statusCode: 'OK',
        statusDes: 'OK',
        schedulerId: null,
        refItemStepId: 3,
      },
    });

    const client = fakeClient({
      postJsonImpl: (path) => {
        if (path === '/searchros') return { requestData: [item] };
        if (path === '/getStepDataExtraDetails') return { requestData: [] };
        throw new Error(`unexpected postJson path ${path}`);
      },
      postFormImpl: () => ({ requestData: [] }),
    });

    const result = await analyzeItem(client, { itemId: '24378914' });

    expect(result.relatedItems.splitMembers).toEqual([
      { forStepId: 3, itemId: '24378920', flowCode: 'X', flowDes: 'X', statusCode: 'OK', statusDes: 'OK' },
    ]);
    expect(result.relatedItems.subprocessMembers).toEqual([
      {
        forStepId: 3,
        itemId: '24378930',
        flowCode: 'X',
        flowDes: 'X',
        statusCode: 'OK',
        statusDes: 'OK',
        rfsVersion: 1,
      },
    ]);
    expect(result.relatedItems.flowItem).toEqual({
      itemId: '24378940',
      flowCode: 'Y',
      statusCode: 'OK',
      statusDes: 'OK',
      schedulerId: null,
      refItemStepId: 3,
    });
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

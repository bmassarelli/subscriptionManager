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

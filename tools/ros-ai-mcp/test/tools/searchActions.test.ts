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

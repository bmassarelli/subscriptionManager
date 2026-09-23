// test/tools/getAction.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getAction } from '../../src/tools/getAction.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { ActionDBConfig, RosAction } from '../../src/rosClient/types.js';

const action: RosAction = {
  actionId: 42,
  actionCode: 'GET_CUSTOMER',
  actionDes: 'Get customer data',
  syncBy: 'admin',
  workerClass: '',
  command: 'return http.get(...)',
  actionType: 'ACTION',
  commandType: 'REST',
  domain: 'https://crm.internal',
  protocol: 'https',
  method: 'GET',
  contentType: 'application/json',
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  eager: 'N',
  hash: 'abc',
  actionYmlConfig: {},
};

const config: ActionDBConfig = {
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  config: {
    GET_CUSTOMER: {
      SYSTEM: 'CRM',
      READ_TIMEOUT: 5000,
      CONNECT_TIMEOUT: 3000,
      DESCRIPTION: 'Fetches customer data from CRM',
    },
  },
};

function fakeClient(getJsonImpl: (path: string) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getAction', () => {
  it('fetches /actionInformation/{actionId} and /actionDBConfig/{actionId} and combines them', async () => {
    const paths: string[] = [];
    const client = fakeClient((path) => {
      paths.push(path);
      if (path === '/actionInformation/42') return { requestData: action };
      if (path === '/actionDBConfig/42') return { requestData: config };
      throw new Error(`unexpected path ${path}`);
    });

    const result = await getAction(client, { actionId: 42 });

    expect(paths.sort()).toEqual(['/actionDBConfig/42', '/actionInformation/42']);
    expect(result).toEqual({ action, config });
  });

  it('uses the versioned path when actionVersion is given', async () => {
    const client = fakeClient((path) => {
      if (path === '/actionInformation/42/2') return { requestData: { ...action, histId: 501 } };
      if (path === '/actionDBConfig/42') return { requestData: config };
      throw new Error(`unexpected path ${path}`);
    });

    const result = await getAction(client, { actionId: 42, actionVersion: 2 });

    expect(result.action).toEqual({ ...action, histId: 501 });
  });
});

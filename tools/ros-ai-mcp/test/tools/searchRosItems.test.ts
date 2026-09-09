import { describe, expect, it, vi } from 'vitest';
import { searchRosItems } from '../../src/tools/searchRosItems.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { SearchRosItem } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

const items = [] as SearchRosItem[];

describe('searchRosItems', () => {
  it('posts to /searchros with default pageNumber/pageSize and no itemId', async () => {
    const client = fakeClient((path, body) => {
      expect(path).toBe('/searchros');
      expect(body).toEqual({ pageNumber: 1, pageSize: 20 });
      return { requestData: items };
    });

    await searchRosItems(client);
  });

  it('passes through provided filter criteria verbatim', async () => {
    const client = fakeClient((_path, body) => {
      expect(body).toEqual({
        pageNumber: 2,
        pageSize: 50,
        flowId: 34606,
        statusId: 3,
        errorCode: 'NCE-500',
        customerId: 'CUST-1',
      });
      return { requestData: items };
    });

    await searchRosItems(client, {
      pageNumber: 2,
      pageSize: 50,
      flowId: 34606,
      statusId: 3,
      errorCode: 'NCE-500',
      customerId: 'CUST-1',
    });
  });

  it('returns requestData as-is', async () => {
    const client = fakeClient(() => ({ requestData: items }));

    const result = await searchRosItems(client);

    expect(result).toBe(items);
  });
});

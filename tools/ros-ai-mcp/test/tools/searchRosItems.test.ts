import { describe, expect, it, vi } from 'vitest';
import { searchRosItems } from '../../src/tools/searchRosItems.js';
import { RosInvalidRequestError } from '../../src/errors.js';
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

  // ROS's own /searchros endpoint silently returns requestData: null for
  // searchHistory:true unless the query is bounded one of two ways (verified live
  // against ROS DEV 2026-09-11, second round of testing — the GUI's own request body
  // for this same search showed the first (entity-key-only) fix was incomplete):
  //   (a) an entity-key field (customerId/contractId/externalId/orderno/messageId), or
  //   (b) BOTH statusStartDate and statusEndDate ("YYYY/MM/DD HH:mm:ss"), spanning at
  //       most ~31 days — startDate/endDate/initialExecutionDate/finalExecutionDate do
  //       nothing for history search.
  // flowId/statusId/actionId/step alone are never enough either way.
  describe('searchHistory requires an entity-key field or a bounded status date range', () => {
    it('rejects searchHistory:true with only flowId/statusId/dates', async () => {
      const client = fakeClient(() => ({ requestData: null }));

      await expect(
        searchRosItems(client, {
          flowId: 57305,
          statusId: 100,
          searchHistory: true,
          initialExecutionDate: '2026-01-01',
          finalExecutionDate: '2026-01-31',
        })
      ).rejects.toThrow(RosInvalidRequestError);
    });

    it('rejects searchHistory:true with no filters at all', async () => {
      const client = fakeClient(() => ({ requestData: null }));

      await expect(searchRosItems(client, { searchHistory: true })).rejects.toThrow(RosInvalidRequestError);
    });

    it('rejects searchHistory:true with only statusStartDate (no statusEndDate)', async () => {
      const client = fakeClient(() => ({ requestData: null }));

      await expect(
        searchRosItems(client, { flowId: 57305, searchHistory: true, statusStartDate: '2026/01/01 00:00:00' })
      ).rejects.toThrow(RosInvalidRequestError);
    });

    it('rejects searchHistory:true with a statusStartDate/statusEndDate span over ~31 days', async () => {
      const client = fakeClient(() => ({ requestData: null }));

      await expect(
        searchRosItems(client, {
          flowId: 57305,
          searchHistory: true,
          statusStartDate: '2026/01/01 00:00:00',
          statusEndDate: '2026/02/14 23:59:59',
        })
      ).rejects.toThrow(RosInvalidRequestError);
    });

    it('allows searchHistory:true with a statusStartDate/statusEndDate span within ~31 days', async () => {
      const client = fakeClient((_path, body) => {
        expect((body as Record<string, unknown>).statusStartDate).toBe('2026/01/01 00:00:00');
        expect((body as Record<string, unknown>).statusEndDate).toBe('2026/01/31 23:59:59');
        return { requestData: items };
      });

      const result = await searchRosItems(client, {
        flowId: 57305,
        searchHistory: true,
        statusStartDate: '2026/01/01 00:00:00',
        statusEndDate: '2026/01/31 23:59:59',
      });

      expect(result).toBe(items);
    });

    it.each(['customerId', 'contractId', 'externalId', 'orderno', 'messageId'] as const)(
      'allows searchHistory:true when %s is present, with no date range',
      async (field) => {
        const client = fakeClient((_path, body) => {
          expect((body as Record<string, unknown>)[field]).toBe('VALUE');
          return { requestData: items };
        });

        const result = await searchRosItems(client, {
          flowId: 57305,
          searchHistory: true,
          [field]: 'VALUE',
        } as Record<string, unknown>);

        expect(result).toBe(items);
      }
    );

    it('does not require an entity-key field or date range when searchHistory is not set', async () => {
      const client = fakeClient(() => ({ requestData: items }));

      const result = await searchRosItems(client, { flowId: 57305 });

      expect(result).toBe(items);
    });
  });
});

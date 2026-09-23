import { describe, expect, it, vi } from 'vitest';
import { getActionCommand } from '../../src/tools/getActionCommand.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';

function fakeClient(getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getActionCommand', () => {
  it('requests /actionDetail/getCurrentCommand with actionId and returns requestData as a string', async () => {
    const client = fakeClient((path, query) => {
      expect(path).toBe('/actionDetail/getCurrentCommand');
      expect(query).toEqual({ actionId: 42 });
      return { requestData: 'def validate() {\n  return true\n}' };
    });

    const result = await getActionCommand(client, { actionId: 42 });

    expect(result).toBe('def validate() {\n  return true\n}');
  });
});

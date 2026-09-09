import { describe, expect, it, vi } from 'vitest';
import { getActionTemplate } from '../../src/tools/getActionTemplate.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';

function fakeClient(getJsonImpl: (path: string) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

describe('getActionTemplate', () => {
  it('requests /actionTemplate/{commandType} and returns availableCodes', async () => {
    const availableCodes = [{ key: 'basic', label: 'Basic Groovy Action', value: 'def execute() {}', methodToInvoke: 'execute' }];
    const client = fakeClient((path) => {
      expect(path).toBe('/actionTemplate/GROOVY');
      return { availableCodes };
    });

    const result = await getActionTemplate(client, { commandType: 'GROOVY' });

    expect(result).toEqual(availableCodes);
  });

  it('builds the path for PYTHON templates', async () => {
    const client = fakeClient((path) => {
      expect(path).toBe('/actionTemplate/PYTHON');
      return { availableCodes: [] };
    });

    await getActionTemplate(client, { commandType: 'PYTHON' });
  });
});

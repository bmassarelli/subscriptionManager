import { describe, expect, it, vi } from 'vitest';
import { searchFlows } from '../../src/tools/searchFlows.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

const flows: UserFlowSummary[] = [
  {
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
  },
  {
    flowId: 40000,
    flowCode: 'BAJA_SERVICIO_Y',
    flowDes: 'Baja de servicio Y',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'READ',
  },
];

describe('searchFlows', () => {
  it('posts to /getUserFlows with includeRoutings:false by default', async () => {
    const client = fakeClient((path, body) => {
      expect(path).toBe('/getUserFlows');
      expect(body).toEqual({ includeRoutings: false });
      return { requestData: flows };
    });

    const result = await searchFlows(client);

    expect(result).toEqual(flows);
  });

  it('passes through isActive/isMassFlag/isRosFlag/hasInputSchema/permission filters', async () => {
    const client = fakeClient((_path, body) => {
      expect(body).toEqual({
        includeRoutings: false,
        isActive: true,
        isMassFlag: false,
        isRosFlag: true,
        hasInputSchema: true,
        permission: 'EDIT',
      });
      return { requestData: flows };
    });

    await searchFlows(client, {
      isActive: true,
      isMassFlag: false,
      isRosFlag: true,
      hasInputSchema: true,
      permission: 'EDIT',
    });
  });

  it('filters client-side by flowCode or flowDes substring, case-insensitively', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await searchFlows(client, { query: 'servicio x' });

    expect(result).toEqual([flows[0]]);
  });

  it('returns every flow when no query is given', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await searchFlows(client);

    expect(result).toEqual(flows);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { findSimilarFlows } from '../../src/tools/findSimilarFlows.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(postJsonImpl: (path: string, body: unknown) => unknown): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(postJsonImpl) as RosClientLike['postJson'],
    postForm: vi.fn(),
  };
}

function makeFlow(overrides: Partial<UserFlowSummary>): UserFlowSummary {
  return {
    flowId: 1,
    flowCode: 'X',
    flowDes: 'X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    syncBy: 'admin',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
    ...overrides,
  };
}

const flows = [
  makeFlow({ flowId: 1, flowCode: 'ALTA_SERVICIO_INTERNET', flowDes: 'Alta de servicio de Internet' }),
  makeFlow({ flowId: 2, flowCode: 'ALTA_SERVICIO_POTS', flowDes: 'Alta de servicio POTS' }),
  makeFlow({ flowId: 3, flowCode: 'REPORTE_VENTAS', flowDes: 'Reporte mensual de ventas' }),
];

describe('findSimilarFlows', () => {
  it('ranks flows by keyword overlap with the requirement, descending, excluding zero scores', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'necesito dar de alta un servicio de internet' });

    expect(result).toEqual([
      { flow: flows[0], score: 3 },
      { flow: flows[1], score: 2 },
    ]);
  });

  it('returns an empty array when no flow matches any keyword', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'facturación de roaming internacional' });

    expect(result).toEqual([]);
  });

  it('caps results at the given limit', async () => {
    const client = fakeClient(() => ({ requestData: flows }));

    const result = await findSimilarFlows(client, { requirement: 'alta de servicio', limit: 1 });

    expect(result).toEqual([{ flow: flows[0], score: 2 }]);
  });

  it('defaults to a limit of 10 even when more than 10 flows match', async () => {
    const manyMatchingFlows = Array.from({ length: 15 }, (_, i) =>
      makeFlow({ flowId: i + 1, flowCode: `ALTA_SERVICIO_${i}`, flowDes: 'Alta de servicio' })
    );
    const client = fakeClient(() => ({ requestData: manyMatchingFlows }));

    const result = await findSimilarFlows(client, { requirement: 'alta de servicio' });

    expect(result).toHaveLength(10);
  });
});

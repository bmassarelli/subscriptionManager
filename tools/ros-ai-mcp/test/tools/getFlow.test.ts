import { describe, expect, it, vi } from 'vitest';
import { getFlow } from '../../src/tools/getFlow.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RequestPaginationData } from '../../src/rosClient/types.js';

function fakeClient(getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'admin',
    version: 3,
    modDate: '2026-01-10T12:00:00Z',
    userName: 'admin',
    eagerFlag: 'N',
  },
  flowNotification: null,
  allAvailableRoutes: [],
  availableFlowGroup: [],
  selectFlowGroup: [],
  allFlowSchemaDatasPath: {},
  flowActionError: null,
  actionErrorDetail: null,
  businessInfo: null,
  isInMemory: false,
  jobProcessedAction: null,
  jobFinishedAction: null,
  onCancelAction: { actionId: null, force: null },
  onCancelAllAction: { actionId: null, force: null },
  description: null,
};

describe('getFlow', () => {
  it('requests /getFlowInfo with the given flowId and returns requestData', async () => {
    const client = fakeClient((path, query) => {
      expect(path).toBe('/getFlowInfo');
      expect(query).toEqual({ flowId: 34606 });
      return { requestData: flowInfoFixture } satisfies RequestPaginationData<FlowInfo>;
    });

    const result = await getFlow(client, { flowId: 34606 });

    expect(result).toEqual(flowInfoFixture);
  });
});

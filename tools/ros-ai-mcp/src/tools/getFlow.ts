import type { RosClientLike } from '../rosClient/rosClient.js';
import type { FlowInfo, RequestPaginationData } from '../rosClient/types.js';

export interface GetFlowInput {
  flowId: number;
}

export async function getFlow(client: RosClientLike, input: GetFlowInput): Promise<FlowInfo> {
  const response = await client.getJson<RequestPaginationData<FlowInfo>>('/getFlowInfo', { flowId: input.flowId });
  return response.requestData;
}

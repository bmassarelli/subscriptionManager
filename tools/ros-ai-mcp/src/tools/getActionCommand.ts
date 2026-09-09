import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData } from '../rosClient/types.js';

export interface GetActionCommandInput {
  actionId: number;
}

export async function getActionCommand(client: RosClientLike, input: GetActionCommandInput): Promise<string> {
  const response = await client.getJson<RequestPaginationData<string>>('/actionDetail/getCurrentCommand', {
    actionId: input.actionId,
  });
  return response.requestData;
}

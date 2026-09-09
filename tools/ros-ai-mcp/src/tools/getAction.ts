import type { RosClientLike } from '../rosClient/rosClient.js';
import type { ActionDBConfig, RequestPaginationData, RosAction, RosActionHist } from '../rosClient/types.js';

export interface GetActionInput {
  actionId: number;
  actionVersion?: number;
}

export interface ActionDetail {
  action: RosAction | RosActionHist;
  config: ActionDBConfig;
}

export async function getAction(client: RosClientLike, input: GetActionInput): Promise<ActionDetail> {
  const actionPath =
    input.actionVersion !== undefined
      ? `/actionInformation/${input.actionId}/${input.actionVersion}`
      : `/actionInformation/${input.actionId}`;

  const [actionResponse, configResponse] = await Promise.all([
    client.getJson<RequestPaginationData<RosAction | RosActionHist>>(actionPath),
    client.getJson<RequestPaginationData<ActionDBConfig>>(`/actionDBConfig/${input.actionId}`),
  ]);

  return { action: actionResponse.requestData, config: configResponse.requestData };
}

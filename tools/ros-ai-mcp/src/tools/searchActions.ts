import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, RosAction } from '../rosClient/types.js';

export interface SearchActionsInput {
  query?: string;
  actionType?: string[];
  commandType?: string[];
  scope?: 'user' | 'admin';
}

export async function searchActions(client: RosClientLike, input: SearchActionsInput = {}): Promise<RosAction[]> {
  let actions: RosAction[];

  if (input.scope === 'admin') {
    const response = await client.getJson<{ adminActions: RosAction[] }>('/getActionsAdmin');
    actions = response.adminActions;
  } else {
    const body: Record<string, string[]> = {};
    if (input.actionType) body.actionType = input.actionType;
    if (input.commandType) body.commandType = input.commandType;

    const response = await client.postJson<RequestPaginationData<RosAction[]>>('/getRosActions', body);
    actions = response.requestData;
  }

  if (!input.query) return actions;

  const needle = input.query.toLowerCase();
  return actions.filter(
    (action) => action.actionCode.toLowerCase().includes(needle) || action.actionDes.toLowerCase().includes(needle)
  );
}

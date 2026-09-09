import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SearchRosItem, StepDataExtraDetailEntry, StepOptimistic } from '../rosClient/types.js';
import { RosNotFoundError } from '../errors.js';

export interface GetItemInfoInput {
  itemId: string;
}

export interface ItemInfo {
  item: SearchRosItem;
  flowSteps: StepOptimistic[];
  recentHistory: StepDataExtraDetailEntry[];
}

export async function getItemInfo(client: RosClientLike, input: GetItemInfoInput): Promise<ItemInfo> {
  const searchResponse = await client.postJson<RequestPaginationData<SearchRosItem[]>>('/searchros', {
    itemId: input.itemId,
    searchHistory: true,
    searchInMemory: false,
    pageNumber: 1,
    pageSize: 1,
    searchProperties: false,
    includeRootItemId: true,
  });

  const item = searchResponse.requestData[0];
  if (!item) {
    throw new RosNotFoundError(`No ROS item found with itemId ${input.itemId}`);
  }

  const [flowStepsResponse, historyResponse] = await Promise.all([
    client.postForm<RequestPaginationData<StepOptimistic[]>>('/getFlowStepInfo', { flowId: item.flowId }),
    client.postJson<RequestPaginationData<StepDataExtraDetailEntry[]>>('/getStepDataExtraDetails', {
      itemId: input.itemId,
      searchInMemory: true,
    }),
  ]);

  return {
    item,
    flowSteps: flowStepsResponse.requestData,
    recentHistory: historyResponse.requestData,
  };
}

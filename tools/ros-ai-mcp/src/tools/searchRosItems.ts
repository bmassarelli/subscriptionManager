import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SearchRosItem } from '../rosClient/types.js';

export interface SearchRosItemsInput {
  flowId?: number;
  statusId?: number;
  actionId?: number;
  customerId?: string;
  contractId?: string;
  errorCode?: string;
  errorMessage?: string;
  externalId?: string;
  externalType?: string;
  orderno?: string;
  origin?: string;
  messageId?: string;
  step?: number;
  initialExecutionDate?: string;
  finalExecutionDate?: string;
  startDate?: string;
  endDate?: string;
  searchHistory?: boolean;
  searchInMemory?: boolean;
  searchInRos?: boolean;
  searchInMass?: boolean;
  searchSubItems?: boolean;
  noSearchSubItems?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

export async function searchRosItems(client: RosClientLike, input: SearchRosItemsInput = {}): Promise<SearchRosItem[]> {
  const { pageNumber = 1, pageSize = 20, ...criteria } = input;

  const body: Record<string, unknown> = { pageNumber, pageSize };
  for (const [key, value] of Object.entries(criteria)) {
    if (value !== undefined) {
      body[key] = value;
    }
  }

  const response = await client.postJson<RequestPaginationData<SearchRosItem[]>>('/searchros', body);
  return response.requestData;
}

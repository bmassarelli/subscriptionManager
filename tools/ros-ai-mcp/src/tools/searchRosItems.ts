import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SearchRosItem } from '../rosClient/types.js';
import { RosInvalidRequestError } from '../errors.js';

// ROS's own /searchros endpoint silently returns requestData: null for
// searchHistory:true unless the query is bounded one of two ways (verified live
// against ROS DEV 2026-09-11 — a third round of testing after the GUI's own request
// body revealed the first fix below was incomplete):
//   (a) at least one entity-key field — flowId/statusId/actionId/step/dates alone
//       are never enough, even combined — or
//   (b) BOTH statusStartDate and statusEndDate, formatted "YYYY/MM/DD HH:mm:ss"
//       (not the ISO dates the other date fields below take), spanning at most
//       ~31 days — a wider span (tested: 32, 45, 60, 93, 182 days) also comes
//       back null even with an otherwise-identical flowId.
// Providing an entity-key field makes the date range optional and unbounded.
const HISTORY_ENTITY_KEY_FIELDS = ['customerId', 'contractId', 'externalId', 'orderno', 'messageId'] as const;
const MAX_HISTORY_DATE_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

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
  // ROS's actual bound for searchHistory — "YYYY/MM/DD HH:mm:ss", max ~31 day span.
  // See the module-level comment above; unrelated to startDate/endDate above, which
  // this project has never confirmed to do anything for history search.
  statusStartDate?: string;
  statusEndDate?: string;
  searchHistory?: boolean;
  searchInMemory?: boolean;
  searchInRos?: boolean;
  searchInMass?: boolean;
  searchSubItems?: boolean;
  noSearchSubItems?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

function validateHistorySearch(input: SearchRosItemsInput): void {
  if (!input.searchHistory) return;
  if (HISTORY_ENTITY_KEY_FIELDS.some((field) => input[field] !== undefined)) return;

  const { statusStartDate, statusEndDate } = input;
  if (!statusStartDate || !statusEndDate) {
    throw new RosInvalidRequestError(
      `searchHistory:true requires either one of ${HISTORY_ENTITY_KEY_FIELDS.join(', ')}, or both statusStartDate ` +
        'and statusEndDate ("YYYY/MM/DD HH:mm:ss", max ~31 day span) — ROS ignores flowId/statusId/actionId/step ' +
        'filters and any other date fields on their own and returns no results.'
    );
  }

  const startMs = new Date(statusStartDate).getTime();
  const endMs = new Date(statusEndDate).getTime();
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs - startMs > MAX_HISTORY_DATE_RANGE_MS) {
    throw new RosInvalidRequestError(
      `statusStartDate/statusEndDate span more than ~31 days — ROS's history search returns no results beyond ` +
        `that window without an entity-key field (${HISTORY_ENTITY_KEY_FIELDS.join(', ')}). Narrow the range or ` +
        'add one of those fields.'
    );
  }
}

export async function searchRosItems(client: RosClientLike, input: SearchRosItemsInput = {}): Promise<SearchRosItem[]> {
  validateHistorySearch(input);

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

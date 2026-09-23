import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, UserFlowSummary } from '../rosClient/types.js';

export interface SearchFlowsInput {
  query?: string;
  isActive?: boolean;
  isMassFlag?: boolean;
  isRosFlag?: boolean;
  hasInputSchema?: boolean;
  permission?: 'EDIT' | 'READ';
}

export async function searchFlows(client: RosClientLike, input: SearchFlowsInput = {}): Promise<UserFlowSummary[]> {
  const body: Record<string, unknown> = { includeRoutings: false };
  if (input.isActive !== undefined) body.isActive = input.isActive;
  if (input.isMassFlag !== undefined) body.isMassFlag = input.isMassFlag;
  if (input.isRosFlag !== undefined) body.isRosFlag = input.isRosFlag;
  if (input.hasInputSchema !== undefined) body.hasInputSchema = input.hasInputSchema;
  if (input.permission !== undefined) body.permission = input.permission;

  const response = await client.postJson<RequestPaginationData<UserFlowSummary[]>>('/getUserFlows', body);
  const flows = response.requestData;

  if (!input.query) return flows;

  const needle = input.query.toLowerCase();
  return flows.filter(
    (flow) => flow.flowCode.toLowerCase().includes(needle) || flow.flowDes.toLowerCase().includes(needle)
  );
}

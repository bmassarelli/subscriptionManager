import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, StepOptimistic } from '../rosClient/types.js';

export interface GetFlowStepsInput {
  flowId: number;
  rfsVersion?: number;
}

export async function getFlowSteps(client: RosClientLike, input: GetFlowStepsInput): Promise<StepOptimistic[]> {
  const form: Record<string, string | number> = { flowId: input.flowId };
  if (input.rfsVersion !== undefined) {
    form.rfsVersion = input.rfsVersion;
  }

  const response = await client.postForm<RequestPaginationData<StepOptimistic[]>>('/getFlowStepInfo', form);
  return response.requestData;
}

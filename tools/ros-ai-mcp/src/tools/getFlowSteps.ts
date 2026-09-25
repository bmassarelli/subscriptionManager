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

  const response = await client.postForm<RequestPaginationData<StepOptimistic[] | null>>('/getFlowStepInfo', form);
  // ROS returns requestData:null (not []) when a flow has no steps or the step-info
  // cache hasn't caught up yet — every consumer (get_flow_steps, analyze_flow,
  // update_flow_steps) expects an array and crashes on .length/iteration otherwise.
  return response.requestData ?? [];
}

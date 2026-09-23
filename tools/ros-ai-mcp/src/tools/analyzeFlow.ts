import type { RosClientLike } from '../rosClient/rosClient.js';
import type { FlowInfo, StepOptimistic } from '../rosClient/types.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';

export interface AnalyzeFlowInput {
  flowId: number;
}

export interface FlowStepNode {
  stepId: number;
  actionId: number;
  action: StepOptimistic['action'];
  decision: string | null;
  decisionCriteria: string | null;
  bypass: string;
  /** Non-null when this step clones into a subflow (StepOptimistic.flow populated), e.g. an INFLOW step. */
  invokesFlow: { flowId: number; flowCode: string } | null;
  children: FlowStepNode[];
}

export interface AnalyzeFlowResult {
  flow: FlowInfo;
  graph: FlowStepNode[];
  /** stepIds present in getFlowSteps but unreachable from the root (parentStepId 0) — dangling parent or a cycle. */
  droppedStepIds: number[];
}

export async function analyzeFlow(client: RosClientLike, input: AnalyzeFlowInput): Promise<AnalyzeFlowResult> {
  const [flow, steps] = await Promise.all([
    getFlow(client, { flowId: input.flowId }),
    getFlowSteps(client, { flowId: input.flowId }),
  ]);

  const { graph, visited } = buildStepTree(steps);
  const droppedStepIds = steps.map((step) => step.stepId).filter((stepId) => !visited.has(stepId));

  return { flow, graph, droppedStepIds };
}

function buildStepTree(steps: StepOptimistic[]): { graph: FlowStepNode[]; visited: Set<number> } {
  const childrenByParent = new Map<number, StepOptimistic[]>();
  for (const step of steps) {
    const siblings = childrenByParent.get(step.parentStepId) ?? [];
    siblings.push(step);
    childrenByParent.set(step.parentStepId, siblings);
  }

  const visited = new Set<number>();

  function buildNode(step: StepOptimistic): FlowStepNode {
    const alreadyVisited = visited.has(step.stepId);
    visited.add(step.stepId);
    // A stepId can reappear as a child under a different parent when the flow loops back to
    // an earlier step (e.g. a retry branch). The first occurrence owns the real subtree; later
    // occurrences are back-references and must not be re-expanded, or buildNode recurses forever.
    const children = alreadyVisited ? [] : (childrenByParent.get(step.stepId) ?? []).map(buildNode);
    return {
      stepId: step.stepId,
      actionId: step.actionId,
      action: step.action,
      decision: step.decision,
      decisionCriteria: step.decisionCriteria,
      bypass: step.bypass,
      invokesFlow: step.flow ? { flowId: step.flow.flowId, flowCode: step.flow.flowCode } : null,
      children,
    };
  }

  const graph = (childrenByParent.get(0) ?? []).map(buildNode);
  return { graph, visited };
}

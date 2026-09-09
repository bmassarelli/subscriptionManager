import type { RosClientLike } from '../rosClient/rosClient.js';
import { analyzeFlow } from './analyzeFlow.js';
import type { FlowStepNode } from './analyzeFlow.js';

export interface SummarizeFlowSkeletonInput {
  flowId: number;
}

export type FlowSkeletonRole = 'subflow' | 'decision' | 'end' | 'external_call' | 'custom_code' | 'flow_control' | 'other';

export interface FlowSkeletonNode {
  stepId: number;
  role: FlowSkeletonRole;
  actionCode: string;
  actionDes: string;
  invokesFlow: { flowId: number; flowCode: string } | null;
  decisionCriteria: string | null;
  decision: string | null;
  terminal: string | null;
  protocol: 'soap' | 'rest' | null;
  domain: string | null;
  language: 'groovy' | 'python' | null;
  commandType: string | null;
  children: FlowSkeletonNode[];
}

export interface FlowSkeletonResult {
  flow: { flowId: number; flowCode: string; flowDes: string };
  skeleton: FlowSkeletonNode[];
  droppedStepIds: number[];
}

const NULL_ROLE_FIELDS = {
  invokesFlow: null,
  decisionCriteria: null,
  terminal: null,
  protocol: null,
  domain: null,
  language: null,
  commandType: null,
};

export async function summarizeFlowSkeleton(client: RosClientLike, input: SummarizeFlowSkeletonInput): Promise<FlowSkeletonResult> {
  const { flow, graph, droppedStepIds } = await analyzeFlow(client, { flowId: input.flowId });

  return {
    flow: { flowId: flow.flow.flowId, flowCode: flow.flow.flowCode, flowDes: flow.flow.flowDes },
    skeleton: graph.map(classifyNode),
    droppedStepIds,
  };
}

function classifyNode(node: FlowStepNode): FlowSkeletonNode {
  const children = node.children.map(classifyNode);
  const shared = {
    stepId: node.stepId,
    actionCode: node.action.actionCode,
    actionDes: node.action.actionDes,
    decision: node.decision,
    children,
  };

  if (node.invokesFlow) {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'subflow', invokesFlow: node.invokesFlow };
  }

  if (node.action.actionType === 'DECISION') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'decision', decisionCriteria: node.decisionCriteria };
  }

  if (node.action.actionType === 'END') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'end', terminal: node.action.workerClass };
  }

  if (node.action.commandType === 'SOAP' || node.action.commandType === 'REST') {
    return {
      ...shared,
      ...NULL_ROLE_FIELDS,
      role: 'external_call',
      protocol: node.action.commandType === 'SOAP' ? 'soap' : 'rest',
      domain: node.action.domain,
    };
  }

  if (node.action.commandType === 'GROOVY' || node.action.commandType === 'PYTHON') {
    return {
      ...shared,
      ...NULL_ROLE_FIELDS,
      role: 'custom_code',
      language: node.action.commandType === 'GROOVY' ? 'groovy' : 'python',
    };
  }

  if (node.action.commandType === 'CLASS') {
    return { ...shared, ...NULL_ROLE_FIELDS, role: 'flow_control' };
  }

  return { ...shared, ...NULL_ROLE_FIELDS, role: 'other', commandType: node.action.commandType };
}

import type { WireFlowStep } from '../rosClient/types.js';

export type StepNode =
  | { kind: 'action'; actionCode: string; des?: string; ymlConfig?: Record<string, unknown> }
  | { kind: 'decision'; criteria: string; yes: StepNode[]; no: StepNode[] }
  | { kind: 'subflow'; flowCode: string; ymlConfig?: Record<string, unknown> }
  | { kind: 'end' };

function isTerminated(nodes: StepNode[]): boolean {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1];
  if (last.kind === 'end') return true;
  if (last.kind === 'decision') return isTerminated(last.yes) && isTerminated(last.no);
  return false;
}

function assertValid(nodes: StepNode[], ownFlowCode: string, branchLabel: string): void {
  if (nodes.length === 0) {
    throw new Error(`${branchLabel} is empty — every branch needs at least one step.`);
  }
  if (!isTerminated(nodes)) {
    throw new Error(`${branchLabel} must end in an "end" step (directly, or via a decision whose own branches all end).`);
  }
  // isTerminated only inspects the LAST node of the array — it says nothing about
  // "end"/"decision" nodes that appear earlier. Both are terminal by nature (an "end"
  // closes the path; a fully-terminated "decision" already closes both of its own
  // branches), so anything placed after one would either dangle off the decision as an
  // untagged third branch or chain onto the ES step — silently corrupting the wire tree.
  // Catch that here instead of letting it through.
  nodes.forEach((node, i) => {
    if (i < nodes.length - 1 && (node.kind === 'end' || node.kind === 'decision')) {
      throw new Error(
        `${branchLabel}: nothing can follow a "${node.kind}" step (found at position ${i + 1} of ${nodes.length}) — every path after a decision must be written inside its own yes/no branch.`
      );
    }
  });
  for (const node of nodes) {
    if (node.kind === 'subflow' && node.flowCode === ownFlowCode) {
      throw new Error(`${branchLabel} calls subflow "${node.flowCode}" recursively — a flow cannot call itself.`);
    }
    if (node.kind === 'decision') {
      assertValid(node.yes, ownFlowCode, `${branchLabel} > decision "yes" branch`);
      assertValid(node.no, ownFlowCode, `${branchLabel} > decision "no" branch`);
    }
  }
}

interface Cursor {
  nextStepId: number;
}

function appendNode(wire: WireFlowStep[], node: StepNode, parentStepId: number, ownFlowCode: string, cursor: Cursor, decision?: 'Y' | 'N'): number {
  if (node.kind === 'action') {
    const stepId = cursor.nextStepId++;
    wire.push({
      stepId,
      parentStepId,
      actionCode: node.actionCode,
      ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
      ...(decision !== undefined ? { decision } : {}),
      ...(node.ymlConfig !== undefined ? { ymlConfig: { [ownFlowCode]: node.ymlConfig } } : {}),
    });
    return stepId;
  }

  if (node.kind === 'end') {
    const stepId = cursor.nextStepId++;
    wire.push({ stepId, parentStepId, actionCode: 'ES', ...(decision !== undefined ? { decision } : {}) });
    return stepId;
  }

  if (node.kind === 'subflow') {
    const inStepId = cursor.nextStepId++;
    wire.push({
      stepId: inStepId,
      parentStepId,
      actionCode: 'INFLOW',
      ...(decision !== undefined ? { decision } : {}),
      ymlConfig: { [ownFlowCode]: { FLOW_CODE: node.flowCode, ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } },
    });
    const outStepId = cursor.nextStepId++;
    wire.push({ stepId: outStepId, parentStepId: inStepId, actionCode: 'OUTFLOW', ymlConfig: { [ownFlowCode]: {} } });
    return outStepId;
  }

  // 'decision' is the only StepNode kind left after the three checks above, so
  // TypeScript has already narrowed node here — no explicit kind check needed.
  const decStepId = cursor.nextStepId++;
  wire.push({
    stepId: decStepId,
    parentStepId,
    actionCode: 'INLINEDEC',
    ...(decision !== undefined ? { decision } : {}),
    ymlConfig: { [ownFlowCode]: { DECISION_CRITERIA: node.criteria } },
  });
  appendChain(wire, node.yes, decStepId, ownFlowCode, cursor, 'Y');
  appendChain(wire, node.no, decStepId, ownFlowCode, cursor, 'N');
  return decStepId;
}

// v1 has no merge/goto primitive for reconverging branches: in the real ROS editor, two
// decision branches can flow back into the same downstream steps because the editor
// tracks an "already-visited" cache keyed by _stepId and reuses the existing step. This
// DSL has no way to express "point back at a step defined elsewhere," so if a caller wants
// both the yes and no branches to reach the same tail, they must write that tail out twice
// — appendChain will happily emit it as two separate, independently-numbered copies of
// those steps rather than one shared one. That's a deliberate scope cut, not a bug — don't
// "fix" it into an under-scoped deduplication attempt without also designing a real
// merge/goto primitive for the DSL.
function appendChain(wire: WireFlowStep[], nodes: StepNode[], parentStepId: number, ownFlowCode: string, cursor: Cursor, firstDecision?: 'Y' | 'N'): void {
  let currentParent = parentStepId;
  for (let i = 0; i < nodes.length; i++) {
    currentParent = appendNode(wire, nodes[i], currentParent, ownFlowCode, cursor, i === 0 ? firstDecision : undefined);
  }
}

export function buildWireSteps(steps: StepNode[], ownFlowCode: string): WireFlowStep[] {
  assertValid(steps, ownFlowCode, 'steps');
  const wire: WireFlowStep[] = [];
  const cursor: Cursor = { nextStepId: 1 };
  appendChain(wire, steps, 0, ownFlowCode, cursor);
  return wire;
}

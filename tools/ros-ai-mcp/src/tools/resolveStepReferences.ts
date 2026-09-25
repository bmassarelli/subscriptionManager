import { searchActions } from './searchActions.js';
import { searchFlows } from './searchFlows.js';
import type { StepNode } from './flowStepTree.js';
import type { RosClientLike } from '../rosClient/rosClient.js';

function collectReferencedCodes(steps: StepNode[]): { actionCodes: Set<string>; flowCodes: Set<string> } {
  const actionCodes = new Set<string>();
  const flowCodes = new Set<string>();
  const visit = (nodes: StepNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'action') actionCodes.add(node.actionCode);
      if (node.kind === 'subflow') flowCodes.add(node.flowCode);
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(steps);
  return { actionCodes, flowCodes };
}

// Walks the original DSL input rather than buildWireSteps's wire-format output on
// purpose: buildWireSteps auto-injects the framework/scaffolding action codes
// (INFLOW/OUTFLOW/INLINEDEC/ES), and those must never be existence-checked via
// search_actions (see this project's Global Constraints) since they aren't
// real user-facing actions a caller would ever reference in the DSL.
export async function findUnresolvedCodes(client: RosClientLike, steps: StepNode[]): Promise<string[]> {
  const { actionCodes, flowCodes } = collectReferencedCodes(steps);
  const problems: string[] = [];

  if (actionCodes.size > 0) {
    const allActions = await searchActions(client, {});
    const knownActionCodes = new Set(allActions.map((action) => action.actionCode));
    for (const code of actionCodes) {
      if (!knownActionCodes.has(code)) problems.push(`actionCode "${code}" not found`);
    }
  }

  if (flowCodes.size > 0) {
    const allFlows = await searchFlows(client, {});
    const knownFlowCodes = new Set(allFlows.map((flow) => flow.flowCode));
    for (const code of flowCodes) {
      if (!knownFlowCodes.has(code)) problems.push(`flowCode "${code}" not found`);
    }
  }

  return problems;
}

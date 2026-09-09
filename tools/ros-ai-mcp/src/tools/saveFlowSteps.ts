import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';
import { searchActions } from './searchActions.js';
import { searchFlows } from './searchFlows.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowStepBody, WireFlowStep } from '../rosClient/types.js';

export interface SaveFlowStepsInput {
  flowId: number;
  steps: StepNode[];
  confirm?: boolean;
}

export interface SaveFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}

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
async function findUnresolvedCodes(client: RosClientLike, steps: StepNode[]): Promise<string[]> {
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

const WARNINGS = [
  'save_flow_steps solo funciona sobre flows recién creados sin steps — reemplaza el árbol completo y renumera todos los stepId en cada guardado.',
  'Los stepId asignados aquí no son estables: si en el futuro se vuelve a llamar a esta tool sobre el mismo flow, se renumerará todo desde cero.',
];

export async function saveFlowSteps(client: RosClientLike, input: SaveFlowStepsInput): Promise<SaveFlowStepsResult> {
  const flowInfo = await getFlow(client, { flowId: input.flowId });
  if (!flowInfo?.flow) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId} not found.` },
    };
  }

  // This guard runs even in preview mode (not gated by input.confirm) — it's the
  // primary defense against a caller mistakenly pointing this tool at a flow that
  // already has real steps, not merely a check for races between preview and confirm.
  const existingSteps = await getFlowSteps(client, { flowId: input.flowId });
  if (existingSteps.length > 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `flowId ${input.flowId} already has ${existingSteps.length} step(s) — save_flow_steps only supports assembling a brand-new flow's tree, editing an existing flow's steps is out of scope (Phase 8 design §3).`,
      },
    };
  }

  const unresolved = await findUnresolvedCodes(client, input.steps);
  if (unresolved.length > 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `Unresolved references — ${unresolved.join('; ')}.` },
    };
  }

  let wireSteps: WireFlowStep[];
  try {
    wireSteps = buildWireSteps(input.steps, flowInfo.flow.flowCode);
  } catch (err) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  const preview = {
    summary: `Creará ${wireSteps.length} step(s) para el flow ${input.flowId} (${flowInfo.flow.flowCode}).`,
    resolvedSteps: wireSteps,
    warnings: WARNINGS,
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  // version/modDate are hardcoded to 0 because this tool only ever targets a
  // brand-new flow with zero prior steps (guarded above) — there is no prior
  // version to preserve. modDate is never even read by ROS's server when
  // version === 0, so any value would do; 0 just mirrors the "no history yet" sentinel.
  const body: SaveFlowStepBody = { flowId: input.flowId, version: 0, modDate: 0, flowSteps: wireSteps };
  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowStep', body);

  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }

  // Absence of errorMessage alone isn't a positive success signal — ROS's
  // FlowStepController always sets successMessage on a genuine save, so treat a
  // response with neither as ambiguous/unconfirmed rather than assuming success.
  if (!response.successMessage) {
    return { applied: false, preview, error: { message: 'ROS did not confirm the step save (no successMessage returned).' } };
  }

  return { applied: true, preview, result: { successMessage: response.successMessage } };
}

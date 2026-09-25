import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';
import { findUnresolvedCodes } from './resolveStepReferences.js';
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

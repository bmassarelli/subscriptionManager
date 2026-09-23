import { searchFlows } from './searchFlows.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowDetailRequestBody } from '../rosClient/types.js';
import { RosUnexpectedResponseError } from '../errors.js';

const RESERVED_FLOW_CODE = 'Dynamic';

export interface CreateFlowInput {
  flowCode: string;
  flowDes: string;
  massFlag?: boolean;
  rosFlag?: boolean;
  activeFlag?: boolean;
  eagerFlag?: boolean;
  inMemory?: boolean;
  dbReprocessFlag?: boolean;
  flowGroups?: number[];
  onCancelAction?: { actionId: number; force?: boolean };
  onCancelAllAction?: { actionId: number; force?: boolean };
  emailNotification?: string;
  confirm?: boolean;
}

export interface CreateFlowResult {
  applied: boolean;
  preview: { summary: string; warnings: string[] };
  result?: { flowId: number; flowCode: string };
  error?: { message: string };
}

function buildRequestBody(input: CreateFlowInput): SaveFlowDetailRequestBody {
  return {
    flowId: -1,
    flowCode: input.flowCode,
    flowDes: input.flowDes,
    massFlag: input.massFlag ?? true,
    rosFlag: input.rosFlag ?? true,
    activeFlag: input.activeFlag ?? true,
    eagerFlag: input.eagerFlag ?? false,
    inMemory: input.inMemory ?? false,
    dbReprocessFlag: input.dbReprocessFlag ?? false,
    flowGroups: input.flowGroups ?? [],
    onCancelAction: input.onCancelAction,
    onCancelAllAction: input.onCancelAllAction,
    // ROS's FlowController unconditionally calls .trim() on the email notification
    // with no null check, so omitting this field (the documented happy path) would
    // throw a NullPointerException server-side. Send '' instead of leaving it undefined.
    emailNotification: input.emailNotification ?? '',
  };
}

function buildWarnings(rosFlag: boolean): string[] {
  const warnings = ['Este guardado se propaga de forma sincrónica al caché de otros nodos del cluster ROS.'];
  if (rosFlag) {
    warnings.push('rosFlag=true — ROS creará automáticamente una ruta REST por defecto para este flow (patrón /ros_<flowCode>Service).');
  }
  warnings.push('Este tool solo crea el header del flow — todavía no tiene steps. Usa save_flow_steps a continuación para ensamblar el árbol.');
  return warnings;
}

async function resolveNewFlowId(client: RosClientLike, flowCode: string, successMessage: string | undefined): Promise<number> {
  const flows = await searchFlows(client, {});
  const match = flows.find((flow) => flow.flowCode === flowCode);
  if (!match) {
    throw new RosUnexpectedResponseError(
      `saveFlowDetail reported success for flowCode "${flowCode}" but no flow with that code was found afterward`,
      JSON.stringify({ successMessage })
    );
  }
  return match.flowId;
}

export async function createFlow(client: RosClientLike, input: CreateFlowInput): Promise<CreateFlowResult> {
  if (input.flowCode === RESERVED_FLOW_CODE) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowCode "${RESERVED_FLOW_CODE}" is reserved by ROS for dynamic-switch flows and cannot be used.` },
    };
  }

  const existingFlows = await searchFlows(client, {});
  const collision = existingFlows.find((flow) => flow.flowCode === input.flowCode);
  if (collision) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowCode "${input.flowCode}" already exists (flowId ${collision.flowId}) — choose a different code.` },
    };
  }

  const body = buildRequestBody(input);
  const preview = {
    summary: `Creará un nuevo flow "${input.flowCode}" ("${input.flowDes}") — massFlag:${body.massFlag}, rosFlag:${body.rosFlag}, activeFlag:${body.activeFlag}.`,
    warnings: buildWarnings(body.rosFlag),
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowDetail', body);
  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }

  try {
    const flowId = await resolveNewFlowId(client, input.flowCode, response.successMessage);
    return { applied: true, preview, result: { flowId, flowCode: input.flowCode } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { applied: false, preview, error: { message } };
  }
}

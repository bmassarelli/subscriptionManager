import { getFlow } from './getFlow.js';
import { createJob, type CreateJobBody, type CreateJobResponse } from '../rosClient/rosRestClient.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RosAuthClientLike } from '../rosClient/rosAuthClient.js';
import { RosAuthError, RosUnexpectedResponseError } from '../errors.js';

export interface ExecuteFlowInput {
  flowId?: number;
  flowCode?: string;
  emails?: string[];
  confirm?: boolean;
}

export interface ExecuteFlowDeps {
  restBaseUrl: string;
  authClient: RosAuthClientLike;
  auditOrigin: string;
  auditUsername: string;
  httpTimeoutMs: number;
}

export interface ExecuteFlowResult {
  applied: boolean;
  preview: { summary: string; warnings: string[] };
  result?: { jobId: number; jobStatusCode: string };
  error?: { message: string };
}

const MISSING_REST_DEPS_MESSAGE =
  'ROS_REST_BASE_URL/ROS_AUTHORIZATION_BASE_URL/ROS_CLIENT_ID/ROS_CLIENT_SECRET/ROS_MCP_AUDIT_ORIGIN/ROS_MCP_AUDIT_USERNAME deben estar configurados para ejecutar (el preview sigue disponible sin esto).';

async function buildPreview(client: RosClientLike, input: ExecuteFlowInput): Promise<{ summary: string; warnings: string[] }> {
  const warnings: string[] = ['Esto programa un job en el mass-scheduler; no es una ejecución síncrona inmediata.'];
  if (input.emails && input.emails.length > 0) {
    warnings.push(`Se notificará a: ${input.emails.join(', ')}.`);
  }

  if (input.flowId !== undefined) {
    try {
      const flowInfo = await getFlow(client, { flowId: input.flowId });
      if (!flowInfo?.flow) {
        return { summary: `Flow ${input.flowId} no encontrado — ROS lo validará al ejecutar.`, warnings };
      }
      return {
        summary: `Ejecutará el flow ${input.flowId} (${flowInfo.flow.flowCode} — "${flowInfo.flow.flowDes}", activo: ${flowInfo.flow.activeFlag}, mass: ${flowInfo.flow.massFlag}).`,
        warnings,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        summary: `No se pudo resolver el flow ${input.flowId} localmente (${detail}) — ROS lo validará al ejecutar.`,
        warnings,
      };
    }
  }

  warnings.push('flowCode no resuelto localmente — ROS lo validará al ejecutar.');
  return { summary: `Ejecutará el flow con flowCode "${input.flowCode}".`, warnings };
}

async function callCreateJobWithRetry(restDeps: ExecuteFlowDeps, body: CreateJobBody): Promise<CreateJobResponse> {
  const token = await restDeps.authClient.getToken();
  try {
    return await createJob(restDeps.restBaseUrl, token, body, restDeps.httpTimeoutMs);
  } catch (err) {
    if (err instanceof RosAuthError) {
      const freshToken = await restDeps.authClient.getToken(true);
      return await createJob(restDeps.restBaseUrl, freshToken, body, restDeps.httpTimeoutMs);
    }
    throw err;
  }
}

export async function executeFlow(client: RosClientLike, restDeps: ExecuteFlowDeps | undefined, input: ExecuteFlowInput): Promise<ExecuteFlowResult> {
  if (input.flowId === undefined && input.flowCode === undefined) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: 'Either flowId or flowCode is required.' },
    };
  }

  if (input.flowId !== undefined && input.flowCode !== undefined) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message:
          "Provide either flowId or flowCode, not both — ROS's choice between them if both are sent is undefined behavior this tool cannot preview accurately.",
      },
    };
  }

  const preview = await buildPreview(client, input);

  if (!input.confirm) {
    return { applied: false, preview };
  }

  if (!restDeps) {
    return { applied: false, preview, error: { message: MISSING_REST_DEPS_MESSAGE } };
  }

  const body: CreateJobBody = {
    audit: { origin: restDeps.auditOrigin, username: restDeps.auditUsername },
    flowId: input.flowId,
    flowCode: input.flowCode,
    notification: input.emails && input.emails.length > 0 ? { email: input.emails } : undefined,
  };

  const response = await callCreateJobWithRetry(restDeps, body);

  if (response.responseStatus.status === 100) {
    if (typeof response.jobId !== 'number' || typeof response.jobStatusCode !== 'string') {
      throw new RosUnexpectedResponseError(
        `ros-rest reported success (status:100) for POST ${restDeps.restBaseUrl}/job but did not return a jobId/jobStatusCode`,
        JSON.stringify(response)
      );
    }
    return {
      applied: true,
      preview,
      result: { jobId: response.jobId, jobStatusCode: response.jobStatusCode },
    };
  }

  return { applied: false, preview, error: { message: response.responseStatus.statusMessage } };
}

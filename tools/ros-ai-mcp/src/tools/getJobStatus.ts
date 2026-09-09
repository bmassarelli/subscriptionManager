import { getJobDetail } from '../rosClient/rosRestClient.js';
import type { ExecuteFlowDeps } from './executeFlow.js';
import type { JobDetailResponse } from '../rosClient/types.js';
import { RosAuthError } from '../errors.js';

export interface GetJobStatusInput {
  jobId: number;
}

export interface GetJobStatusResult {
  found: boolean;
  jobId?: number | null;
  flowId?: number | null;
  flowCode?: string | null;
  flowDes?: string | null;
  filename?: string | null;
  createUser?: string | null;
  statusId?: number | null;
  statusCode?: string | null;
  statusDes?: string | null;
  entryDate?: string | null;
  startDate?: string | null;
  items?: number | null;
  progressPercentage?: number | null;
  historyDetails?: boolean | null;
  schedulerNotification?: JobDetailResponse['schedulerNotification'];
  monitorProcessJob?: JobDetailResponse['monitorProcessJob'];
  monitorProcessJobHist?: JobDetailResponse['monitorProcessJobHist'];
  historyJob?: JobDetailResponse['historyJob'];
  errorCodeGroup?: JobDetailResponse['errorCodeGroup'];
  error?: { message: string };
}

async function callGetJobDetailWithRetry(restDeps: ExecuteFlowDeps, jobId: number): Promise<JobDetailResponse> {
  const token = await restDeps.authClient.getToken();
  try {
    return await getJobDetail(restDeps.restBaseUrl, token, jobId, restDeps.httpTimeoutMs);
  } catch (err) {
    if (err instanceof RosAuthError) {
      const freshToken = await restDeps.authClient.getToken(true);
      return await getJobDetail(restDeps.restBaseUrl, freshToken, jobId, restDeps.httpTimeoutMs);
    }
    throw err;
  }
}

export async function getJobStatus(restDeps: ExecuteFlowDeps, input: GetJobStatusInput): Promise<GetJobStatusResult> {
  if (!Number.isSafeInteger(input.jobId) || input.jobId <= 0) {
    return { found: false, error: { message: 'jobId must be a positive integer.' } };
  }

  const response = await callGetJobDetailWithRetry(restDeps, input.jobId);

  if (response.statusId == null && response.flowId == null) {
    return response.responseStatus.status === 100
      ? { found: false }
      : { found: false, error: { message: response.responseStatus.statusMessage } };
  }

  return {
    found: true,
    jobId: response.jobId,
    flowId: response.flowId,
    flowCode: response.flowCode,
    flowDes: response.flowDes,
    filename: response.filename,
    createUser: response.createUser,
    statusId: response.statusId,
    statusCode: response.statusCode,
    statusDes: response.statusDes,
    entryDate: response.entryDate,
    startDate: response.startDate,
    items: response.items,
    progressPercentage: response.progressPercentage,
    historyDetails: response.historyDetails,
    schedulerNotification: response.schedulerNotification,
    monitorProcessJob: response.monitorProcessJob,
    monitorProcessJobHist: response.monitorProcessJobHist,
    historyJob: response.historyJob,
    errorCodeGroup: response.errorCodeGroup,
  };
}

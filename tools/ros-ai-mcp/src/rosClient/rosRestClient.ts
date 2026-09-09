import { mapHttpError, rawRequest } from './httpClient.js';
import { RosUnexpectedResponseError } from '../errors.js';
import type { JobDetailResponse } from './types.js';

export interface CreateJobBody {
  audit: { origin: string; username: string };
  flowId?: number;
  flowCode?: string;
  notification?: { email: string[] };
}

export interface CreateJobResponse {
  responseStatus: { status: number; statusCode: string; statusMessage: string };
  jobId?: number;
  jobStatusId?: number;
  jobStatusCode?: string;
}

// A thin wrapper around POST /job — it does not interpret responseStatus.
// ROS's /job controller always answers HTTP 200 for business-logic outcomes
// (success or rejection alike); only transport/security/routing failures use
// a non-2xx status. Interpreting responseStatus.status is executeFlow's job.
export async function createJob(baseUrl: string, token: string, body: CreateJobBody, timeoutMs: number): Promise<CreateJobResponse> {
  const url = `${baseUrl}/job`;
  const response = await rawRequest(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (response.status < 200 || response.status >= 300) {
    throw mapHttpError(url, response.status, response.text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (err) {
    throw new RosUnexpectedResponseError(`Expected JSON from ${url} but could not parse the response`, response.text, err);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as CreateJobResponse).responseStatus !== 'object' ||
    (parsed as CreateJobResponse).responseStatus === null ||
    typeof (parsed as CreateJobResponse).responseStatus.status !== 'number'
  ) {
    throw new RosUnexpectedResponseError(`${url} returned an unexpected response shape (missing responseStatus.status)`, response.text);
  }

  return parsed as CreateJobResponse;
}

// A thin wrapper around GET /jobDetail — like createJob, it does not interpret
// responseStatus or decide "found"; that heuristic (statusId/flowId both
// absent means the jobId doesn't exist in ROS) lives in getJobStatus, not here.
export async function getJobDetail(baseUrl: string, token: string, jobId: number, timeoutMs: number): Promise<JobDetailResponse> {
  const url = `${baseUrl}/jobDetail?jobId=${jobId}`;
  const response = await rawRequest(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, timeoutMs);

  if (response.status < 200 || response.status >= 300) {
    throw mapHttpError(url, response.status, response.text);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (err) {
    throw new RosUnexpectedResponseError(`Expected JSON from ${url} but could not parse the response`, response.text, err);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as JobDetailResponse).responseStatus !== 'object' ||
    (parsed as JobDetailResponse).responseStatus === null ||
    typeof (parsed as JobDetailResponse).responseStatus.status !== 'number'
  ) {
    throw new RosUnexpectedResponseError(`${url} returned an unexpected response shape (missing responseStatus.status)`, response.text);
  }

  return parsed as JobDetailResponse;
}

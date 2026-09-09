import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJobStatus } from '../../src/tools/getJobStatus.js';
import type { ExecuteFlowDeps } from '../../src/tools/executeFlow.js';
import * as rosRestClient from '../../src/rosClient/rosRestClient.js';
import type { RosAuthClientLike } from '../../src/rosClient/rosAuthClient.js';
import type { JobDetailResponse } from '../../src/rosClient/types.js';
import { RosAuthError, RosServerError } from '../../src/errors.js';

function fakeAuthClient(token = 'jwt-1'): RosAuthClientLike {
  return { getToken: vi.fn().mockResolvedValue(token) };
}

function restDeps(overrides: Partial<ExecuteFlowDeps> = {}): ExecuteFlowDeps {
  return {
    restBaseUrl: 'http://ros-rest.local',
    authClient: fakeAuthClient(),
    auditOrigin: 'ros-ai-mcp',
    auditUsername: 'jyanez',
    httpTimeoutMs: 5000,
    ...overrides,
  };
}

const inProgressJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
  jobId: 98765,
  flowId: 34606,
  flowCode: 'ALTA_SERVICIO_X',
  flowDes: 'Alta de servicio X',
  createUser: 'jyanez',
  statusId: 10,
  statusCode: 'STARTED',
  statusDes: 'En curso',
  entryDate: '2026-09-05T10:00:00Z',
  startDate: '2026-09-05T10:00:05Z',
  items: 120,
  progressPercentage: 40,
  historyDetails: false,
  monitorProcessJob: { item: [{ stepId: 1, actionId: 2, actionCode: 'A', actionDes: 'Action A', statusId: 10, statusCode: 'STARTED', statusDes: 'En curso', items: 48 }] },
  monitorProcessJobHist: { item: [] },
  errorCodeGroup: { errorItem: [{ errorCode: 'ERR1', items: 2, actionId: 2, actionDes: 'Action A', areSubflows: false, isEvaluatorAction: false, errorType: 'BUSINESS' }] },
};

const historicalJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
  jobId: 11111,
  flowId: 34606,
  flowCode: 'ALTA_SERVICIO_X',
  flowDes: 'Alta de servicio X',
  createUser: 'jyanez',
  statusId: 90,
  statusCode: 'FINISHED',
  statusDes: 'Finalizado',
  entryDate: '2026-09-05T09:00:00Z',
  startDate: '2026-09-05T09:00:05Z',
  items: 50,
  progressPercentage: 100,
  historyDetails: true,
  historyJob: { item: [{ histId: 1, statusDate: '2026-09-05T09:00:00Z', modUser: 'system', statusId: 0, statusCode: 'SCHEDULED', statusDes: 'Programado', startDate: '2026-09-05T09:00:05Z' }] },
  // errorCodeGroup and monitorProcessJobHist deliberately absent — ROS never
  // populates them for historyDetails:true jobs.
};

const notFoundJob: JobDetailResponse = {
  responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
};

const businessErrorJob: JobDetailResponse = {
  responseStatus: { status: -1, statusCode: 'ros.generalError', statusMessage: 'some business error' },
};

describe('getJobStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns found:false with an error and never calls authClient/getJobDetail when jobId is not a positive integer', async () => {
    const deps = restDeps();
    const spy = vi.spyOn(rosRestClient, 'getJobDetail');

    for (const badJobId of [0, -5, 1.5, 1e21]) {
      const result = await getJobStatus(deps, { jobId: badJobId });
      expect(result.found).toBe(false);
      expect(result.error?.message).toMatch(/jobId/);
    }

    expect(deps.authClient.getToken).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('found:true for an in-progress job, mapping all fields including monitorProcessJob/monitorProcessJobHist/errorCodeGroup', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(inProgressJob);

    const result = await getJobStatus(restDeps(), { jobId: 98765 });

    expect(result.found).toBe(true);
    expect(result.jobId).toBe(98765);
    expect(result.statusCode).toBe('STARTED');
    expect(result.progressPercentage).toBe(40);
    expect(result.monitorProcessJob).toEqual(inProgressJob.monitorProcessJob);
    expect(result.monitorProcessJobHist).toEqual(inProgressJob.monitorProcessJobHist);
    expect(result.errorCodeGroup).toEqual(inProgressJob.errorCodeGroup);
  });

  it('found:true for a historical job, leaving errorCodeGroup/monitorProcessJobHist undefined', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(historicalJob);

    const result = await getJobStatus(restDeps(), { jobId: 11111 });

    expect(result.found).toBe(true);
    expect(result.historyDetails).toBe(true);
    expect(result.historyJob).toEqual(historicalJob.historyJob);
    expect(result.errorCodeGroup).toBeUndefined();
    expect(result.monitorProcessJobHist).toBeUndefined();
  });

  it('found:false when ROS returns only responseStatus with status:100 (job does not exist)', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(notFoundJob);

    const result = await getJobStatus(restDeps(), { jobId: 999999999 });

    expect(result.found).toBe(false);
    expect(result.jobId).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('found:false with an error when ROS reports a business failure (responseStatus.status !== 100)', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(businessErrorJob);

    const result = await getJobStatus(restDeps(), { jobId: 999999999 });

    expect(result.found).toBe(false);
    expect(result.error?.message).toBe('some business error');
  });

  it('passes restBaseUrl/token/jobId/timeoutMs through to getJobDetail', async () => {
    const spy = vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue(inProgressJob);

    await getJobStatus(restDeps({ restBaseUrl: 'http://ros-rest.local', httpTimeoutMs: 7000 }), { jobId: 98765 });

    expect(spy).toHaveBeenCalledWith('http://ros-rest.local', 'jwt-1', 98765, 7000);
  });

  it('a 401 from getJobDetail retries once with a fresh token and succeeds', async () => {
    const getToken = vi.fn().mockResolvedValueOnce('stale-jwt').mockResolvedValueOnce('fresh-jwt');
    const deps = restDeps({ authClient: { getToken } });

    vi.spyOn(rosRestClient, 'getJobDetail').mockRejectedValueOnce(new RosAuthError('ROS rejected the request (HTTP 401)')).mockResolvedValueOnce(inProgressJob);

    const result = await getJobStatus(deps, { jobId: 98765 });

    expect(result.found).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(rosRestClient.getJobDetail).toHaveBeenCalledTimes(2);
  });

  it('a 401 twice propagates the exception (not swallowed as found:false)', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockRejectedValue(new RosAuthError('ROS rejected the request (HTTP 401)'));

    await expect(getJobStatus(restDeps(), { jobId: 98765 })).rejects.toBeInstanceOf(RosAuthError);
    expect(rosRestClient.getJobDetail).toHaveBeenCalledTimes(2);
  });

  it('a non-401 error propagates without a wasted retry', async () => {
    vi.spyOn(rosRestClient, 'getJobDetail').mockRejectedValue(new RosServerError('ROS returned HTTP 500', 500));

    await expect(getJobStatus(restDeps(), { jobId: 98765 })).rejects.toBeInstanceOf(RosServerError);
    expect(rosRestClient.getJobDetail).toHaveBeenCalledTimes(1);
  });
});

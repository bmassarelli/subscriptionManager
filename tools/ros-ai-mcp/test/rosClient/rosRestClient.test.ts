import { afterEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { createJob, getJobDetail } from '../../src/rosClient/rosRestClient.js';
import { RosAuthError, RosServerError, RosUnexpectedResponseError } from '../../src/errors.js';

function jsonResponse(status: number, body: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(body) };
}

describe('createJob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const body = { audit: { origin: 'ros-ai-mcp', username: 'jyanez' }, flowId: 34606 };

  it('sends the Bearer token and JSON body to POST /job', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValue(jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 1, jobStatusId: 5, jobStatusCode: 'SCHEDULED' }));

    await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(spy).toHaveBeenCalledWith(
      'http://ros-rest.local/job',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-1', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      5000
    );
  });

  it('returns the parsed response on success (status:100)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(
      jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 42, jobStatusId: 5, jobStatusCode: 'SCHEDULED' })
    );

    const result = await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(result).toEqual({ responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 42, jobStatusId: 5, jobStatusCode: 'SCHEDULED' });
  });

  it('returns the parsed response as-is even when it is a business-logic error (HTTP 200, status:-1)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(
      jsonResponse(200, { responseStatus: { status: -1, statusCode: 'ros.generalError', statusMessage: 'Flow not found for flowId:34606' } })
    );

    const result = await createJob('http://ros-rest.local', 'jwt-1', body, 5000);

    expect(result.responseStatus.status).toBe(-1);
    expect(result.responseStatus.statusMessage).toBe('Flow not found for flowId:34606');
    expect(result.jobId).toBeUndefined();
  });

  it('throws RosAuthError on HTTP 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: '{"errorCode":401,"errorMessage":"Unauthorized"}' });

    await expect(createJob('http://ros-rest.local', 'expired-jwt', body, 5000)).rejects.toBeInstanceOf(RosAuthError);
  });

  it('throws RosServerError on HTTP 500', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    await expect(createJob('http://ros-rest.local', 'jwt-1', body, 5000)).rejects.toBeInstanceOf(RosServerError);
  });

  it('throws RosUnexpectedResponseError (not a TypeError) on HTTP 200 with a body missing responseStatus', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { jobId: 1 }));

    await expect(createJob('http://ros-rest.local', 'jwt-1', body, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with responseStatus: null', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { responseStatus: null }));

    await expect(createJob('http://ros-rest.local', 'jwt-1', body, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with a fully null body', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, null));

    await expect(createJob('http://ros-rest.local', 'jwt-1', body, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});

describe('getJobDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fullBody = {
    responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
    jobId: 98765,
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    filename: null,
    createUser: 'jyanez',
    statusId: 90,
    statusCode: 'FINISHED',
    statusDes: 'Finalizado',
    entryDate: '2026-09-05T10:00:00Z',
    startDate: '2026-09-05T10:00:05Z',
    items: 120,
    progressPercentage: 100,
    historyDetails: true,
    schedulerNotification: { notificationId: 1, email: ['a@x.com'] },
    monitorProcessJob: { item: [{ stepId: 1, actionId: 2, actionCode: 'A', actionDes: 'Action A', statusId: 100, statusCode: 'SUCCESS', statusDes: 'ok', items: 120 }] },
    historyJob: { item: [{ histId: 1, statusDate: '2026-09-05T10:00:00Z', modUser: 'system', statusId: 0, statusCode: 'SCHEDULED', statusDes: 'Programado', startDate: '2026-09-05T10:00:05Z' }] },
  };

  it('sends the Bearer token to GET /jobDetail?jobId=X', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, fullBody));

    await getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000);

    expect(spy).toHaveBeenCalledWith('http://ros-rest.local/jobDetail?jobId=98765', { method: 'GET', headers: { Authorization: 'Bearer jwt-1' } }, 5000);
  });

  it('returns the parsed response on success, including nested arrays', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, fullBody));

    const result = await getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000);

    expect(result).toEqual(fullBody);
  });

  it('returns the parsed response as-is when the job was not found (only responseStatus present)', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' } }));

    const result = await getJobDetail('http://ros-rest.local', 'jwt-1', 999999999, 5000);

    expect(result.jobId).toBeUndefined();
    expect(result.statusId).toBeUndefined();
  });

  it('throws RosAuthError on HTTP 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: '{"errorCode":401,"errorMessage":"Unauthorized"}' });

    await expect(getJobDetail('http://ros-rest.local', 'expired-jwt', 98765, 5000)).rejects.toBeInstanceOf(RosAuthError);
  });

  it('throws RosServerError on HTTP 500', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosServerError);
  });

  it('throws RosUnexpectedResponseError (not a TypeError) on HTTP 200 with a body missing responseStatus', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { jobId: 1 }));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with responseStatus: null', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { responseStatus: null }));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('throws RosUnexpectedResponseError on HTTP 200 with a fully null body', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, null));

    await expect(getJobDetail('http://ros-rest.local', 'jwt-1', 98765, 5000)).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});

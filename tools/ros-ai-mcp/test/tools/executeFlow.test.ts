import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeFlow, type ExecuteFlowDeps } from '../../src/tools/executeFlow.js';
import * as rosRestClient from '../../src/rosClient/rosRestClient.js';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { RosAuthClient } from '../../src/rosClient/rosAuthClient.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { RosAuthClientLike } from '../../src/rosClient/rosAuthClient.js';
import type { FlowInfo } from '../../src/rosClient/types.js';
import { RosAuthError, RosServerError, RosUnexpectedResponseError } from '../../src/errors.js';

function fakeClient(getJsonImpl: (path: string, query?: Record<string, string | number>) => unknown): RosClientLike {
  return {
    getJson: vi.fn(getJsonImpl) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
  };
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 34606,
    flowCode: 'ALTA_SERVICIO_X',
    flowDes: 'Alta de servicio X',
    priority: 1,
    activeFlag: 'Y',
    massFlag: 'N',
    rosFlag: 'Y',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    syncBy: 'admin',
    version: 3,
    modDate: '2026-01-10T12:00:00Z',
    userName: 'admin',
    eagerFlag: 'N',
  },
  flowNotification: null,
  allAvailableRoutes: [],
  availableFlowGroup: [],
  selectFlowGroup: [],
  allFlowSchemaDatasPath: {},
  flowActionError: null,
  actionErrorDetail: null,
  businessInfo: null,
  isInMemory: false,
  jobProcessedAction: null,
  jobFinishedAction: null,
  onCancelAction: { actionId: null, force: null },
  onCancelAllAction: { actionId: null, force: null },
  description: null,
};

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

describe('executeFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a validation error when neither flowId nor flowCode is given', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), {});

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/flowId or flowCode/);
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('preview without confirm resolves the flow via getFlow and never touches restDeps', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const deps = restDeps();

    const result = await executeFlow(client, deps, { flowId: 34606 });

    expect(result.applied).toBe(false);
    expect(result.preview.summary).toContain('ALTA_SERVICIO_X');
    expect(result.preview.warnings).toContain('Esto programa un job en el mass-scheduler; no es una ejecución síncrona inmediata.');
    expect(deps.authClient.getToken).not.toHaveBeenCalled();
  });

  it('preview includes the emails warning when emails are given', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), { flowId: 34606, emails: ['a@x.com', 'b@x.com'] });

    expect(result.preview.warnings.some((w) => w.includes('a@x.com') && w.includes('b@x.com'))).toBe(true);
  });

  it('preview flags a flowId getFlow could not resolve', async () => {
    const client = fakeClient(() => ({ requestData: { ...flowInfoFixture, flow: null } }));
    const result = await executeFlow(client, restDeps(), { flowId: 999999 });

    expect(result.applied).toBe(false);
    expect(result.preview.summary).toContain('999999');
    expect(result.preview.summary).toMatch(/no encontrado/);
  });

  it('a flowId getFlow could not resolve does not block a later confirm:true from calling createJob', async () => {
    const client = fakeClient(() => ({ requestData: { ...flowInfoFixture, flow: null } }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
      jobId: 99,
      jobStatusId: 5,
      jobStatusCode: 'SCHEDULED',
    });

    const result = await executeFlow(client, restDeps(), { flowId: 999999, confirm: true });

    expect(rosRestClient.createJob).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ jobId: 99, jobStatusCode: 'SCHEDULED' });
  });

  it('when only flowCode is given, does not call getFlow and warns it is unresolved locally', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const result = await executeFlow(client, restDeps(), { flowCode: 'ALTA_SERVICIO_X' });

    expect(client.getJson).not.toHaveBeenCalled();
    expect(result.preview.warnings.some((w) => w.includes('no resuelto localmente'))).toBe(true);
  });

  it('confirm:true without restDeps returns a config error and does not call createJob', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const spy = vi.spyOn(rosRestClient, 'createJob');

    const result = await executeFlow(client, undefined, { flowId: 34606, confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/ROS_REST_BASE_URL/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('confirm:true with success (status:100) returns applied:true with jobId/jobStatusCode', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
      jobId: 42,
      jobStatusId: 5,
      jobStatusCode: 'SCHEDULED',
    });

    const result = await executeFlow(client, restDeps(), { flowId: 34606, confirm: true });

    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ jobId: 42, jobStatusCode: 'SCHEDULED' });
    expect(rosRestClient.createJob).toHaveBeenCalledWith(
      'http://ros-rest.local',
      'jwt-1',
      { audit: { origin: 'ros-ai-mcp', username: 'jyanez' }, flowId: 34606, flowCode: undefined, notification: undefined },
      5000
    );
  });

  it('confirm:true, ROS rejects (status:-1) returns applied:false with the statusMessage, no exception', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: -1, statusCode: 'ros.generalError', statusMessage: 'Flow not found for flowId:34606' },
    });

    const result = await executeFlow(client, restDeps(), { flowId: 34606, confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('Flow not found for flowId:34606');
  });

  it('confirm:true, createJob throws 401 once: retries with a fresh token and succeeds', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const getToken = vi.fn().mockResolvedValueOnce('stale-jwt').mockResolvedValueOnce('fresh-jwt');
    const deps = restDeps({ authClient: { getToken } });

    vi.spyOn(rosRestClient, 'createJob')
      .mockRejectedValueOnce(new RosAuthError('ROS rejected the request (HTTP 401)'))
      .mockResolvedValueOnce({ responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 7, jobStatusId: 5, jobStatusCode: 'SCHEDULED' });

    const result = await executeFlow(client, deps, { flowId: 34606, confirm: true });

    expect(result.applied).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect(rosRestClient.createJob).toHaveBeenCalledTimes(2);
  });

  it('confirm:true, createJob fails 401 twice: the second failure propagates', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const deps = restDeps({ authClient: fakeAuthClient() });

    vi.spyOn(rosRestClient, 'createJob').mockRejectedValue(new RosAuthError('ROS rejected the request (HTTP 401)'));

    await expect(executeFlow(client, deps, { flowId: 34606, confirm: true })).rejects.toBeInstanceOf(RosAuthError);
    expect(rosRestClient.createJob).toHaveBeenCalledTimes(2);
  });

  it('returns a validation error when both flowId and flowCode are given, without calling getFlow or createJob', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const spy = vi.spyOn(rosRestClient, 'createJob');

    const result = await executeFlow(client, restDeps(), { flowId: 34606, flowCode: 'ALTA_SERVICIO_X', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/flowId or flowCode, not both/);
    expect(client.getJson).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('buildPreview degrades gracefully when getFlow throws, and a later confirm:true still proceeds to createJob', async () => {
    const client = fakeClient(() => {
      throw new RosServerError('VPN unreachable', 503);
    });
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
      jobId: 55,
      jobStatusId: 5,
      jobStatusCode: 'SCHEDULED',
    });

    const result = await executeFlow(client, restDeps(), { flowId: 34606, confirm: true });

    expect(result.preview.summary).toContain('VPN unreachable');
    expect(result.preview.warnings).toContain('Esto programa un job en el mass-scheduler; no es una ejecución síncrona inmediata.');
    expect(result.applied).toBe(true);
    expect(rosRestClient.createJob).toHaveBeenCalledTimes(1);
  });

  it('confirm:true rejects with RosUnexpectedResponseError (not a TypeError) when /job returns HTTP 200 with no responseStatus', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    // Do NOT mock rosRestClient.createJob here — mock the transport instead, so the
    // real createJob guard (rosRestClient.ts) is what's under test.
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: JSON.stringify({ jobId: 1 }) });

    await expect(executeFlow(client, restDeps(), { flowId: 34606, confirm: true })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('confirm:true rejects with RosUnexpectedResponseError when /job returns HTTP 200 with responseStatus: null', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: JSON.stringify({ responseStatus: null }) });

    await expect(executeFlow(client, restDeps(), { flowId: 34606, confirm: true })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('confirm:true rejects with RosUnexpectedResponseError when status:100 is missing jobId/jobStatusCode', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    vi.spyOn(rosRestClient, 'createJob').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
    });

    await expect(executeFlow(client, restDeps(), { flowId: 34606, confirm: true })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });

  it('real RosAuthClient + real createJob: a 401 on /job forces a fresh token and the retry uses it', async () => {
    const client = fakeClient(() => ({ requestData: flowInfoFixture }));
    const authClient = new RosAuthClient({
      baseUrl: 'http://ros-auth.local',
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      httpTimeoutMs: 5000,
    });

    const spy = vi.spyOn(httpClient, 'rawRequest').mockImplementation(async (url: string) => {
      if (url.endsWith('/authenticate')) {
        const expiryHours = 1;
        const token = spy.mock.calls.filter((c) => (c[0] as string).endsWith('/authenticate')).length === 1 ? 'jwt-1' : 'jwt-2';
        return { status: 200, headers: new Headers(), text: JSON.stringify({ token, expiryHours }) };
      }
      if (url.endsWith('/job')) {
        const jobCallCount = spy.mock.calls.filter((c) => (c[0] as string).endsWith('/job')).length;
        if (jobCallCount === 1) {
          return { status: 401, headers: new Headers(), text: '{"errorCode":401,"errorMessage":"Unauthorized"}' };
        }
        return {
          status: 200,
          headers: new Headers(),
          text: JSON.stringify({ responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' }, jobId: 1, jobStatusId: 5, jobStatusCode: 'SCHEDULED' }),
        };
      }
      throw new Error(`unexpected URL in test: ${url}`);
    });

    const deps = restDeps({ authClient, restBaseUrl: 'http://ros-rest.local' });

    const result = await executeFlow(client, deps, { flowId: 34606, confirm: true });

    expect(result.applied).toBe(true);
    expect(spy).toHaveBeenCalledTimes(4);
    expect((spy.mock.calls[0][0] as string).endsWith('/authenticate')).toBe(true);
    expect((spy.mock.calls[1][0] as string).endsWith('/job')).toBe(true);
    expect((spy.mock.calls[2][0] as string).endsWith('/authenticate')).toBe(true);
    expect((spy.mock.calls[3][0] as string).endsWith('/job')).toBe(true);

    const secondJobInit = spy.mock.calls[3][1] as { headers: Record<string, string> };
    expect(secondJobInit.headers.Authorization).toBe('Bearer jwt-2');
  });
});

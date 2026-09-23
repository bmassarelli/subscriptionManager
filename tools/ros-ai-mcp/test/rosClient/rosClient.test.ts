import { describe, expect, it, vi } from 'vitest';
import * as curlClient from '../../src/rosClient/curlClient.js';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { RosClient } from '../../src/rosClient/rosClient.js';
import type { SessionLike } from '../../src/rosClient/session.js';
import { RosNotFoundError, RosServerError, RosUnexpectedResponseError } from '../../src/errors.js';
import type { RosConfig } from '../../src/config.js';

const config: RosConfig = {
  baseUrl: 'http://ros.local/masros-gui',
  username: 'jyanez',
  password: 'secret',
  httpTimeoutMs: 1000,
};

class FakeSession implements SessionLike {
  cookie: string | null = null;
  loginCalls = 0;

  hasSession(): boolean {
    return this.cookie !== null;
  }
  getCookie(): string | null {
    return this.cookie;
  }
  clear(): void {
    this.cookie = null;
  }
  async login(): Promise<void> {
    this.loginCalls += 1;
    this.cookie = `JSESSIONID=session-${this.loginCalls}`;
  }
}

function jsonResponse(status: number, data: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(data) };
}

describe('RosClient', () => {
  it('logs in before the first request when no session exists', async () => {
    const session = new FakeSession();
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: { flowId: 34606 } }));

    const client = new RosClient(config, session);
    await client.getJson('/getFlowInfo', { flowId: 34606 });

    expect(session.loginCalls).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getFlowInfo?flowId=34606',
      expect.objectContaining({
        method: 'GET',
        headers: { Cookie: 'JSESSIONID=session-1', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      }),
      1000
    );
  });

  it('does not log in again when a session already exists', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.getJson('/getAllFlowInfo');

    expect(session.loginCalls).toBe(1);
  });

  it('postJson sends a JSON body with the right content-type via the curl transport', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi.spyOn(curlClient, 'curlPostJson').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.postJson('/getRosActions', { actionType: ['ACTION'] });

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getRosActions',
      {
        Cookie: 'JSESSIONID=session-1',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
      },
      JSON.stringify({ actionType: ['ACTION'] }),
      1000
    );
  });

  it('postForm sends a form-encoded body with the right content-type', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { requestData: [] }));

    const client = new RosClient(config, session);
    await client.postForm('/getFlowStepInfo', { flowId: 34606 });

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/getFlowStepInfo',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Cookie: 'JSESSIONID=session-1',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'flowId=34606',
      }),
      1000
    );
  });

  it('re-logs-in once and retries when the response looks like the login page', async () => {
    const session = new FakeSession();
    await session.login();
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce({ status: 200, headers: new Headers(), text: '<form action="/dologin"><input name="password"/></form>' })
      .mockResolvedValueOnce(jsonResponse(200, { requestData: { flowId: 34606 } }));

    const client = new RosClient(config, session);
    const result = await client.getJson<{ requestData: { flowId: number } }>('/getFlowInfo', { flowId: 34606 });

    expect(session.loginCalls).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.requestData.flowId).toBe(34606);
  });

  it('throws RosUnexpectedResponseError if the login page keeps coming back after retry', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: '<form action="/dologin"><input name="password"/></form>',
    });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
    expect(session.loginCalls).toBe(2);
  });

  it('throws RosNotFoundError on a 404', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 404, headers: new Headers(), text: '' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 999999 })).rejects.toBeInstanceOf(RosNotFoundError);
  });

  it('throws RosServerError on a 500', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 500, headers: new Headers(), text: 'boom' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosServerError);
  });

  it('throws RosUnexpectedResponseError when the body is not valid JSON', async () => {
    const session = new FakeSession();
    await session.login();
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: 'not json at all' });

    const client = new RosClient(config, session);
    await expect(client.getJson('/getFlowInfo', { flowId: 34606 })).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { RosAuthClient } from '../../src/rosClient/rosAuthClient.js';
import { RosAuthError, RosUnexpectedResponseError } from '../../src/errors.js';

function jsonResponse(status: number, body: unknown) {
  return { status, headers: new Headers(), text: JSON.stringify(body) };
}

describe('RosAuthClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function client() {
    return new RosAuthClient({
      baseUrl: 'http://ros-auth.local',
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      httpTimeoutMs: 5000,
    });
  }

  it('sends clientId/clientSecret as JSON to POST /authenticate', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }));

    const token = await client().getToken();

    expect(token).toBe('jwt-1');
    expect(spy).toHaveBeenCalledWith(
      'http://ros-auth.local/authenticate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-abc', clientSecret: 'secret-xyz' }),
      }),
      5000
    );
  });

  it('reuses the cached token within the validity window', async () => {
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    vi.setSystemTime(10 * 60 * 1000); // 10 minutes later, well within the 1h expiry
    const second = await authClient.getToken();

    expect(second).toBe('jwt-1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes once the cached token is within the 5-minute safety margin of expiry', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-2', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    vi.setSystemTime(56 * 60 * 1000); // past the 55-minute margin cutoff of a 60-minute token
    const second = await authClient.getToken();

    expect(second).toBe('jwt-2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('refreshes when forceRefresh is true even if the cache is still fresh', async () => {
    const spy = vi
      .spyOn(httpClient, 'rawRequest')
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-1', expiryHours: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'jwt-2', expiryHours: 1 }));
    const authClient = client();

    await authClient.getToken();
    const second = await authClient.getToken(true);

    expect(second).toBe('jwt-2');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws RosAuthError when /authenticate returns 401', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 401, headers: new Headers(), text: 'bad credentials' });

    await expect(client().getToken()).rejects.toBeInstanceOf(RosAuthError);
  });

  it('throws RosUnexpectedResponseError (not a TypeError) when /authenticate returns valid JSON that is not an object, e.g. null', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: 'null' });

    await expect(client().getToken()).rejects.toBeInstanceOf(RosUnexpectedResponseError);
  });
});

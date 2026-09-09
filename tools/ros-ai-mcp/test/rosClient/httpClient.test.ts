// test/rosClient/httpClient.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapHttpError, rawRequest } from '../../src/rosClient/httpClient.js';
import {
  RosAuthError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../../src/errors.js';

describe('rawRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns status, headers, and text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'x-test': '1' } }))
    );

    const result = await rawRequest('http://ros.local/getFlowInfo', { method: 'GET', headers: {} }, 1000);

    expect(result.status).toBe(200);
    expect(result.text).toBe('{"ok":true}');
    expect(result.headers.get('x-test')).toBe('1');
  });

  it('throws RosTimeoutError when the request is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          })
      )
    );

    await expect(rawRequest('http://ros.local/slow', { method: 'GET', headers: {} }, 20)).rejects.toBeInstanceOf(
      RosTimeoutError
    );
  });

  it('throws RosServerError with status 0 when fetch fails outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const error = await rawRequest('http://ros.local/unreachable', { method: 'GET', headers: {} }, 1000).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(RosServerError);
    expect((error as RosServerError).status).toBe(0);
  });
});

describe('mapHttpError', () => {
  it('maps 401 and 403 to RosAuthError', () => {
    expect(mapHttpError('http://x', 401, '')).toBeInstanceOf(RosAuthError);
    expect(mapHttpError('http://x', 403, '')).toBeInstanceOf(RosAuthError);
  });

  it('maps 404 to RosNotFoundError', () => {
    expect(mapHttpError('http://x', 404, '')).toBeInstanceOf(RosNotFoundError);
  });

  it('maps 5xx to RosServerError with the status attached', () => {
    const error = mapHttpError('http://x', 503, 'boom') as RosServerError;
    expect(error).toBeInstanceOf(RosServerError);
    expect(error.status).toBe(503);
  });

  it('maps other non-2xx statuses to RosUnexpectedResponseError', () => {
    expect(mapHttpError('http://x', 418, 'teapot')).toBeInstanceOf(RosUnexpectedResponseError);
  });
});

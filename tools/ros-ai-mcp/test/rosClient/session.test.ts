import { afterEach, describe, expect, it, vi } from 'vitest';
import * as httpClient from '../../src/rosClient/httpClient.js';
import { extractJsessionId, SessionManager } from '../../src/rosClient/session.js';
import { RosAuthError } from '../../src/errors.js';

describe('extractJsessionId', () => {
  it('finds JSESSIONID among multiple set-cookie values', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'OTHERCOOKIE=abc; Path=/');
    headers.append('set-cookie', 'JSESSIONID=xyz123; Path=/; HttpOnly');
    expect(extractJsessionId(headers)).toBe('JSESSIONID=xyz123');
  });

  it('returns null when no JSESSIONID cookie is present', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'OTHERCOOKIE=abc; Path=/');
    expect(extractJsessionId(headers)).toBeNull();
  });

  it('returns null when there are no set-cookie headers at all', () => {
    expect(extractJsessionId(new Headers())).toBeNull();
  });
});

describe('SessionManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the JSESSIONID cookie after a successful login', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/masros-gui; HttpOnly');
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'secret', 1000);
    expect(session.hasSession()).toBe(false);

    await session.login();

    expect(session.hasSession()).toBe(true);
    expect(session.getCookie()).toBe('JSESSIONID=abc123');
  });

  it('sends username/password form-encoded to /dologin', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/');
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'p@ss w/ord', 1000);
    await session.login();

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/dologin',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=jyanez&password=p%40ss+w%2Ford',
      }),
      1000
    );
  });

  it('does not follow the 302 redirect ROS sends on a successful login, so the Set-Cookie header is preserved', async () => {
    // ROS's real /dologin responds 302 (Location: .../home) with the JSESSIONID Set-Cookie
    // on that redirect response itself. Following the redirect (fetch's default) discards
    // that header, since the caller then only sees the final response's headers.
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/');
    const spy = vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 302, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'secret', 1000);
    await session.login();

    expect(spy).toHaveBeenCalledWith(
      'http://ros.local/masros-gui/dologin',
      expect.objectContaining({ redirect: 'manual' }),
      1000
    );
    expect(session.getCookie()).toBe('JSESSIONID=abc123');
  });

  it('throws RosAuthError when no JSESSIONID cookie comes back', async () => {
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers: new Headers(), text: '<html/>' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'wrong', 1000);
    await expect(session.login()).rejects.toBeInstanceOf(RosAuthError);
    expect(session.hasSession()).toBe(false);
  });

  it('clear() drops the stored cookie', async () => {
    const headers = new Headers();
    headers.append('set-cookie', 'JSESSIONID=abc123; Path=/');
    vi.spyOn(httpClient, 'rawRequest').mockResolvedValue({ status: 200, headers, text: '' });

    const session = new SessionManager('http://ros.local/masros-gui', 'jyanez', 'secret', 1000);
    await session.login();
    session.clear();

    expect(session.hasSession()).toBe(false);
    expect(session.getCookie()).toBeNull();
  });
});

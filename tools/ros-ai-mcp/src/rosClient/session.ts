import { rawRequest } from './httpClient.js';
import { RosAuthError } from '../errors.js';

export interface SessionLike {
  hasSession(): boolean;
  getCookie(): string | null;
  clear(): void;
  login(): Promise<void>;
}

export function extractJsessionId(headers: Headers): string | null {
  const setCookieValues =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];

  for (const value of setCookieValues) {
    const match = value.match(/^JSESSIONID=[^;]+/);
    if (match) return match[0];
  }
  return null;
}

export class SessionManager implements SessionLike {
  private cookie: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly timeoutMs: number
  ) {}

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
    const url = `${this.baseUrl}/dologin`;
    const body = new URLSearchParams({ username: this.username, password: this.password }).toString();

    const response = await rawRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        // ROS responds to a successful login with a 302 carrying the JSESSIONID
        // Set-Cookie header; following that redirect (fetch's default) would hand
        // back only the final response's headers, which don't include it.
        redirect: 'manual',
      },
      this.timeoutMs
    );

    const jsessionId = extractJsessionId(response.headers);
    if (!jsessionId) {
      throw new RosAuthError('Login to ROS did not return a JSESSIONID cookie — check ROS_USERNAME/ROS_PASSWORD');
    }
    this.cookie = jsessionId;
  }
}

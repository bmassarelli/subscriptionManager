import { mapHttpError, rawRequest } from './httpClient.js';
import { RosUnexpectedResponseError } from '../errors.js';

export interface RosAuthClientLike {
  getToken(forceRefresh?: boolean): Promise<string>;
}

export interface RosAuthClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  httpTimeoutMs: number;
}

interface AuthenticateResponse {
  token: string;
  expiryHours: number;
}

// Refresh a bit before the JWT actually expires, so a token handed to a
// caller doesn't expire mid-flight on a slow request to ros-rest.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class RosAuthClient implements RosAuthClientLike {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly opts: RosAuthClientOptions) {}

  async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedToken !== null && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.cachedToken;
    }

    const url = `${this.opts.baseUrl}/authenticate`;
    const response = await rawRequest(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.opts.clientId, clientSecret: this.opts.clientSecret }),
      },
      this.opts.httpTimeoutMs
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
    if (typeof parsed !== 'object' || parsed === null || !(parsed as AuthenticateResponse).token) {
      throw new RosUnexpectedResponseError(`ros-authorization did not return a token`, response.text);
    }
    const { token, expiryHours } = parsed as AuthenticateResponse;

    this.cachedToken = token;
    this.expiresAt = Date.now() + expiryHours * 60 * 60 * 1000;
    return this.cachedToken;
  }
}

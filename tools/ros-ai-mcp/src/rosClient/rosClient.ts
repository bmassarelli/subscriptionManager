import { curlPostJson } from './curlClient.js';
import { mapHttpError, rawRequest } from './httpClient.js';
import type { RawRequestInit, RawResponse } from './httpClient.js';
import { SessionLike, SessionManager } from './session.js';
import type { RosConfig } from '../config.js';
import { RosUnexpectedResponseError } from '../errors.js';

export interface RosClientLike {
  getJson<T>(path: string, query?: Record<string, string | number>): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  postForm<T>(path: string, form: Record<string, string | number>): Promise<T>;
}

interface RequestOptions {
  query?: Record<string, string | number>;
  jsonBody?: unknown;
  formBody?: Record<string, string | number>;
}

type Transport = (url: string, init: RawRequestInit, timeoutMs: number) => Promise<RawResponse>;

// fetch (see httpClient.ts) reliably ECONNRESETs on JSON POST bodies above
// ~1KB sent to ROS over the Ivanti Secure Access VPN path to DEV/QA
// (confirmed 2026-09-03, reproduced outside this codebase entirely — curl
// sending the identical body/headers/cookie over the same network succeeds
// in ~1s every time, at any size tested). saveAction is the only tool that
// sends JSON POST bodies large enough to hit this, so postJson specifically
// routes through curl; GETs and the small dologin form POST stay on fetch.
const curlTransport: Transport = (url, init, timeoutMs) => curlPostJson(url, init.headers, init.body ?? '', timeoutMs);

export class RosClient implements RosClientLike {
  private readonly session: SessionLike;

  constructor(
    private readonly config: RosConfig,
    session?: SessionLike
  ) {
    this.session = session ?? new SessionManager(config.baseUrl, config.username, config.password, config.httpTimeoutMs);
  }

  async getJson<T>(path: string, query?: Record<string, string | number>): Promise<T> {
    return this.request<T>('GET', path, { query }, rawRequest);
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { jsonBody: body }, curlTransport);
  }

  async postForm<T>(path: string, form: Record<string, string | number>): Promise<T> {
    return this.request<T>('POST', path, { formBody: form }, rawRequest);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, opts: RequestOptions, transport: Transport): Promise<T> {
    if (!this.session.hasSession()) {
      await this.session.login();
    }
    const text = await this.attempt(method, path, opts, transport, false);
    return this.parseJson<T>(text, path);
  }

  private async attempt(
    method: 'GET' | 'POST',
    path: string,
    opts: RequestOptions,
    transport: Transport,
    isRetry: boolean
  ): Promise<string> {
    const url = this.buildUrl(path, opts.query);
    // ROS's content negotiation defaults to XML unless the client asks for JSON explicitly.
    const headers: Record<string, string> = {
      Cookie: this.session.getCookie() ?? '',
      Accept: 'application/json',
      // jQuery (what masros-gui's own frontend uses via ajaxRequest/sk.js) sets
      // this on every same-origin XHR by default; matching it in case some
      // intermediary distinguishes AJAX-style requests from ECONNRESET-prone ones.
      'X-Requested-With': 'XMLHttpRequest',
    };
    let body: string | undefined;

    if (opts.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.jsonBody);
    } else if (opts.formBody !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(
        Object.fromEntries(Object.entries(opts.formBody).map(([key, value]) => [key, String(value)]))
      ).toString();
    }

    const response = await transport(url, { method, headers, body }, this.config.httpTimeoutMs);

    if (looksLikeLoginPage(response.text) && !isRetry) {
      this.session.clear();
      await this.session.login();
      return this.attempt(method, path, opts, transport, true);
    }

    if (response.status < 200 || response.status >= 300) {
      throw mapHttpError(url, response.status, response.text);
    }

    return response.text;
  }

  private buildUrl(path: string, query?: Record<string, string | number>): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private parseJson<T>(text: string, path: string): T {
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new RosUnexpectedResponseError(`Expected JSON from ${path} but could not parse the response`, text, err);
    }
  }
}

function looksLikeLoginPage(text: string): boolean {
  return /action=["']?\/?dologin/i.test(text) || /name=["']?password["']?/i.test(text);
}

import {
  RosAuthError,
  RosError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../errors.js';

export interface RawResponse {
  status: number;
  headers: Headers;
  text: string;
}

export interface RawRequestInit {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  redirect?: 'manual' | 'follow' | 'error';
}

export async function rawRequest(url: string, init: RawRequestInit, timeoutMs: number): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new RosTimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`, err);
    }
    throw new RosServerError(`Failed to reach ${url}: ${(err as Error).message}`, 0, err);
  } finally {
    clearTimeout(timer);
  }
}

export function mapHttpError(url: string, status: number, text: string): RosError {
  if (status === 401 || status === 403) {
    return new RosAuthError(`ROS rejected the request to ${url} (HTTP ${status})`);
  }
  if (status === 404) {
    return new RosNotFoundError(`ROS returned 404 for ${url}`);
  }
  if (status >= 500) {
    return new RosServerError(`ROS returned HTTP ${status} for ${url}`, status);
  }
  return new RosUnexpectedResponseError(`ROS returned unexpected HTTP ${status} for ${url}`, text);
}

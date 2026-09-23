import { execFile } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';
import { RosServerError, RosTimeoutError } from '../errors.js';
import type { RawResponse } from './httpClient.js';

// Node's fetch (both the global implementation and undici's directly, with
// or without a keepalive-tuned Agent — all three were tried) reliably
// ECONNRESETs on JSON POST bodies above ~1KB sent to ROS over the Ivanti
// Secure Access VPN path to DEV/QA (confirmed 2026-09-03: reproduced in
// isolation outside this codebase entirely). curl sending the exact same
// body/headers/session cookie over the same network succeeds in ~1s every
// time, for bodies of any size tested. The root cause sits outside this
// codebase — most likely something in the VPN or an inline security
// appliance mishandling Node's TCP write pattern for larger request bodies —
// so shelling out to curl for JSON POSTs (this is the transport postJson
// uses; GETs and the tiny login POST stay on fetch, which was never
// observed to fail) is the pragmatic fix rather than a real root-cause fix.
export async function curlPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<RawResponse> {
  const headerArgs = Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));

  return new Promise((resolve, reject) => {
    const child = execFile(
      'curl',
      ['-s', '-X', 'POST', url, ...headerArgs, '--data-binary', '@-', '-w', '\n%{http_code}', '--max-time', String(timeoutSeconds)],
      { timeout: timeoutMs + 5000, maxBuffer: 20 * 1024 * 1024 },
      (err: ExecFileException | null, stdout, stderr) => {
        if (err) {
          if (err.killed) {
            reject(new RosTimeoutError(`curl request to ${url} timed out after ${timeoutMs}ms`, err));
          } else {
            reject(new RosServerError(`curl failed to reach ${url}: ${stderr.trim() || err.message}`, 0, err));
          }
          return;
        }
        const lastNewline = stdout.lastIndexOf('\n');
        const text = lastNewline === -1 ? stdout : stdout.slice(0, lastNewline);
        const status = Number(stdout.slice(lastNewline + 1).trim());
        resolve({ status, headers: new Headers(), text });
      }
    );
    child.stdin?.end(body);
  });
}

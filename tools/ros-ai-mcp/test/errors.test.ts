import { describe, expect, it } from 'vitest';
import {
  RosAuthError,
  RosError,
  RosNotFoundError,
  RosServerError,
  RosTimeoutError,
  RosUnexpectedResponseError,
} from '../src/errors.js';

describe('RosError hierarchy', () => {
  it('RosAuthError is a RosError with the right name and message', () => {
    const err = new RosAuthError('bad credentials');
    expect(err).toBeInstanceOf(RosError);
    expect(err.name).toBe('RosAuthError');
    expect(err.message).toBe('bad credentials');
  });

  it('RosNotFoundError is a RosError', () => {
    expect(new RosNotFoundError('flow 999 not found')).toBeInstanceOf(RosError);
  });

  it('RosServerError carries the HTTP status', () => {
    const err = new RosServerError('boom', 503);
    expect(err).toBeInstanceOf(RosError);
    expect(err.status).toBe(503);
  });

  it('RosTimeoutError is a RosError', () => {
    expect(new RosTimeoutError('timed out')).toBeInstanceOf(RosError);
  });

  it('RosUnexpectedResponseError carries the raw response body', () => {
    const err = new RosUnexpectedResponseError('not JSON', '<html>login</html>');
    expect(err).toBeInstanceOf(RosError);
    expect(err.body).toBe('<html>login</html>');
  });

  it('preserves an optional cause', () => {
    const cause = new Error('network down');
    const err = new RosServerError('boom', 0, cause);
    expect(err.cause).toBe(cause);
  });
});

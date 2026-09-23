export interface RosConfig {
  baseUrl: string;
  username: string;
  password: string;
  httpTimeoutMs: number;
  enableWrite: boolean;
  rosRestBaseUrl?: string;
  rosAuthorizationBaseUrl?: string;
  rosClientId?: string;
  rosClientSecret?: string;
  auditOrigin?: string;
  auditUsername?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadRosConfig(env: Record<string, string | undefined> = process.env): RosConfig {
  const baseUrl = env.ROS_BASE_URL;
  const username = env.ROS_USERNAME;
  const password = env.ROS_PASSWORD;

  if (!baseUrl) throw new ConfigError('ROS_BASE_URL is required');
  if (!username) throw new ConfigError('ROS_USERNAME is required');
  if (!password) throw new ConfigError('ROS_PASSWORD is required');

  const timeoutRaw = env.ROS_HTTP_TIMEOUT_MS;
  const httpTimeoutMs = timeoutRaw === undefined ? 15000 : Number(timeoutRaw);
  if (!Number.isFinite(httpTimeoutMs) || httpTimeoutMs <= 0) {
    throw new ConfigError('ROS_HTTP_TIMEOUT_MS must be a positive number');
  }

  const enableWrite = env.ROS_MCP_ENABLE_WRITE === 'true';

  const rosRestBaseUrl = env.ROS_REST_BASE_URL?.replace(/\/+$/, '');
  const rosAuthorizationBaseUrl = env.ROS_AUTHORIZATION_BASE_URL?.replace(/\/+$/, '');
  const rosClientId = env.ROS_CLIENT_ID;
  const rosClientSecret = env.ROS_CLIENT_SECRET;
  const auditOrigin = env.ROS_MCP_AUDIT_ORIGIN;
  const auditUsername = env.ROS_MCP_AUDIT_USERNAME;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    username,
    password,
    httpTimeoutMs,
    enableWrite,
    rosRestBaseUrl,
    rosAuthorizationBaseUrl,
    rosClientId,
    rosClientSecret,
    auditOrigin,
    auditUsername,
  };
}

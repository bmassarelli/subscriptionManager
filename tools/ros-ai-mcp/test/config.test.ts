import { describe, expect, it } from 'vitest';
import { ConfigError, loadRosConfig } from '../src/config.js';

const validEnv = {
  ROS_BASE_URL: 'http://172.19.91.145:8081/masros-gui/',
  ROS_USERNAME: 'jyanez',
  ROS_PASSWORD: 'secret',
};

describe('loadRosConfig', () => {
  it('loads and strips a trailing slash from baseUrl', () => {
    const config = loadRosConfig(validEnv);
    expect(config).toEqual({
      baseUrl: 'http://172.19.91.145:8081/masros-gui',
      username: 'jyanez',
      password: 'secret',
      httpTimeoutMs: 15000,
      enableWrite: false,
    });
  });

  it('uses ROS_HTTP_TIMEOUT_MS when provided', () => {
    const config = loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '5000' });
    expect(config.httpTimeoutMs).toBe(5000);
  });

  it('throws ConfigError when ROS_BASE_URL is missing', () => {
    const { ROS_BASE_URL, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_USERNAME is missing', () => {
    const { ROS_USERNAME, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_PASSWORD is missing', () => {
    const { ROS_PASSWORD, ...rest } = validEnv;
    expect(() => loadRosConfig(rest)).toThrow(ConfigError);
  });

  it('throws ConfigError when ROS_HTTP_TIMEOUT_MS is not a positive number', () => {
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: 'abc' })).toThrow(ConfigError);
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '0' })).toThrow(ConfigError);
    expect(() => loadRosConfig({ ...validEnv, ROS_HTTP_TIMEOUT_MS: '-5' })).toThrow(ConfigError);
  });

  it('enableWrite is false when ROS_MCP_ENABLE_WRITE is not set', () => {
    const config = loadRosConfig(validEnv);
    expect(config.enableWrite).toBe(false);
  });

  it('enableWrite is false when ROS_MCP_ENABLE_WRITE is anything other than "true"', () => {
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'TRUE' }).enableWrite).toBe(false);
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: '1' }).enableWrite).toBe(false);
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'false' }).enableWrite).toBe(false);
  });

  it('enableWrite is true when ROS_MCP_ENABLE_WRITE is exactly "true"', () => {
    expect(loadRosConfig({ ...validEnv, ROS_MCP_ENABLE_WRITE: 'true' }).enableWrite).toBe(true);
  });
});

describe('loadRosConfig — ros-rest / ros-authorization / audit fields (Phase 6)', () => {
  it('leaves the 6 new fields undefined when their env vars are absent', () => {
    const config = loadRosConfig(validEnv);
    expect(config.rosRestBaseUrl).toBeUndefined();
    expect(config.rosAuthorizationBaseUrl).toBeUndefined();
    expect(config.rosClientId).toBeUndefined();
    expect(config.rosClientSecret).toBeUndefined();
    expect(config.auditOrigin).toBeUndefined();
    expect(config.auditUsername).toBeUndefined();
  });

  it('reads all 6 fields when their env vars are present', () => {
    const config = loadRosConfig({
      ...validEnv,
      ROS_REST_BASE_URL: 'http://172.19.91.145:9081/ros-rest',
      ROS_AUTHORIZATION_BASE_URL: 'http://172.19.91.145:9082/ros-authorization',
      ROS_CLIENT_ID: 'client-abc',
      ROS_CLIENT_SECRET: 'secret-xyz',
      ROS_MCP_AUDIT_ORIGIN: 'ros-ai-mcp',
      ROS_MCP_AUDIT_USERNAME: 'jyanez',
    });
    expect(config.rosRestBaseUrl).toBe('http://172.19.91.145:9081/ros-rest');
    expect(config.rosAuthorizationBaseUrl).toBe('http://172.19.91.145:9082/ros-authorization');
    expect(config.rosClientId).toBe('client-abc');
    expect(config.rosClientSecret).toBe('secret-xyz');
    expect(config.auditOrigin).toBe('ros-ai-mcp');
    expect(config.auditUsername).toBe('jyanez');
  });
});

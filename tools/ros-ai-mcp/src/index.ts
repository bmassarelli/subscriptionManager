// src/index.ts
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadRosConfig } from './config.js';
import { RosClient } from './rosClient/rosClient.js';
import { RosAuthClient } from './rosClient/rosAuthClient.js';
import type { ExecuteFlowDeps } from './tools/executeFlow.js';
import { registerTools, type McpServerLike } from './server.js';

// The MCP client launches this process with an arbitrary cwd (its own, not
// ours), so dotenv's default cwd-relative lookup can't find our .env — resolve
// it relative to this module's own location instead.
loadDotenv({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

async function main(): Promise<void> {
  const config = loadRosConfig();
  const client = new RosClient(config);

  const server = new McpServer({ name: 'ros-ai-mcp', version: '0.1.0' });
  // The installed SDK's `McpServer.tool()` is overloaded (6 signatures, one of
  // which is the 4-arg `(name, description, schema, handler)` form our
  // McpServerLike/registerTools use). TypeScript's structural check for
  // assigning an overloaded method to a single-signature interface resolves
  // against the wrong overload here and reports a false incompatibility, even
  // though the 4-arg call this code actually makes matches a real overload
  // and dispatches correctly at runtime. Hence the explicit cast.
  const restDeps: ExecuteFlowDeps | undefined =
    config.rosRestBaseUrl && config.rosAuthorizationBaseUrl && config.rosClientId && config.rosClientSecret && config.auditOrigin && config.auditUsername
      ? {
          restBaseUrl: config.rosRestBaseUrl,
          authClient: new RosAuthClient({
            baseUrl: config.rosAuthorizationBaseUrl,
            clientId: config.rosClientId,
            clientSecret: config.rosClientSecret,
            httpTimeoutMs: config.httpTimeoutMs,
          }),
          auditOrigin: config.auditOrigin,
          auditUsername: config.auditUsername,
          httpTimeoutMs: config.httpTimeoutMs,
        }
      : undefined;

  registerTools(server as unknown as McpServerLike, client, { enableWrite: config.enableWrite, restDeps });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('ros-ai-mcp failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});

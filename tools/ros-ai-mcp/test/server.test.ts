// test/server.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerTools } from '../src/server.js';
import type { RosClientLike } from '../src/rosClient/rosClient.js';

interface RegisteredTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

class FakeMcpServer {
  registered: RegisteredTool[] = [];

  tool(name: string, description: string, _schema: unknown, handler: RegisteredTool['handler']): void {
    this.registered.push({ name, description, handler });
  }
}

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

describe('registerTools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 9 Phase-1 read-only tools, the 4 Phase-2 intelligence tools, the Phase-3 skeleton tool, and get_action_parameters', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());

    const names = server.registered.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        'analyze_flow',
        'analyze_item',
        'find_similar_actions',
        'find_similar_flows',
        'get_action',
        'get_action_command',
        'get_action_parameters',
        'get_action_template',
        'get_flow',
        'get_flow_steps',
        'get_item_info',
        'search_actions',
        'search_flows',
        'search_ros_items',
        'summarize_flow_skeleton',
      ].sort()
    );
  });

  it('get_action_parameters handler returns the parsed rows plus a joined signature', async () => {
    const client = fakeClient({
      postForm: vi.fn().mockResolvedValue({
        requestData: [
          { parserId: 1, actionId: 88138, parserTarget: 'INPUT_PARAM', seqId: 1, parserType: null, parserValue: null, propertyPath: 'typeRecurso', schemaDefId: 2, propertyType: null, version: 1, modDate: 0, userName: 'x' },
        ],
      }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client);

    const tool = server.registered.find((t) => t.name === 'get_action_parameters')!;
    const result = await tool.handler({ actionId: 88138 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.parsers).toHaveLength(1);
    expect(parsed.signature.inputs).toEqual([{ seqId: 1, propertyPath: 'typeRecurso', schemaType: 'Number' }]);
  });

  it('a tool handler calls the client and returns MCP text content on success', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { flow: { flowId: 34606 } } }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client);

    const getFlowTool = server.registered.find((tool) => tool.name === 'get_flow')!;
    const result = await getFlowTool.handler({ flowId: 34606 });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ flow: { flowId: 34606 } });
  });

  it('a tool handler returns isError:true with the message when the client throws a RosError', async () => {
    const { RosNotFoundError } = await import('../src/errors.js');
    const client = fakeClient({
      getJson: vi.fn().mockRejectedValue(new RosNotFoundError('flow 999999 not found')),
    });
    const server = new FakeMcpServer();
    registerTools(server, client);

    const getFlowTool = server.registered.find((tool) => tool.name === 'get_flow')!;
    const result = await getFlowTool.handler({ flowId: 999999 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('flow 999999 not found');
  });

  it('does NOT register save_action when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'save_action')).toBe(false);

    const server2 = new FakeMcpServer();
    registerTools(server2, fakeClient(), { enableWrite: false });
    expect(server2.registered.some((tool) => tool.name === 'save_action')).toBe(false);
  });

  it('registers save_action when enableWrite is true', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'save_action')).toBe(true);
  });

  it('save_action handler returns MCP text content', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: {} }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const saveActionTool = server.registered.find((tool) => tool.name === 'save_action')!;
    const result = await saveActionTool.handler({
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mode).toBe('create');
    expect(parsed.applied).toBe(false);
  });

  it('does NOT register execute_flow when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'execute_flow')).toBe(false);

    const server2 = new FakeMcpServer();
    registerTools(server2, fakeClient(), { enableWrite: false });
    expect(server2.registered.some((tool) => tool.name === 'execute_flow')).toBe(false);
  });

  it('registers execute_flow when enableWrite is true, with or without restDeps', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'execute_flow')).toBe(true);
  });

  it('execute_flow handler returns preview-only MCP text content without restDeps', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { flow: { flowId: 34606, flowCode: 'X', flowDes: 'x', activeFlag: 'Y', massFlag: 'N' } } }),
    });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const tool = server.registered.find((t) => t.name === 'execute_flow')!;
    const result = await tool.handler({ flowId: 34606 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(false);
    expect(parsed.preview.summary).toContain('X');
  });

  it('does NOT register create_flow, save_flow_steps, or update_flow_steps when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'create_flow')).toBe(false);
    expect(server.registered.some((tool) => tool.name === 'save_flow_steps')).toBe(false);
    expect(server.registered.some((tool) => tool.name === 'update_flow_steps')).toBe(false);
  });

  it('registers create_flow, save_flow_steps, and update_flow_steps when enableWrite is true, without needing restDeps', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'create_flow')).toBe(true);
    expect(server.registered.some((tool) => tool.name === 'save_flow_steps')).toBe(true);
    expect(server.registered.some((tool) => tool.name === 'update_flow_steps')).toBe(true);
  });

  it('create_flow handler returns MCP text content on a rejected preview', async () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });

    const tool = server.registered.find((t) => t.name === 'create_flow')!;
    const result = await tool.handler({ flowCode: 'Dynamic', flowDes: 'x' });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(false);
    expect(parsed.error.message).toMatch(/reserved/i);
  });

  it('save_flow_steps handler returns MCP text content on a rejected preview (flow not found)', async () => {
    const client = fakeClient();
    vi.spyOn(client, 'getJson').mockResolvedValue({ requestData: { flow: null } });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const tool = server.registered.find((t) => t.name === 'save_flow_steps')!;
    const result = await tool.handler({ flowId: 1, steps: [{ kind: 'end' }] });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(false);
    expect(parsed.error.message).toMatch(/not found/i);
  });

  it('update_flow_steps handler returns MCP text content on a rejected preview (flow not found)', async () => {
    const client = fakeClient();
    vi.spyOn(client, 'getJson').mockResolvedValue({ requestData: { flow: null } });
    const server = new FakeMcpServer();
    registerTools(server, client, { enableWrite: true });

    const tool = server.registered.find((t) => t.name === 'update_flow_steps')!;
    const result = await tool.handler({ flowId: 1, steps: [{ kind: 'end' }] });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.applied).toBe(false);
    expect(parsed.error.message).toMatch(/not found/i);
  });

  it('does NOT register get_job_status when enableWrite is false or omitted', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient());
    expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);

    const server2 = new FakeMcpServer();
    registerTools(server2, fakeClient(), { enableWrite: false });
    expect(server2.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);
  });

  it('does NOT register get_job_status when enableWrite is true but restDeps is missing', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), { enableWrite: true });
    expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(false);
  });

  it('registers get_job_status when enableWrite is true and restDeps is present', () => {
    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), {
      enableWrite: true,
      restDeps: { restBaseUrl: 'http://ros-rest.local', authClient: { getToken: vi.fn() }, auditOrigin: 'ros-ai-mcp', auditUsername: 'jyanez', httpTimeoutMs: 5000 },
    });
    expect(server.registered.some((tool) => tool.name === 'get_job_status')).toBe(true);
  });

  it('get_job_status handler returns MCP text content on success', async () => {
    const rosRestClient = await import('../src/rosClient/rosRestClient.js');
    vi.spyOn(rosRestClient, 'getJobDetail').mockResolvedValue({
      responseStatus: { status: 100, statusCode: 'ok', statusMessage: '' },
      jobId: 98765,
      flowId: 34606,
      statusId: 90,
      statusCode: 'FINISHED',
    });

    const server = new FakeMcpServer();
    registerTools(server, fakeClient(), {
      enableWrite: true,
      restDeps: { restBaseUrl: 'http://ros-rest.local', authClient: { getToken: vi.fn().mockResolvedValue('jwt-1') }, auditOrigin: 'ros-ai-mcp', auditUsername: 'jyanez', httpTimeoutMs: 5000 },
    });

    const tool = server.registered.find((t) => t.name === 'get_job_status')!;
    const result = await tool.handler({ jobId: 98765 });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.found).toBe(true);
    expect(parsed.jobId).toBe(98765);
  });
});

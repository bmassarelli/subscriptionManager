import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlow } from '../../src/tools/createFlow.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { UserFlowSummary } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn(),
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

function flowSummary(overrides: Partial<UserFlowSummary> = {}): UserFlowSummary {
  return {
    flowId: 99001,
    flowCode: 'EXISTING_FLOW',
    flowDes: 'Existing',
    priority: 10,
    activeFlag: 'Y',
    massFlag: 'Y',
    rosFlag: 'Y',
    syncBy: 'NONE',
    inMemoryFlag: 'N',
    dbReprocessFlag: 'N',
    permisionLevelCode: 'EDIT',
    ...overrides,
  };
}

describe('createFlow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects the reserved flowCode "Dynamic" before any HTTP call, even with confirm:true', async () => {
    const client = fakeClient();
    const result = await createFlow(client, { flowCode: 'Dynamic', flowDes: 'x', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/reserved/i);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('preview mode (no confirm) never calls postJson and flags an existing flowCode collision', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({ requestData: [flowSummary({ flowCode: 'NEW_FLOW' })] }),
    });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow' });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/already exists/i);
  });

  it('preview mode reports no collision and never writes when flowCode is free', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({ requestData: [flowSummary({ flowCode: 'OTHER' })] }),
    });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow' });

    expect(result.applied).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.preview.summary).toMatch(/NEW_FLOW/);
    expect(client.postJson).toHaveBeenCalledTimes(1); // only the search_flows uniqueness check
  });

  it('confirm:true posts to /saveFlowDetail with flowId:-1 and the right defaults', async () => {
    // search_flows is called twice — once for the pre-save uniqueness check, once
    // as the post-save verification lookup — both hit postJson('/getUserFlows'),
    // so the three calls are distinguished purely by order via mockImplementationOnce.
    const postJson = vi.fn();
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // pre-save uniqueness check
    postJson.mockImplementationOnce(() => Promise.resolve({ successMessage: 'flow.successCreate: 77003' })); // saveFlowDetail
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [flowSummary({ flowId: 77003, flowCode: 'NEW_FLOW' })] })); // post-save verify
    const client = fakeClient({ postJson, getJson: vi.fn() });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow', confirm: true });

    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ flowId: 77003, flowCode: 'NEW_FLOW' });
    expect(postJson).toHaveBeenNthCalledWith(
      2,
      '/saveFlowDetail',
      expect.objectContaining({
        flowId: -1,
        flowCode: 'NEW_FLOW',
        flowDes: 'A new flow',
        massFlag: true,
        rosFlag: true,
        activeFlag: true,
        eagerFlag: false,
        inMemory: false,
        dbReprocessFlag: false,
        flowGroups: [],
      })
    );
  });

  it('confirm:true sends emailNotification:"" (not omitted/undefined) when the input omits it, to avoid a server-side NPE', async () => {
    const postJson = vi.fn();
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // pre-save uniqueness check
    postJson.mockImplementationOnce(() => Promise.resolve({ successMessage: 'flow.successCreate: 77003' })); // saveFlowDetail
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [flowSummary({ flowId: 77003, flowCode: 'NEW_FLOW' })] })); // post-save verify
    const client = fakeClient({ postJson, getJson: vi.fn() });

    await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow', confirm: true });

    expect(postJson).toHaveBeenNthCalledWith(
      2,
      '/saveFlowDetail',
      expect.objectContaining({ emailNotification: '' })
    );
  });

  it('confirm:true fails clearly when the post-save verification lookup finds no matching flow', async () => {
    const postJson = vi.fn();
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // pre-save uniqueness check
    postJson.mockImplementationOnce(() => Promise.resolve({ successMessage: 'flow.successCreate: 77003' })); // saveFlowDetail
    postJson.mockImplementationOnce(() => Promise.resolve({ requestData: [] })); // post-save verify finds nothing
    const client = fakeClient({ postJson });

    const result = await createFlow(client, { flowCode: 'NEW_FLOW', flowDes: 'A new flow', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/no flow with that code was found/i);
  });
});

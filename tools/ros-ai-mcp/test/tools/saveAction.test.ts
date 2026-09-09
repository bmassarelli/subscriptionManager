// test/tools/saveAction.test.ts
import { describe, expect, it, vi } from 'vitest';
import { saveAction } from '../../src/tools/saveAction.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { ActionDBConfig, RosAction } from '../../src/rosClient/types.js';

const currentAction: RosAction = {
  actionId: 42,
  actionCode: 'GET_CUSTOMER',
  actionDes: 'Get customer data',
  syncBy: 'admin',
  workerClass: '',
  command: 'return http.get(...)',
  actionType: 'ACTION',
  commandType: 'REST',
  domain: 'https://crm.internal',
  protocol: 'https',
  method: 'GET',
  contentType: 'application/json',
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  eager: 'N',
  hash: 'abc',
  actionYmlConfig: {},
};

const currentConfig: ActionDBConfig = {
  version: 2,
  modDate: '2026-01-01T00:00:00Z',
  userName: 'admin',
  config: {
    GET_CUSTOMER: {
      SYSTEM: 'CRM',
      READ_TIMEOUT: 5000,
      CONNECT_TIMEOUT: 3000,
      DESCRIPTION: 'Fetches customer data from CRM',
      TOPIC_KEY: 'crm.customer',
      CIRCUIT_BREAKER_CONFIG: { failureThreshold: 5 },
      // KPI is a config key ActionDBConfig models but this tool does not (and
      // never will exhaustively model every key ROS might add) — it must
      // still round-trip untouched through an update that only changes
      // something else.
      KPI: { trackLatency: true },
    },
  },
};

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return {
    getJson: vi.fn((path: string) => {
      if (path === '/actionInformation/42') return Promise.resolve({ requestData: currentAction });
      if (path === '/actionDBConfig/42') return Promise.resolve({ requestData: currentConfig });
      throw new Error(`unexpected path ${path}`);
    }) as RosClientLike['getJson'],
    postJson: vi.fn(),
    postForm: vi.fn(),
    ...overrides,
  };
}

describe('saveAction — preview mode (confirm falsy/absent)', () => {
  it('create mode without required fields returns a validation error, calls nothing', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionCode: 'NEW_ACTION' });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('create');
    expect(result.error?.message).toMatch(/actionType.*commandType.*command|required/i);
    expect(client.getJson).not.toHaveBeenCalled();
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('create mode with all required fields returns a summary and fieldDiffs listing every field that will be set', async () => {
    const client = fakeClient();

    const result = await saveAction(client, {
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
    });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('create');
    // Not just the three identity fields named in the summary sentence —
    // every non-empty field being sent, including ones the caller never set
    // an explicit value for (eager defaults to 'N').
    expect(result.preview.fieldDiffs).toEqual(
      expect.arrayContaining([
        { field: 'actionCode', from: undefined, to: 'NEW_ACTION' },
        { field: 'actionType', from: undefined, to: 'ACTION' },
        { field: 'commandType', from: undefined, to: 'REST' },
        { field: 'command', from: undefined, to: 'return true' },
      ])
    );
    expect(result.preview.summary).toContain('NEW_ACTION');
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('create mode preview fieldDiffs include config fields the caller specified', async () => {
    const client = fakeClient();

    const result = await saveAction(client, {
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
      config: { system: 'CRM' },
    });

    expect(result.preview.fieldDiffs).toEqual(
      expect.arrayContaining([{ field: 'config.system', from: undefined, to: 'CRM' }])
    );
  });

  it('update mode fetches current state via getAction and diffs only fields the input changed', async () => {
    const client = fakeClient();

    const result = await saveAction(client, {
      actionId: 42,
      version: '2',
      command: 'return http.get(...) // v2',
    });

    expect(client.getJson).toHaveBeenCalledWith('/actionInformation/42');
    expect(result.mode).toBe('update');
    expect(result.applied).toBe(false);
    expect(result.preview.fieldDiffs).toEqual([
      { field: 'command', from: 'return http.get(...)', to: 'return http.get(...) // v2' },
    ]);
  });

  it('update mode with no changed fields returns an empty fieldDiffs', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', actionDes: 'Get customer data' });

    expect(result.preview.fieldDiffs).toEqual([]);
  });

  it('update mode with only a config field changed shows a non-empty fieldDiffs entry for it', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', config: { system: 'NEW_SYSTEM' } });

    expect(result.preview.fieldDiffs).toEqual([{ field: 'config.system', from: 'CRM', to: 'NEW_SYSTEM' }]);
    expect(result.preview.summary).toContain('1 campo(s) cambiado(s)');
  });

  it('update without version returns a validation error before reading anything', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, command: 'changed' });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('update');
    expect(result.error?.message).toMatch(/version is required/i);
    expect(client.getJson).not.toHaveBeenCalled();
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('update with an unknown actionId returns a friendly error instead of throwing', async () => {
    const client = fakeClient({
      getJson: vi.fn((path: string) => {
        if (path === '/actionInformation/999') return Promise.resolve({ requestData: undefined });
        if (path === '/actionDBConfig/999') return Promise.resolve({ requestData: { version: 0, modDate: '', userName: '', config: {} } });
        throw new Error(`unexpected path ${path}`);
      }) as RosClientLike['getJson'],
    });

    const result = await saveAction(client, { actionId: 999, version: '1', command: 'x' });

    expect(result.applied).toBe(false);
    expect(result.mode).toBe('update');
    expect(result.error?.message).toBe('actionId 999 not found');
  });

  it('update mode warns when the supplied version does not match the current version', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '1', command: 'changed' });

    expect(result.preview.warnings).toContainEqual(expect.stringMatching(/versi[oó]n.*(1).*(2)|stale|obsolet/i));
  });

  it('update mode does not warn about version when it matches', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'changed' });

    expect(result.preview.warnings.some((w) => /versi[oó]n|stale|obsolet/i.test(w))).toBe(false);
  });

  it('warns about server-side compilation when commandType is GROOVY/PYTHON and command changed', async () => {
    const client = fakeClient({
      getJson: vi.fn((path: string) => {
        if (path === '/actionInformation/42') {
          return Promise.resolve({ requestData: { ...currentAction, commandType: 'GROOVY' } });
        }
        if (path === '/actionDBConfig/42') return Promise.resolve({ requestData: currentConfig });
        throw new Error(`unexpected path ${path}`);
      }) as RosClientLike['getJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'new groovy body' });

    expect(result.preview.warnings.some((w) => /compil/i.test(w))).toBe(true);
  });

  it('does not warn about compilation when commandType is not GROOVY/PYTHON', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', domain: 'https://crm2.internal' });

    expect(result.preview.warnings.some((w) => /compil/i.test(w))).toBe(false);
  });

  it('always warns about cluster cache propagation', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionId: 42, version: '2', domain: 'https://crm2.internal' });

    expect(result.preview.warnings.some((w) => /cluster|nodo/i.test(w))).toBe(true);
  });
});

describe('saveAction — confirm: true', () => {
  it('create mode posts the wire-shaped payload and returns the new actionId on success', async () => {
    let sentPath = '';
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((path: string, body: unknown) => {
        sentPath = path;
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 99',
          requestData: { ...currentAction, actionId: 99, actionCode: 'NEW_ACTION', command: '', version: 1 },
        });
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, {
      actionCode: 'NEW_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return true',
      confirm: true,
    });

    expect(sentPath).toBe('/actionDetail/saveAction');
    expect(sentBody).toMatchObject({
      actionData: expect.objectContaining({
        actionId: -1,
        actionCode: 'NEW_ACTION',
        actionType: 'ACTION',
        commandType: 'REST',
        actionCommands: 'return true',
      }),
    });
    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ actionId: 99, version: '1', successMessage: 'Action created: 99' });
  });

  it('update mode posts the merged full actionData, not a partial payload', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action updated: 42',
          requestData: { ...currentAction, version: 3, command: '' },
        });
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'return http.get(...) // v2', confirm: true });

    expect(sentBody).toMatchObject({
      actionData: expect.objectContaining({
        actionId: 42,
        actionCode: 'GET_CUSTOMER', // preserved from current, not lost
        actionType: 'ACTION', // preserved from current
        actionCommands: 'return http.get(...) // v2',
        version: '2',
      }),
      SYSTEM: 'CRM', // preserved protocol config
      READ_TIMEOUT: 5000,
      CONNECT_TIMEOUT: 3000,
      DESCRIPTION: 'Fetches customer data from CRM',
      TOPIC_KEY: 'crm.customer',
      CIRCUIT_BREAKER_CONFIG: { failureThreshold: 5 },
    });
    expect(result.applied).toBe(true);
    expect(result.result).toEqual({ actionId: 42, version: '3', successMessage: 'Action updated: 42' });
  });

  it('update mode preserves config keys the tool does not model (e.g. KPI) when only another config field changes', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action updated: 42',
          requestData: { ...currentAction, version: 3 },
        });
      }) as RosClientLike['postJson'],
    });

    await saveAction(client, { actionId: 42, version: '2', config: { system: 'NEW_SYSTEM' }, confirm: true });

    expect(sentBody).toMatchObject({
      SYSTEM: 'NEW_SYSTEM', // the field the caller actually changed
      // everything else the current config had survives untouched, including
      // a key (KPI) this tool never explicitly models
      READ_TIMEOUT: 5000,
      CONNECT_TIMEOUT: 3000,
      DESCRIPTION: 'Fetches customer data from CRM',
      TOPIC_KEY: 'crm.customer',
      CIRCUIT_BREAKER_CONFIG: { failureThreshold: 5 },
      KPI: { trackLatency: true },
    });
  });

  it('treats a response with a populated requestData.actionId AND an errorMessage as a failure', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({
        responseStatus: 1,
        errorMessage: 'La versión ya no es la vigente para esta action.',
        requestData: { ...currentAction, actionId: 42, version: 2 },
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '2', command: 'changed', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('La versión ya no es la vigente para esta action.');
  });

  it('returns applied:false with the ROS error message when the save is rejected, without throwing', async () => {
    const client = fakeClient({
      postJson: vi.fn().mockResolvedValue({
        responseStatus: 1,
        errorMessage: 'La versión ya no es la vigente para esta action.',
      }) as RosClientLike['postJson'],
    });

    const result = await saveAction(client, { actionId: 42, version: '1', command: 'changed', confirm: true });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('La versión ya no es la vigente para esta action.');
  });

  it('confirm:true on an invalid create (missing required fields) still short-circuits before any HTTP call', async () => {
    const client = fakeClient();

    const result = await saveAction(client, { actionCode: 'X', confirm: true });

    expect(result.applied).toBe(false);
    expect(client.postJson).not.toHaveBeenCalled();
  });

  it('create mode omits domain from actionData entirely when not provided — never sends "" (ROS treats domain:"" as "has a package", not "no domain", breaking GROOVY compilation; confirmed live 2026-09-07)', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 99',
          requestData: { ...currentAction, actionId: 99, actionCode: 'NEW_GROOVY_ACTION', domain: null, command: '', version: 1 },
        });
      }) as RosClientLike['postJson'],
    });

    await saveAction(client, {
      actionCode: 'NEW_GROOVY_ACTION',
      actionType: 'ACTION',
      commandType: 'GROOVY',
      command: 'def run(){}',
      confirm: true,
    });

    // domain:undefined still shows up as an own key on the in-memory object
    // (that's normal JS) — the actual bug is at the wire level, where
    // JSON.stringify (what the real client sends) drops undefined-valued
    // keys entirely. Assert both: the value itself, and that it vanishes
    // from the serialized wire body.
    expect((sentBody as { actionData: { domain?: string } }).actionData.domain).toBeUndefined();
    expect(JSON.stringify(sentBody)).not.toContain('"domain"');
  });

  it('create mode still sends a caller-supplied domain (e.g. a REST/SOAP endpoint URL) unchanged', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 100',
          requestData: { ...currentAction, actionId: 100, version: 1 },
        });
      }) as RosClientLike['postJson'],
    });

    await saveAction(client, {
      actionCode: 'NEW_SOAP_ACTION',
      actionType: 'ACTION',
      commandType: 'SOAP',
      command: '<soapenv:Envelope/>',
      domain: '${WS_VMS_ENDPOINT}',
      confirm: true,
    });

    expect(sentBody).toMatchObject({ actionData: expect.objectContaining({ domain: '${WS_VMS_ENDPOINT}' }) });
  });

  it('create mode omits protocol/method/contentType/workerClass/syncBy entirely when not provided — same "!= null" risk as domain (generalized 2026-09-08; method specifically confirmed live to matter for GROOVY\'s required method:"run")', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 101',
          requestData: { ...currentAction, actionId: 101, command: '', version: 1 },
        });
      }) as RosClientLike['postJson'],
    });

    await saveAction(client, {
      actionCode: 'NEW_GROOVY_ACTION_2',
      actionType: 'ACTION',
      commandType: 'GROOVY',
      command: 'def run(){}',
      confirm: true,
    });

    const actionData = (sentBody as { actionData: Record<string, unknown> }).actionData;
    expect(actionData.protocol).toBeUndefined();
    expect(actionData.method).toBeUndefined();
    expect(actionData.contentType).toBeUndefined();
    expect(actionData.workerClass).toBeUndefined();
    expect(actionData.actionSync).toBeUndefined();
    const wireJson = JSON.stringify(sentBody);
    expect(wireJson).not.toContain('"protocol"');
    expect(wireJson).not.toContain('"method"');
    expect(wireJson).not.toContain('"contentType"');
    expect(wireJson).not.toContain('"workerClass"');
    expect(wireJson).not.toContain('"actionSync"');
    // eager is NOT part of this bug class — "Y".equals(...) treats '' and null
    // identically, so it's fine (and useful) to keep defaulting it to 'N'.
    expect(actionData.eager).toBe('N');
  });

  it('create mode still sends caller-supplied protocol/method/contentType/workerClass/syncBy unchanged', async () => {
    let sentBody: unknown;
    const client = fakeClient({
      postJson: vi.fn((_path: string, body: unknown) => {
        sentBody = body;
        return Promise.resolve({
          responseStatus: 0,
          successMessage: 'Action created: 102',
          requestData: { ...currentAction, actionId: 102, version: 1 },
        });
      }) as RosClientLike['postJson'],
    });

    await saveAction(client, {
      actionCode: 'NEW_REST_ACTION',
      actionType: 'ACTION',
      commandType: 'REST',
      command: 'return http.get(...)',
      protocol: 'https',
      method: 'GET',
      contentType: 'application/json',
      workerClass: 'CUSTOM_WORKER',
      syncBy: 'admin',
      confirm: true,
    });

    expect(sentBody).toMatchObject({
      actionData: expect.objectContaining({
        protocol: 'https',
        method: 'GET',
        contentType: 'application/json',
        workerClass: 'CUSTOM_WORKER',
        actionSync: 'admin',
      }),
    });
  });
});

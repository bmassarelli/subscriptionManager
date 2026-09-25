import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateFlowSteps } from '../../src/tools/updateFlowSteps.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RosAction, StepOptimistic } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return { getJson: vi.fn(), postJson: vi.fn(), postForm: vi.fn(), ...overrides };
}

function fakeAction(actionCode: string): RosAction {
  return { actionCode, actionDes: actionCode } as RosAction;
}

// Resolves /getRosActions (used by findUnresolvedCodes -> searchActions) with the given
// actionCodes, and any other endpoint (e.g. /saveFlowStep) via `extra`, keyed by path.
function fakePostJson(actionCodes: string[], extra: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((path: string) => {
    if (path === '/getRosActions') {
      return Promise.resolve({ requestData: actionCodes.map(fakeAction) });
    }
    if (path in extra) {
      return Promise.resolve(extra[path]);
    }
    return Promise.resolve({});
  });
}

const flowInfoFixture: FlowInfo = {
  flow: {
    flowId: 64506, flowCode: 'MY_FLOW', flowDes: 'My Flow', priority: 10, activeFlag: 'Y', massFlag: 'Y',
    rosFlag: 'Y', inMemoryFlag: 'N', dbReprocessFlag: 'N', syncBy: 'NONE', version: 4,
    modDate: '2026-09-21T00:00:00Z', userName: 'jyanez', eagerFlag: 'N',
  },
  flowNotification: null, allAvailableRoutes: [], availableFlowGroup: [], selectFlowGroup: [],
  allFlowSchemaDatasPath: {}, flowActionError: null, actionErrorDetail: null, businessInfo: null,
  isInMemory: false, jobProcessedAction: null, jobFinishedAction: null,
  onCancelAction: { actionId: null, force: null }, onCancelAllAction: { actionId: null, force: null }, description: null,
};

// StepOptimistic types flowActionDes/bypass/sizeRos/sizeMass/syncStep as plain
// `string` (not nullable) in src/rosClient/types.ts, but real ROS responses send
// literal null for all of them on virtually every step (confirmed against ROS DEV,
// 2026-09-22) — so the "unset" default here is null, matching runtime reality, not
// the type declaration. A prior version of this fixture used '' and masked a real
// bug: normalizeExisting comparing null (real ROS) against '' (the DSL's own "unset"
// sentinel) reported every untouched step as unexpectedlyChanged.
function existingStep(overrides: Partial<StepOptimistic>): StepOptimistic {
  return {
    flowId: 64506, stepId: 1, parentStepId: 0, actionId: 1,
    action: { actionCode: 'TM_ST' } as StepOptimistic['action'],
    flowActionDes: null as unknown as string, preActionId: null, preAction: null, flow: null,
    multiplyArrProp: null, decisionCriteria: null, decision: null,
    version: 3, modDate: '2026-09-21T00:00:00Z', userName: 'jyanez',
    bypass: null as unknown as string, switchPropertyPath: null,
    sizeRos: null as unknown as string, sizeMass: null as unknown as string, syncStep: null as unknown as string,
    modDateYmls: 0, ymlConfig: null, alerts: null,
    ...overrides,
  };
}

describe('updateFlowSteps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses when the flow has zero existing steps, pointing the caller at save_flow_steps instead', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: [] }),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: [{ kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/save_flow_steps/i);
  });

  it('refuses when existing steps do not share one uniform version', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({
        requestData: [existingStep({ stepId: 1, version: 3, modDateYmls: 123 }), existingStep({ stepId: 2, parentStepId: 1, version: 4 })],
      }),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: [{ kind: 'end' }] });

    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/uniform version/i);
  });

  it("preview mode: pure additions produce a clean diff and never call postJson('/saveFlowStep', ...)", async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['TM_ST', 'NEW_ACTION']),
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'action', actionCode: 'NEW_ACTION' }, { kind: 'end' }],
    });

    expect(result.applied).toBe(false); // preview, not confirmed
    expect(result.error).toBeUndefined();
    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
    expect(result.preview.diff?.added).toHaveLength(1); // the NEW_ACTION row
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('does NOT flag an untouched step as changed when ROS returns null bypass/syncStep and the DSL simply omits them (regression: null vs "" mismatch)', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123, bypass: null as unknown as string, syncStep: null as unknown as string }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['TM_ST', 'NEW_ACTION']),
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'action', actionCode: 'NEW_ACTION' }, { kind: 'end' }],
    });

    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
  });

  it('refuses (even with confirm:true) when the rebuilt tree would change an existing untouched step', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['SOMETHING_ELSE']),
    });

    // Caller's DSL renames the first action — same position (stepId 1, parentStepId 0)
    // but a different actionCode than what's really there today.
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'SOMETHING_ELSE' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('flags a changed multiplyArrProp on an existing step as unexpectedlyChanged (not silently accepted)', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 15, action: { actionCode: 'INMLTPL' } as StepOptimistic['action'], version: 3, modDateYmls: 123, multiplyArrProp: 'baseCsOffers' }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 16, action: { actionCode: 'OUTMLTPL' } as StepOptimistic['action'], version: 3 }),
      existingStep({ stepId: 3, parentStepId: 2, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson([]),
    });

    // Same shape as what's really there, but a typo'd arrayProperty — same actionCode,
    // so a diff that ignored multiplyArrProp would wrongly call this a clean no-op.
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'multiply-subflow', flowCode: 'CS_UPDATE_OFFER', arrayProperty: 'wrongProp' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('flags a changed custom ymlConfig on an existing step as unexpectedlyChanged (e.g. TM_ST losing its contractPath wiring)', async () => {
    const existing = [
      existingStep({
        stepId: 1, parentStepId: 0, actionId: 39958, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123,
        ymlConfig: { MY_FLOW: { contractPath: 'coCode', customerPath: 'custNum' } },
      }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { ...flowInfoFixture, flow: { ...flowInfoFixture.flow, flowCode: 'MY_FLOW' } } }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['TM_ST']),
    });

    // Same actionCode as today, but the DSL forgets to carry the ymlConfig forward.
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('does NOT flag an existing step as changed when its ymlConfig round-trips with a different key order', async () => {
    const existing = [
      existingStep({
        stepId: 1, parentStepId: 0, actionId: 39958, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123,
        ymlConfig: { MY_FLOW: { customerPath: 'custNum', contractPath: 'coCode' } },
      }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: { ...flowInfoFixture, flow: { ...flowInfoFixture.flow, flowCode: 'MY_FLOW' } } }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['TM_ST']),
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST', ymlConfig: { contractPath: 'coCode', customerPath: 'custNum' } }, { kind: 'end' }],
    });

    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
  });

  it('flags a lost syncStep on an existing step as unexpectedlyChanged (e.g. step1 losing syncStep:"Y")', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 90333, action: { actionCode: 'VALIDATE' } as StepOptimistic['action'], version: 3, modDateYmls: 123, syncStep: 'Y' }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['VALIDATE']),
    });

    // The DSL doesn't set syncStep at all — would silently drop it without this check.
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'VALIDATE' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('force:true without confirm still returns a preview-only result (no write), flagging what would be forced', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['SOMETHING_ELSE']),
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'SOMETHING_ELSE' }, { kind: 'end' }],
      force: true,
    });

    expect(result.applied).toBe(false); // preview, confirm wasn't set
    expect(result.error).toBeUndefined();
    expect(result.preview.summary).toMatch(/FORZADO/);
    expect(result.preview.diff?.unexpectedlyChanged.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('force:true + confirm:true writes despite a diff that would otherwise be rejected', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123456 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const postJson = fakePostJson(['SOMETHING_ELSE'], { '/saveFlowStep': { successMessage: 'flow.step.successSave' } });
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson,
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'SOMETHING_ELSE' }, { kind: 'end' }],
      confirm: true,
      force: true,
    });

    expect(result.applied).toBe(true);
    expect(result.preview.summary).toMatch(/FORZADO/);
    expect(postJson).toHaveBeenCalledWith('/saveFlowStep', { flowId: 64506, version: 3, modDate: 123456, flowSteps: expect.any(Array) });
  });

  it('confirm:true with a clean (additions-only) diff posts the resolved tree with the real version/modDate', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'TM_ST' } as StepOptimistic['action'], version: 3, modDateYmls: 123456 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const postJson = fakePostJson(['TM_ST'], { '/saveFlowStep': { successMessage: 'flow.step.successSave' } });
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson,
    });

    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'TM_ST' }, { kind: 'end' }],
      confirm: true,
    });

    expect(result.applied).toBe(true);
    expect(postJson).toHaveBeenCalledWith('/saveFlowStep', { flowId: 64506, version: 3, modDate: 123456, flowSteps: expect.any(Array) });
  });

  // --- Regression suite: key-based (stepId,parentStepId) diff, no LCS/position ---
  // A "gate" decision whose YES branch ends, and whose NO branch runs a filler action
  // then goto's back to that same end — the exact shape (a shared stepId reached via
  // two different parentStepId) that flow 64506's own steps 12/22/25 have.
  const GATE_STEPS = [
    {
      kind: 'decision' as const,
      criteria: 'gate',
      yes: [{ kind: 'end' as const, ref: 'e' }],
      no: [{ kind: 'action' as const, actionCode: 'FILLER' }, { kind: 'goto' as const, ref: 'e' }],
    },
  ];
  // What ROS actually has today for GATE_STEPS, unchanged — same (stepId,parentStepId)
  // buildWireSteps would deterministically assign to this exact tree shape.
  function gateExisting(): StepOptimistic[] {
    return [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, modDateYmls: 123, decisionCriteria: 'gate', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'gate' } } }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3, decision: 'Y' }),
      existingStep({ stepId: 3, parentStepId: 1, actionId: 1, action: { actionCode: 'FILLER' } as StepOptimistic['action'], version: 3, decision: 'N' }),
      existingStep({ stepId: 2, parentStepId: 3, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
  }

  it('regresión: un stepId con dos parentStepId (convergencia) produce un diff limpio — ninguna fila added/missing/changed', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: gateExisting() }),
      postJson: fakePostJson(['FILLER']),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: GATE_STEPS });

    expect(result.preview.diff).toEqual({ added: [], unexpectedlyChanged: [], unexpectedlyMissing: [] });
  });

  it('regresión: varias convergencias independientes en el mismo árbol se resuelven todas correctamente', async () => {
    const steps = [
      {
        kind: 'decision' as const,
        criteria: 'outer',
        yes: [
          {
            kind: 'decision' as const,
            criteria: 'gate1',
            yes: [{ kind: 'end' as const, ref: 'e1' }],
            no: [{ kind: 'action' as const, actionCode: 'FILLER1' }, { kind: 'goto' as const, ref: 'e1' }],
          },
        ],
        no: [
          {
            kind: 'decision' as const,
            criteria: 'gate2',
            yes: [{ kind: 'end' as const, ref: 'e2' }],
            no: [{ kind: 'action' as const, actionCode: 'FILLER2' }, { kind: 'goto' as const, ref: 'e2' }],
          },
        ],
      },
    ];
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, modDateYmls: 123, decisionCriteria: 'outer', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'outer' } } }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, decision: 'Y', decisionCriteria: 'gate1', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'gate1' } } }),
      existingStep({ stepId: 3, parentStepId: 2, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3, decision: 'Y' }),
      existingStep({ stepId: 4, parentStepId: 2, actionId: 1, action: { actionCode: 'FILLER1' } as StepOptimistic['action'], version: 3, decision: 'N' }),
      existingStep({ stepId: 3, parentStepId: 4, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
      existingStep({ stepId: 5, parentStepId: 1, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, decision: 'N', decisionCriteria: 'gate2', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'gate2' } } }),
      existingStep({ stepId: 6, parentStepId: 5, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3, decision: 'Y' }),
      existingStep({ stepId: 7, parentStepId: 5, actionId: 2, action: { actionCode: 'FILLER2' } as StepOptimistic['action'], version: 3, decision: 'N' }),
      existingStep({ stepId: 6, parentStepId: 7, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['FILLER1', 'FILLER2']),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps });

    expect(result.preview.diff).toEqual({ added: [], unexpectedlyChanged: [], unexpectedlyMissing: [] });
  });

  it('regresión: mismo contenido en distinto orden del array (ROS no garantiza el mismo orden que buildWireSteps) no produce diff', async () => {
    const reordered = [...gateExisting()].reverse(); // the exact array-order divergence that broke the old LCS diff
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: reordered }),
      postJson: fakePostJson(['FILLER']),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: GATE_STEPS });

    expect(result.preview.diff).toEqual({ added: [], unexpectedlyChanged: [], unexpectedlyMissing: [] });
  });

  it('regresión: un cambio real en una sola fila se localiza en esa fila — las convergencias del mismo árbol no se ven afectadas', async () => {
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: gateExisting() }),
      postJson: fakePostJson(['FILLER']),
    });

    // Same shape, but the gate's own criteria genuinely changed.
    const changedSteps = [{ ...GATE_STEPS[0], criteria: 'gate-changed' }];
    const result = await updateFlowSteps(client, { flowId: 64506, steps: changedSteps, confirm: true });

    expect(result.applied).toBe(false);
    expect(result.preview.diff?.unexpectedlyChanged).toHaveLength(1);
    expect(result.preview.diff?.unexpectedlyChanged[0].stepId).toBe(1);
    expect(result.preview.diff?.added).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
  });

  it('regresión: el ymlConfig "heredado por lectura" de un clon goto (ROS resuelve por stepId, no por fila física) no se reporta como changed cuando el nuevo árbol correctamente no lo reenvía', async () => {
    // Mirrors exactly what ROS's own read returned live for flow 64506's steps
    // 22/25 after the ymlConfig-duplication fix: the clone row (parentStepId 3)
    // reads back with the SAME ymlConfig as the real definition (parentStepId 1),
    // even though only the real definition actually has it persisted.
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, modDateYmls: 123, decisionCriteria: 'gate', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'gate' } } }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3, decision: 'Y' }),
      existingStep({ stepId: 3, parentStepId: 1, actionId: 1, action: { actionCode: 'FILLER' } as StepOptimistic['action'], version: 3, decision: 'N' }),
      // The clone's read-merged decisionCriteria/ymlConfig — identical to the
      // real definition above, purely a read-time artifact.
      existingStep({ stepId: 1, parentStepId: 3, actionId: 18, action: { actionCode: 'INLINEDEC' } as StepOptimistic['action'], version: 3, decisionCriteria: 'gate', ymlConfig: { MY_FLOW: { DECISION_CRITERIA: 'gate' } } }),
    ];
    // A decision reached from the root AND, via a filler action + goto, from
    // its own "no" branch — a legitimate retry-loop shape, and the simplest
    // tree where the SHARED (converging) stepId is itself the ymlConfig-
    // bearing row, matching exactly what steps 22/25 on flow 64506 look like.
    const selfConverging = [
      { kind: 'decision' as const, criteria: 'gate', ref: 'g', yes: [{ kind: 'end' as const }], no: [{ kind: 'action' as const, actionCode: 'FILLER' }, { kind: 'goto' as const, ref: 'g' }] },
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['FILLER']),
    });

    const result = await updateFlowSteps(client, { flowId: 64506, steps: selfConverging });

    expect(result.preview.diff).toEqual({ added: [], unexpectedlyChanged: [], unexpectedlyMissing: [] });
  });

  it('regresión: una fila realmente eliminada se reporta como unexpectedlyMissing — las filas renumeradas por el corrimiento NO se reportan como changed/added', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'A' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 2, action: { actionCode: 'B' } as StepOptimistic['action'], version: 3 }),
      existingStep({ stepId: 3, parentStepId: 2, actionId: 3, action: { actionCode: 'C' } as StepOptimistic['action'], version: 3 }),
      existingStep({ stepId: 4, parentStepId: 3, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['A', 'C']),
    });

    // B removed — C and ES shift from (stepId 3,4) down to (stepId 2,3).
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'A' }, { kind: 'action', actionCode: 'C' }, { kind: 'end' }],
    });

    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.added).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toHaveLength(1);
    expect(result.preview.diff?.unexpectedlyMissing[0].actionCode).toBe('B');
  });

  it('regresión: una fila realmente agregada se reporta como added — las filas renumeradas por el corrimiento NO se reportan como changed/missing', async () => {
    const existing = [
      existingStep({ stepId: 1, parentStepId: 0, actionId: 1, action: { actionCode: 'A' } as StepOptimistic['action'], version: 3, modDateYmls: 123 }),
      existingStep({ stepId: 2, parentStepId: 1, actionId: 3, action: { actionCode: 'C' } as StepOptimistic['action'], version: 3 }),
      existingStep({ stepId: 3, parentStepId: 2, actionId: 100, action: { actionCode: 'ES' } as StepOptimistic['action'], version: 3 }),
    ];
    const client = fakeClient({
      getJson: vi.fn().mockResolvedValue({ requestData: flowInfoFixture }),
      postForm: vi.fn().mockResolvedValue({ requestData: existing }),
      postJson: fakePostJson(['A', 'B', 'C']),
    });

    // B inserted between A and C — C and ES shift from (stepId 2,3) to (stepId 3,4).
    const result = await updateFlowSteps(client, {
      flowId: 64506,
      steps: [{ kind: 'action', actionCode: 'A' }, { kind: 'action', actionCode: 'B' }, { kind: 'action', actionCode: 'C' }, { kind: 'end' }],
    });

    expect(result.preview.diff?.unexpectedlyChanged).toEqual([]);
    expect(result.preview.diff?.unexpectedlyMissing).toEqual([]);
    expect(result.preview.diff?.added).toHaveLength(1);
    expect(result.preview.diff?.added[0].actionCode).toBe('B');
  });
});

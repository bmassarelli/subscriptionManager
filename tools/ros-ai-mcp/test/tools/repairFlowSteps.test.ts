import { afterEach, describe, expect, it, vi } from 'vitest';
import { repairFlowSteps, type RepairFlowStepsInput } from '../../src/tools/repairFlowSteps.js';
import type { RosClientLike } from '../../src/rosClient/rosClient.js';
import type { FlowInfo, RosAction } from '../../src/rosClient/types.js';

function fakeClient(overrides: Partial<RosClientLike> = {}): RosClientLike {
  return { getJson: vi.fn(), postJson: vi.fn(), postForm: vi.fn(), ...overrides };
}

function fakeAction(actionCode: string): RosAction {
  return { actionCode, actionDes: actionCode, actionId: 1 } as RosAction;
}

function fakePostJson(actionCodes: string[], extra: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((path: string) => {
    if (path === '/getRosActions') return Promise.resolve({ requestData: actionCodes.map(fakeAction) });
    if (path in extra) return Promise.resolve(extra[path]);
    return Promise.resolve({});
  });
}

// Dispatches by path: /getFlowInfo -> the flow header; /getFlowStepVersions/N
// -> the step-tree's own version history (DESC), read via a completely
// different mechanism (ROS_FLOW_STEP_HIST) than the flow header's version.
function fakeGetJson(flow: FlowInfo, versions: number[] = [4]) {
  return vi.fn().mockImplementation((path: string) => {
    if (path === '/getFlowInfo') return Promise.resolve({ requestData: flow });
    if (path.startsWith('/getFlowStepVersions/')) return Promise.resolve({ requestData: versions });
    return Promise.resolve({});
  });
}

function flowInfoFixture(overrides: Partial<FlowInfo['flow']> = {}): FlowInfo {
  return {
    flow: {
      flowId: 64506, flowCode: 'S_O_ACTIVATE_CONTRACT', flowDes: 'Test', priority: 10, activeFlag: 'Y', massFlag: 'Y',
      rosFlag: 'Y', inMemoryFlag: 'N', dbReprocessFlag: 'N', syncBy: 'NONE', version: 4,
      modDate: '2026-09-22T00:00:00Z', userName: 'jyanez', eagerFlag: 'N',
      ...overrides,
    },
    flowNotification: null, allAvailableRoutes: [], availableFlowGroup: [], selectFlowGroup: [],
    allFlowSchemaDatasPath: {}, flowActionError: null, actionErrorDetail: null, businessInfo: null,
    isInMemory: false, jobProcessedAction: null, jobFinishedAction: null,
    onCancelAction: { actionId: null, force: null }, onCancelAllAction: { actionId: null, force: null }, description: null,
  };
}

const REPEATED_KEY_ERROR = "org.skink.common.util.SkException : Repeated key DECISION_CRITERIA of children of yml config STEP:S_O_ACTIVATE_CONTRACT step 22";

// A minimal 3-row tree matching { action TM_ST, decision 'x' (yes:[end], no:[end]) }
// once built — used as the happy-path baseline throughout.
const SIMPLE_STEPS = [
  { kind: 'action' as const, actionCode: 'TM_ST' },
  { kind: 'decision' as const, criteria: 'x', yes: [{ kind: 'end' as const }], no: [{ kind: 'end' as const }] },
];
const SIMPLE_BASELINE = [
  { stepId: 1, parentStepId: 0, actionId: 1 },
  { stepId: 2, parentStepId: 1, actionId: 18, ymlConfig: { DECISION_CRITERIA: 'x' } },
  { stepId: 3, parentStepId: 2, actionId: 100, decision: 'Y' as const },
  { stepId: 4, parentStepId: 2, actionId: 100, decision: 'N' as const },
];

function validInput(overrides: Partial<RepairFlowStepsInput> = {}): RepairFlowStepsInput {
  return {
    flowId: 64506,
    expectedFlowCode: 'S_O_ACTIVATE_CONTRACT',
    expectedCurrentVersion: 4,
    expectedModDate: 20260922140311,
    recoveryMode: true,
    confirmationPhrase: 'REPAIR_FLOW_64506_VERSION_4',
    baseline: SIMPLE_BASELINE,
    steps: SIMPLE_STEPS,
    ...overrides,
  };
}

function happyPathClient(extraPostJson: Record<string, unknown> = {}): RosClientLike {
  return fakeClient({
    getJson: fakeGetJson(flowInfoFixture()),
    postForm: vi.fn().mockResolvedValue({ requestData: null, errorMessage: REPEATED_KEY_ERROR, responseStatus: 1 }),
    postJson: fakePostJson(['TM_ST'], extraPostJson),
  });
}

describe('repairFlowSteps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses when recoveryMode is not the literal boolean true', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), recoveryMode: 'true' as unknown as true });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/recoveryMode debe ser exactamente `true`/i);
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('refuses when expectedCurrentVersion is missing/invalid', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), expectedCurrentVersion: 0 });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/expectedCurrentVersion/i);
  });

  it('refuses when expectedModDate is missing/invalid', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), expectedModDate: -1 });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/expectedModDate/i);
  });

  it('refuses when baseline is empty', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), baseline: [] });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/baseline/i);
  });

  // --- Explicit blocks requested by the user ---

  it('BLOQUEO: confirmationPhrase incorrecta detiene la ejecución sin llamar a ROS', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), confirmationPhrase: 'WRONG_PHRASE' });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/confirmationPhrase inválida/i);
    expect(client.getJson).not.toHaveBeenCalled();
  });

  it('BLOQUEO: confirmationPhrase se exige incluso en modo preview (sin confirm:true)', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), confirmationPhrase: '', confirm: false });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/confirmationPhrase inválida/i);
  });

  it('BLOQUEO: flowCode incorrecto detiene la ejecución', async () => {
    const client = fakeClient({
      getJson: fakeGetJson(flowInfoFixture({ flowCode: 'OTRO_FLUJO' })),
      postForm: vi.fn().mockResolvedValue({ requestData: null, errorMessage: REPEATED_KEY_ERROR }),
      postJson: fakePostJson(['TM_ST']),
    });
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/flowCode no coincide/i);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('BLOQUEO: versión activa del árbol de steps (vía /getFlowStepVersions) distinta a expectedCurrentVersion detiene la ejecución (el flujo cambió)', async () => {
    // The flow HEADER's own version (flowInfoFixture().version === 4) is
    // deliberately left matching — this proves the guard checks the STEP-TREE
    // version (/getFlowStepVersions), not ROS_FLOW.VERSION, which can drift
    // independently (confirmed live: a disposable flow's header stayed at 1
    // while its step tree advanced to 2 after a real repair).
    const client = fakeClient({
      getJson: fakeGetJson(flowInfoFixture(), [5, 4, 3]),
      postForm: vi.fn().mockResolvedValue({ requestData: null, errorMessage: REPEATED_KEY_ERROR }),
      postJson: fakePostJson(['TM_ST']),
    });
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/versión activa del árbol de steps .* es 5.*no 4/i);
  });

  it('BLOQUEO: flowId sin ninguna versión de steps registrada se detiene (nada que reparar)', async () => {
    const client = fakeClient({
      getJson: fakeGetJson(flowInfoFixture(), []),
      postForm: vi.fn().mockResolvedValue({ requestData: null, errorMessage: REPEATED_KEY_ERROR }),
      postJson: fakePostJson(['TM_ST']),
    });
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/no tiene ninguna versión de steps registrada/i);
  });

  it('BLOQUEO: si la lectura normal funciona (sin error), se niega — no es un bypass general', async () => {
    const client = fakeClient({
      getJson: fakeGetJson(flowInfoFixture()),
      postForm: vi.fn().mockResolvedValue({ requestData: [{ stepId: 1 }] }), // no errorMessage — read succeeds
      postJson: fakePostJson(['TM_ST']),
    });
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/no devolvió ningún error/i);
    expect(result.error?.message).toMatch(/update_flow_steps/i);
  });

  it('BLOQUEO: si la lectura falla con un error distinto al patrón "Repeated key" conocido, se detiene', async () => {
    const client = fakeClient({
      getJson: fakeGetJson(flowInfoFixture()),
      postForm: vi.fn().mockResolvedValue({ requestData: null, errorMessage: 'org.skink.common.util.SkException: some unrelated failure' }),
      postJson: fakePostJson(['TM_ST']),
    });
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error?.message).toMatch(/patrón conocido/i);
  });

  it('BLOQUEO: sin confirm:true nunca llama a /saveFlowStep (preview-only)', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, validInput());
    expect(result.applied).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.preview.baselineMatch?.matches).toBe(true);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('BLOQUEO: si el payload reconstruido difiere del baseline (stepId/parentStepId), aborta sin escribir', async () => {
    const client = happyPathClient();
    const badBaseline = SIMPLE_BASELINE.map((r) => (r.stepId === 2 ? { ...r, actionId: 999 /* unrelated field, still same shape */ } : r));
    // Force an actual structural mismatch: wrong parentStepId on one row.
    badBaseline[1] = { ...badBaseline[1], parentStepId: 99 };
    const result = await repairFlowSteps(client, { ...validInput(), baseline: badBaseline, confirm: true });
    expect(result.applied).toBe(false);
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.length).toBeGreaterThan(0);
    expect(client.postJson).not.toHaveBeenCalledWith('/saveFlowStep', expect.anything());
  });

  it('regression: baseline en distinto orden que el payload (mismo conjunto de filas) SIGUE coincidiendo — buildWireSteps agrega los clones goto al final de su rama, no en orden ascendente de stepId', async () => {
    // Same 4 rows as SIMPLE_BASELINE, but in a different order — mirrors the
    // real-world case where a baseline is sourced from `ORDER BY STEP_ID` SQL
    // while buildWireSteps' DFS-with-goto-appended-last order differs.
    const reorderedBaseline = [SIMPLE_BASELINE[2], SIMPLE_BASELINE[0], SIMPLE_BASELINE[3], SIMPLE_BASELINE[1]];
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), baseline: reorderedBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(true);
    expect(result.preview.baselineMatch?.mismatches).toEqual([]);
  });

  it('regression: una fila realmente distinta (stepId/parent no presente en el baseline) SÍ se detecta pese a la comparación por clave, no por posición', async () => {
    const client = happyPathClient();
    const wrongBaseline = [...SIMPLE_BASELINE.slice(0, 3), { stepId: 4, parentStepId: 999, actionId: 100, decision: 'N' as const }];
    const result = await repairFlowSteps(client, { ...validInput(), baseline: wrongBaseline, confirm: true });
    expect(result.applied).toBe(false);
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/no existe en el baseline/);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/que el payload reconstruido no reproduce/);
  });

  // --- Extended field coverage: actionId, bypass, syncStep, ymlConfig ---

  it('BLOQUEO: actionId resuelto que no coincide con el baseline se detecta', async () => {
    const client = happyPathClient();
    const wrongBaseline = SIMPLE_BASELINE.map((r) => (r.stepId === 1 ? { ...r, actionId: 999 } : r));
    const result = await repairFlowSteps(client, { ...validInput(), baseline: wrongBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/actionId no coincide/);
  });

  it('BLOQUEO: bypass que no coincide con el baseline se detecta', async () => {
    const client = happyPathClient();
    const wrongBaseline = SIMPLE_BASELINE.map((r) => (r.stepId === 1 ? { ...r, bypass: true } : r));
    const result = await repairFlowSteps(client, { ...validInput(), baseline: wrongBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/bypass no coincide/);
  });

  it('BLOQUEO: syncStep que no coincide con el baseline se detecta', async () => {
    const client = happyPathClient();
    const wrongBaseline = SIMPLE_BASELINE.map((r) => (r.stepId === 1 ? { ...r, syncStep: true } : r));
    const result = await repairFlowSteps(client, { ...validInput(), baseline: wrongBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/syncStep no coincide/);
  });

  // A decision reached via a real definition (parent 2) AND a goto clone
  // (parent 6) — mirrors flow 64506's step 22/25 pattern exactly.
  const GOTO_STEPS = [
    { kind: 'action' as const, actionCode: 'TM_ST' },
    {
      kind: 'decision' as const,
      criteria: 'outer',
      yes: [{ kind: 'decision' as const, criteria: 'x', ref: 'xDecision', yes: [{ kind: 'end' as const }], no: [{ kind: 'end' as const }] }],
      no: [{ kind: 'action' as const, actionCode: 'TM_ST' }, { kind: 'goto' as const, ref: 'xDecision' }],
    },
  ];
  // Baseline representing the OLD, broken state: the goto clone (stepId 3,
  // parent 6) still carries the SAME ymlConfig as the real definition
  // (stepId 3, parent 2) — i.e. duplicated, exactly the bug this tool fixes.
  const GOTO_BASELINE_WITH_DUPLICATE = [
    { stepId: 1, parentStepId: 0, actionId: 1 },
    { stepId: 2, parentStepId: 1, actionId: 18, ymlConfig: { DECISION_CRITERIA: 'outer' } },
    { stepId: 3, parentStepId: 2, actionId: 18, decision: 'Y' as const, ymlConfig: { DECISION_CRITERIA: 'x' } },
    { stepId: 4, parentStepId: 3, actionId: 100, decision: 'Y' as const },
    { stepId: 5, parentStepId: 3, actionId: 100, decision: 'N' as const },
    { stepId: 6, parentStepId: 2, actionId: 1, decision: 'N' as const },
    { stepId: 3, parentStepId: 6, actionId: 18, ymlConfig: { DECISION_CRITERIA: 'x' } }, // known duplicate
  ];

  it('éxito: el clon goto dejando de reenviar ymlConfig duplicado (idéntico a un hermano del mismo stepId) es la ÚNICA divergencia permitida', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, { ...validInput(), steps: GOTO_STEPS, baseline: GOTO_BASELINE_WITH_DUPLICATE });
    expect(result.preview.baselineMatch?.matches).toBe(true);
    expect(result.preview.baselineMatch?.mismatches).toEqual([]);
  });

  it('BLOQUEO: una diferencia de ymlConfig que NO es una duplicación conocida (contenido genuinamente distinto en la definición real) se detecta', async () => {
    const client = happyPathClient();
    const badBaseline = GOTO_BASELINE_WITH_DUPLICATE.map((r) =>
      r.stepId === 3 && r.parentStepId === 2 ? { ...r, ymlConfig: { DECISION_CRITERIA: 'algo-completamente-distinto' } } : r
    );
    const result = await repairFlowSteps(client, { ...validInput(), steps: GOTO_STEPS, baseline: badBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/ymlConfig funcional no coincide/);
  });

  it('BLOQUEO: un clon goto que perdió ymlConfig que NUNCA estuvo duplicado en el baseline (no es una corrección conocida) se detecta', async () => {
    const client = happyPathClient();
    // Remove the duplicate from the clone row's baseline entirely (as if it
    // never had ymlConfig to begin with) — the payload's clone row still has
    // none, so this should actually still match (both sides say "no config").
    // To force a genuine violation, instead make the REAL row's baseline
    // content something the clone's (correctly empty) payload can't satisfy
    // via the sibling-duplicate exception because no sibling carries it.
    const noSiblingBaseline = GOTO_BASELINE_WITH_DUPLICATE.map((r) =>
      r.stepId === 3 && r.parentStepId === 6 ? { ...r, ymlConfig: { DECISION_CRITERIA: 'x', EXTRA_KEY: 'only-on-the-clone' } } : r
    );
    const result = await repairFlowSteps(client, { ...validInput(), steps: GOTO_STEPS, baseline: noSiblingBaseline });
    expect(result.preview.baselineMatch?.matches).toBe(false);
    expect(result.preview.baselineMatch?.mismatches.join(' ')).toMatch(/ymlConfig funcional no coincide/);
  });

  it('no acepta un parámetro force — un TypeScript consumer no puede pasarlo sin @ts-expect-error', () => {
    // Compile-time guard: RepairFlowStepsInput has no `force` field.
    const input: RepairFlowStepsInput = validInput();
    expect('force' in input).toBe(false);
  });

  it('éxito: preview limpio reporta 4 filas físicas, 4 stepId lógicos, y a lo sumo un ymlConfig vacío', async () => {
    const client = happyPathClient();
    const result = await repairFlowSteps(client, validInput());
    expect(result.preview.baselineMatch).toMatchObject({
      logicalStepIdCount: 4,
      physicalRowCount: 4,
      emptyYmlConfigRowCount: 0,
      matches: true,
      mismatches: [],
    });
    expect(result.preview.baselineMatch?.checkedFields).toEqual(
      expect.arrayContaining(['stepId', 'parentStepId', 'decision', 'flowActionDes'])
    );
    expect(result.preview.baselineMatch?.checkedFields.some((f) => f.includes('actionId'))).toBe(true);
    expect(result.preview.baselineMatch?.checkedFields.some((f) => f.includes('bypass'))).toBe(true);
    expect(result.preview.baselineMatch?.checkedFields.some((f) => f.includes('syncStep'))).toBe(true);
    expect(result.preview.baselineMatch?.checkedFields.some((f) => f.includes('ymlConfig'))).toBe(true);
  });

  it('éxito: con confirm:true, escribe vía /saveFlowStep (el mismo endpoint oficial) y reporta la nueva versión', async () => {
    const client = happyPathClient({ '/saveFlowStep': { successMessage: 'Flow Steps successfully saved' } });
    const result = await repairFlowSteps(client, { ...validInput(), confirm: true });

    expect(result.applied).toBe(true);
    expect(result.result?.successMessage).toBe('Flow Steps successfully saved');
    expect(client.postJson).toHaveBeenCalledWith(
      '/saveFlowStep',
      expect.objectContaining({ flowId: 64506, version: 4, modDate: 20260922140311 })
    );
    // Preview text says it will save as version 5 (current 4 + 1).
    expect(result.preview.summary).toMatch(/versión 5/);
  });

  it('propaga un errorMessage de ROS en el guardado real sin marcar applied:true', async () => {
    const client = happyPathClient({ '/saveFlowStep': { errorMessage: 'algún error de ROS al guardar' } });
    const result = await repairFlowSteps(client, { ...validInput(), confirm: true });
    expect(result.applied).toBe(false);
    expect(result.error?.message).toBe('algún error de ROS al guardar');
  });
});

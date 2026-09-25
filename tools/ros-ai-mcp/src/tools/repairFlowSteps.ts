import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { getFlow } from './getFlow.js';
import { findUnresolvedCodes } from './resolveStepReferences.js';
import { searchActions } from './searchActions.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowStepBody, WireFlowStep } from '../rosClient/types.js';

// A single physical row of the KNOWN-GOOD tree structure, as obtained by the
// operator via read-only SQL against ROS_FLOW_STEP_HIST / ROS_YML (never via
// the normal getFlowStepInfo read, which is exactly what's broken). This is
// the baseline every recovery payload must reproduce exactly. See
// BASELINE_MATCH_FIELDS below for exactly which fields are compared.
export interface BaselineRow {
  stepId: number;
  parentStepId: number;
  actionId: number;
  decision?: 'Y' | 'N' | null;
  flowActionDes?: string | null;
  bypass?: boolean | null;
  syncStep?: boolean | null;
  // The functional yml config ROS_YML actually holds for THIS physical row
  // (i.e. the flowCode-scoped inner map, same shape as
  // WireFlowStep.ymlConfig[flowCode]) — sourced from SQL (ROS_YML /
  // ROS_YML_HIST for this stepId). Omit/null for rows with none. Never
  // include the SK_OPTIMISTIC sentinel (STEP_ID=-1) here — that is not a
  // real tree row; it's tracked separately via emptyYmlConfigRowCount.
  ymlConfig?: Record<string, unknown> | null;
}

// Framework/scaffolding actionCodes buildWireSteps synthesizes itself (never
// present in the DSL, so findUnresolvedCodes/searchActions never resolves
// them) — their actionIds are fixed, global ROS system actions, confirmed
// live across multiple flows this session (2026-09-22).
const FRAMEWORK_ACTION_IDS: Record<string, number> = {
  INFLOW: 13,
  OUTFLOW: 14,
  INLINEDEC: 18,
  INMLTPL: 15,
  OUTMLTPL: 16,
  ES: 100,
};

// Exactly which fields baselineMatch protects, exposed on the result so a
// caller never has to read the source to know what was actually checked.
const BASELINE_MATCH_FIELDS = [
  'stepId',
  'parentStepId',
  'actionId (resuelto desde actionCode vía ROS, incluyendo los actionCode de framework INFLOW/OUTFLOW/INLINEDEC/INMLTPL/OUTMLTPL/ES)',
  'decision',
  'flowActionDes',
  'bypass',
  'syncStep',
  'ymlConfig funcional por stepId (contenido completo, no solo presencia) — con una única excepción permitida: un clon `goto` puede dejar de reenviar contenido que, en el baseline, ya estaba duplicado byte-a-byte en otra fila del mismo stepId (ese es exactamente el bug corregido); cualquier otra diferencia de contenido es un mismatch',
  'cantidad de filas con ymlConfig vacío (máximo 1 en todo el payload)',
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function ymlConfigEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return stableStringify(a) === stableStringify(b);
}

export interface RepairFlowStepsInput {
  flowId: number;
  // Both required and checked against live ROS data before anything else —
  // this tool refuses to guess which flow/version it's touching.
  expectedFlowCode: string;
  expectedCurrentVersion: number;
  // ROS's own optimistic-locking modDate check (see saveFlowSteps' SQL
  // insertYMLsWithOptimisticLockingCheck / getYmlHisMaxDateByCode) can't be
  // read through the normal broken path, so the operator supplies it
  // directly from one more read-only SQL query — never guessed here.
  expectedModDate: number;
  // Must be the literal boolean `true` — a string "true" or omission both
  // refuse. This is the primary "did you mean to do this" tripwire.
  recoveryMode: true;
  // Must equal `REPAIR_FLOW_<flowId>_VERSION_<expectedCurrentVersion>` —
  // checked even in preview mode, so the tool cannot be invoked casually.
  confirmationPhrase: string;
  // The known-good physical rows (from SQL), never derived internally.
  baseline: BaselineRow[];
  steps: StepNode[];
  confirm?: boolean;
}

export interface RepairFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];
    baselineMatch?: {
      checkedFields: string[];
      logicalStepIdCount: number;
      physicalRowCount: number;
      emptyYmlConfigRowCount: number;
      matches: boolean;
      mismatches: string[];
    };
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}

const WARNINGS = [
  'repair_flow_steps es un mecanismo de recuperación restringido — solo repara flujos cuya lectura falla por el bug conocido de claves YML duplicadas (STEP:<flowCode> step <N>). No reemplaza a update_flow_steps para cambios normales; si la lectura del flujo funciona, esta tool se niega a correr.',
  'El payload debe reproducir EXACTAMENTE la estructura del baseline suministrado (mismos stepId/parentStepId/decision/flowActionDes en cada fila) — cualquier diferencia estructural aborta sin escribir nada.',
  'No existe un parámetro force en esta tool: un baseline que no coincide, una versión que cambió, o un error de lectura distinto al conocido, detienen la ejecución sin excepción.',
];

function expectedConfirmationPhrase(flowId: number, expectedCurrentVersion: number): string {
  return `REPAIR_FLOW_${flowId}_VERSION_${expectedCurrentVersion}`;
}

export async function repairFlowSteps(client: RosClientLike, input: RepairFlowStepsInput): Promise<RepairFlowStepsResult> {
  // 1. recoveryMode must be the literal boolean true.
  if ((input.recoveryMode as unknown) !== true) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: 'recoveryMode debe ser exactamente `true` — este mecanismo de recuperación no se activa por accidente ni con valores truthy distintos.' },
    };
  }

  // 2. expectedCurrentVersion required & a positive integer.
  if (!Number.isInteger(input.expectedCurrentVersion) || input.expectedCurrentVersion <= 0) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: 'expectedCurrentVersion debe ser un entero positivo — la versión activa que el operador confirmó por SQL antes de invocar esta tool.' } };
  }

  if (!Number.isInteger(input.expectedModDate) || input.expectedModDate < 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: 'expectedModDate debe ser un entero no negativo — obtenido por el operador vía SQL de solo lectura (MAX(MOD_DATE) de ROS_YML_HIST para SCOPE=STEP), nunca inferido por esta tool.' },
    };
  }

  // 3. baseline required & non-empty.
  if (!Array.isArray(input.baseline) || input.baseline.length === 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: 'baseline es obligatorio y no puede estar vacío — debe contener las filas físicas conocidas (obtenidas por SQL) contra las que se valida el payload de recuperación.' },
    };
  }

  // 8. confirmationPhrase checked unconditionally, even in preview mode.
  const expectedPhrase = expectedConfirmationPhrase(input.flowId, input.expectedCurrentVersion);
  if (input.confirmationPhrase !== expectedPhrase) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `confirmationPhrase inválida — se esperaba exactamente "${expectedPhrase}".` },
    };
  }

  // 3a. Flow must exist and its flowCode must match exactly.
  const flowInfo = await getFlow(client, { flowId: input.flowId });
  if (!flowInfo?.flow) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `flowId ${input.flowId} no existe.` } };
  }
  if (flowInfo.flow.flowCode !== input.expectedFlowCode) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowCode no coincide: se esperaba "${input.expectedFlowCode}", ROS devolvió "${flowInfo.flow.flowCode}" — deteniendo por seguridad, este no es el flujo esperado.` },
    };
  }

  // 3b/6. Active STEP-TREE version must still match what the operator
  // verified by SQL. Deliberately NOT flowInfo.flow.version — that is
  // ROS_FLOW.VERSION, the flow HEADER's own revision counter, a completely
  // separate thing from the step tree's version (MAX(VERSION) over
  // ROS_FLOW_STEP). They happened to coincide on flow 64506 (a coincidence
  // of that flow's edit history) but do NOT in general — confirmed live
  // against a disposable flow (2026-09-22): after a real repair, the step
  // tree's version advanced from 1 to 2 while ROS_FLOW.VERSION stayed at 1
  // the entire time. /getFlowStepVersions/{flowId} (GET) queries
  // ROS_FLOW_STEP_HIST directly — the same structural data
  // getRFSVersionByFlowCode's SQL reads — and is completely unaffected by
  // the ROS_YML duplicate-key bug, so it's safe to call even on a broken flow.
  const versionsResponse = await client.getJson<RequestPaginationData<number[]>>(`/getFlowStepVersions/${input.flowId}`);
  const knownVersions = versionsResponse.requestData ?? [];
  if (knownVersions.length === 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId} no tiene ninguna versión de steps registrada en ROS_FLOW_STEP_HIST — no hay nada que reparar.` },
    };
  }
  const currentStepTreeVersion = Math.max(...knownVersions);
  if (currentStepTreeVersion !== input.expectedCurrentVersion) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `La versión activa del árbol de steps de flowId ${input.flowId} es ${currentStepTreeVersion} (vía /getFlowStepVersions), no ${input.expectedCurrentVersion} — el flujo cambió desde que se preparó este baseline. Deteniendo por seguridad; vuelve a generar el preflight contra el estado actual antes de reintentar.`,
      },
    };
  }

  // 5/6. Only continue when the NORMAL read fails with the specific known
  // duplicate-key pattern — this tool is not a general bypass. Calls the raw
  // endpoint directly (not getFlowSteps.ts) because that helper silently
  // normalizes any failure to `[]`, discarding the errorMessage this guard
  // needs to inspect.
  const rawRead = await client.postForm<RequestPaginationData<unknown>>('/getFlowStepInfo', { flowId: input.flowId });
  if (!rawRead.errorMessage) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `La lectura normal de flowId ${input.flowId} no devolvió ningún error — este flujo no está en el estado de corrupción que repair_flow_steps está diseñado a corregir. Usa update_flow_steps para cambios normales.`,
      },
    };
  }
  if (!/repeated key/i.test(rawRead.errorMessage)) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `La lectura normal de flowId ${input.flowId} falló, pero con un error distinto al patrón conocido de duplicación de claves YML — deteniendo por seguridad, este mecanismo no está diseñado para ese caso. Error real: "${rawRead.errorMessage}"`,
      },
    };
  }

  const unresolved = await findUnresolvedCodes(client, input.steps);
  if (unresolved.length > 0) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `Unresolved references — ${unresolved.join('; ')}.` } };
  }

  // Build the corrective payload from the DSL — the SAME buildWireSteps used
  // by update_flow_steps/save_flow_steps (already fixed: no ymlConfig resend
  // on goto clones, at most one empty ymlConfig sentinel per save).
  let wireSteps: WireFlowStep[];
  try {
    wireSteps = buildWireSteps(input.steps, flowInfo.flow.flowCode);
  } catch (err) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: err instanceof Error ? err.message : String(err) } };
  }

  // 4/7. The new payload's STRUCTURAL shape must reproduce the caller-
  // supplied baseline exactly — see BASELINE_MATCH_FIELDS for the full list
  // this protects. This tool can fix the known ymlConfig bugs, never
  // introduce a functional change, by construction.
  //
  // Compared by (stepId, parentStepId) — the same tuple that is ROS_FLOW_STEP's
  // real primary key within a flow — NOT by array position. buildWireSteps
  // appends every goto clone at the end of its own branch (DFS traversal
  // order), which does not match the STEP_ID-ascending order a baseline
  // sourced from `ORDER BY STEP_ID, PARENT_STEP_ID` SQL naturally has; the
  // SET of physical rows is what must match, not their sequence.
  const flowCode = flowInfo.flow.flowCode;
  const rowKey = (stepId: number, parentStepId: number): string => `${stepId}:${parentStepId}`;
  const mismatches: string[] = [];
  if (wireSteps.length !== input.baseline.length) {
    mismatches.push(`Cantidad de filas distinta: payload=${wireSteps.length}, baseline=${input.baseline.length}.`);
  }

  // actionId resolution: framework actionCodes (INFLOW/OUTFLOW/etc.) are
  // fixed constants; everything else comes from the same action list
  // findUnresolvedCodes already validated exists.
  const actionCodesNeedingLookup = [...new Set(wireSteps.map((s) => s.actionCode))].filter((c) => !(c in FRAMEWORK_ACTION_IDS));
  const actionIdByCode = new Map<string, number>(Object.entries(FRAMEWORK_ACTION_IDS));
  if (actionCodesNeedingLookup.length > 0) {
    const allActions = await searchActions(client, {});
    for (const a of allActions) actionIdByCode.set(a.actionCode, a.actionId);
  }

  const baselineByKey = new Map(input.baseline.map((b) => [rowKey(b.stepId, b.parentStepId), b]));
  const wireKeysSeen = new Set<string>();
  for (const w of wireSteps) {
    const key = rowKey(w.stepId, w.parentStepId);
    wireKeysSeen.add(key);
    const b = baselineByKey.get(key);
    if (!b) {
      mismatches.push(`El payload tiene una fila (stepId ${w.stepId}, parent ${w.parentStepId}) que no existe en el baseline.`);
      continue;
    }

    const resolvedActionId = actionIdByCode.get(w.actionCode);
    if (resolvedActionId === undefined) {
      mismatches.push(`stepId ${w.stepId} (parent ${w.parentStepId}): no se pudo resolver actionId para actionCode "${w.actionCode}".`);
    } else if (resolvedActionId !== b.actionId) {
      mismatches.push(
        `stepId ${w.stepId} (parent ${w.parentStepId}): actionId no coincide (payload actionCode="${w.actionCode}" → actionId ${resolvedActionId} vs baseline actionId ${b.actionId}).`
      );
    }

    if ((w.decision ?? null) !== (b.decision ?? null)) {
      mismatches.push(`stepId ${w.stepId} (parent ${w.parentStepId}): decision no coincide (payload ${w.decision ?? 'null'} vs baseline ${b.decision ?? 'null'}).`);
    }
    if ((w.flowActionDes ?? null) !== (b.flowActionDes ?? null)) {
      mismatches.push(
        `stepId ${w.stepId} (parent ${w.parentStepId}): flowActionDes no coincide (payload "${w.flowActionDes ?? 'null'}" vs baseline "${b.flowActionDes ?? 'null'}").`
      );
    }
    if ((w._bypass ?? false) !== (b.bypass ?? false)) {
      mismatches.push(`stepId ${w.stepId} (parent ${w.parentStepId}): bypass no coincide (payload ${w._bypass ?? false} vs baseline ${b.bypass ?? false}).`);
    }
    if ((w._syncStep ?? false) !== (b.syncStep ?? false)) {
      mismatches.push(`stepId ${w.stepId} (parent ${w.parentStepId}): syncStep no coincide (payload ${w._syncStep ?? false} vs baseline ${b.syncStep ?? false}).`);
    }

    // ymlConfig: compare functional content, not mere presence. An empty
    // (SK_OPTIMISTIC-sentinel) map is normalized to null here — it isn't
    // functional config and is checked separately via emptyYmlConfigRowCount.
    const wYmlRaw = w.ymlConfig?.[flowCode] ?? null;
    const wYml = wYmlRaw !== null && Object.keys(wYmlRaw).length === 0 ? null : wYmlRaw;
    const bYml = b.ymlConfig ?? null;
    if (!ymlConfigEqual(wYml, bYml)) {
      // The ONLY allowed divergence: the payload row has NO ymlConfig at all,
      // the baseline row HAD content, and that exact content is duplicated
      // byte-for-byte on another baseline row of the SAME stepId (a
      // different parentStepId) — i.e. it was a known duplicate, and this
      // row is the goto clone that correctly stopped resending it. Anything
      // else (added keys, changed values, a partial removal, or content
      // that was never actually duplicated) is a real mismatch.
      const wasKnownDuplicate =
        wYml === null &&
        bYml !== null &&
        input.baseline.some((other) => other !== b && other.stepId === b.stepId && other.parentStepId !== b.parentStepId && ymlConfigEqual(other.ymlConfig ?? null, bYml));
      if (!wasKnownDuplicate) {
        mismatches.push(
          `stepId ${w.stepId} (parent ${w.parentStepId}): ymlConfig funcional no coincide y no corresponde a una eliminación correctiva conocida (contenido duplicado entre filas del mismo stepId en el baseline) — payload=${JSON.stringify(wYml)} vs baseline=${JSON.stringify(bYml)}.`
        );
      }
    }
  }
  for (const b of input.baseline) {
    const key = rowKey(b.stepId, b.parentStepId);
    if (!wireKeysSeen.has(key)) {
      mismatches.push(`El baseline tiene una fila (stepId ${b.stepId}, parent ${b.parentStepId}) que el payload reconstruido no reproduce.`);
    }
  }

  const logicalStepIdCount = new Set(wireSteps.map((s) => s.stepId)).size;
  const ymlConfigRowCounts = new Map<number, number>();
  for (const s of wireSteps) if (s.ymlConfig !== undefined) ymlConfigRowCounts.set(s.stepId, (ymlConfigRowCounts.get(s.stepId) ?? 0) + 1);
  const duplicatedYmlConfigStepIds = [...ymlConfigRowCounts.entries()].filter(([, count]) => count > 1).map(([stepId]) => stepId);
  if (duplicatedYmlConfigStepIds.length > 0) {
    mismatches.push(`stepId(s) con más de una fila portando ymlConfig (no debería ocurrir tras el fix): ${duplicatedYmlConfigStepIds.join(', ')}.`);
  }
  const emptyYmlConfigRowCount = wireSteps.filter((s) => {
    if (s.ymlConfig === undefined) return false;
    const inner = s.ymlConfig[flowCode];
    return inner !== undefined && Object.keys(inner).length === 0;
  }).length;
  if (emptyYmlConfigRowCount > 1) {
    mismatches.push(`Hay ${emptyYmlConfigRowCount} filas con ymlConfig vacío (marcador SK_OPTIMISTIC) — se esperaba como máximo 1.`);
  }

  const baselineMatch = {
    checkedFields: BASELINE_MATCH_FIELDS,
    logicalStepIdCount,
    physicalRowCount: wireSteps.length,
    emptyYmlConfigRowCount,
    matches: mismatches.length === 0,
    mismatches,
  };

  const preview = {
    summary:
      mismatches.length === 0
        ? `RECUPERACIÓN — flowId ${input.flowId} (${flowInfo.flow.flowCode}), versión activa del árbol de steps ${currentStepTreeVersion} confirmada (vía /getFlowStepVersions), lectura normal falla con el error conocido de duplicación de claves. El payload reproduce exactamente las ${wireSteps.length} filas físicas / ${logicalStepIdCount} stepId lógicos del baseline, con ${emptyYmlConfigRowCount} fila(s) de ymlConfig vacío y sin duplicados de ymlConfig por stepId. Guardará como versión ${currentStepTreeVersion + 1}.`
        : `ABORTADO — el payload reconstruido difiere del baseline suministrado en ${mismatches.length} punto(s). No se escribió nada.`,
    resolvedSteps: wireSteps,
    baselineMatch,
    warnings: WARNINGS,
  };

  if (mismatches.length > 0) {
    return {
      applied: false,
      preview,
      error: { message: 'El payload reconstruido no reproduce exactamente el baseline — revisa preview.baselineMatch.mismatches antes de reintentar. No se aplicó ningún cambio.' },
    };
  }

  if (!input.confirm) {
    return { applied: false, preview };
  }

  // 10. The same official saveFlowSteps endpoint ROS's own GUI and
  // update_flow_steps/save_flow_steps use — no SQL, no force.
  const body: SaveFlowStepBody = { flowId: input.flowId, version: input.expectedCurrentVersion, modDate: input.expectedModDate, flowSteps: wireSteps };
  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowStep', body);

  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }
  if (!response.successMessage) {
    return { applied: false, preview, error: { message: 'ROS no confirmó el guardado de recuperación (sin successMessage).' } };
  }

  return { applied: true, preview, result: { successMessage: response.successMessage } };
}

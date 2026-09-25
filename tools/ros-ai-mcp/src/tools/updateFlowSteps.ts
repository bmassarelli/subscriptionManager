import { buildWireSteps, type StepNode } from './flowStepTree.js';
import { findUnresolvedCodes } from './resolveStepReferences.js';
import { getFlow } from './getFlow.js';
import { getFlowSteps } from './getFlowSteps.js';
import type { RosClientLike } from '../rosClient/rosClient.js';
import type { RequestPaginationData, SaveFlowStepBody, StepOptimistic, WireFlowStep } from '../rosClient/types.js';

export interface UpdateFlowStepsInput {
  flowId: number;
  steps: StepNode[];
  confirm?: boolean;
  force?: boolean;
}

export interface FlowStepsDiff {
  added: WireFlowStep[];
  unexpectedlyChanged: WireFlowStep[];
  unexpectedlyMissing: WireFlowStep[];
}

export interface UpdateFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];
    diff?: FlowStepsDiff;
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}

// Content identity used to detect a REAL change once two rows are already known to be
// "the same physical row" (matched by (stepId, parentStepId) — see diffSteps below).
// Deliberately does NOT itself drive matching — see diffSteps' comment for why raw
// content alone (à la the old LCS approach) isn't enough either.
interface ComparableStep {
  actionCode: string;
  decisionCriteria: string | null;
  decision: string | null;
  flowActionDes: string | null;
  multiplyArrProp: string | null;
  ymlConfig: string;
  bypass: boolean;
  syncStep: boolean;
}

// Deterministic (sorted-key) serialization so two objects that are equal but built in a
// different key order (e.g. ROS's read-side JSON vs. the DSL builder's own construction
// order) don't register as "changed" purely from JS object key ordering.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

function normalizeExisting(steps: StepOptimistic[], ownFlowCode: string): ComparableStep[] {
  return steps.map((s) => {
    const cfg = s.ymlConfig as Record<string, Record<string, unknown>> | null | undefined;
    return {
      actionCode: s.action.actionCode,
      decisionCriteria: s.decisionCriteria,
      decision: s.decision,
      flowActionDes: s.flowActionDes,
      multiplyArrProp: s.multiplyArrProp,
      ymlConfig: stableStringify(cfg?.[ownFlowCode] ?? {}),
      // Read side is "Y"/null (StepOptimistic.bypass/syncStep); write side is a real
      // boolean (see WireFlowStep._bypass/_syncStep) — normalize both to boolean here
      // so an unset/unset pair isn't misreported as unexpectedlyChanged, and so a real
      // "Y" is compared correctly against the DSL's true/false.
      bypass: s.bypass === 'Y',
      syncStep: s.syncStep === 'Y',
    };
  });
}

function existingToWire(s: StepOptimistic): WireFlowStep {
  return {
    stepId: s.stepId,
    parentStepId: s.parentStepId,
    actionCode: s.action.actionCode,
    ...(s.decision !== null ? { decision: s.decision as 'Y' | 'N' } : {}),
    ...(s.flowActionDes !== null ? { flowActionDes: s.flowActionDes } : {}),
    ...(s.multiplyArrProp !== null ? { multiplyArrProp: s.multiplyArrProp } : {}),
    ...(s.bypass === 'Y' ? { _bypass: true } : {}),
    ...(s.syncStep === 'Y' ? { _syncStep: true } : {}),
  };
}

function normalizeNew(steps: WireFlowStep[], ownFlowCode: string): ComparableStep[] {
  return steps.map((s) => ({
    actionCode: s.actionCode,
    decisionCriteria: (s.ymlConfig?.[ownFlowCode] as { DECISION_CRITERIA?: string } | undefined)?.DECISION_CRITERIA ?? null,
    decision: s.decision ?? null,
    flowActionDes: s.flowActionDes ?? null,
    multiplyArrProp: s.multiplyArrProp ?? null,
    ymlConfig: stableStringify(s.ymlConfig?.[ownFlowCode] ?? {}),
    bypass: s._bypass ?? false,
    syncStep: s._syncStep ?? false,
  }));
}

function stepsEqual(a: ComparableStep, b: ComparableStep): boolean {
  return (
    a.actionCode === b.actionCode &&
    a.decisionCriteria === b.decisionCriteria &&
    a.decision === b.decision &&
    a.flowActionDes === b.flowActionDes &&
    a.multiplyArrProp === b.multiplyArrProp &&
    a.ymlConfig === b.ymlConfig &&
    a.bypass === b.bypass &&
    a.syncStep === b.syncStep
  );
}

function rowKey(stepId: number, parentStepId: number): string {
  return `${stepId}:${parentStepId}`;
}

// Matches old vs. new rows in four passes, each pass consuming only rows the previous
// pass left unmatched. NEVER uses array position/sequence-alignment (no LCS) — every
// pass identifies rows either by the real ROS_FLOW_STEP primary key (stepId,
// parentStepId) or by full-content equality via hash-map grouping, both of which are
// completely order-independent. This fixes a real bug (caught live, 2026-09-22, on
// flow 64506's own v5→v6 diff): buildWireSteps appends every goto-clone row at the end
// of its own branch, which can leave a clone at a different ARRAY POSITION than the
// equivalent-content row occupied in ROS's own read order, even though its
// (stepId, parentStepId) is byte-identical on both sides. The previous LCS-based
// sequence diff treated that position difference as if the two sequences had
// genuinely diverged there, misclassifying already-correct convergence rows (steps
// 12/22/25 on flow 64506) as added+missing pairs and forcing an unnecessary force:true.
//
//   Phase 1 — exact match: same (stepId, parentStepId) key AND identical content.
//             This is the common case whenever the tree's topology hasn't changed
//             (no step inserted/removed anywhere before a given row in DFS order):
//             buildWireSteps is deterministic, so the same tree shape always gets the
//             same numbering, and phase 1 alone correctly resolves every row —
//             including every convergence row — completely independent of what order
//             either side lists them in.
//   Phase 2 — content-only match (multiset/hash-map, not sequence alignment) among
//             whatever phase 1 couldn't pair. This is what correctly re-identifies a
//             row that's genuinely UNCHANGED in content but got renumbered because an
//             unrelated insertion/removal happened earlier in DFS order — without it,
//             every row downstream of a real insertion would falsely show as
//             removed+added instead of the insertion alone showing as added.
//   Phase 3 — same-key match among whatever's still left: by construction these pairs
//             share an identity (stepId, parentStepId) but did NOT match by content in
//             phase 1, and did NOT find a content-doppelganger elsewhere in phase 2 —
//             this is a genuine content change on an existing row (unexpectedlyChanged).
//   Phase 4 — whatever remains unmatched on the new side is a genuine addition;
//             whatever remains unmatched on the old side is a genuine removal.
// ROS's OWN read side (FlowStepController.getFlowStepInfo / getFlowStepConfig)
// resolves a step's config by stepId alone, not by which physical (stepId,
// parentStepId) row is asking — so EVERY row sharing a stepId (a real
// definition and its goto clone(s)) reads back showing the SAME resolved
// ymlConfig AND decisionCriteria (decisionCriteria is itself just
// ymlConfig.DECISION_CRITERIA, subject to the exact same merge), even though
// only the real definition actually has it persisted (confirmed live on flow
// 64506, 2026-09-22: the fixed clone rows for steps 22/25 send neither at
// all, yet existingSteps — read from ROS — shows their old counterparts
// carrying the full resolved values). A clone row's "old" ymlConfig/
// decisionCriteria are therefore not necessarily its OWN persisted content —
// comparing them at face value against a correctly-fixed clone (which sends
// neither) produces a false positive. This mirrors the same allowance
// already implemented in repairFlowSteps.ts.
function stepsEqualForDiff(a: ComparableStep, b: ComparableStep, stepId: number, newRealComparableByStepId: Map<number, ComparableStep>): boolean {
  if (
    a.actionCode !== b.actionCode ||
    a.decision !== b.decision ||
    a.flowActionDes !== b.flowActionDes ||
    a.multiplyArrProp !== b.multiplyArrProp ||
    a.bypass !== b.bypass ||
    a.syncStep !== b.syncStep
  ) {
    return false;
  }
  if (a.decisionCriteria === b.decisionCriteria && a.ymlConfig === b.ymlConfig) return true;
  // Allow: new side sent no ymlConfig at all (b.ymlConfig === '{}', b.decisionCriteria
  // === null — a goto clone, correctly not resending), and old side's
  // decisionCriteria/ymlConfig exactly match what THIS SAME stepId's real
  // definition still carries on the new side — i.e. old's values are fully
  // explained as the read-merge artifact, not a real loss.
  if (b.ymlConfig !== '{}' || b.decisionCriteria !== null) return false;
  const real = newRealComparableByStepId.get(stepId);
  return real !== undefined && a.decisionCriteria === real.decisionCriteria && a.ymlConfig === real.ymlConfig;
}

function diffSteps(
  oldWire: WireFlowStep[],
  oldComparable: ComparableStep[],
  newWire: WireFlowStep[],
  newComparable: ComparableStep[]
): FlowStepsDiff {
  const oldMatched = new Array<boolean>(oldWire.length).fill(false);
  const newMatched = new Array<boolean>(newWire.length).fill(false);
  const unexpectedlyChanged: WireFlowStep[] = [];

  // For each stepId, the (single, by construction) new-side row that carries
  // non-empty ymlConfig — i.e. its real definition's actual persisted content.
  const newRealComparableByStepId = new Map<number, ComparableStep>();
  newWire.forEach((w, i) => {
    if (newComparable[i].ymlConfig !== '{}') newRealComparableByStepId.set(w.stepId, newComparable[i]);
  });

  // Phase 1: exact (key + content) match.
  const oldIndexByKey = new Map<string, number>();
  oldWire.forEach((w, i) => oldIndexByKey.set(rowKey(w.stepId, w.parentStepId), i));
  for (let ni = 0; ni < newWire.length; ni++) {
    const oi = oldIndexByKey.get(rowKey(newWire[ni].stepId, newWire[ni].parentStepId));
    if (oi !== undefined && !oldMatched[oi] && stepsEqualForDiff(oldComparable[oi], newComparable[ni], newWire[ni].stepId, newRealComparableByStepId)) {
      oldMatched[oi] = true;
      newMatched[ni] = true;
    }
  }

  // Phase 2: content-only match among what's left (order-independent grouping).
  const leftoverOldByContent = new Map<string, number[]>();
  for (let oi = 0; oi < oldWire.length; oi++) {
    if (oldMatched[oi]) continue;
    const ck = stableStringify(oldComparable[oi]);
    const bucket = leftoverOldByContent.get(ck);
    if (bucket) bucket.push(oi);
    else leftoverOldByContent.set(ck, [oi]);
  }
  for (let ni = 0; ni < newWire.length; ni++) {
    if (newMatched[ni]) continue;
    const bucket = leftoverOldByContent.get(stableStringify(newComparable[ni]));
    const oi = bucket?.shift();
    if (oi !== undefined) {
      oldMatched[oi] = true;
      newMatched[ni] = true;
    }
  }

  // Phase 3: same-key match among what's still left — a real content change.
  const leftoverOldIndexByKey = new Map<string, number>();
  for (let oi = 0; oi < oldWire.length; oi++) {
    if (!oldMatched[oi]) leftoverOldIndexByKey.set(rowKey(oldWire[oi].stepId, oldWire[oi].parentStepId), oi);
  }
  for (let ni = 0; ni < newWire.length; ni++) {
    if (newMatched[ni]) continue;
    const oi = leftoverOldIndexByKey.get(rowKey(newWire[ni].stepId, newWire[ni].parentStepId));
    if (oi !== undefined && !oldMatched[oi]) {
      oldMatched[oi] = true;
      newMatched[ni] = true;
      // Same identity, content differs even after the read-merge allowance
      // above — a genuine change.
      if (!stepsEqualForDiff(oldComparable[oi], newComparable[ni], newWire[ni].stepId, newRealComparableByStepId)) {
        unexpectedlyChanged.push(newWire[ni]);
      }
    }
  }

  // Phase 4: whatever's left is a genuine addition or removal.
  const added = newWire.filter((_, ni) => !newMatched[ni]);
  const unexpectedlyMissing = oldWire.filter((_, oi) => !oldMatched[oi]);

  return { added, unexpectedlyChanged, unexpectedlyMissing };
}

const WARNINGS = [
  'update_flow_steps reemplaza el árbol COMPLETO del flow en cada guardado — cualquier fila que no esté en el DSL enviado desaparece.',
  'Los stepId son reasignados desde cero en cada guardado — no son estables entre llamadas.',
];

export async function updateFlowSteps(client: RosClientLike, input: UpdateFlowStepsInput): Promise<UpdateFlowStepsResult> {
  const flowInfo = await getFlow(client, { flowId: input.flowId });
  if (!flowInfo?.flow) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `flowId ${input.flowId} not found.` } };
  }

  const existingSteps = await getFlowSteps(client, { flowId: input.flowId });
  if (existingSteps.length === 0) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: { message: `flowId ${input.flowId} has no existing steps — use save_flow_steps for a brand-new flow instead.` },
    };
  }

  const versions = new Set(existingSteps.map((s) => s.version));
  if (versions.size !== 1) {
    return {
      applied: false,
      preview: { summary: '', warnings: [] },
      error: {
        message: `flowId ${input.flowId}'s existing steps don't share one uniform version (found: ${[...versions].join(', ')}) — update_flow_steps doesn't know which to send.`,
      },
    };
  }
  const version = existingSteps[0].version;
  const firstStep = existingSteps.reduce((min, s) => (s.stepId < min.stepId ? s : min), existingSteps[0]);
  const modDate = firstStep.modDateYmls ?? 0;

  const unresolved = await findUnresolvedCodes(client, input.steps);
  if (unresolved.length > 0) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: `Unresolved references — ${unresolved.join('; ')}.` } };
  }

  let wireSteps: WireFlowStep[];
  try {
    wireSteps = buildWireSteps(input.steps, flowInfo.flow.flowCode);
  } catch (err) {
    return { applied: false, preview: { summary: '', warnings: [] }, error: { message: err instanceof Error ? err.message : String(err) } };
  }

  const oldWire = existingSteps.map(existingToWire);
  const oldComparable = normalizeExisting(existingSteps, flowInfo.flow.flowCode);
  const newComparable = normalizeNew(wireSteps, flowInfo.flow.flowCode);
  const diff = diffSteps(oldWire, oldComparable, wireSteps, newComparable);

  const touchesExisting = diff.unexpectedlyChanged.length > 0 || diff.unexpectedlyMissing.length > 0;

  if (touchesExisting && !input.force) {
    return {
      applied: false,
      preview: {
        summary: `ABORTADO — el árbol nuevo altera o elimina ${diff.unexpectedlyChanged.length + diff.unexpectedlyMissing.length} step(s) existentes que no deberían tocarse.`,
        resolvedSteps: wireSteps,
        diff,
        warnings: WARNINGS,
      },
      error: {
        message:
          'La reconstrucción del árbol difiere de lo esperado en steps no marcados como nuevos — revisar el diff antes de reintentar, o volver a llamar con force:true una vez confirmado que el cambio/eliminación es intencional.',
      },
    };
  }

  const preview = {
    summary: touchesExisting
      ? `FORZADO — el árbol nuevo altera o elimina ${diff.unexpectedlyChanged.length + diff.unexpectedlyMissing.length} step(s) existentes (force:true); además agregará ${diff.added.length} step(s) nuevo(s) al flow ${input.flowId} (${flowInfo.flow.flowCode}).`
      : `Agregará ${diff.added.length} step(s) nuevo(s) al flow ${input.flowId} (${flowInfo.flow.flowCode}); ${existingSteps.length} step(s) existentes quedan intactos.`,
    resolvedSteps: wireSteps,
    diff,
    warnings: touchesExisting
      ? [...WARNINGS, 'force:true omitió el guardrail de seguridad — los steps listados en unexpectedlyChanged/unexpectedlyMissing SÍ van a alterarse/eliminarse.']
      : WARNINGS,
  };

  if (!input.confirm) {
    return { applied: false, preview };
  }

  const body: SaveFlowStepBody = { flowId: input.flowId, version, modDate, flowSteps: wireSteps };
  const response = await client.postJson<RequestPaginationData<unknown>>('/saveFlowStep', body);

  if (response.errorMessage) {
    return { applied: false, preview, error: { message: response.errorMessage } };
  }

  // Absence of errorMessage alone isn't a positive success signal — mirrors
  // saveFlowSteps.ts's precedent: ROS's FlowStepController always sets successMessage
  // on a genuine save, so treat a response with neither as ambiguous/unconfirmed.
  if (!response.successMessage) {
    return { applied: false, preview, error: { message: 'ROS did not confirm the step save (no successMessage returned).' } };
  }

  return { applied: true, preview, result: { successMessage: response.successMessage } };
}

import type { WireFlowStep } from '../rosClient/types.js';

export type StepNode =
  | { kind: 'action'; actionCode: string; des?: string; ymlConfig?: Record<string, unknown>; bypass?: boolean; syncStep?: boolean; ref?: string }
  | { kind: 'decision'; criteria: string; des?: string; bypass?: boolean; syncStep?: boolean; yes: StepNode[]; no: StepNode[]; ref?: string }
  | { kind: 'subflow'; flowCode: string; ymlConfig?: Record<string, unknown>; ref?: string }
  | { kind: 'multiply-subflow'; flowCode: string; arrayProperty: string; saveProperty?: string; ref?: string }
  | { kind: 'end'; ref?: string }
  | { kind: 'goto'; ref: string };

function isTerminated(nodes: StepNode[]): boolean {
  if (nodes.length === 0) return false;
  const last = nodes[nodes.length - 1];
  if (last.kind === 'end') return true;
  // Trusts that the ref-labeled node this goto points at was already validated as
  // sitting on a properly-terminated path at its own point of definition — a goto
  // never introduces new unterminated paths, it only reconnects to one that exists.
  if (last.kind === 'goto') return true;
  if (last.kind === 'decision') return isTerminated(last.yes) && isTerminated(last.no);
  return false;
}

function collectRefs(nodes: StepNode[]): Set<string> {
  const refs = new Set<string>();
  const visit = (list: StepNode[]) => {
    for (const node of list) {
      if (node.kind !== 'goto' && node.ref !== undefined) {
        if (refs.has(node.ref)) {
          throw new Error(`ref "${node.ref}" is defined more than once — ref names must be unique across the whole tree.`);
        }
        refs.add(node.ref);
      }
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(nodes);
  return refs;
}

function assertGotosResolvable(nodes: StepNode[], definedRefs: Set<string>): void {
  const visit = (list: StepNode[]) => {
    for (const node of list) {
      if (node.kind === 'goto' && !definedRefs.has(node.ref)) {
        throw new Error(`goto references "${node.ref}", but no node in the tree defines a ref "${node.ref}" — check for a typo or a ref that was removed.`);
      }
      if (node.kind === 'decision') {
        visit(node.yes);
        visit(node.no);
      }
    }
  };
  visit(nodes);
}

function assertValid(nodes: StepNode[], ownFlowCode: string, branchLabel: string): void {
  if (nodes.length === 0) {
    throw new Error(`${branchLabel} is empty — every branch needs at least one step.`);
  }
  if (!isTerminated(nodes)) {
    throw new Error(`${branchLabel} must end in an "end" step (directly, via a decision whose own branches all end, or via a "goto" to an already-terminated node).`);
  }
  nodes.forEach((node, i) => {
    if (i < nodes.length - 1 && (node.kind === 'end' || node.kind === 'decision' || node.kind === 'goto')) {
      throw new Error(
        `${branchLabel}: nothing can follow a "${node.kind}" step (found at position ${i + 1} of ${nodes.length}) — every path after a decision/goto must be written inside its own yes/no branch, or must itself be the branch's last step.`
      );
    }
  });
  for (const node of nodes) {
    if ((node.kind === 'subflow' || node.kind === 'multiply-subflow') && node.flowCode === ownFlowCode) {
      throw new Error(`${branchLabel} calls subflow "${node.flowCode}" recursively — a flow cannot call itself.`);
    }
    if (node.kind === 'decision') {
      assertValid(node.yes, ownFlowCode, `${branchLabel} > decision "yes" branch`);
      assertValid(node.no, ownFlowCode, `${branchLabel} > decision "no" branch`);
    }
  }
}

// Deliberately does NOT carry ymlConfig — see the long comment in appendNode's 'goto'
// case for why a goto clone must never resend it.
interface RefTarget {
  stepId: number;
  actionCode: string;
  flowActionDes?: string;
  multiplyArrProp?: string;
  bypass?: boolean;
  syncStep?: boolean;
}

interface Cursor {
  nextStepId: number;
  refs: Map<string, RefTarget>;
}

function appendNode(wire: WireFlowStep[], node: StepNode, parentStepId: number, ownFlowCode: string, cursor: Cursor, decision?: 'Y' | 'N'): number {
  if (node.kind === 'goto') {
    const target = cursor.refs.get(node.ref);
    if (!target) {
      throw new Error(
        `goto reference "${node.ref}" has not been defined yet at this point in the tree — forward references aren't supported. The node with ref "${node.ref}" must appear earlier in traversal order (remember: "yes" branches are visited before "no" branches at every decision).`
      );
    }
    // Deliberately NEVER resends target.ymlConfig here. Reproduced live against ROS DEV
    // (flow 64506, 2026-09-22): ROS_YML rows are keyed by (YML_CODE, SCOPE, STEP_ID) alone
    // — not by the (stepId, parentStepId) pair that actually distinguishes a goto clone's
    // wire row from its real definition — and FlowProcessor.saveFlowSteps' STEP-scope save
    // path never deletes prior ROS_YML rows before inserting (unlike FLOW/ACTION scope).
    // Calling saveFlowStepYml a second time for the same stepId (once for the real
    // definition, once for a goto clone carrying its own copy of the same ymlConfig)
    // inserts a second ROS_YML row with the same PARAM_KEY, which createRFSRosYmlHist then
    // copies verbatim into ROS_YML_HIST — producing two history rows for one key and
    // throwing "Repeated key ... of children of yml config" the next time anything (ROS's
    // own masros-gui included) tries to read that step's config back. The real definition
    // row alone is sufficient: ROS resolves a step's yml config by stepId, not by which
    // parent row is asking, so every goto clone transparently inherits it for free.
    // flowActionDes/multiplyArrProp/_bypass/_syncStep are NOT affected by this — those are
    // plain columns on each wire row's own RosFlowStep/RosFlowStepHist insert (a fresh row
    // per wire array entry, never a shared key), so duplicating them across the real
    // definition and its goto clone(s) is safe and matches ROS's own native convergence
    // rows (flow 64506's pre-existing "IL?" convergence carried flowActionDes on both
    // physical rows before this tool ever touched it).
    wire.push({
      stepId: target.stepId,
      parentStepId,
      actionCode: target.actionCode,
      ...(decision !== undefined ? { decision } : {}),
      ...(target.flowActionDes !== undefined ? { flowActionDes: target.flowActionDes } : {}),
      ...(target.multiplyArrProp !== undefined ? { multiplyArrProp: target.multiplyArrProp } : {}),
      ...(target.bypass !== undefined ? { _bypass: target.bypass } : {}),
      ...(target.syncStep !== undefined ? { _syncStep: target.syncStep } : {}),
    });
    return target.stepId;
  }

  if (node.kind === 'action') {
    const stepId = cursor.nextStepId++;
    const ymlConfig = node.ymlConfig !== undefined ? { [ownFlowCode]: node.ymlConfig } : undefined;
    wire.push({
      stepId,
      parentStepId,
      actionCode: node.actionCode,
      ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
      ...(decision !== undefined ? { decision } : {}),
      ...(ymlConfig !== undefined ? { ymlConfig } : {}),
      ...(node.bypass !== undefined ? { _bypass: node.bypass } : {}),
      ...(node.syncStep !== undefined ? { _syncStep: node.syncStep } : {}),
    });
    if (node.ref !== undefined) {
      cursor.refs.set(node.ref, {
        stepId,
        actionCode: node.actionCode,
        ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
        ...(node.bypass !== undefined ? { bypass: node.bypass } : {}),
        ...(node.syncStep !== undefined ? { syncStep: node.syncStep } : {}),
      });
    }
    return stepId;
  }

  if (node.kind === 'end') {
    const stepId = cursor.nextStepId++;
    wire.push({ stepId, parentStepId, actionCode: 'ES', ...(decision !== undefined ? { decision } : {}) });
    if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId, actionCode: 'ES' });
    return stepId;
  }

  if (node.kind === 'subflow') {
    const inStepId = cursor.nextStepId++;
    const inYmlConfig = { [ownFlowCode]: { FLOW_CODE: node.flowCode, ENABLE_SWITCH_FLOW: 'false', VALIDATE_SWITCH_FLOW: 'false' } };
    wire.push({
      stepId: inStepId,
      parentStepId,
      actionCode: 'INFLOW',
      ...(decision !== undefined ? { decision } : {}),
      ymlConfig: inYmlConfig,
    });
    if (node.ref !== undefined) cursor.refs.set(node.ref, { stepId: inStepId, actionCode: 'INFLOW' });
    const outStepId = cursor.nextStepId++;
    wire.push({ stepId: outStepId, parentStepId: inStepId, actionCode: 'OUTFLOW', ymlConfig: { [ownFlowCode]: {} } });
    return outStepId;
  }

  if (node.kind === 'multiply-subflow') {
    const inStepId = cursor.nextStepId++;
    const inYmlConfig = {
      [ownFlowCode]: {
        FLOW_CODE: node.flowCode,
        ARRAY_PROPERTY_PATH: node.arrayProperty,
        ...(node.saveProperty !== undefined ? { SAVE_PROPERTY_PATH: node.saveProperty } : {}),
      },
    };
    wire.push({
      stepId: inStepId,
      parentStepId,
      actionCode: 'INMLTPL',
      ...(decision !== undefined ? { decision } : {}),
      multiplyArrProp: node.arrayProperty,
      ymlConfig: inYmlConfig,
    });
    if (node.ref !== undefined) {
      cursor.refs.set(node.ref, { stepId: inStepId, actionCode: 'INMLTPL', multiplyArrProp: node.arrayProperty });
    }
    const outStepId = cursor.nextStepId++;
    wire.push({ stepId: outStepId, parentStepId: inStepId, actionCode: 'OUTMLTPL', ymlConfig: { [ownFlowCode]: {} } });
    return outStepId;
  }

  // 'decision' is the only StepNode kind left after the checks above.
  const decStepId = cursor.nextStepId++;
  const decYmlConfig = { [ownFlowCode]: { DECISION_CRITERIA: node.criteria } };
  wire.push({
    stepId: decStepId,
    parentStepId,
    actionCode: 'INLINEDEC',
    ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
    ...(decision !== undefined ? { decision } : {}),
    ymlConfig: decYmlConfig,
    ...(node.bypass !== undefined ? { _bypass: node.bypass } : {}),
    ...(node.syncStep !== undefined ? { _syncStep: node.syncStep } : {}),
  });
  if (node.ref !== undefined) {
    cursor.refs.set(node.ref, {
      stepId: decStepId,
      actionCode: 'INLINEDEC',
      ...(node.des !== undefined ? { flowActionDes: node.des } : {}),
      ...(node.bypass !== undefined ? { bypass: node.bypass } : {}),
      ...(node.syncStep !== undefined ? { syncStep: node.syncStep } : {}),
    });
  }
  appendChain(wire, node.yes, decStepId, ownFlowCode, cursor, 'Y');
  appendChain(wire, node.no, decStepId, ownFlowCode, cursor, 'N');
  return decStepId;
}

function appendChain(wire: WireFlowStep[], nodes: StepNode[], parentStepId: number, ownFlowCode: string, cursor: Cursor, firstDecision?: 'Y' | 'N'): void {
  let currentParent = parentStepId;
  for (let i = 0; i < nodes.length; i++) {
    currentParent = appendNode(wire, nodes[i], currentParent, ownFlowCode, cursor, i === 0 ? firstDecision : undefined);
  }
}

// ROS's ROS_FLOW_STEP table has a composite primary key on (stepId, parentStepId) —
// confirmed by reproducing ORA-00001 (PK_ROS_FLOW_STEP) against real ROS DEV. A "ref"
// node whose very first row is directly under a decision, reached identically by both
// that decision's "yes" and "no" branches via "goto", produces two wire rows with the
// exact same (stepId, parentStepId) and no other distinguishing key (the `decision`
// Y/N tag isn't part of ROS's primary key) — ROS rejects the save outright. This is
// only reachable when a ref target sits as a branch's very first step on both sides;
// any intervening step on at least one side (as in every real convergence in flow
// 64506) gives the two rows distinct parentStepIds and is unaffected.
function assertNoDuplicateRows(wire: WireFlowStep[]): void {
  const seen = new Map<string, WireFlowStep>();
  for (const step of wire) {
    const key = `${step.stepId}:${step.parentStepId}`;
    const prior = seen.get(key);
    if (prior) {
      throw new Error(
        `Two branches converge directly into the same "ref"-labeled node as their very first step (stepId ${step.stepId}, parentStepId ${step.parentStepId}) — ROS's ROS_FLOW_STEP table has a unique constraint on (stepId, parentStepId), and a decision's "yes"/"no" tag isn't part of that key, so this would violate it (ORA-00001 on PK_ROS_FLOW_STEP) instead of saving. Insert at least one distinct step before the shared node on one of the two branches, or don't share the node between branches that both reach it immediately.`
      );
    }
    seen.set(key, step);
  }
}

// OUTFLOW/OUTMLTPL closing nodes (see appendNode's 'subflow'/'multiply-subflow' cases)
// always carry a present-but-empty ymlConfig ({ownFlowCode: {}}) — there is never any
// real content to save on a closing node, but ROS's own FlowProcessor.saveFlowSteps
// loop (confirmed by reading the ros5 Java source, 2026-09-22) treats ANY step whose
// ymlConfig is present-but-empty as a trigger to insert a single internal bookkeeping
// row (YML_CODE=<flowCode>, SCOPE='STEP', STEP_ID=-1, PARAM_KEY='SK_OPTIMISTIC') used
// for its own optimistic-locking modDate round-trip — this row is invisible to every
// real read path (FlowStepController.getFlowStepInfo iterates RosFlowStep rows only;
// STEP_ID=-1 is never a real step, so it can never appear there or collide with any
// real stepId's config) and is NOT the ROS_YML duplicate-key bug fixed above.
// However: sending it on EVERY OUTFLOW/OUTMLTPL (a flow can have many) let ROS's own
// per-call insert fire once per occurrence during the 2026-09-22 write to flow 64506 —
// 7 live rows / 28 history rows (confirmed via SQL, matching the N / N(N+1)/2 pattern
// of the ymlConfig bug above, N=7). Capping this ourselves to at most one occurrence,
// unconditionally, is the correct fix regardless of which guard (if any) the deployed
// ROS build implements internally — we simply never hand it the opportunity to insert
// more than once. The first empty ymlConfig is kept (preserving the sentinel for flows
// that have no other STEP-scope yml config at all); every later one is stripped.
function capSentinelYmlConfig(wire: WireFlowStep[], ownFlowCode: string): void {
  let keptOne = false;
  for (const step of wire) {
    if (step.ymlConfig === undefined) continue;
    const inner = step.ymlConfig[ownFlowCode];
    if (inner === undefined || Object.keys(inner).length > 0) continue;
    if (!keptOne) {
      keptOne = true;
    } else {
      delete step.ymlConfig;
    }
  }
}

export function buildWireSteps(steps: StepNode[], ownFlowCode: string): WireFlowStep[] {
  assertValid(steps, ownFlowCode, 'steps');
  const definedRefs = collectRefs(steps);
  assertGotosResolvable(steps, definedRefs);
  const wire: WireFlowStep[] = [];
  const cursor: Cursor = { nextStepId: 1, refs: new Map() };
  appendChain(wire, steps, 0, ownFlowCode, cursor);
  capSentinelYmlConfig(wire, ownFlowCode);
  assertNoDuplicateRows(wire);
  return wire;
}

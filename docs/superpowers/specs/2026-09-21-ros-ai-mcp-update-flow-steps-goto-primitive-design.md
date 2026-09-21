# ros-ai-mcp — `update_flow_steps` + DSL `ref`/`goto` primitive — Design

## 1. Goal

Add a capability to `ros-ai-mcp` for editing the step tree of a ROS flow that **already has steps** — explicitly out of scope for Phase 8's `save_flow_steps`, which refuses to run against any flow with existing steps (a deliberate safety guardrail, since `POST /saveFlowStep` is a whole-tree replace with no partial-update concept). This is needed right now to wire the 8 new steps from `docs/superpowers/plans/2026-09-21-so-movil-activate-contract-gap-remediation.md` (Task 4) into the real flow `S_O_ACTIVATE_CONTRACT` (flowId 64506) — a live flow, not a throwaway.

A blocking technical gap surfaced while designing this: flow 64506's real step tree already has **two convergence points** (stepId 18 and stepId 21, each reached from two different parents) — a pattern the current DSL (`flowStepTree.ts`) cannot represent at all (its own code comments call this "a deliberate scope cut, not a bug" from Phase 8). Reconstructing the flow's full tree via the DSL — required because `saveFlowStep` replaces the whole tree, there's no partial update — needs a way to express "this branch reconnects to a node defined elsewhere," or those two real convergence points get silently duplicated into independent copies when resaved.

## 2. Background

**Confirmed live, this session**, reading `get_flow_steps(64506)`:
- stepId 18 (`INLINEDEC "IL?"`, `decisionCriteria: SYSTEMIL=="Y"`) appears as two rows: one with `parentStepId: 9` (decision `N` branch of the `CS?` node), one with `parentStepId: 17` (end of the CS chain). Same `stepId`, same `actionId`/`decisionCriteria`, different `parentStepId`.
- stepId 21 (`INFLOW → SERVICE_ORDERING_PROVISIONING_NOTIF`) appears the same way: `parentStepId: 18` (decision `N` of the `IL?` node) and `parentStepId: 20` (after the `IL?` `Y` branch's InstantLink call).
- Their own children (19/20 under 18; 22/23 under 21) appear **only once each**, with `parentStepId` set to the shared `stepId` — ROS resolves the DAG by `stepId` value alone, so a child doesn't care which of the two incoming-edge rows "activated" its parent.

**Confirmed from source** (already documented in Phase 8's design, re-verified against `flowStepTree.ts` directly this session): `buildWireSteps` does a simple single-pass DFS (`yes` branch before `no` branch at every decision, per `appendChain`), assigning `stepId` via a monotonic `cursor.nextStepId++` with no concept of a shared/revisited node.

**Two approaches were considered** (see the design conversation): (A) reconstruct the whole existing tree as DSL, extended with a `ref`/`goto` primitive to express real convergence, then rebuild the whole wire array via `buildWireSteps`; (B) clone the existing wire array byte-for-byte untouched and only append new rows for the inserted subtrees, patching a handful of `parentStepId` links — which needs no new primitive at all, since existing convergences are never regenerated. **The user explicitly chose (A)** for its generality (reusable for future flows with convergence, not just this one), accepting the extra design/build cost and the review discipline in §6 to manage the residual risk.

## 3. Scope

**In scope:**
- A `ref`/`goto` primitive added to the existing DSL (`flowStepTree.ts`), reusable by any future caller, not special-cased to this flow.
- A new tool, `update_flow_steps`, for flows that already have steps — separate from `save_flow_steps`, which keeps its existing create-only guardrail unchanged for its own use case.
- Automatic resolution of the real `version`/`modDate` needed for the update POST (never client-supplied, to avoid a stale value).
- A mandatory, always-re-computed preview + a structural diff safety check comparing the proposed new tree against the **live** current tree at confirm-time (not a diff against a stale earlier read).
- Live verification against a throwaway flow (with its own real convergence, deliberately constructed to exercise `ref`/`goto`) before this tool is ever pointed at flow 64506.

**Out of scope:**
- Any change to `save_flow_steps`'s existing create-only behavior or its guardrail — untouched.
- A general "diff two arbitrary step trees" utility beyond what's needed for the safety check in §5.3.
- Forward references in `goto` (referencing a `ref` not yet visited in DFS order) — the caller must order the DSL so shared nodes are defined before they're referenced; a clear error is thrown otherwise, not silently worked around.
- Editing `bypass`/`syncStep`/`multiplyArrProp` or any other step field not already handled by the existing DSL — carried over unchanged from Phase 8's scope.

## 4. The `ref`/`goto` primitive

### 4.1 DSL changes (`flowStepTree.ts`)

```typescript
export type StepNode =
  | { kind: 'action'; actionCode: string; des?: string; ymlConfig?: Record<string, unknown>; ref?: string }
  | { kind: 'decision'; criteria: string; yes: StepNode[]; no: StepNode[]; ref?: string }
  | { kind: 'subflow'; flowCode: string; ymlConfig?: Record<string, unknown>; ref?: string }
  | { kind: 'end'; ref?: string }
  | { kind: 'goto'; ref: string };
```

`ref` is an optional label on any regular node, naming its **entry stepId** for later reference:
- `action`/`end`: their own (only) stepId.
- `decision`: the `INLINEDEC` row's own stepId (not either branch).
- `subflow`: the `INFLOW` row's stepId (not the paired `OUTFLOW`) — this is what real convergence targets in practice (per §2's `stepId 21` example, the shared node is the `INFLOW`, and its own single `OUTFLOW`/`ES` continuation is untouched, appearing once).

`goto` emits **one new wire row** — no new stepId, no re-visiting of the target's children (they're already correctly wired via the shared stepId, exactly matching the real ROS pattern in §2):
```typescript
{ stepId: <target's entry stepId>, parentStepId: <this goto's parent>, actionCode: <target's actionCode>, ...(target had ymlConfig ? {ymlConfig: target.ymlConfig} : {}), ...(decision !== undefined ? {decision} : {}) }
```

### 4.2 Validation rules (added to `assertValid`/`isTerminated`)

- `ref` names must be unique across the whole tree — checked in one pass before building, independent of traversal order.
- Every `goto.ref` must match some node's `ref` somewhere in the tree — checked in the same pass (a dangling reference is a caller mistake, caught before any wire-building is attempted).
- `goto` may only appear as the **last** element of a branch array, exactly like the existing rule for `end`/`decision` — extend the existing "nothing can follow a terminal node" check to include `goto`.
- `isTerminated`: a branch ending in `goto` is treated as terminated — this trusts that the referenced node's own branch was already validated as terminated at its point of original definition (documented as an explicit trust assumption in a code comment, matching this file's existing commenting style for known scope cuts).
- **Build-time-only rule** (not statically checkable, since it depends on DFS visitation order): if a `goto` is reached before its target `ref` has been assigned a stepId (i.e., the target is defined later in the tree, in a branch not yet visited), throw a clear error naming the ref and stating that forward references aren't supported — the caller must reorder the DSL so the shared node's real definition comes first (in our concrete case, this is naturally satisfied: `appendChain` visits `yes` before `no`, and the flow's own convergences are always first-reached via the "long" `yes`-side path in the original tree).

## 5. Tool design: `update_flow_steps`

### 5.1 Input/output

```typescript
export interface UpdateFlowStepsInput {
  flowId: number;
  steps: StepNode[];   // the FULL intended tree, not a patch — same DSL as save_flow_steps, now with ref/goto
  confirm?: boolean;
}

export interface UpdateFlowStepsResult {
  applied: boolean;
  preview: {
    summary: string;
    resolvedSteps?: WireFlowStep[];      // the full new wire tree, for review
    diff?: { added: WireFlowStep[]; unexpectedlyChanged: WireFlowStep[]; unexpectedlyMissing: WireFlowStep[] };
    warnings: string[];
  };
  result?: { successMessage?: string };
  error?: { message: string };
}
```

Unlike `save_flow_steps`, this tool requires the flow to **already have** steps (inverse guard) — if `get_flow_steps` returns zero rows, it errors out pointing the caller at `save_flow_steps` instead, rather than silently working for both cases.

### 5.2 Resolving `version`/`modDate` automatically

Read live via `get_flow_steps(flowId)` at both preview and confirm time (never trust a value the tool already computed earlier in the same conversation — ROS state may have changed): `version` is the common `version` value shared by the flow's existing step rows (confirmed uniform across flow 64506's 23 steps this session — `version: 3` on all of them); `modDate` is the real `modDateYmls` value carried only on the **first** step of the response (confirmed non-zero only there, `0` on every other row — matches Phase 8's own documented finding). If the existing steps don't share one uniform `version` (an edge case not yet seen live), the tool errors out explicitly rather than guessing which one to send.

### 5.3 Mandatory preview + live structural diff safety check

Every call (preview or confirm) re-fetches the flow's **current live** tree and builds the new tree via `buildWireSteps` (now `ref`/`goto`-aware) from the caller's DSL. It then diffs the two wire arrays by `(stepId, parentStepId)` identity:
- **Added**: rows in the new tree with no matching `(stepId, parentStepId)` in the old — expected, these are the intended insertions.
- **Unexpectedly changed**: rows sharing `(stepId, parentStepId)` but differing in `actionCode`/`decisionCriteria`/`ymlConfig`/`decision` — this should never happen if the DSL faithfully reconstructed the untouched parts of the tree; if it does, the tool refuses to proceed (even with `confirm:true`) and reports exactly which rows, rather than silently applying a change to something the caller didn't intend to touch.
- **Unexpectedly missing**: rows present in the old tree with no counterpart in the new — same refusal, since nothing existing should ever be dropped by this tool.

Only "added" rows are expected; any "changed"/"missing" entries block the write entirely. This is the primary safety net against a mistranslation of the existing tree into the DSL silently corrupting flow 64506 (or any other flow this tool is later pointed at).

### 5.4 Registration

New MCP tool `update_flow_steps`, gated by the same `ROS_MCP_ENABLE_WRITE` flag as `save_flow_steps`/`create_flow` — no new flag.

## 6. Testing / verification approach

1. **Unit tests** for the `ref`/`goto` primitive in `flowStepTree.test.ts`: a tree with one real convergence (two branches rejoining via `goto`) produces the expected two-row-same-stepId wire shape; a dangling `goto.ref` errors before building; a forward-reference `goto` (target not yet visited) errors with a clear message; `goto` in a non-last position errors; duplicate `ref` names error.
2. **Unit tests** for `update_flow_steps` against a fake `RosClientLike`: refuses on a flow with zero existing steps; resolves `version`/`modDate` from a fake existing tree; the diff safety check catches an unexpectedly-changed/missing row and refuses even with `confirm:true`; a clean diff (only additions) proceeds to `confirm:true` and posts the expected body.
3. **Live verification, mandatory before touching flow 64506**: create a throwaway test flow via `create_flow`, assemble an initial tree via `save_flow_steps` that deliberately includes a convergence (two branches of a decision reconnecting to a shared downstream node, built directly in wire form via a manual test since `save_flow_steps` itself can't express convergence on create — or, more simply, build the throwaway tree without a convergence first, apply one `update_flow_steps` call that *introduces* a convergence via `ref`/`goto`, and confirm via `get_flow_steps` that the resulting live wire shape exactly matches the `stepId`-duplication pattern documented in §2). Only after this passes does `update_flow_steps` get used against flow 64506, per the plan's Task 4.

## 7. Open questions / risks

1. The claim that all of flow 64506's existing steps share one uniform `version` (3) is based on this session's single read — not verified against a flow where steps have drifted to different individual versions (if that's even possible; `getFlowStepInfo`'s per-row `version` field's exact semantics beyond "shared across a whole tree save" aren't independently re-derived here, only reused from Phase 8's existing documented understanding).
2. §5.3's diff safety check assumes `(stepId, parentStepId)` is a sufficiently unique key for matching old vs. new rows — for a tree with the same `stepId` appearing on more than 2 incoming edges (not seen in flow 64506, but not proven impossible elsewhere in ROS), the diff logic should be re-checked before trusting it blindly.
3. Whether `getFlowStepInfo`'s wrapped envelope for an **update** response differs from Phase 8's already-documented create response shape isn't independently reconfirmed here — `saveFlowStep`'s response handling in `update_flow_steps` reuses the exact same `successMessage`/`errorMessage` check `save_flow_steps` already uses, on the assumption the envelope is identical for create and update (both are the same endpoint, same whole-tree-replace mechanism).
4. Nothing in this design has been applied to ROS. `flow 64506` remains untouched until: this spec's plan is written, the throwaway-flow live test in §6.3 passes, and the user explicitly approves running `update_flow_steps` against 64506 itself.

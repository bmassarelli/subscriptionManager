# Service Ordering - Movil - Activate Contract — Gap Remediation Implementation Plan

> **Execution note:** this is not a software plan with unit tests — it's a sequence of real ROS writes (via `ros-ai-mcp`'s `save_action`, gated by `ROS_MCP_ENABLE_WRITE=true`, already on) plus one manual step in masros-gui's visual editor (adding steps to an *existing* flow is out of scope for `save_flow_steps` — it refuses to run against a flow that already has steps). Execute this **inline, one task at a time**, not via `subagent-driven-development`/`executing-plans` (those assume autonomous code-writing + git commits; here every write is a real, irreversible-ish change to ROS DEV that needs the user's explicit `confirm:true` go-ahead at each step). Do not batch multiple `confirm:true` calls without showing the preview first, per this project's standing discipline.

**Goal:** Wire the missing SP/Function/REST steps into flow 64506 (`S_O_ACTIVATE_CONTRACT`) for all 4 alta processes, correct `SYSTEMCS`'s scope, and create the new supporting Actions — per the approved design in `docs/superpowers/specs/2026-09-21-so-movil-activate-contract-gap-remediation-design.md`.

**Architecture:** New Groovy actions created via `save_action` (preview → review → `confirm:true`). The existing validation action (90333) updated the same way. Flow step wiring done manually in masros-gui (no ros-ai-mcp tool covers editing an existing flow's step tree). SOM/Inventory actions stay prototypes, not created for real, until Task 0's open question is resolved with real data.

**Tech Stack:** `ros-ai-mcp` MCP tools (`save_action`, `get_action`, `get_action_parameters`, `get_flow_steps`), masros-gui (manual step-tree edit), ROS DEV only — never production.

## Global Constraints

- Every `save_action` call runs preview-only first (no `confirm:true`); the preview is shown to the user and **only re-run with `confirm:true` after they explicitly approve it**, one action at a time — never batch multiple confirms.
- `SOM_OBTENER_PARAMETROS_TECNICOS` and `RESOURCE_INVENTORY_UPDATE` are **not created for real** in this plan — they stay design-only prototypes until real schema/domain/auth data exists (spec §9.2/§9.3). Tasks 4-5 below only cover the two actions with fully-confirmed real signatures (`RESERVAR_LINEA_GROOVY`, `ALTA_IMSI_GROOVY`).
- Nothing in flow 64506's **existing** 23 steps is deleted, replaced, or reordered — only new steps are inserted, per the topology in the spec's §6.
- The single-vs-double `¿Es Locución?` gate question (spec §9.1) must be resolved (Task 0) before Task 6 (manual flow wiring), since it changes the step tree shape.
- The reuse-vs-new-Groovy question (spec §9.6) must be resolved (Task 0) before Tasks 4-5, since if the existing `OBTIENE_CM_IMSI_HRLUD`/`RESERVAR_LINEA_INVE` PROCEDURE actions are reused as-is, Tasks 4-5 are skipped entirely (nothing to create).
- `get_action_parameters` (built and tested in `ros-ai-mcp`, not yet committed) is **not required** to be committed before this plan proceeds — it already works from source (`npm run build` output is what the running MCP process loads). Task 7 covers committing it, independent of the rest.

---

## Task 0: Resolve the two open design questions before touching ROS

**Files:** none — this is a conversation/decision checkpoint, not a code or ROS-write task.

- [ ] **Step 1: Ask the user directly, one at a time, and record the answers**
  1. "¿Reusamos las Actions PROCEDURE existentes (`OBTIENE_CM_IMSI_HRLUD` #86538, `RESERVAR_LINEA_INVE` #88138) tal cual en el flujo, o creamos las versiones Groovy nuevas (`ALTA_IMSI_GROOVY`, `RESERVAR_LINEA_GROOVY`) diseñadas en la spec?"
  2. "Para DATOS SOM/INVENTARIO en la rama no-prepago: ¿un solo gate `¿Es Locución?` antes de InstantLink (como quedó en la spec), o dos gates separados preservando el orden literal del Excel (INVENTARIO después de INSTANT LINK)?"
- [ ] **Step 2: Update the spec file's §9 open-questions section** to mark these two as resolved, with the answer, before proceeding to Task 1.

---

## Task 1: Create `RESERVAR_LINEA_GROOVY` (only if Task 0.1 chose "new Groovy")

**Depends on:** Task 0 (skip this task entirely if Task 0.1 chose "reuse existing").

**Tool:** `save_action` (actionId: none — create mode)

- [ ] **Step 1: Preview**

Call `save_action` with:
```json
{
  "actionCode": "RESERVAR_LINEA_GROOVY",
  "actionDes": "Reservar Linea (Groovy)",
  "commandType": "GROOVY",
  "method": "run",
  "command": "<the full Groovy body from spec §7.3>"
}
```
No `confirm`. Read the preview response carefully — it shows exactly what will be sent (`actionId:-1` sentinel, full command body, etc.).

- [ ] **Step 2: Show the preview to the user, wait for explicit approval**

Paste the preview's summary back to the user verbatim. Do not proceed to Step 3 without an explicit "sí, confirmá" (or equivalent) in this exact conversation turn.

- [ ] **Step 3: Confirm**

Re-run the same `save_action` call with `confirm: true`. Record the returned `actionId`.

- [ ] **Step 4: Verify**

Call `get_action_parameters` on the new `actionId`. Since this is a plain Groovy action (not `PROCEDURE`), expect an **empty** `parsers` array — `RosActionParser` rows only exist for `PROCEDURE`/SOAP/REST actions with explicitly configured parsers, and this action's IN/OUT handling is entirely inside its own Groovy body via `@SkValue`, not via the parser-row mechanism. Confirming an empty array here is the expected, correct result — it is not a sign anything is missing.

Then call `get_action_command` on the new `actionId` and diff it against the spec's §7.3 body to confirm it was stored verbatim (no ROS-side mangling of the Groovy text).

---

## Task 2: Create `ALTA_IMSI_GROOVY` (only if Task 0.1 chose "new Groovy")

**Depends on:** Task 0 (skip if "reuse existing").

Identical shape to Task 1, using the actionCode `ALTA_IMSI_GROOVY`, `actionDes: "Alta IMSI (Groovy)"`, and the full Groovy body from spec §7.2. Follow the same 4 steps (preview → user approval → confirm → verify via `get_action_command`).

---

## Task 3: Update the validation action (90333) with the new `tipoAlta`/`SYSTEMCS` logic

**Tool:** `save_action` (actionId: 90333 — update mode)

- [ ] **Step 1: Read the current full state first**

Call `get_action(90333)` and `get_action_command(90333)`. Confirm the current `version` number (needed for the optimistic-lock check) and re-read the existing `buildParameter()` method's body — the update must carry it forward **unchanged** (spec §9.5 — the unrelated VMS content is out of scope, not to be cleaned up here).

- [ ] **Step 2: Preview the update**

Call `save_action` with `actionId: 90333`, the current `version` from Step 1, and `command` set to the **full** new body from spec §7.1 (validation logic + the untouched `buildParameter()` from Step 1 appended, verbatim). Do not pass `confirm`.

Double-check the preview's diff view shows only the intended changes (new `tipoAlta`/`SYSTEMCS` logic added, `buildParameter()` identical to before) — if the diff shows anything else changed unexpectedly, stop and investigate before proceeding.

- [ ] **Step 3: Show the preview to the user, wait for explicit approval.**

- [ ] **Step 4: Confirm**

Re-run with `confirm: true`.

- [ ] **Step 5: Verify**

`get_action_command(90333)` again, confirm the stored body matches exactly what was sent in Step 2.

---

## Task 4: Add the new flow steps to flow 64506 (MANUAL — masros-gui visual editor)

**This step cannot be done via `ros-ai-mcp`.** `save_flow_steps` explicitly refuses to run against a flow that already has any steps (Phase 8 design §3/§5.4 of `ros-ai-mcp`'s own docs) — flow 64506 has 23. Adding steps to an *existing* flow's tree has to be done by hand in masros-gui's visual flow editor.

- [ ] **Step 1: Read the exact current tree once more immediately before editing**

Call `get_flow_steps(64506)` right before starting the manual edit (not relying on this session's earlier read) — confirm no one else changed the flow in the meantime, and get the exact current `stepId`s to anchor the new nodes onto.

- [ ] **Step 2: Give the user (or whoever does the manual edit) the exact checklist**, derived from spec §6's topology (final shape depends on Task 0.2's answer):

For each new node, specify: which existing step it attaches after, the exact `actionCode` (for the two new/reused actions) or `decisionCriteria` (for the two new `INLINEDEC` nodes: `tipoAlta=="POSTPAGO"` and `tipoAlta=="LOCUCION"`), and which existing downstream step it should reconnect to. Do not improvise field names not already confirmed in the spec.

- [ ] **Step 3: After the manual edit, read it back**

Call `get_flow_steps(64506)` again and diff the full tree against the intended shape from spec §6. Confirm nothing among the original 23 steps was altered (same `stepId`s, same `actionId`s, same `decisionCriteria` on the untouched nodes).

---

## Task 5: Live verification, one item per `tipoAlta`

**Tool:** `get_item_info` / `analyze_item` (read-only — the actual item execution itself happens by running a real or throwaway service order through the flow, outside `ros-ai-mcp`, e.g. via the flow's REST route or a test job).

- [ ] **Step 1:** For each of `AltaPostpago`, `AltaPre`, `AltaPorta`, `AltaLocu`, run one item through flow 64506 (coordinate with the user on how — real test data or a throwaway payload).
- [ ] **Step 2:** For each item, call `get_item_info`/`analyze_item` and confirm:
  - The right steps executed for that category (RESERVAR LINEA only for Postpago; DATOS SOM/INVENTARIO skipped only for Locución; CS chain only for Portada/Locución, never for Postpago or Prepago).
  - No step among the original 23 misbehaved.
- [ ] **Step 3:** Report results back to the user per category — do not declare this plan complete until all 4 have been checked, per this project's standing "no live-write phase is proven until actually exercised" discipline.

---

## Task 6: Commit `get_action_parameters` in `ros-ai-mcp` (independent of Tasks 1-5)

**Only if the user now wants to commit** (they explicitly deferred this earlier this session).

- [ ] **Step 1:** Ask again — do not assume a prior "not yet" still holds.
- [ ] **Step 2:** If yes, `cd C:\Users\52554\Documents\ros-ai-mcp && git add src/rosClient/types.ts src/tools/getActionParameters.ts src/server.ts test/tools/getActionParameters.test.ts test/server.test.ts && git commit` with a message describing the new read-only tool.
- [ ] **Step 3:** Ask separately whether to also sync the change into the vendorized copy at `subscriptionManager/tools/ros-ai-mcp/` (per this project's established master-then-sync convention) — do not do this silently.

---

## Deferred, not part of this plan's completion

- Real implementation of `SOM_OBTENER_PARAMETROS_TECNICOS` and `RESOURCE_INVENTORY_UPDATE` — blocked on real schema/domain/auth data (spec §9.2/§9.3). When that data arrives, repeat Task 1's shape (preview → approve → confirm → verify) for each.
- The orphaned OUT parameters on `OBTIENE_CM_IMSI_HRLUD` (spec §9.4) and the unrelated dead code in 90333's `buildParameter()` (spec §9.5) — explicitly out of scope, not touched by this plan.

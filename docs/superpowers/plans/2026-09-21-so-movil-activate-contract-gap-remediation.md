# Service Ordering - Movil - Activate Contract — Gap Remediation Implementation Plan

> **Execution note:** this is not a software plan with unit tests — it's a sequence of real ROS writes (via `ros-ai-mcp`'s `save_action`, gated by `ROS_MCP_ENABLE_WRITE=true`, already on) plus one manual step in masros-gui's visual editor (adding steps to an *existing* flow is out of scope for `save_flow_steps` — it refuses to run against a flow that already has steps). Execute this **inline, one task at a time**, not via `subagent-driven-development`/`executing-plans` (those assume autonomous code-writing + git commits; here every write is a real, irreversible-ish change to ROS DEV that needs the user's explicit `confirm:true` go-ahead at each step). Do not batch multiple `confirm:true` calls without showing the preview first, per this project's standing discipline.

**Goal:** Wire the missing SP/Function/REST steps into flow 64506 (`S_O_ACTIVATE_CONTRACT`) for all 4 alta processes, correct `SYSTEMCS`'s scope, and create the new supporting Actions — per the approved design in `docs/superpowers/specs/2026-09-21-so-movil-activate-contract-gap-remediation-design.md`.

**Architecture:** New Groovy actions created via `save_action` (preview → review → `confirm:true`). The existing validation action (90333) updated the same way. Flow step wiring done manually in masros-gui (no ros-ai-mcp tool covers editing an existing flow's step tree). SOM/Inventory actions stay prototypes, not created for real, until Task 0's open question is resolved with real data.

**Tech Stack:** `ros-ai-mcp` MCP tools (`save_action`, `get_action`, `get_action_parameters`, `get_flow_steps`), masros-gui (manual step-tree edit), ROS DEV only — never production.

## Global Constraints

- Every `save_action` call runs preview-only first (no `confirm:true`); the preview is shown to the user and **only re-run with `confirm:true` after they explicitly approve it**, one action at a time — never batch multiple confirms.
- `SOM_OBTENER_PARAMETROS_TECNICOS` and `RESOURCE_INVENTORY_UPDATE` are **not created for real** in this plan — they stay design-only prototypes until real schema/domain/auth data exists (spec §9.2/§9.3). Tasks 1-2 below only cover the two actions with fully-confirmed real signatures (`RESERVAR_LINEA_GROOVY`, `ALTA_IMSI_GROOVY`).
- Nothing in flow 64506's **existing** 23 steps is deleted, replaced, or reordered — only new steps are inserted, per the topology in the spec's §6.
- Task 0's two design questions (gate shape, reuse-vs-new-Groovy) are already resolved (see Task 0) — Tasks 1-4 below reflect those answers directly, no more conditionals.
- `get_action_parameters` (built and tested in `ros-ai-mcp`, not yet committed) is **not required** to be committed before this plan proceeds — it already works from source (`npm run build` output is what the running MCP process loads). Task 6 covers committing it, independent of the rest.

---

## Task 0: Resolve the two open design questions before touching ROS — DONE (2026-09-21)

**Resolved:**
1. Create the new Groovy actions (`ALTA_IMSI_GROOVY`, `RESERVAR_LINEA_GROOVY`) — not a reuse of the existing PROCEDURE actions. Tasks 1-2 proceed unconditionally.
2. Two separate `¿Es Locución?` gates, preserving the Excel's literal order (DATOS SOM before InstantLink, INVENTARIO after) — not the single-gate version.

Both recorded in the spec's §6/§9 (updated in place, same commit history).

---

## Task 1: Create `RESERVAR_LINEA_GROOVY`

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

## Task 2: Create `ALTA_IMSI_GROOVY`

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

- [ ] **Step 2: Follow this exact checklist** (final shape per spec §6, post-Task 0):

**Rama Y (Prepago puro, hoy termina en `ES` tras la Notificación) — insertar, en orden:**
  1. Action `ALTA_IMSI_GROOVY` (nueva) — insertar como el primer paso de la rama, antes de lo que hoy es el primer `INFLOW` a `INSTANTLINK_BSCS9`.
  2. Action `SOM_OBTENER_PARAMETROS_TECNICOS` (prototipo — **no crear/wirear todavía**, ver Deferred) — se saltea esta inserción hasta que el prototipo tenga datos reales.
  3. (sin cambios) `INFLOW → INSTANTLINK_BSCS9 → OUTFLOW`
  4. Action `RESOURCE_INVENTORY_UPDATE` (prototipo — **no crear/wirear todavía**, ver Deferred) — se saltea igual que el punto 2.
  5. (sin cambios) `INFLOW → SERVICE_ORDERING_PROVISIONING_NOTIF → OUTFLOW → ES`

  *(Nota: con SOM/Inventario diferidos, lo único que se agrega realmente a la rama Y en esta pasada es `ALTA_IMSI_GROOVY` al principio.)*

**Rama N (Postpago/Portada/Locución, después del nodo `CS?` existente, paso 9):**
  1. `INLINEDEC "¿Es Postpago?"` — `decisionCriteria: tipoAlta=="POSTPAGO"`
     - Rama Y: Action `RESERVAR_LINEA_GROOVY` (nueva)
     - Rama N: nada (converge directo)
  2. Action `ALTA_IMSI_GROOVY` (la misma reutilizada de la rama Y, o una segunda inserción del mismo `actionCode` — confirmar en masros-gui si el editor permite reusar el mismo actionId en dos steps distintos del mismo flujo antes de asumirlo)
  3. `INLINEDEC "¿Es Locución?"` (gate 1) — `decisionCriteria: tipoAlta=="LOCUCION"`
     - Rama Y: nada (salta DATOS SOM)
     - Rama N: Action `SOM_OBTENER_PARAMETROS_TECNICOS` (prototipo — **diferir**, ver Deferred)
  4. (sin cambios) `INLINEDEC "IL?"` existente (paso 18) → `INSTANTLINK_BSCS9` si Y
  5. `INLINEDEC "¿Es Locución?"` (gate 2) — mismo criterio que el gate 1
     - Rama Y: nada (salta INVENTARIO)
     - Rama N: Action `RESOURCE_INVENTORY_UPDATE` (prototipo — **diferir**, ver Deferred)
  6. (sin cambios) `INFLOW → SERVICE_ORDERING_PROVISIONING_NOTIF → OUTFLOW → ES` existente (paso 21 en adelante)

**Con SOM/Inventario diferidos, el alcance real de esta pasada de Task 4 es:** agregar `ALTA_IMSI_GROOVY` a ambas ramas, agregar el gate `¿Es Postpago?` + `RESERVAR_LINEA_GROOVY` a la rama N, y dejar los 2 gates `¿Es Locución?` creados pero con su rama N vacía (sin acción todavía) hasta que SOM/Inventario se implementen de verdad — no dejar el gate sin crear, para no tener que re-tocar el árbol dos veces.

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

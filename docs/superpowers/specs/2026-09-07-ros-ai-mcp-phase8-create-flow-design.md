# ros-ai-mcp Phase 8 — Flow Creation Design

## 1. Goal

Add write capability to `ros-ai-mcp` to create a brand-new ROS flow (header + step tree) end-to-end, so a designed flow (e.g. "Service Activator - Movil - Baja Servicios Locucion", designed by analogy to an existing flow) can be assembled directly through the MCP server instead of being built by hand in masros-gui's visual flow editor.

This is explicitly scoped to **creating new flows only** — never editing the step tree of an existing flow. See §3 (Scope) for why.

## 2. Background

`ros-ai-mcp` already has two write tools, both following the same pattern: preview by default, execute only with `confirm:true`, gated by `ROS_MCP_ENABLE_WRITE`.

- `save_action` (Phase 5) — creates/updates a single ROS action (`POST /actionDetail/saveAction`).
- `execute_flow` (Phase 6) — schedules a mass-scheduler job for an existing flow (`ros-rest`'s `POST /job`).

Creating a flow's step tree was explicitly deferred out of both of those phases (recorded as "saveFlowDetail / flow-import, deferred to a future phase"), because — unlike a single action — a flow's step tree has real graph structure (parent/child, decision branches, subflow calls), and getting that wrong silently produces a broken or uninvokable flow. Before designing anything here, the real contract was verified by reading ROS source directly (`C:\Users\52554\Documents\masros\ros5\`, the active checkout) across three areas: the flow-header save endpoint, the step-tree save endpoint, and the flow editor's frontend (which is the actual ground truth for how a correct payload is assembled, since large parts of step semantics live only in client-side JS, not in the Java DTOs). Findings below are cited with file:line where available.

## 3. Scope

**In scope (v1):**
- Creating a new flow header (`create_flow`).
- Creating the step tree for a flow that was just created and has zero existing steps (`save_flow_steps`).
- Step vocabulary: plain action step, binary (Y/N) inline decision, subflow call (with automatic `INFLOW`/`OUTFLOW` pairing), end/success.

**Out of scope (v1), deferred until an actual need arises:**
- Editing the step tree of a flow that already has steps. `saveFlowStep` is a **whole-tree replace** (§5.2) — every save deletes and re-numbers all existing steps. Doing this against a live flow risks destroying a working flow if the caller's tree omits anything, and there is no per-row optimistic lock to catch partial drift (only one shared `modDate` for the whole flow). `save_flow_steps` in this design refuses to run against a flow that already has any steps (§6.2) rather than attempt a safe "diff and preserve" path that hasn't been designed.
- `updateFlowStepConfig` (incremental config-only edits to existing steps — `bypass`/`syncStep`/`ymlConfig`/`flowActionDes` without touching topology).
- N-way switch steps (`INLINESWTH`), parallel split (`INSPLIT`/`OUTSPLIT`), multiply/iterate (`INMLTPL`/`OUTMLTPL`, `INMLTPLFLOWS`/`OUTMLTPLFLOWS`), function-style subflows (`SP_FUNCT_IN`/`SP_FUNCT_OUT` with `INPUT`/`OUTPUT` mapping), timer waits (`TIMER`), independent/fire-and-forget subflows (`INDPNDFLOW`).
- Flow routing customization beyond ROS's own default (`attachDefaultRouting` auto-creates `POST /ros_<camelCaseFlowCode>Service` when `rosFlag=Y` — see §5.1 — v1 does not let a caller specify a custom route).
- YAML flow import (`checkYMLFileImportDiff`/`executeImportFlow`) — unrelated mechanism, still fully out of scope per prior phases.

Adding any of the above later is additive (new step `kind`s in the same DSL, or a new tool) — nothing in this design forecloses it.

## 4. Verified contracts

### 4.1 `POST /saveFlowDetail` (flow header)

`FlowController.java:243-337` (`masros-gui/src/main/java/org/skink/mass/web/controller/flow/FlowController.java`), body is a typed DTO, `FlowDetailForm` — **not** an untyped map, unlike everything else written so far in this project.

Key fields relevant to v1 (full field list is larger — see the investigation notes for the complete `FlowDetailForm`/`FlowInfo` diff — these are the ones `create_flow` exposes):
- `flowId` — `-1` sentinel means create. Any other value is out of scope (v1 never updates a flow header).
- `flowCode`, `flowDes`.
- `activeFlag`, `massFlag`, `rosFlag`, `eagerFlag`, `inMemory`, `dbReprocessFlag` — booleans.
- `flowGroups` — `List<Long>` of flow-group ids (not names; resolve via `get_flow`'s `availableFlowGroup` list or a future `search`, same pattern as resolving action codes).
- `onCancelAction` / `onCancelAllAction` — optional `{actionId, force}`.
- `jobProcessedAction` / `jobFinishedAction` — optional action ids.
- `emailNotification` — optional string.

Confirmed **not** client-settable: `syncBy` is hardcoded `"NONE"` server-side (`FlowController.java:272`); `priority` is hardcoded `10L` (`FlowController.java:275`). `create_flow`'s input schema simply omits these rather than accepting-and-ignoring them.

**Create semantics**: app-level uniqueness check on `flowCode` (throws a plain, non-localized `SkException` if it already exists), plus a reserved-word check — `flowCode` cannot be the literal string `Dynamic` (`DYNAMIC_SWITCH_FLOW_CODE`). Server force-sets `version = 1` on create; client-supplied `version` is ignored.

**Response**: does **not** return the saved flow. `requestData` is the caller's refreshed `userFlows` session list. The new `flowId` is only recoverable from `successMessage`'s trailing `": <id>"` substring, or by a follow-up call. `create_flow` must not rely on string-parsing alone — it parses the trailing id, then **verifies** it via `search_flows` by the same `flowCode` (falls back to that if parsing fails or looks wrong) before reporting success.

**Side effects** (synchronous, inside the same HTTP request): `RosFlowHist` audit row; if `rosFlag=Y`, a default REST route is auto-created (`attachDefaultRouting` — `POST /ros_<camelCaseFlowCode>Service`, `RoutingDomain.SINGLE`, `AuthorizationType.NONE`); cache invalidation broadcast to other ROS cluster nodes via JGroups (`RosCacheService.java:1224-1235`) — same mechanism already documented for `save_action`, not node-local.

**Unverifiable** (external `skink-gui`/`skink-common` jars not present in this checkout, consistent with every prior phase's caveat): the exact framework-level optimistic-lock SQL; whether any permission check beyond "has a session" gates this endpoint (no explicit check found inside `saveFlowDetail` itself — `FLOWEDIT` permission is only checked in the page-load handler for the UI's "canCreate" flag).

### 4.2 `POST /saveFlowStep` (step tree)

`FlowStepController.java:108` → `FlowProcessor.saveFlowSteps` (`FlowProcessor.java:197-283`). Body is an **untyped map**: `{ flowId, version, modDate, flowSteps: [...] }`.

**This is a whole-tree replace, not incremental CRUD.** Every call does an unconditional `DELETE ... WHERE FLOW_ID=?` against the live steps table, then re-inserts every element of `flowSteps` fresh, all sharing one new `version = MAX(existing version)+1`. `ROS_FLOW_STEP_HIST` is the append-only archive; `ROS_FLOW_STEP` only ever holds the current version.

**Concurrency guard**: not per-row. The client must send back the `modDate` it last read (surfaced only on the *first* element of a `getFlowStepInfo` response, as `modDateYmls`). Server compares it against `MAX(MOD_DATE)` in `ROS_YML_HIST` for that flow's step scope; a mismatch throws the same `tool.alertRecVersion` error used everywhere else. **For a brand-new flow** (v1's only supported case), the client sends `version: 0`; the server additionally guards this case — if the "delete existing steps" step unexpectedly deletes more than 0 rows despite `version:0`, it throws the same alert (meaning: something already put steps on this flow between `create_flow` and `save_flow_steps`, which v1 treats as a hard stop, see §6.2).

**Tree structure — assigned by the client, not the server.** The real editor (`flow_steps_rappid.js:882-1260`) does a DFS over its visual graph starting at an implicit root, assigning `stepId` as a plain incrementing integer from 1 and passing the parent's freshly-assigned `stepId` down as each child's `parentStepId`. The server just stores whatever `parentStepId`/`stepId`/`decision` it's given (`BeanUtils.populate`) — there is no independent graph validation found server-side. **`save_flow_steps` must replicate this numbering itself** rather than let the caller supply arbitrary ids (§5.2 below).

**Fields that are not real DB columns**: `decisionCriteria`, `flow` (subflow reference), `switchPropertyPath`, `multiplyArrProp` are all persisted through a generic YML key-value store (`ymlConfig[<ownFlowCode>].<KEY>`, e.g. `DECISION_CRITERIA`, `FLOW_CODE`), not as columns on the step row, and are only rehydrated onto the read-side DTO by `FlowProcessor.setFlowStepAdditionalConfig`. Subflow references are wired **by `flowCode` string**, not `flowId`.

**Write/read field-name asymmetry**: `bypass`/`syncStep` on read become `_bypass`/`_syncStep` (underscore-prefixed) on write. Easy to miss since it's invisible from the Java side — only visible in the frontend JS's literal request-object construction.

**Universal action codes** (`INFLOW`, `OUTFLOW`, `INLINEDEC`, `ES`, etc. — full list in `RosCoreAction.java:3-25`) are resolved by `actionCode` string, both client- and server-side — never a fixed numeric `actionId`. `search_actions`/an exact-code lookup is how `save_flow_steps` resolves them, same as any other action. **`TM_ST` is not scaffolding** — it's an ordinary action like any other, found by the same code-resolution path, not a framework constant.

**Subflow auto-pairing**: the real editor auto-injects the closing `OUTFLOW` step immediately after every subflow-call (`sk.flow`) step, chaining `parentStepId` through it (`flow_steps_rappid.js:1240-1258`). `save_flow_steps`'s `subflow` DSL kind (§5.1) replicates this exactly — the caller writes one `subflow` entry, the tool emits two wire steps.

**Client-side validations replicated** (§5.3) — the editor enforces ~15 checks before ever submitting (single root, decision branches can't target the identical first step, every non-terminal node needs exactly one outbound path, no self-recursive subflow call, etc.). These are **not confirmed to be re-checked server-side** — sending a structurally broken tree may succeed at the HTTP layer and only surface as a broken flow at execution time. `save_flow_steps` treats client-side validation as mandatory, not optional.

**Side effects**: cache invalidation + `refreshActionsById`; if the flow is flagged eager, `FlowEagerOperation.afterSaveSteps()` re-walks the whole new tree to recompute which actions need the eager flag (a genuine recomputation triggered by topology, not just a cache bump); `RosFlowStepHist` audit rows.

## 5. Tool design

### 5.1 `create_flow`

Wraps `POST /saveFlowDetail` with `flowId: -1`. Input:

```
flowCode: string
flowDes: string
massFlag, rosFlag, activeFlag, eagerFlag: boolean (defaults: massFlag=true, rosFlag=true, activeFlag=true, eagerFlag=false — matches the pattern of the flows read so far in this family)
flowGroups?: number[]
onCancelAction?: { actionId: number, force?: boolean }
onCancelAllAction?: { actionId: number, force?: boolean }
emailNotification?: string
confirm?: boolean
```

Preview (no `confirm`): calls `search_flows` for the given `flowCode`; if a flow with that code already exists, returns an error-shaped preview rather than a green light (mirrors ROS's own uniqueness check, but surfaced before spending a write attempt). Also rejects `flowCode === "Dynamic"` client-side, matching the server's reserved-word check. Preview response shows exactly what will be sent (mapped to `FlowDetailForm` field names) and calls out that `syncBy`/`priority` are server-fixed, not caller-controlled.

`confirm:true`: POSTs, then resolves the real `flowId` — parses `successMessage`'s trailing `: <id>`, and **always** cross-checks it with a `search_flows` lookup by the same `flowCode` before returning (belt-and-suspenders, since the response shape here is thinner than `save_action`'s). Returns `{ flowId, flowCode, warnings: [...] }`. If `rosFlag:true`, the response notes that ROS auto-created a default route (`POST /ros_<camelCaseFlowCode>Service`) — informational, not something the caller chose.

### 5.2 `save_flow_steps`

Wraps `POST /saveFlowStep`. Input:

```
flowId: number
steps: StepNode[]   // see DSL below
confirm?: boolean
```

`StepNode` (the simplified DSL — never the raw wire format):

```
{ kind: "action", actionCode: string, des?: string, ymlConfig?: object }
{ kind: "decision", criteria: string,               // Groovy boolean expression → INLINEDEC + DECISION_CRITERIA
  yes: StepNode[], no: StepNode[] }
{ kind: "subflow", flowCode: string, ymlConfig?: object }   // INFLOW(FLOW_CODE=...) + auto OUTFLOW
{ kind: "end" }                                     // ES
```

Each `StepNode` chains to the next one in its containing array (implicit linear `parentStepId` chaining); `decision.yes`/`decision.no` each start a new branch off the decision step, matching the real editor's "both branches share the decision's own stepId as `parentStepId`, disambiguated by `decision: Y/N`" model.

**Algorithm** (mirrors `getFromStepToEnd`, `flow_steps_rappid.js:937` on, in TypeScript instead of the browser's DFS-over-JointJS-graph):
1. Walk the caller's `steps` tree, assigning `stepId` as a sequential counter starting at 1, `parentStepId` chained from the previous node (root's `parentStepId = 0`).
2. For every `action`/`subflow` step, resolve `actionCode` via an exact-code lookup (reusing the existing action-search machinery) — hard-fail with a clear "actionCode X not found" error if it doesn't resolve, never silently drop or guess.
3. For every `subflow` step, resolve `flowCode` via `search_flows` (must exist and be a real flow), then emit two wire steps: the `INFLOW`-coded step carrying `ymlConfig[ownFlowCode].FLOW_CODE = <target flowCode>` (`ownFlowCode` is the `flowCode` of the flow being assembled, i.e. the value passed to `create_flow`, not the subflow being called), immediately followed by an `OUTFLOW`-coded step chained through it — exactly the auto-pairing the real editor performs.
4. For every `decision` step: emit the `INLINEDEC`-coded step carrying `ymlConfig[ownFlowCode].DECISION_CRITERIA = criteria`, then recurse into `yes` (tagged `decision: "Y"`) and `no` (tagged `decision: "N"`), both chained with `parentStepId` = the decision step's own `stepId`.
5. Map `bypass`/`syncStep` (not exposed in v1's DSL — always default/omitted) to `_bypass`/`_syncStep` if ever added later; not needed for v1's minimal vocabulary.
6. `end` emits the `ES`-coded step with no children.

### 5.3 Validations (replicated from the real editor, enforced before any HTTP call)

- Exactly one root step (the first element of the top-level `steps` array) — trivially true given the DSL shape, but a `steps: []` input is rejected outright ("no start").
- Every branch of every `decision` must terminate — i.e. every leaf of the whole tree must be an `end` step. Rejected otherwise ("grid.alertNoEnd" equivalent).
- A `decision`'s `yes` and `no` arrays must not resolve to sharing an identical first step by both id and content — practically, this can't happen given the DSL always allocates fresh nodes per branch, but the check is kept as a defensive assertion, not skipped as "impossible by construction."
- Every `actionCode`/`flowCode` referenced must resolve to a real, existing ROS action/flow (§5.2 step 2-3) — never silently create a placeholder.
- No self-recursive `subflow` call — a `subflow` step's `flowCode` must not equal the flow currently being assembled (`flow.notRecursive` equivalent).

### 5.4 Safety guard specific to `save_flow_steps`: existing-steps refusal

Before doing anything else, `save_flow_steps` calls `get_flow_steps` (the existing read tool) for the target `flowId`. If it returns any steps at all, the tool refuses with a clear error ("this flow already has N step(s); save_flow_steps only supports assembling a brand-new flow's tree — editing an existing flow's steps is out of scope, see Phase 8 design §3") rather than attempting the replace. This is the single most important guardrail in this design, given `saveFlowStep`'s delete-everything-then-reinsert behavior has no built-in "are you sure this is really new" check beyond the `version:0`-vs-"0 rows deleted" guard (§4.2), which only catches a race, not a caller mistakenly pointing this tool at a live flow.

### 5.5 Preview / confirm

Same convention as `save_action`/`execute_flow`: without `confirm:true`, `save_flow_steps` runs steps 1-6 of the algorithm (§5.2) and the existing-steps check (§5.4), then returns the fully-resolved wire-format tree (real `actionId`s, real `stepId`/`parentStepId` numbering) as a preview — nothing is sent to ROS. With `confirm:true`, the same resolution runs again (never trust a stale preview — ROS state could have changed) immediately before the real POST.

### 5.6 Orphaned-header risk

`create_flow` succeeding and `save_flow_steps` never being called (or failing) leaves a flow header with zero steps sitting in ROS — there is no cross-tool transaction or automatic rollback. `create_flow`'s response text explicitly says this and recommends immediately following up with `save_flow_steps` in the same working session. This is a documented, accepted risk (not solved by this design) — the mitigating factor is that `create_flow` defaults `activeFlag` in a way the caller controls, so a caller who wants extra safety can create inactive and flip it on later (out of scope for v1 to automate — that would be a flow-header **update**, which this phase doesn't do).

## 6. Testing

Follows the project's established pattern: unit tests against fake ROS clients for every branch (create success, `flowCode` collision, reserved-word rejection, `flowId` parse-then-verify fallback path, `save_flow_steps`'s existing-steps refusal, actionCode/flowCode resolution failures, decision/subflow DSL-to-wire-format expansion, the `_bypass`/`_syncStep` underscore mapping if/when exposed). Both tools are new, so no regression surface on Phases 1-7. Per this project's standing rule, **no live write test is treated as proof of correctness** until actually exercised against a real throwaway flow in ROS DEV, the same discipline that caught two real defects in Phase 5 that 120 passing fake-client tests had missed.

## 7. Open questions carried into the implementation plan

- Exact TypeScript shape for reusing the action/flow **code**-resolution logic — should reuse `search_actions`/`search_flows`, not reimplement lookups.
- Whether `flowGroups` needs its own resolution helper (id-only in the write contract; the read side's `availableFlowGroup` list is the only place names are exposed) — likely just pass through ids the caller already has from a prior `get_flow`/`search_flows` call, no new tool needed for v1.
- Confirming the exact `modDate`/`version:0` request shape for `save_flow_steps` in Node (only ever tested from the real browser client so far) — flagged for live verification (§6), consistent with how Phase 5/6 each found a real gap between "passes fake-client tests" and "works against real ROS."

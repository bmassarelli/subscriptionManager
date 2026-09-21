# ros-ai-mcp Phase 9 — Custom Flow Routing Design

## 1. Goal

Let `create_flow` set a custom HTTP route (`urlExp`) for the new flow's REST endpoint, instead of always being stuck with ROS's auto-generated default (`/ros_<camelCaseFlowCode>Service`). The user's team follows their own naming convention for exposed routes — a fixed prefix (`/tros-api-`) plus a name characteristic of the flow (e.g. `/tros-api-bajaServiciosLocucion`) — and today the only way to get that is to create the flow, then manually edit the auto-generated route by hand in masros-gui afterward. This closes that gap.

This was explicitly called out as out of scope in Phase 8 (`2026-09-07-ros-ai-mcp-phase8-create-flow-design.md`, §3: "`create_flow` v1 does not let a caller specify a custom route") and confirmed as a real, repeated pain point in practice — the Baja Servicios Locucion flow (Phase 8's own worked example) and a "Service Ordering - Movil - APN Personalizado" flow both needed this same manual fix-up after creation.

## 2. Background

`create_flow` (Phase 8) wraps `POST /saveFlowDetail`. When `rosFlag:true`, ROS's `FlowOperation.attachDefaultRouting()` (`masros-gui/.../operation/admin/FlowOperation.java:304-348`) runs inside that same request and inserts a `RosFlowRouting` row with `urlExp = "/ros_" + toLowerCammelCase(flowCode) + "Service"`. This is confirmed dead-end for customization: `FlowDetailForm` (the DTO `saveFlowDetail` accepts) has no routing/path field at all — routing lives in a completely separate table and a completely separate controller, `FlowRoutingController` (`POST /rosFlowRoutingExecute`).

`FlowRoutingController` extends a generic `CRUDBaseController<RosFlowRouting>` from an external `skink_gui` jar not present in the local `masros/ros5` checkout — the same class of "can't verify from source alone" gap this project has hit before (`org.skink.common.*`). Per the user's explicit choice this session ("captura de red real primero"), the wire contract was resolved empirically instead of by guessing: a real create and a real edit were performed against the routing grid in masros-gui (Routing tab of a flow's detail page), against real ROS DEV, using the existing throwaway flow `ZTEST_JYANEZ_PHASE8_CREATEFLOW` (flowId **64505** in this environment — flowIds are environment-specific, don't hardcode across environments). Both writes were captured by injecting a wrapper around this app's `$.ajax` calls (it's a jQuery/Bootstrap admin app, not Angular/SPA, for this part — confirmed by reading `skBootstrap.js` directly) and are cited verbatim in §4.

## 3. Scope

**In scope (v1):**
- `create_flow` gains two new optional inputs: `routingPath` (explicit full path override, e.g. `/tros-api-bajaServiciosLocucion`) and an auto-suggested default when `routingPath` is omitted (§5.3).
- Only applies when the resolved `rosFlag` is `true` (the only case where ROS auto-creates a routing row to begin with).
- Only the `urlExp` field is ever changed. Every other routing field (`domain`, `httpMethod`, `authorizationType`, `httpResponseSuccess`, `httpResponseError`, the 8 SOAP fields) is read back from the just-created row and re-sent unchanged — never guessed, never defaulted.

**Out of scope (v1), deferred until an actual need arises:**
- `rosFlag:false` flows. No routing row exists to update in this case (`attachDefaultRouting` only runs when `rosFlag:true`), and nobody has asked for a route on a non-ROS flow. A `routingPath` passed alongside `rosFlag:false` is rejected with a clear warning in the preview, not silently ignored.
- Any routing field other than `urlExp` (custom `httpMethod`, `domain`, SOAP mapping, auth type). Nothing about this design prevents adding that later as more optional inputs on the same tool.
- Editing the routing of an existing flow that wasn't just created by this same `create_flow` call (i.e. no standalone `set_flow_routing` tool for arbitrary flows — see §7, this was considered and explicitly deferred per the user's own choice this session).
- Multiple routing rows per flow. ROS supports this (confirmed empirically, §4.3 — a flow can have one `POST` route and one `GET` route, for example), but `create_flow` only ever manages the single default row ROS itself created.

## 4. Verified contracts

### 4.1 `POST /rosFlowRoutingExecute` — create (`action=save`)

Body is `application/x-www-form-urlencoded`, **not JSON** (unlike `saveFlowDetail`/`saveFlowStep`) — confirmed by capturing the real request this session:

```
action=save
fields['domain'].value=SINGLE
fields['httpMethod'].value=GET
fields['urlExp'].value=/tros-api-ztestJyanezPhase8-get
fields['authorizationType'].value=NONE
fields['httpResponseSuccess'].value=200
fields['httpResponseError'].value=400
fields['soapHeaderReqNamespace'].value=
fields['soapHeaderReqProperty'].value=
fields['soapBodyReqNamespace'].value=
fields['soapBodyReqProperty'].value=
fields['soapHeaderResNamespace'].value=
fields['soapHeaderResProperty'].value=
fields['soapBodyResNamespace'].value=
fields['soapBodyResProperty'].value=
fields['flowId'].value=<flowId>
```

Note the literal single-quotes inside the bracket (`fields['domain']`, not `fields[domain]`) — this is really how the client sends it, not a transcription artifact (confirmed by decoding the raw captured body twice). No `routingId`/`version`/`userName`/`modDate` on create — the server fills those in (`beforeSaveHook`/`completeData`, `FlowRoutingController.java:115-125`, already read from source in the earlier investigation pass).

### 4.2 `POST /rosFlowRoutingExecute` — update (`action=update`)

Same URL, a **different field prefix** (no quotes) and the action parameter trails at the end instead of leading:

```
updateFields[routingId].value=<existing routingId>
updateFields[flowId].value=<flowId>
updateFields[domain].value=SINGLE
updateFields[httpMethod].value=POST
updateFields[urlExp].value=/tros-api-yourNewPath
updateFields[authorizationType].value=NONE
updateFields[httpResponseSuccess].value=201
updateFields[httpResponseError].value=400
updateFields[soapHeaderReqNamespace].value=
updateFields[soapHeaderReqProperty].value=
updateFields[soapBodyReqNamespace].value=
updateFields[soapBodyReqProperty].value=
updateFields[soapHeaderResNamespace].value=
updateFields[soapHeaderResProperty].value=
updateFields[soapBodyResNamespace].value=
updateFields[soapBodyResProperty].value=
updateFields[version].value=<current version, numeric — optimistic lock>
updateFields[modDate].value=2026/09/21 11:34:38
updateFields[userName].value=<ROS username>
action=update
```

**Confirmed twice** (two separate live edits, same asymmetry both times): create uses `fields['x']` with quotes and no `routingId`/`version`; update uses `updateFields[x]` without quotes and requires both. This is a real, structural difference in the CRUD framework's own wire format, not a bug to normalize away — `ros-ai-mcp` must build the two request bodies differently, not share one body-builder with a flag.

**All fields required on update, none optional.** `beforeUpdateHook`/`completeData` (`FlowRoutingController.java:127-143`, read from source) show the server does not merge — whatever isn't sent is not preserved. This is the same "merge fully client-side before sending" safety property already established for `save_action` (Phase 5) and is the main reason `create_flow`'s new logic must read the row back before updating it (§5.2, step 2).

**`modDate` format**: `YYYY/MM/DD HH:mm:ss`, client-supplied. Not independently confirmed whether the server trusts this value or overwrites it server-side before persisting — treated as "send current timestamp in this format," not verified further; low risk since it's an audit field, not something read back to make decisions.

### 4.3 The "search" (read) call — how to get the existing row's `routingId`/`version`

Also captured live, a third distinct shape (`action=search`):

```
action=search
fields['domain'].value=
fields['httpMethod'].value=
fields['urlExp'].value=
fields['authorizationType'].value=
fields['httpResponseSuccess'].value=
fields['httpResponseError'].value=
fields['soapHeaderReqNamespace'].value=
fields['soapHeaderReqProperty'].value=
fields['soapBodyReqNamespace'].value=
fields['soapBodyReqProperty'].value=
fields['soapHeaderResNamespace'].value=
fields['soapHeaderResProperty'].value=
fields['soapBodyResNamespace'].value=
fields['soapBodyResProperty'].value=
fields['flowId'].value=<flowId>
pageNumber=1
pageSize=20
```

All `fields[...]` empty except `flowId` acts as a filter-by-flow. Response envelope matches the same `{errorMessage, successMessage, redirect, responseStatus, requestData}` shape already handled elsewhere in this codebase (`RequestPaginationData`-style) — `requestData` here is the paginated row list, from which `routingId` and `version` (and every other current field value) are read.

**Multiple rows confirmed possible**: the same flowId (64505) was left, deliberately, with two routing rows after this session's testing — one `POST /tros-api-ztestJyanezPhase8v4` and one `GET /tros-api-ztestJyanezPhase8-get`. `create_flow`'s update logic (§5.2) must therefore not assume "exactly one row" blindly — it should target the row matching the `httpMethod`/`domain` ROS itself just auto-created (`POST`/`SINGLE`, always, per `FlowOperation.createDefaultRouting`), not just "the first row returned."

## 5. Tool design

### 5.1 `create_flow` input changes

```
routingPath?: string   // full custom path, e.g. "/tros-api-bajaServiciosLocucion" — explicit override, highest priority
confirm?: boolean       // unchanged, already exists
```

No new required input. Everything else about `create_flow` (§5 of the Phase 8 design) is unchanged.

### 5.2 Execution flow (only when resolved `rosFlag` is `true`)

1. `saveFlowDetail` runs exactly as it does today (Phase 8, unchanged) → real `flowId` resolved and verified the same way (parse `successMessage`, cross-check via `search_flows`).
2. Read back the routing row ROS just auto-created: `action=search` filtered by `flowId`, find the row with `httpMethod:"POST"`/`domain:"SINGLE"` (matching `createDefaultRouting`'s own hardcoded defaults — `FlowOperation.java:315-320`). If no matching row is found (shouldn't happen when `rosFlag:true`, but the auto-routing is a separate write inside the same transaction and isn't independently guaranteed here), treat this as a partial-success case (§5.5) rather than silently skipping the custom path.
3. Compute the desired `urlExp`:
   - If `routingPath` was given, use it verbatim (no validation beyond "starts with `/`" — the caller is trusted the same way `flowCode`/`flowDes` already are).
   - Otherwise, auto-suggest: fixed prefix `/tros-api-` + camelCase of (everything after the last `" - "` in `flowDes`, or all of `flowDes` if there's no `" - "`). This is a **best-effort heuristic, not a reliable reproduction of how the user actually names things** — confirmed this session by comparing two real examples that don't share a single mechanical rule (`"Service Activator - Movil - Baja Servicios Locucion"` → `bajaServiciosLocucion`, keeping everything after the last dash; `"Service Ordering - Movil - APN Personalizado"` → `serviceOrderingApn`, keeping the first segment plus only the first word of the last segment). The heuristic implements the simpler, explainable rule (last-segment-only) and leans on the preview step to catch mismatches — it is expected to guess wrong sometimes, and that's fine because nothing applies without `confirm:true`.
4. Submit `action=update` (§4.2) with every field from the row read in step 2 carried forward unchanged, except `urlExp` set to the value from step 3, `modDate` set to now (same format), `userName` set to the configured ROS user.
5. Parse the response envelope the same way as every other write tool (`errorMessage`/`successMessage`).

### 5.3 Preview (no `confirm`)

Shows, in addition to everything Phase 8's preview already shows:
- The path ROS would use by default (`/ros_<camelCaseFlowCode>Service`) if nothing else were done.
- The path that will actually be requested instead — either the caller's explicit `routingPath` (labeled as such) or the auto-suggested one (labeled `"auto-sugerido, revisar antes de confirmar"` / "auto-suggested, review before confirming").
- A warning that this preview cannot show the real `routingId`/`version` it will act on (those are only knowable after the flow and its default routing actually exist) — the real values are only resolved and shown at `confirm:true` time, same "preview is best-effort, re-resolve at confirm" convention `save_flow_steps` already uses (Phase 8 design §5.5).
- If `routingPath` is set together with a `rosFlag` that resolves to `false`: an explicit rejection in the preview ("routingPath requires rosFlag:true — no routing row exists to update otherwise"), not a silent no-op.

### 5.4 Error handling / partial success

If step 1 (§5.2) succeeds but steps 2-4 fail for any reason (routing row not found, the update POST itself errors, an unexpected response shape), the tool's result is `applied:true` (the flow header was created — that fact is real and shouldn't be hidden) **plus** a separate `warning` field stating the routing update did not land and the flow is currently reachable at ROS's own default path instead. Never report full success when the requested custom path didn't actually get set — this mirrors the accepted "orphaned header" risk already documented for `create_flow`/`save_flow_steps` (Phase 8 design §5.6), just for routing instead of steps.

### 5.5 Response shape addition

`create_flow`'s existing `result: { flowId, flowCode }` gains an optional `routing: { urlExp, applied: boolean }` field, present only when `rosFlag:true` was resolved (so callers checking `result.routing` can tell whether the custom path landed, defaulted, or was skipped per §5.3's rejection case).

## 6. Testing

Unit tests against fake `RosClientLike`, extending Phase 8's existing suite for `create_flow`:
- `routingPath` given, `rosFlag:true` → search finds the default row → update sent with the custom `urlExp`, every other field carried forward from the search response unchanged.
- No `routingPath`, `rosFlag:true` → auto-suggested path computed from `flowDes` (last-segment heuristic), same update flow.
- `routingPath` given, `rosFlag:false` → rejected in preview, no routing calls made at all.
- Search returns no matching `POST`/`SINGLE` row → partial-success path (§5.4): `applied:true` for the flow, `routing.applied:false`, warning present.
- Update POST itself errors → same partial-success shape.
- Auto-suggest heuristic unit-tested directly against both real-world examples from this session (documented as **known mismatches**, not regressions — the "Service Ordering..." case is expected to under-guess relative to what the user actually wants, and the test asserts the *implemented* rule's output, not the user's ideal output).

**Live verification** (mandatory per this project's standing rule — Phase 5 found 2 real bugs that 120 fake-client tests missed, Phase 8 found 3 Criticals only in final review): create one more real throwaway flow via `create_flow` with an explicit `routingPath`, confirm via a follow-up `search`-style read that the live `urlExp` matches exactly what was requested — same style of check already done manually this session on flow 64505, just exercised through the actual `ros-ai-mcp` tool code instead of the raw browser capture.

## 7. Alternatives considered

- **Standalone `set_flow_routing` tool**, usable against any existing flow (not just one just created by `create_flow`), was considered and is the more general shape. Rejected for v1 per the user's explicit choice this session — extending `create_flow` directly is simpler for the only case that's actually come up (fixing the route right after creation) and avoids a second tool with its own preview/confirm/gating surface for a need that hasn't materialized yet. Nothing here forecloses adding it later; the routing search/update logic in §5.2 is written as its own internal function precisely so it could be exposed as a separate tool without rewriting it.
- **Deriving the auto-suggested suffix from `flowCode`** (camelCase of the identifier itself, the same transform ROS's own `buildDefaultEndpoint` already applies) was rejected outright — it's literally the transform that produced the wrong default the user is trying to get away from (e.g. `S_O_APN_PERSONALIZADO` → `sOApnPersonalizado`, not `serviceOrderingApn`).

## 8. Open questions carried into the implementation plan

- Whether to add a small stopword-stripping pass to the auto-suggest heuristic (dropping generic channel words like "Movil"/"Fija" wherever they appear, not just relying on the last-dash-segment split) — deliberately not decided here; start with the simpler rule (§5.2 step 3) and revisit only if it proves annoying in practice, per the user's own "simple heuristic + override always available" choice this session.
- Exact behavior of `updateFields[modDate]` if given a value the server doesn't expect (untested — always sending "now" in the observed format is assumed safe, not proven).
- Whether the vendorized copy of `ros-ai-mcp` under `subscriptionManager/tools/ros-ai-mcp` needs its own sync step documented in the implementation plan, or whether that's purely a manual post-merge copy (per this session's decision: code lands in the master repo `C:\Users\52554\Documents\ros-ai-mcp` first, vendorized copy is synced after — the exact sync mechanism, e.g. a script vs. manual `robocopy`/`cp`, is not decided here).

# ros-ai-mcp

Read-only by default MCP server exposing ThinkSkink ROS (`masros-gui`) Flows,
Actions, and Items to Claude Code (see Scope for the gated write tools).

## Setup

1. Copy `.env.example` to `.env` and fill in `ROS_USERNAME`/`ROS_PASSWORD`.
   `ROS_BASE_URL` defaults to the DEV/QA `masros-gui` — you must be connected
   to the Ivanti Secure Access VPN for requests to succeed.
2. `npm install`
3. `npm test` — runs the full unit test suite (no VPN/network required; all
   HTTP is mocked).
4. `npm run build && npm run dev` — starts the MCP server over stdio.

## Smoke-testing against real DEV/QA

`npm run smoke` exercises `get_flow`, `get_item_info`, `analyze_flow`,
`analyze_item`, `summarize_flow_skeleton`, `find_similar_flows`, and
`find_similar_actions` (on `ROS_SMOKE_FLOW_ID`/`ROS_SMOKE_ITEM_ID`) against
the real server. It only runs
when `RUN_SMOKE_TESTS=true` is set, and requires the VPN to be connected — it
is never run as part of `npm test`.

## Registering with Claude Code

```bash
npm run build
claude mcp add ros-ai-mcp -s user -- node "C:\Users\52554\Documents\ros-ai-mcp\dist\index.js"
```

The `-s user` flag registers the server globally (available in all projects). Credentials
are read from `.env` in this repo at process start — nothing is passed on the
`claude mcp add` command line.

## Scope

14 read-only tools plus 6 tools gated behind `ROS_MCP_ENABLE_WRITE` (off by
default) — `save_action`, `execute_flow`, `create_flow`, `save_flow_steps`,
and `update_flow_steps` write to ROS; `get_job_status` is itself read-only
but shares the same gate and environment variables (see Phase 7).

**Phase 1 — data access (9 tools):** `search_flows`, `get_flow`,
`get_flow_steps`, `search_actions`, `get_action`, `get_action_command`,
`get_action_template`, `get_item_info`, `search_ros_items`.

**Phase 2 — intelligence (4 tools):** `find_similar_flows`,
`find_similar_actions`, `analyze_flow`, `analyze_item`. Built entirely on top
of Phase 1's tools — no new ROS HTTP endpoints.

**Phase 3 — design support (1 tool):** `summarize_flow_skeleton`. Classifies
an `analyze_flow` tree into technical roles (subflow/decision/end/
external_call/custom_code/flow_control/other) so a similar flow's reusable
pattern is visible at a glance. No new ROS HTTP endpoints, no business-rule
inference — purely structural classification.

**Phase 4 — flow design (Claude Code skill, not an MCP tool):**
`designing-ros-flow`. Ships as a Claude Code skill rather than a server tool,
so it isn't counted in the tool total above.

**Phase 5 — write (1 tool, off by default):** `save_action`. Creates or
updates a ROS action with a mandatory human-approval preview (no ROS call
without an explicit `confirm:true` after the user has reviewed the diff/
summary). Disabled unless `ROS_MCP_ENABLE_WRITE=true` is set — when unset or
any other value, the tool is not even registered with the MCP client.

**Phase 6 — write (1 tool, off by default):** `execute_flow`. Schedules a ROS
flow execution as a job via `ros-rest`'s `POST /job`, JWT-authenticated
against `ros-authorization`. Same mandatory human-approval preview pattern as
`save_action` (no ROS call without an explicit `confirm:true`), and gated
behind the same `ROS_MCP_ENABLE_WRITE` flag. The preview works without any of
the 6 new environment variables (`ROS_REST_BASE_URL`,
`ROS_AUTHORIZATION_BASE_URL`, `ROS_CLIENT_ID`, `ROS_CLIENT_SECRET`,
`ROS_MCP_AUDIT_ORIGIN`, `ROS_MCP_AUDIT_USERNAME`) — only `confirm:true`
requires them, since only then does the tool actually call `ros-rest`/
`ros-authorization`.

**Phase 7 — write-gated read (1 tool, off by default):** `get_job_status`.
Wraps `ros-rest`'s `GET /jobDetail` to report a scheduled job's status,
progress, and (for in-progress jobs) per-action monitoring/error detail.
Gated behind the same `ROS_MCP_ENABLE_WRITE` flag as `save_action` and
`execute_flow`, and requires the same 6 environment variables
(`ROS_REST_BASE_URL`, `ROS_AUTHORIZATION_BASE_URL`, `ROS_CLIENT_ID`,
`ROS_CLIENT_SECRET`, `ROS_MCP_AUDIT_ORIGIN`, `ROS_MCP_AUDIT_USERNAME`) —
unlike `execute_flow`, it does not register at all if those vars are
missing, since there's no meaningful preview-only mode for a pure read tool
with no data source.

**Phase 8 — flow creation (2 tools, off by default):** `create_flow` (create a new flow header), `save_flow_steps` (assemble a brand-new flow's step tree from a simplified DSL — refuses to run against a flow that already has steps). Both gated by `ROS_MCP_ENABLE_WRITE`, same preview/confirm:true pattern as `save_action`/`execute_flow`.

The DSL shared by `save_flow_steps` and `update_flow_steps` has six step kinds: `action` (a plain ROS action by `actionCode`), `decision` (an `INLINEDEC` node with a `criteria` expression and `yes`/`no` branches), `subflow` (expands to an `INFLOW`/`OUTFLOW` pair calling another flow by `flowCode`), `multiply-subflow` (expands to an `INMLTPL`/`OUTMLTPL` pair — like `subflow` but iterating: `arrayProperty` sets both the wire's `multiplyArrProp` and `ymlConfig.ARRAY_PROPERTY_PATH`, `saveProperty` optionally sets `ymlConfig.SAVE_PROPERTY_PATH`), `end` (an `ES` terminal), and `goto` (reconnects to an earlier node elsewhere in the same tree, by the `ref` string that node was tagged with — any node kind except `goto` itself can carry a `ref`). `goto` is how two branches that structurally re-converge (e.g. a `Y` and `N` path both leading into the same downstream decision) are expressed without duplicating that downstream subtree — only backward references are supported (the `ref` must already have been visited, and branches are visited `yes` before `no` at every decision). `action` and `decision` also accept optional `bypass`/`syncStep` strings, mapped to ROS's real underscore-prefixed wire fields (`_bypass`/`_syncStep`) — needed to faithfully carry forward an existing step that has either set, since omitting them on a `save`/`update` clears them.

Two structural notes worth knowing before reconstructing an existing flow's full tree with `update_flow_steps`: (1) ROS's `ROS_FLOW_STEP` table has a composite primary key on `(stepId, parentStepId)` with no third distinguishing column — a `ref`'d node reached as the *very first* step on both sides of the decision that leads to it produces two identical-keyed rows and is rejected before any write is attempted (insert at least one other step before the shared node on one side to avoid this; every real convergence pattern in a mature flow already has this, since ROS itself can't represent the collision case). (2) `update_flow_steps`' diff (see Phase 9 below) compares `actionCode`/`decisionCriteria`/`decision`/`multiplyArrProp`/`ymlConfig`/`bypass`/`syncStep` — i.e. everything that actually affects a step's runtime behavior — so an existing step reconstructed with the wrong `ymlConfig` (e.g. forgetting a plain action's custom input-path config) or a dropped `bypass`/`syncStep` is caught as `unexpectedlyChanged` rather than silently overwritten.

**Phase 9 — flow editing (1 tool, off by default):** `update_flow_steps`. Rebuilds the step tree of an existing flow (one that already has steps) from the same DSL as `save_flow_steps`, then diffs the rebuilt tree against the flow's current steps (by `actionCode`/`decisionCriteria`/`decision`/`multiplyArrProp`/`ymlConfig`/`bypass`/`syncStep` — not `stepId`, which is reassigned from scratch on every save). By default the save is rejected outright if the diff shows any existing step changed or went missing (`unexpectedlyChanged`/`unexpectedlyMissing`) — only pure additions (`added`) are allowed through, since the underlying `saveFlowStep` endpoint replaces the whole step tree on every call. Passing `force:true` lifts that abort (e.g. to intentionally insert a decision gate that converts a single terminal step into two) — it does not bypass the preview/confirm gate: a forced call still returns preview-only until `confirm:true` is also set, and the preview/warnings spell out exactly which existing steps will be altered or removed so the human approving it can review before committing. Gated by `ROS_MCP_ENABLE_WRITE`, same preview/confirm:true pattern as the other write tools.

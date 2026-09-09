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

This copy lives at `tools/ros-ai-mcp/` inside `subscriptionManager`, and the
project already ships a `.mcp.json` at the repo root pointing at
`tools/ros-ai-mcp/dist/index.js` (relative path) — after `npm run build`
below, Claude Code auto-detects it when you open this project and prompts to
enable it. Nothing to register manually.

If you want it registered globally instead (available in every project, not
just this one):

```bash
npm run build
claude mcp add ros-ai-mcp -s user -- node "<absolute path to this folder>\dist\index.js"
```

Credentials are read from `.env` in this folder at process start — nothing is
passed on the `claude mcp add` command line.

## Scope

14 read-only tools plus 5 tools gated behind `ROS_MCP_ENABLE_WRITE` (off by
default) — `save_action`, `execute_flow`, `create_flow`, and `save_flow_steps`
write to ROS; `get_job_status` is itself read-only but shares the same gate
and environment variables (see Phase 7).

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

**Phase 8 — flow creation (2 tools, off by default):** `create_flow` (create a new flow header), `save_flow_steps` (assemble a brand-new flow's step tree from a simplified action/decision/subflow/end DSL — refuses to run against a flow that already has steps). Both gated by `ROS_MCP_ENABLE_WRITE`, same preview/confirm:true pattern as `save_action`/`execute_flow`. v1 scope is create-only — neither tool edits an existing flow.

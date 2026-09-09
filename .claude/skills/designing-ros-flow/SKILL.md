---
name: designing-ros-flow
description: Use when asked to design, propose, or draft a new ROS flow or action from a natural-language requirement — before it exists in masros-gui. Finds reusable flows/actions via ros-ai-mcp's find_similar_flows/find_similar_actions, inspects the closest match's structure via summarize_flow_skeleton/analyze_flow, and drafts any new Groovy action against a real get_action_template plus a real similar action's style. Never applies anything to ROS — always ends by presenting the proposal for the user to review and create manually. Triggers on "diseña un flow para...", "necesito un flow que...", "cómo armaría una action para...", "propón el diseño de...", "design a ROS flow for...", "draft an action that...".
---

# Designing a new ROS flow or action by analogy

Drafts a flow/action design proposal from a natural-language requirement by
finding and studying the closest existing ROS flows/actions through the
`ros-ai-mcp` MCP server, then having Claude write any genuinely new Groovy
logic against real templates and real conventions — never from scratch,
never guessed.

## When NOT to use this skill

If the user wants to *understand* a flow or item that already exists (not
design something new), that's `analyze_flow`, `summarize_flow_skeleton`, or
`analyze_item` directly — no need for this skill's process.

## Hard rule: this skill never touches ROS

There is no write path yet. `ros-ai-mcp` only exposes read-only tools
(`search_flows`, `get_flow`, `get_flow_steps`, `search_actions`,
`get_action`, `get_action_command`, `get_action_template`, `get_item_info`,
`search_ros_items`, `find_similar_flows`, `find_similar_actions`,
`analyze_flow`, `analyze_item`, `summarize_flow_skeleton`). Endpoints like
`saveAction`, `saveFlowDetail`, `executeImportFlow`, or
`checkYMLFileImportDiff` do not exist as tools here — never invoke them,
never imply they were invoked, never simulate their effect. This skill
always ends at a proposal for a human to apply manually in masros-gui.

## Step 1 — Understand the requirement

Before searching anything, make sure the requirement actually answers:
synchronous or asynchronous? What external systems does it touch? What
triggers it — an inbound REST call, an event, a scheduled job? What should
happen on error? If any of this is missing, ask the user one question at a
time before moving on — don't guess at ROS-specific design decisions.

## Step 2 — Find what already exists

```
find_similar_flows({ requirement })
find_similar_actions({ requirement })
```

If `find_similar_actions` surfaces a high-scoring action that already covers
an integration the requirement needs (e.g. a SOAP call to the same external
system), prefer reusing it over drafting a new one.

## Step 3 — Study the closest candidate's pattern

```
summarize_flow_skeleton({ flowId })   # the reusable pattern at a glance
analyze_flow({ flowId })              # the full step tree, if more detail is needed
get_action({ actionId })              # full config of a specific step to reuse/adapt
get_action_command({ actionId })      # a similar action's real Groovy, as a style reference
```

## Step 4 — Draft any genuinely new logic

```
get_action_template({ commandType: 'GROOVY' })   # ROS's real template
```

Using the real template plus the style already observed in Step 3 (e.g. the
`@SkValue`/`@SkLog`/`@Field` annotations, `SkException`-based error handling,
the `validate()`/`execute()` split seen in real actions like
`SERVICE_ORDERING_PROVISIONING`'s validator), write the new action's Groovy
body. This is Claude's own judgment — the skill's job is only to make sure
that judgment starts from a real, verified base instead of an invented one.

## Step 5 — Present the proposal, never apply it

Every proposal produced by this skill must include:

- Which existing flow/steps are reused as-is (with their `flowId`/`stepId`).
- Which actions are new, with the complete drafted Groovy.
- Which decision/end steps differ from the reference flow, and why.
- A closing line, verbatim in spirit: **"This is a proposal only — nothing
  was applied to ROS. There is no write/import phase yet."**

## Quick checklist

1. Requirement is unambiguous (sync/async, external systems, trigger,
   error handling) — ask first if not.
2. `find_similar_flows` + `find_similar_actions` run before drafting
   anything new.
3. Closest candidate's structure understood via `summarize_flow_skeleton`
   (and `analyze_flow` if needed).
4. Any new Groovy drafted from `get_action_template` + a real similar
   action's style — never invented from nothing.
5. Final output names what's reused, what's new, what changed, and states
   explicitly that nothing was applied to ROS.
6. No write endpoint (`saveAction`, `saveFlowDetail`, `executeImportFlow`,
   `checkYMLFileImportDiff`) is ever invoked or implied.

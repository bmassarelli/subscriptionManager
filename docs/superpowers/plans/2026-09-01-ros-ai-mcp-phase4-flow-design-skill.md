# ros-ai-mcp — Fase 4: designing-ros-flow Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single Claude Code skill, `designing-ros-flow`, that gives Claude a concrete process for drafting a new ROS flow/action proposal from a natural-language requirement by orchestrating `ros-ai-mcp`'s existing Fase 1-3 tools — never writing to ROS.

**Architecture:** This is a documentation deliverable, not a code change. There is no TypeScript, no tests, no TDD cycle — the "implementation" is writing one Markdown file with exact, complete content, then manually validating it against a real scenario over the real (VPN-connected) `ros-ai-mcp` server.

**Tech Stack:** Markdown (Claude Code skill frontmatter + body). No new dependencies.

## Global Constraints

- The skill file lives in `ts-skills-1` (this repo), under `plugins/masros/skills/designing-ros-flow/SKILL.md` — never in the `ros-ai-mcp` repo, which stays code-only.
- The skill must never invoke, or instruct Claude to invoke, any ROS write endpoint (`saveAction`, `saveFlowDetail`, `executeImportFlow`, `checkYMLFileImportDiff`) — none of those exist as `ros-ai-mcp` tools yet (Fase 5+), and the skill must say so explicitly rather than assume or simulate them.
- The skill orchestrates only tools that already exist in `ros-ai-mcp`: `find_similar_flows`, `find_similar_actions`, `summarize_flow_skeleton`, `analyze_flow`, `get_action`, `get_action_command`, `get_action_template`. No new `ros-ai-mcp` code of any kind.
- Every proposal the skill produces must end with an explicit "nothing was applied to ROS" statement — never implied to have taken effect.
- Follow the exact frontmatter/body conventions of the other skills in `plugins/masros/skills/` (dense trigger-phrase `description`, English body, numbered steps, a closing checklist/summary).

---

## File Structure

```
ts-skills-1/
  plugins/
    masros/
      skills/
        designing-ros-flow/
          SKILL.md   # NEW
```

---

### Task 1: Check for name/trigger collisions, then write the skill

**Files:**
- Create: `plugins/masros/skills/designing-ros-flow/SKILL.md`

**Interfaces:**
- Consumes (by name only, referenced in prose — not code): the `ros-ai-mcp` MCP tools `find_similar_flows`, `find_similar_actions`, `summarize_flow_skeleton`, `analyze_flow`, `get_action`, `get_action_command`, `get_action_template`.
- Produces: nothing consumed by other tasks — this is the only task.

- [ ] **Step 1: Check for collisions**

Run:
```bash
grep -A1 '^name:' plugins/masros/skills/*/SKILL.md
```
Expected: no existing skill named `designing-ros-flow`, and no other skill's `description` already claims the same trigger phrases ("diseña un flow", "propón el diseño", "necesito un flow que"). If a collision is found, stop and report it — do not silently rename.

- [ ] **Step 2: Write the skill file**

Create `plugins/masros/skills/designing-ros-flow/SKILL.md` with exactly this content:

````markdown
---
name: designing-ros-flow
description: Use when asked to design, propose, or draft a new ROS flow or action from a natural-language requirement — before it exists in masros-gui. Finds reusable flows/actions via ros-ai-mcp's find_similar_flows/find_similar_actions, inspects the closest match's structure via summarize_flow_skeleton/analyze_flow, and drafts any new Groovy action against a real get_action_template plus a real similar action's style. Never applies anything to ROS — always ends by presenting the proposal for the user to review and create manually. Triggers: "diseña un flow para...", "necesito un flow que...", "cómo armaría una action para...", "propón el diseño de...", "design a ROS flow for...", "draft an action that...".
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
````

- [ ] **Step 3: Confirm the file was written correctly**

Run:
```bash
cat plugins/masros/skills/designing-ros-flow/SKILL.md | head -5
```
Expected: the frontmatter block (`---\nname: designing-ros-flow\n...`) appears exactly as written above.

- [ ] **Step 4: Commit**

```bash
git add plugins/masros/skills/designing-ros-flow/SKILL.md
git commit -m "feat(masros): add designing-ros-flow skill for flow/action design by analogy"
```

(Per the user's standing instruction for this work: do not run this commit automatically — leave the file staged/unstaged and wait for the user's explicit go-ahead, same as every other change in Fases 2-4 this session.)

---

### Task 2: Manual validation walkthrough

**Files:** none modified — this task only runs the skill once against a real scenario and records the result.

**Interfaces:** none — this is a manual QA pass, not code.

- [ ] **Step 1: Confirm no accidental collisions survived Task 1**

Run again post-write:
```bash
grep -c '^name: designing-ros-flow$' plugins/masros/skills/*/SKILL.md
```
Expected: exactly one match, in `plugins/masros/skills/designing-ros-flow/SKILL.md`.

- [ ] **Step 2: Run the skill against a real requirement, with VPN connected to real ROS**

Invoke `/designing-ros-flow` (or trigger it naturally, e.g. "diseña un flow para una baja parcial de un servicio similar a PREPRAIDBAJAPARCIAL") and confirm, in order:

1. `find_similar_flows` is called before anything else, and its results are read (not skipped).
2. A candidate flow is picked and either `summarize_flow_skeleton` or `analyze_flow` is called on it.
3. If new Groovy is drafted, `get_action_template({ commandType: 'GROOVY' })` is called first, and the drafted code visibly borrows the real annotation/error-handling style rather than inventing an unrelated shape.
4. The final response follows the Step 5 format: reused steps named, new actions shown in full, changes explained, and it explicitly states nothing was applied to ROS.
5. No write endpoint name appears anywhere in the transcript, not even as a suggestion ("you could now call saveAction...").

- [ ] **Step 3: Record the result**

If all 5 checks pass, the skill is validated — no code to commit for this task (Task 1's commit already covers the skill file). If any check fails, revise `SKILL.md`'s content (re-run Task 1 Step 2 with the fix) and repeat this task's Step 2.

---

## Self-Review Notes

- **Spec coverage:** the design spec's single deliverable (`designing-ros-flow` skill) maps to Task 1; the spec's Testing/Validation section (walkthrough + collision check) maps to Task 2. Both spec Non-goals (no `ros-ai-mcp` code changes, no write-endpoint invocation) are enforced by Global Constraints above and are directly checked in Task 2 Step 2's checklist.
- **Global Constraints check:** no code is created outside `plugins/masros/skills/designing-ros-flow/SKILL.md`. The skill's own text repeats the "never touch ROS" rule twice (a dedicated "Hard rule" section plus the last checklist item) so it survives partial reads.
- **Type/naming consistency check:** every MCP tool name referenced in the skill body (`find_similar_flows`, `find_similar_actions`, `summarize_flow_skeleton`, `analyze_flow`, `get_action`, `get_action_command`, `get_action_template`) matches exactly the tool names registered in `ros-ai-mcp`'s `src/server.ts` as of Fase 3 — no invented or renamed tool references.

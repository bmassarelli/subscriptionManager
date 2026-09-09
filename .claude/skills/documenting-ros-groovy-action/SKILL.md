---
name: documenting-ros-groovy-action
description: Use when asked to document a Groovy ROS action (created or modified) in the fixed technical-functional template used by the team — activity identity, API/BD, Request/Properties/Response data mapping, Transformación/Properties when applicable, a step-by-step FLUJO narrative with the real embedded SQL, and Respuesta Técnica/Funcional error-code tables. The team calls this document the "EDS". Accepts a flow name (documents every Groovy action in that flow, one .docx per activity) or a single action name/description. Every table header renders filled #EA3323. Never invents data not verifiable in the real Groovy/config — marks it "no determinado en el código" instead. Triggers: "documenta este groovy", "necesito el detalle paso a paso de esta action", "genera la ficha técnica de...", "genera la eds de...", "eds de...", "document this Groovy action...".
---

# Documenting a Groovy ROS action step by step

Produces the team's fixed technical-functional documentation — the
**"EDS"** — for one or more Groovy ROS actions (created or modified),
reading their real code and config through the `ros-ai-mcp` MCP server —
never inventing a mapping, step, or error code that isn't verifiable in
the source.

A request like "genera la EDS de \<nombre de flujo\>" is the same request
as "documenta este flujo" — resolve `<nombre de flujo>` as the flow input
in Step 1.

## When NOT to use this skill

- To *design* a new Groovy action from a requirement → `designing-ros-flow`.
- To just understand a flow's structure without producing the fixed
  template → `analyze_flow`/`summarize_flow_skeleton` directly.

## Scope: Groovy only

This skill documents only actions whose `commandType` is GROOVY. If a flow
contains other action types (SOAP, REST, stored procedure), list them by
name so the user knows they exist, but do not force them into this
template — it's built around Groovy's `validate()`/`execute()` shape and
`SkException` error handling.

## Step 1 — Resolve the input

Two accepted inputs:

- **A flow name:** `search_flows({ query })` → if more than one reasonable
  match comes back, confirm the correct `flowId` with the user before
  continuing. Then `analyze_flow({ flowId })` for the real activity order,
  and `summarize_flow_skeleton({ flowId })` to filter which steps are
  `custom_code` (the Groovy candidates).
- **A single action's name/description:** `search_actions({ query })` →
  confirm the correct `actionId` with the user if there's ambiguity.

## Step 2 — Fetch each Groovy action's real code and config

For every Groovy action identified in Step 1:
```
get_action({ actionId })          # identity, API/BD, field config
get_action_command({ actionId })  # the real Groovy source
```

## Step 3 — Fill the template from real data only

Every cell comes from something verifiable — never from assumption:

| Template section | Source |
|---|---|
| Tipo / Actividad / Nombre | Action name + its real position in the flow (`analyze_flow`) |
| API / BD | `get_action`'s config |
| Mapeo de Datos (Origen→Destino, Request/Properties/Response) | `@SkValue`-annotated fields read from the real Groovy |
| Transformación | Only if the Groovy actually transforms a field before use — omit the section entirely if none is found |
| Properties | Global DB config properties referenced in the Groovy |
| **FLUJO** | Step-by-step narrative of `validate()`/`execute()`, in the code's real order: each validation, each SQL query copied **literally**, each error branch with its code |
| Respuesta Técnica / Respuesta Funcional | IDF/código/mensaje table built from the real `SkException` calls thrown in the Groovy |

If any template cell can't be determined from the real code/config (e.g. a
Mapeo de Datos row with no matching field in the Groovy), that cell must
read exactly **"no determinado en el código"** — never filled by
inference or convention.

## Step 4 — Build the per-activity JSON

Each activity ends up as its own `.docx` file — never a combined
document, even when the input was a whole flow with several Groovy
actions.

Build a JSON object matching the contract documented at the top of
`scripts/generate-docx.js`: one entry per activity under `activities`,
each with a `fileName`, a `title`, and an ordered `sections` array. Use
`kind: "table"` for every tabular part of the template (Identidad,
API/BD, Mapeo de Datos, Transformación, Properties, Respuesta
Técnica/Funcional) and `kind: "paragraphs"` for the FLUJO narrative (mark
literal SQL/Groovy lines with `"code": true`). If the input was a flow,
keep the activities in the flow's real order (from `analyze_flow`) and
give each `fileName` a numeric prefix (`01-`, `02-`, …) so the files sort
in that order.

## Step 5 — Confirm the output location before writing anything

1. Ask the user for the exact destination directory — never assume a
   default.
2. Show the proposed filenames (one per activity) and wait for
   confirmation.
3. Only proceed to Step 6 after explicit confirmation.

## Step 6 — Render one .docx per activity

1. First run only: `npm install` inside
   `plugins/masros/skills/documenting-ros-groovy-action/` to fetch the
   `docx` dependency.
2. Run `node scripts/generate-docx.js <input.json> <outputDir>` — it
   writes one `.docx` per activity into `<outputDir>`. Every table header
   row renders filled **#EA3323** with bold white text; this is fixed by
   the script and never needs to be specified per call.

## Hard rule: read-only, always

This skill only calls `ros-ai-mcp` read tools (`search_flows`,
`search_actions`, `analyze_flow`, `summarize_flow_skeleton`, `get_action`,
`get_action_command`). It never invokes, or suggests invoking, a ROS write
endpoint (`saveAction`, `saveFlowDetail`, `executeImportFlow`, etc.) — none
of those are available tools here, and they must never be simulated or
assumed.

## Quick checklist

1. Input resolved unambiguously — flow confirmed via `search_flows` +
   `analyze_flow`/`summarize_flow_skeleton`, or action confirmed via
   `search_actions` — asking the user when there's more than one candidate.
2. `get_action` + `get_action_command` called for every Groovy action
   before writing any template section.
3. Every template cell sourced from real code/config; anything not
   determinable reads "no determinado en el código".
4. FLUJO's SQL queries match the real Groovy source literally.
5. Respuesta Técnica/Funcional codes match the real `SkException` calls.
6. Non-Groovy actions in a flow are named but not force-fit into the
   template.
7. One `.docx` per activity — never a combined document, even for a
   multi-activity flow.
8. Every table header renders filled #EA3323 (fixed by
   `scripts/generate-docx.js` — never overridden per call).
9. Output destination asked and confirmed before `generate-docx.js` runs.
10. No write endpoint (`saveAction`, `saveFlowDetail`, `executeImportFlow`,
    `checkYMLFileImportDiff`) is ever invoked or implied.

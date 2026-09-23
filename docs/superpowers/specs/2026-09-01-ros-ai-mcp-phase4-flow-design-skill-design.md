# ros-ai-mcp — Fase 4: Skill de diseño de flow/action por analogía

- **Date:** 2026-09-01
- **Status:** Approved (design)
- **Repo:** `ts-skills-1` (este repo de skills/plugins — **no** `ros-ai-mcp`, ver Non-goals)
- **Depends on:** Fase 1-3 de `ros-ai-mcp` (13+1 tools MCP: datos crudos +
  inteligencia + esqueleto de flow). Código completo, testeado y revisado
  esta misma sesión, pero **todavía sin commitear** (el usuario comiteará
  todas las fases juntas más adelante).

## Purpose

Las Fases 1-3 de `ros-ai-mcp` son 100% determinísticas: estructuran y cruzan
hechos ya existentes en ROS, nunca inventan nada. La Fase 4 del roadmap
original del usuario ("generar código") es fundamentalmente distinta —
escribir la lógica Groovy de una action nueva es un acto de juicio/creación,
no algo reducible a un algoritmo.

Por eso Fase 4 **no agrega código nuevo a `ros-ai-mcp`**. En vez de eso,
agrega un **skill de Claude Code** (`designing-ros-flow`) que le da a Claude
un proceso concreto para seguir cuando el usuario pide diseñar un flow o
action nuevo: usar `find_similar_flows`/`find_similar_actions` (Fase 2) para
encontrar qué ya existe, `summarize_flow_skeleton`/`analyze_flow` (Fase 2-3)
para entender el patrón reusable, `get_action_template`/`get_action`/
`get_action_command` (Fase 1) como base real para redactar Groovy nuevo, y
terminar presentándole la propuesta al usuario — sin aplicar nada, porque no
existe una Fase 5 de escritura con aprobación humana todavía.

## Goals

- 1 skill nuevo: `plugins/masros/skills/designing-ros-flow/SKILL.md`, mismo
  formato/convención que los demás skills de `plugins/masros/skills/`
  (frontmatter `name`/`description` denso en triggers, cuerpo en Markdown
  con pasos numerados).
- El skill orquesta las tools ya existentes de `ros-ai-mcp` (Fases 1-3) —
  cero tools nuevas, cero endpoints ROS nuevos, cero cambios al servidor
  MCP.
- El código Groovy/YAML lo redacta Claude, con criterio, usando como
  referencia real `get_action_template` y actions similares reales — el
  skill no intenta "generar" código de forma determinística ni con reglas
  fijas.
- Límite explícito y verificable: el skill nunca invoca ni sugiere invocar
  un endpoint de escritura (`saveAction`, `saveFlowDetail`,
  `executeImportFlow`, etc.) — esas tools no existen todavía (Fase 5+).

## Non-goals

- No vive en el repo `ros-ai-mcp` — es un skill de Claude Code, vive en
  `ts-skills-1` junto a los demás skills del proyecto (mismo patrón que
  `editing-ros-flow-yaml`, `masros-import-flow`, etc. en
  `plugins/masros/skills/`).
- No aplica ni importa nada a ROS — termina siempre en "acá está la
  propuesta", nunca en una llamada real. Aplicar el cambio es responsabilidad
  del usuario (manualmente en masros-gui) hasta que exista Fase 5.
- No intenta cubrir el 100% de los tipos de action de ROS (SOAP/REST/SP/
  Kafka) con una plantilla por tipo — se apoya en `get_action_template` (que
  ya cubre GROOVY/PYTHON) y en leer actions reales similares para el resto
  de los detalles de configuración (headers REST, namespaces SOAP, etc., ya
  expuestos por `get_action`/`get_action_command` de Fase 1).
- No hay tests automatizados en el sentido de Fase 1-3 (no hay código
  TypeScript que testear) — la validación es un walkthrough manual contra un
  caso real (ver Testing/Validation abajo).
- No se toca nada de `ros-ai-mcp` (código, tests, server) — Fase 4 es
  aditiva sobre un repo distinto.

## Design

### Ubicación y frontmatter

```
plugins/masros/skills/designing-ros-flow/SKILL.md
```

```markdown
---
name: designing-ros-flow
description: Use when asked to design, propose, or draft a new ROS flow or action from a natural-language requirement (before it exists in masros-gui) — finds reusable flows/actions via ros-ai-mcp's find_similar_flows/find_similar_actions, inspects the closest match's structure via summarize_flow_skeleton/analyze_flow, and drafts any new Groovy action against a real get_action_template. Never applies anything to ROS — always ends by presenting the proposal for the user to review/create manually. Triggers: "diseña un flow para...", "necesito un flow que...", "cómo armaría una action para...", "propón el diseño de...".
---
```

### Cuerpo del skill (contenido, no solo estructura)

**Sección "Cuándo NO usar este skill":** si el usuario solo quiere *entender*
un flow existente (no diseñar uno nuevo), eso ya lo resuelven directamente
`analyze_flow`/`summarize_flow_skeleton`/`analyze_item` sin pasar por este
skill.

**Paso 1 — Entender el requerimiento.** Antes de buscar nada: si falta
información clave (¿síncrono o asíncrono?, ¿qué sistemas externos toca?,
¿qué dispara el flow — un llamado REST, un evento?, ¿qué debería pasar en
caso de error?), preguntar al usuario primero, una pregunta a la vez —mismo
principio que `superpowers:brainstorming`, pero acotado a estas preguntas
específicas de diseño ROS.

**Paso 2 — Buscar qué ya existe.**
```
find_similar_flows({ requirement })   → candidatos de flow a reusar/clonar
find_similar_actions({ requirement }) → integraciones que podrían ya existir
```
Si `find_similar_actions` devuelve una action con score alto para una
integración que el requerimiento necesita, priorizar reusarla sobre escribir
una nueva.

**Paso 3 — Entender el patrón del mejor candidato.**
```
summarize_flow_skeleton({ flowId })   → patrón reusable de un vistazo
analyze_flow({ flowId })              → árbol completo si se necesita detalle
get_action({ actionId })              → config completa de una action puntual a reusar/adaptar
get_action_command({ actionId })      → Groovy real de una action similar, como referencia de estilo
```

**Paso 4 — Redactar la lógica nueva (si hace falta).**
```
get_action_template({ commandType: 'GROOVY' })   → template real de ROS
```
Con el template real + el estilo observado en el Paso 3 (anotaciones
`@SkValue`/`@SkLog`/`@Field`, manejo de errores con `SkException`, patrón
`validate()`/`execute()` visto en flows reales como
`SERVICE_ORDERING_PROVISIONING`), Claude redacta el Groovy de la action
nueva. Esto es razonamiento de Claude, no una tool — el skill solo garantiza
que parte de una base real verificada, no de una plantilla inventada.

**Paso 5 — Presentar la propuesta, nunca aplicarla.** El output final debe
tener siempre esta forma:
- Qué flow/steps existentes se reusan tal cual (con su flowId/actionId).
- Qué actions son nuevas, con el código Groovy propuesto completo.
- Qué steps de decisión/fin cambian respecto al flow de referencia.
- Una nota explícita: "Esto es una propuesta — no se aplicó nada en ROS.
  Fase 5 (escritura + aprobación) todavía no existe."

**Regla dura (repetida al final del skill, como los demás skills de
`ros-ai-mcp` repiten sus Global Constraints):** este skill JAMÁS debe
invocar ni instruir invocar `saveAction`, `saveFlowDetail`,
`executeImportFlow`, `checkYMLFileImportDiff`, ni ningún otro endpoint de
escritura — no son tools disponibles y no deben simularse ni asumirse.

## Testing / Validation

No hay suite automatizada (no hay código TS). La validación es un
walkthrough manual antes de dar el skill por terminado:

1. Tomar un requerimiento real ya usado en esta sesión como prueba (p. ej.
   "necesito una baja parcial para un servicio similar a
   `PREPRAIDBAJAPARCIAL`"), correr el skill paso a paso manualmente contra
   el `ros-ai-mcp` real (VPN conectada), y confirmar que:
   - `find_similar_flows` efectivamente sugiere `PREPRAIDBAJAPARCIAL` u otro
     candidato razonable.
   - `summarize_flow_skeleton` sobre ese candidato es legible y útil como
     base de la propuesta.
   - La propuesta final generada por Claude sigue el formato del Paso 5, no
     inventa haber aplicado nada, y no invoca (ni sugiere) ningún endpoint
     de escritura.
2. Confirmar que el skill no colisiona en nombre/trigger con ningún skill
   existente de `plugins/masros/skills/` (revisar `description` de los
   demás antes de commitear).

## Rollout

- Repo `ts-skills-1`, no `ros-ai-mcp` — no depende de que Fase 1-3 de
  `ros-ai-mcp` estén commiteadas para escribirse (el skill referencia
  nombres de tools MCP ya reales, no código), pero sí depende de que estén
  **registradas y funcionando** para que el walkthrough de validación pueda
  correr contra tools reales.
- Ejecución vía `superpowers:writing-plans` seguido de una escritura directa
  (no hay TDD posible sobre un archivo Markdown) — el "plan" de esta fase es
  esencialmente "escribir este archivo con este contenido y correr el
  walkthrough de validación", sin tasks de código.
- Commit: igual que Fases 1-3, el usuario decide cuándo comitear esto junto
  con todo lo demás — no se comitea automáticamente al terminar.

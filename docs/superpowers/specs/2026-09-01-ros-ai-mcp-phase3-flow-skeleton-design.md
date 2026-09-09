# ros-ai-mcp — Fase 3: Esqueleto de Flow para diseño por analogía

- **Date:** 2026-09-01
- **Status:** Approved (design)
- **Repo:** `ros-ai-mcp` (local, `C:\Users\52554\Documents\ros-ai-mcp`, sin remoto)
- **Depends on:** Fase 2 (`find_similar_flows`, `analyze_flow`) — código completo,
  revisado y con fixes aplicados, pero **todavía sin commitear** al momento de
  escribir este spec. Este plan asume que Fase 2 ya está commiteada antes de
  ejecutarse.

## Purpose

Fase 1 (9 tools de datos crudos) y Fase 2 (4 tools de "inteligencia":
`find_similar_flows`, `find_similar_actions`, `analyze_flow`, `analyze_item`)
ya permiten encontrar flows parecidos a un requerimiento y ver su árbol de
steps completo. Pero el árbol de `analyze_flow` trae cada action con su
nombre real (`actionCode`, `actionDes`, UUIDs autogenerados) — para entender
el *patrón* reusable de un flow (¿dónde arranca una transacción?, ¿dónde
llama a un sistema externo?, ¿dónde decide?, ¿dónde termina?) hay que leer
step por step.

La Fase 3, según el roadmap original del usuario ("diseñar" antes de
"generar código"), agrega **una tool que resume el árbol de un flow en un
esqueleto clasificado por rol técnico**, para que Claude pueda ver de un
vistazo el patrón de un flow similar antes de proponer (razonando él mismo,
no la tool) cómo adaptarlo a un nuevo requerimiento.

## Goals

- 1 tool MCP nueva, mismo patrón que Fase 1/2: función pura
  `(client: RosClientLike, input) => output` en `src/tools/`, testeada con un
  fake client, registrada en `src/server.ts`.
- Cero endpoints ROS nuevos — se construye enteramente sobre `analyzeFlow`
  (Fase 2), que a su vez ya combina `getFlow`+`getFlowSteps` (Fase 1).
- Clasificación **puramente estructural**: solo usa campos técnicos ya
  verificados (`actionType`, `commandType`, `workerClass`, y la presencia de
  `step.flow` para detectar invocación a subflow). Nunca infiere significado
  de negocio a partir del código Groovy ni de nombres de action — eso lo
  sigue haciendo Claude leyendo la salida estructurada, igual que en Fase 2.

## Non-goals

- No propone ni genera el diseño del nuevo flow/action — eso es
  razonamiento de Claude sobre la salida de esta tool, no código
  determinístico. Fase 4 (generación de código) es un spec separado, futuro.
- No distingue sub-tipos semánticos de `custom_code` (p. ej. "esto es una
  validación" vs "esto es un enriquecimiento") — solo dice que es código
  Groovy/Python custom. Cualquier lista de `actionCode`s de framework
  conocidos (`TM_ST`, `TM_UCP`, `TM_N`, etc.) quedaría **fuera de esta
  versión**: requeriría verificarla contra más flows reales antes de
  hardcodearla, y no es necesaria para el caso de uso mínimo (ver el
  esqueleto estructural). Puede ser una extensión futura si hace falta más
  precisión.
- No maneja `actionType: 'SWITCH'` como caso distinto de `'DECISION'` — no
  hay evidencia todavía (en los 3 flows reales inspeccionados) de que ROS
  use un `actionType` literal distinto para switches; si aparece, requeriría
  antes extender `FlowStepNode` de Fase 2 con `switchPropertyPath` (hoy no
  expuesto), no algo que esta tool deba adivinar.
- No se tocan las tools de Fase 1/2 ni el cliente HTTP/sesión — Fase 3 es
  estrictamente aditiva.
- Sigue sin haber tools de escritura (Fase 5+) ni `execute_flow` (Fase 6).

## Design

### Estructura de archivos (nueva, sobre lo ya construido en Fase 1/2)

```
src/
  tools/
    summarizeFlowSkeleton.ts   # NUEVO
  server.ts                    # se amplía: registerTools gana 1 tool nueva
test/
  tools/
    summarizeFlowSkeleton.test.ts   # NUEVO
```

### `summarize_flow_skeleton(flowId: number)`

1. `analyzeFlow(client, { flowId })` (Fase 2) → `{ flow, graph, droppedStepIds }`.
2. Recorre `graph` (un árbol de `FlowStepNode`) y mapea cada nodo a un
   `FlowSkeletonNode` clasificado, con esta **precedencia fija** (un nodo
   puede cumplir varias condiciones a la vez, ej. un DECISION también tiene
   `commandType: CLASS` — gana la primera que matchee):

   1. `step.flow` poblado → rol `subflow`, con `invokesFlow: { flowId, flowCode }`.
   2. `actionType === 'DECISION'` → rol `decision`, con `decisionCriteria`/`decision` (ya vienen en `FlowStepNode`).
   3. `actionType === 'END'` → rol `end`, con `terminal: action.workerClass` (p. ej. `"SUCCESS"`).
   4. `commandType === 'SOAP' | 'REST'` → rol `external_call`, con `protocol: 'soap' | 'rest'` y `domain: action.domain`.
   5. `commandType === 'GROOVY' | 'PYTHON'` → rol `custom_code`, con `language: 'groovy' | 'python'`.
   6. `commandType === 'CLASS'` (sin caer en 1-3) → rol `flow_control`.
   7. cualquier otro caso → rol `other`, con `commandType: action.commandType` crudo (nunca se descarta un step).

3. Devuelve:
   ```typescript
   interface FlowSkeletonNode {
     stepId: number;
     role: 'subflow' | 'decision' | 'end' | 'external_call' | 'custom_code' | 'flow_control' | 'other';
     actionCode: string;
     actionDes: string;
     invokesFlow: { flowId: number; flowCode: string } | null;   // solo 'subflow'
     decisionCriteria: string | null;                            // solo 'decision'
     decision: string | null;                                    // solo 'decision' (label de rama)
     terminal: string | null;                                    // solo 'end'
     protocol: 'soap' | 'rest' | null;                           // solo 'external_call'
     domain: string | null;                                      // solo 'external_call'
     language: 'groovy' | 'python' | null;                       // solo 'custom_code'
     commandType: string | null;                                 // solo 'other'
     children: FlowSkeletonNode[];
   }

   interface FlowSkeletonResult {
     flow: { flowId: number; flowCode: string; flowDes: string };
     skeleton: FlowSkeletonNode[];
     droppedStepIds: number[];   // passthrough exacto de analyzeFlow, no se recalcula
   }
   ```
   Todos los campos "solo de un rol" van `null` en los demás — evita uniones
   discriminadas complejas en el consumidor (Claude/MCP) a cambio de un
   shape plano y fácil de leer, igual de válido que el enfoque de Fase 2.

### Registro MCP (`server.ts`)

Mismo patrón que las 13 tools existentes: `server.tool(name, description, zodSchema, handler)`,
try/catch con `ok()`/`fail()`. 1 registro nuevo, ningún cambio a las 13 existentes.

## Testing

Fake client con `getFlow`+`getFlowSteps` mockeados (mismo patrón que
`analyzeFlow.test.ts`, sin HTTP real):

- Step con `flow` poblado → rol `subflow` con `invokesFlow` correcto,
  **incluso si además el step fuera DECISION o SOAP** (verifica que gana la
  precedencia #1).
- Step `actionType: DECISION` → rol `decision`, con `decisionCriteria`/
  `decision` propagados, y que gane sobre `commandType: CLASS`.
- Step `actionType: END`, `workerClass: SUCCESS` → rol `end`,
  `terminal: "SUCCESS"`.
- Step `commandType: SOAP` y otro `REST` → rol `external_call`, `protocol`
  correcto por cada uno, `domain` propagado.
- Step `commandType: GROOVY` y otro `PYTHON` → rol `custom_code`,
  `language` correcto por cada uno.
- Step `commandType: CLASS` sin ser subflow/decision/end (p. ej. `OUTFLOW`)
  → rol `flow_control`.
- Step con `commandType: null` y `actionType: 'ACTION'` → rol `other`, con
  `commandType: null` visible — el step sigue apareciendo en el árbol.
- Flow con huérfanos/ciclo (mismo fixture que `analyzeFlow.test.ts`) →
  `droppedStepIds` en el resultado es idéntico al que devuelve `analyzeFlow`
  — esta tool no reimplementa esa lógica, solo la hereda.
- Árbol con hijos anidados (2+ niveles) → la recursión preserva la
  estructura padre/hijo, no aplana el árbol.

## Rollout

- Mismo repo `ros-ai-mcp`, mismo `master`, sin rama nueva.
- Requisito previo: Fase 2 debe estar commiteada (ver
  [[project_ros_ai_mcp_server]]) antes de ejecutar este plan, porque
  `summarizeFlowSkeleton` importa `analyzeFlow` de Fase 2.
- Ejecución vía `superpowers:subagent-driven-development`: por ser 1 sola
  tool con lógica de clasificación (judgment real en la precedencia, no pura
  transcripción), usar modelo estándar (sonnet), no el tier barato.
- Sin criterio de aceptación MVP nuevo del usuario para esta fase — se
  considera lista cuando la tool está implementada, testeada, y el review
  final del branch queda limpio (mismo bar que Fase 1/2).

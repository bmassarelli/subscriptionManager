# ros-ai-mcp — Fase 2: Inteligencia sobre ROS

- **Date:** 2026-08-31
- **Status:** Approved (design)
- **Repo:** `ros-ai-mcp` (local, `C:\Users\52554\Documents\ros-ai-mcp`, sin remoto)

## Purpose

La Fase 1 de `ros-ai-mcp` (completada y verificada en esta misma sesión) expone
9 tools MCP de solo lectura sobre ROS/masros-gui: `search_flows`, `get_flow`,
`get_flow_steps`, `search_actions`, `get_action`, `get_action_command`,
`get_action_template`, `get_item_info`, `search_ros_items`. Son de bajo nivel:
cada una refleja un endpoint (o una combinación mínima de endpoints) casi tal
cual.

La Fase 2, según el spec original del usuario, agrega **4 tools de
"inteligencia"** que combinan y enriquecen las de Fase 1 para que Claude pueda:

- Encontrar Flows/Actions existentes reutilizables dado un requerimiento en
  lenguaje natural (`find_similar_flows`, `find_similar_actions`).
- Entender la estructura completa de un Flow sin tener que reconstruir el
  árbol de Steps a mano (`analyze_flow`).
- Diagnosticar un Item (dónde quedó, por qué, con qué otros items se
  relaciona) sin tener que cruzar manualmente 3 respuestas distintas
  (`analyze_item`).

## Goals

- 4 tools MCP nuevas, mismo patrón que Fase 1: función pura
  `(client: RosClientLike, input) => output` en `src/tools/`, testeada con un
  fake client (sin HTTP real), registrada en `src/server.ts`.
- Cero endpoints ROS nuevos que verificar — todas combinan datos que ya
  devuelven las tools de Fase 1. La única verificación nueva necesaria (los 4
  tipos XSD de "items relacionados": `MemberList`/`SplitMemberList`/
  `SubprocessMemberList`/`RelatedItem`) ya se hizo contra
  `ros_interface-xsd.xsd:306-422` antes de escribir este spec.
- Las tools solo estructuran/cruzan hechos determinísticamente. Ninguna
  inventa reglas de negocio ROS no verificadas (p. ej. "error X normalmente
  significa Y") — esa clase de razonamiento la hace Claude leyendo la
  respuesta estructurada, igual que ya ocurre con `get_item_info` en Fase 1.

## Non-goals

- No hay búsqueda semántica real (embeddings, LLM-en-el-medio) dentro de
  `find_similar_flows`/`find_similar_actions` — es scoring por palabras clave,
  determinístico y barato. Si el scoring por keywords resulta insuficiente en
  la práctica, es una fase futura, no parte de esto.
- `analyze_flow` no llama `GET /actionDBConfig/{actionId}` por step — la
  config de protocolo (timeouts, headers REST, etc.) queda fuera de esta tool.
  El usuario puede pedir `get_action` para una action puntual si la necesita.
- `analyze_item` no resuelve el detalle de los items relacionados (no llama
  `get_item_info` recursivamente para cada `groupMembers`/`parentMembers`/
  etc.) — solo lista los IDs y su rol. Evita explosión de llamadas HTTP y
  problemas de profundidad no acotada.
- No se tocan las tools de Fase 1 ni el cliente HTTP/sesión — Fase 2 es
  estrictamente aditiva sobre la base ya construida y revisada.
- Sigue sin haber tools de escritura (Fase 5+) ni `execute_flow` (Fase 6).

## Design

### Estructura de archivos (nueva, sobre lo ya construido en Fase 1)

```
src/
  tools/
    findSimilarFlows.ts
    findSimilarActions.ts
    analyzeFlow.ts
    analyzeItem.ts
    similarity.ts          # tokenizador + scoring compartido por las 2 tools "find_similar_*"
  rosClient/
    types.ts               # se AMPLÍA (no se reescribe): tipar MemberList/MemberItem,
                            # SplitMemberList/SplitMemberItem,
                            # SubprocessMemberList/SubprocessMemberItem, RelatedItem
                            # en SearchRosItem (hoy son `unknown`)
  server.ts                 # se amplía: registerTools gana las 4 tools nuevas
test/
  tools/
    findSimilarFlows.test.ts
    findSimilarActions.test.ts
    analyzeFlow.test.ts
    analyzeItem.test.ts
    similarity.test.ts
```

### `similarity.ts` — scoring compartido

```typescript
export function tokenize(text: string): string[]
```
Minúsculas, split por no-alfanuméricos, filtra una lista fija de stopwords
español/inglés básicas (`de, la, el, los, las, para, con, en, un, una, y, the,
a, an, of, for, to, and, ...`) y strings vacíos.

```typescript
export function scoreByKeywordOverlap<T>(
  keywords: string[],
  items: T[],
  getText: (item: T) => string
): Array<{ item: T; score: number }>
```
Para cada item, cuenta cuántas `keywords` aparecen como substring
case-insensitive en `getText(item)`. Devuelve **todos** los items con su
score (incluido 0) — el filtrado/orden/límite lo hace cada tool que lo usa,
no esta función (mantiene `similarity.ts` genérico y testeable en aislado).

### `find_similar_flows(requirement: string, limit = 10)`

1. `searchFlows(client, {})` → todos los flows visibles al usuario logueado.
2. `tokenize(requirement)`.
3. `scoreByKeywordOverlap(keywords, flows, f => \`${f.flowCode} ${f.flowDes}\`)`.
4. Filtra `score > 0`, ordena descendente por score, corta a `limit`.
5. Devuelve `Array<{ flow: UserFlowSummary; score: number }>`.

Si `searchFlows` no devuelve nada (0 flows visibles), devuelve `[]` — no es
un error, es un resultado válido.

### `find_similar_actions(requirement: string, limit = 10)`

Mismo algoritmo, sobre `searchActions(client, {})` puntuando
`\`${a.actionCode} ${a.actionDes}\``. Devuelve
`Array<{ action: RosAction; score: number }>`.

### `analyze_flow(flowId: number)`

1. `Promise.all([getFlow(client, {flowId}), getFlowSteps(client, {flowId})])`
   — no dependen entre sí, se piden en paralelo.
2. Arma el árbol a partir de la lista plana de `StepOptimistic[]`:
   - Cada nodo: `{ stepId, actionId, action: RosAction, decision, decisionCriteria,
     bypass, children: FlowStepNode[] }`.
   - Se indexa por `stepId`, se agrupa por `parentStepId`. `parentStepId` es
     `long` no-nullable en `StepOptimistic` (Fase 1); el step raíz del flow
     usa `parentStepId === 0` como sentinel (así lo usan tanto el fixture de
     test de Fase 1 — `test/tools/getFlowSteps.test.ts` — como el front real
     de ROS). El árbol se arma agrupando todos los steps por su
     `parentStepId`; el/los nodo(s) con `parentStepId === 0` son las raíces
     devueltas en `graph`.
   - Ramas DECISION/SWITCH: varios steps comparten `parentStepId`,
     desambiguados por `decision` (p. ej. `"SI"`/`"NO"` o un case-key) — se
     agrupan como hijos etiquetados, no aplanados.
3. Devuelve `{ flow: FlowInfo; graph: FlowStepNode[] }` (graph es la lista de
   raíces del árbol — normalmente un único elemento, el step inicial).

### `analyze_item(itemId: string)`

1. `getItemInfo(client, {itemId})` → `{item, flowSteps, recentHistory}`.
2. Resuelve `currentStep`: busca en `flowSteps` el nodo con
   `stepId === item.stepId`, devuelve su `action` completa (incluye
   `command`).
3. Resuelve `previousStep` (si `recentHistory[0]` existe): busca en
   `flowSteps` el nodo con `stepId === recentHistory[0].PREV_STEP_ID`,
   devuelve `{ stepId, action, elapsedMillis: recentHistory[0].PREV_ACTION_ELAPSED_MILLIS }`.
   Si no hay `recentHistory` o no matchea ningún step (p. ej. item recién
   creado, sin historial), `previousStep` es `null` — no se inventa un
   fallback.
4. Tipa (amplía `src/rosClient/types.ts`) y expone `relatedItems`:
   - `groupMembers`, `cloneMembers`, `parentMembers`:
     `Array<{ itemId: number; flowCode; flowDes; statusCode; statusDes }>`
     (nota: `itemId` acá es `number`, viene de `xsd:decimal` — NO castear a
     string para "uniformar" con el resto del sistema, es una inconsistencia
     real del esquema ROS que hay que preservar, no ocultar).
   - `splitMembers`, `subprocessMembers`:
     `Array<{ itemId: string; forStepId: number; flowCode; flowDes; statusCode; statusDes }>`.
   - `flowItem`: `{ itemId: string; flowCode; statusCode; statusDes } | null`.
5. Devuelve:
   ```typescript
   {
     item: SearchRosItem;           // tal cual ya devuelve get_item_info
     currentStep: { stepId, action } | null;
     previousStep: { stepId, action, elapsedMillis } | null;
     relatedItems: { groupMembers, cloneMembers, parentMembers, splitMembers, subprocessMembers, flowItem };
   }
   ```
   Sin campo de "hipótesis" ni "diagnóstico" — eso lo redacta Claude a partir
   de estos hechos ya cruzados, igual que hoy hace con la respuesta cruda de
   `get_item_info`.

### Registro MCP (`server.ts`)

Mismo patrón que las 9 tools existentes: `server.tool(name, description, zodSchema, handler)`,
`handler` envuelve la llamada en try/catch y usa los mismos helpers `ok()`/`fail()`
ya existentes. 4 registros nuevos, ningún cambio a los 9 existentes.

## Testing

- `similarity.test.ts`: tokenización (stopwords, mayúsculas, puntuación),
  scoring (0 matches, matches parciales, empate de score no rompe el orden
  esperado — usar `sort` estable o desempatar por orden original).
- `findSimilarFlows.test.ts` / `findSimilarActions.test.ts`: fake client
  devuelve una lista fija, se verifica orden/corte por `limit`, caso lista
  vacía.
- `analyzeFlow.test.ts`: fixture de flow con al menos un step con
  `parentStepId` compartido por 2 hijos con `decision` distinto (rama
  DECISION), se verifica que el árbol resultante los agrupa como hermanos
  bajo el padre correcto, no aplanados.
- `analyzeItem.test.ts`: fixture con `recentHistory` no vacío y con
  `relatedItems` poblados en al menos 2 de las 4 categorías, se verifica
  cruce correcto de `currentStep`/`previousStep` contra `flowSteps`, y que
  `relatedItems.groupMembers[].itemId` queda como `number` (no string).

## Rollout

- Mismo repo `ros-ai-mcp`, mismo `master`, sin rama nueva (igual que Fase 1
  se hizo directo en `master` por ser repo local sin remoto ni colaboradores).
- Ejecución vía `superpowers:subagent-driven-development`, mismo criterio de
  modelo que Fase 1 (haiku para tasks de pura transcripción, sonnet para las
  que requieren cruce/judgment real — `analyzeFlow`'s reconstrucción de árbol
  y `analyzeItem`'s cruce de 3 fuentes son las candidatas a sonnet).
- Sin criterio de aceptación MVP nuevo del usuario para esta fase — se
  considera lista cuando las 4 tools están implementadas, testeadas, y el
  review final del branch queda limpio (mismo bar que Fase 1).

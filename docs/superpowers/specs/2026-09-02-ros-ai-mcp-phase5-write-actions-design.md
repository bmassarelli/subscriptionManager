# ros-ai-mcp — Fase 5: escritura de Actions con aprobación humana

- **Date:** 2026-09-02
- **Status:** Approved (design)
- **Repo:** `ros-ai-mcp` (local, `C:\Users\52554\Documents\ros-ai-mcp`, sin remoto)
- **Depends on:** Fase 1's `getAction` (para el diff en modo preview). Fases 1-4
  ya están commiteadas y validadas en vivo.

## Purpose

Fases 1-4 son estrictamente de lectura: exploran, entienden y ayudan a
diseñar por analogía, pero nunca tocan ROS. El spec original del usuario
pide, a partir de acá, tools de **escritura** con un workflow obligatorio de
aprobación humana (generar → mostrar diff/resumen → el usuario aprueba →
ejecutar), y que sea completamente deshabilitable por config.

Fase 5 cubre el primero y mejor entendido de los 5 endpoints de escritura del
spec original: `saveAction`/`updateCommand` (crear o actualizar una Action).
`saveFlowDetail` y el import de flows YAML (`checkYMLFileImportDiff`/
`executeImportFlow`, que además es multipart y tiene mutex de proceso) quedan
para una fase posterior — mismo enfoque incremental de las fases anteriores.

## Goals

- 1 tool MCP nueva, `save_action`, función pura
  `(client: RosClientLike, input) => output` en `src/tools/`, testeada con un
  fake client, registrada condicionalmente en `src/server.ts`.
- Aprobación humana real, no solo nominal: sin `confirm:true` la tool nunca
  llama a ROS — solo genera un preview/diff determinístico. El paso de
  "el usuario aprueba" ocurre en la conversación (Claude muestra el preview,
  espera la aprobación explícita del usuario, recién ahí reintenta con
  `confirm:true`), no dentro del tool.
- Deshabilitable por config: `ROS_MCP_ENABLE_WRITE` (default apagado) controla
  si `save_action` se registra en el servidor MCP.
- `updateCommand` **no** se expone como tool separada: verificado que el
  endpoint real solo delega a `saveAction` reenviando el payload completo —
  exponerla aparte duplicaría el mecanismo de preview/confirm sin beneficio
  real.
- El diff en modo update se basa en un `getAction` real hecho por la propia
  tool, no en lo que el caller diga que es el estado actual — evita previews
  mentirosos si Claude no leyó el estado más reciente.

## Non-goals

- `saveFlowDetail`, `checkYMLFileImportDiff`, `executeImportFlow` — fase
  futura (5b/6), no parte de este spec.
- No hay batch (guardar varias actions en una sola llamada).
- No se reintenta automáticamente un guardado rechazado por versión obsoleta
  — la tool informa el conflicto, Claude/el usuario deciden si releer y
  reintentar.
- No se valida el contenido del script (sintaxis Groovy/Python, contenido
  sensible) del lado de la tool — eso ya lo hace ROS de forma sincrónica al
  guardar (ver Design); la tool solo **avisa** que va a pasar, no lo
  duplica ni lo simula.
- No se tocan las tools de Fase 1-4 ni el cliente HTTP/sesión — Fase 5 es
  aditiva, salvo la extensión de `config.ts` para el flag de gating.
- Sigue sin haber `execute_flow` (Fase 6) ni el flujo de auth JWT
  clientId/clientSecret.

## Design

### Contrato real verificado (`ActionController.java`, checkout `ros5`)

`POST /actionDetail/saveAction` — JSON, pero un `Map<String,Object>` sin tipar,
no un DTO plano:
```json
{
  "actionData": { "actionId": -1, "actionCode": "...", "actionDes": "...",
                   "actionSync": "...", "actionType": "...", "commandType": "...",
                   "actionCommands": "...", "domain": "...", "protocol": "...",
                   "method": "...", "contentType": "...", "workerClass": "...",
                   "version": "3", "eager": false },
  "READ_TIMEOUT": ..., "CONNECT_TIMEOUT": ..., "REST_HEADERS": ...,
  "CIRCUIT_BREAKER_CONFIG": ..., "TOPIC_KEY": ..., "SYSTEM": ..., "DESCRIPTION": ...
}
```
Notar los nombres de campo distintos a los del lado de lectura:
`actionCommands` (no `command`), `actionSync` (no `syncBy`), `version` como
**string**. `actionId: -1` (sentinel `RosAction.NEW_ACTION`) → crear; otro
valor → actualizar. `updateCommand` es un alias fino que reenvía el mismo
`actionData` completo — no acepta un payload reducido.

**Concurrencia optimista:** en update, `version` debe matchear exactamente la
versión vigente en ROS o falla con `SkException("tool.alertRecVersion")`,
capturada por un catch amplio y devuelta como `AjaxData` de error (no una
excepción de transporte ni un status HTTP distintivo). En create, `version`
se ignora — el servidor la fija en `1`.

**Respuesta exitosa:** `RequestPaginationData`-shaped `AjaxData` con
`responseStatus`, `successMessage` (incluye el `actionId`), y `requestData` =
el `RosAction` guardado **sin** el campo `command` (queda en blanco) — para
confirmar el script guardado hay que releer con `get_action`/
`get_action_command`.

**Efectos colaterales a advertir en el preview:** para GROOVY/PYTHON, ROS
**compila el script de forma sincrónica** como parte de la misma transacción
del guardado — si falla la compilación, se revierte todo. También corre un
scan de contenido sensible que puede rechazar el guardado. El `hash` que
mande el caller se ignora (siempre se recalcula server-side). El guardado
además **propaga sincrónicamente** una invalidación de caché a otros nodos
del cluster ROS (JGroups) antes de que vuelva la respuesta HTTP — no es
local a un nodo.

### Estructura de archivos (nueva, sobre lo ya construido)

```
src/
  tools/
    saveAction.ts            # NUEVO — preview/diff + confirm:true → POST real
  rosClient/
    types.ts                  # se amplía: SaveActionRequestBody (wire shape real), SaveActionAjaxResponse
  config.ts                   # se amplía: enableWrite: boolean (ROS_MCP_ENABLE_WRITE)
  server.ts                   # se amplía: registro condicional de save_action (solo si enableWrite)
test/
  tools/
    saveAction.test.ts        # NUEVO
  config.test.ts              # se amplía: casos de enableWrite
```

### `save_action(input: SaveActionInput): Promise<SaveActionResult>`

Input, en nombres "amigables" que la tool traduce al wire format real:
```typescript
interface SaveActionInput {
  actionId?: number;          // omitido = crear; presente = actualizar
  // actionCode/actionType/commandType/command son REQUERIDOS al crear (no hay
  // base de la que mergear); OPCIONALES al actualizar (el merge contra el
  // estado actual de getAction completa lo que el input no traiga).
  actionCode?: string;
  actionDes?: string;
  actionType?: string;
  commandType?: string;       // GROOVY | PYTHON | REST | SOAP | DB | ...
  command?: string;           // -> actionCommands en el wire
  domain?: string;
  protocol?: string;
  method?: string;
  contentType?: string;
  workerClass?: string;
  syncBy?: string;             // -> actionSync
  eager?: string;              // 'Y'/'N' — verified as a String field server-side (RosAction.java/MassActionFormInfo.java), not boolean
  version?: string;            // REQUERIDO si actionId está presente
  config?: {
    readTimeoutMs?: number; connectTimeoutMs?: number;
    restHeaders?: Record<string, string>; circuitBreakerConfig?: unknown;
    topicKey?: string; system?: string; description?: string;
  };
  confirm?: boolean;           // default false
}

interface SaveActionResult {
  applied: boolean;
  mode: 'create' | 'update';
  preview: {
    summary: string;
    fieldDiffs?: Array<{ field: string; from: unknown; to: unknown }>;  // solo update
    warnings: string[];
  };
  result?: { actionId: number; version: string; successMessage?: string };
  error?: { message: string };
}
```

Lógica:

0. **Validación de modo:** si `input.actionId` está ausente (create) y falta
   alguno de `actionCode`/`actionType`/`commandType`/`command`, la tool
   devuelve un error de validación (no llama a ROS ni a `getAction`) — en
   create no hay estado previo del que completar lo faltante.
1. **Si `input.actionId` está presente (modo update):**
   - Llama `getAction(client, { actionId })` (Fase 1) para traer el estado
     real actual.
   - **Merge, no reemplazo:** ROS no completa campos faltantes del lado
     servidor (confirmado — `updateCommand` exige el `actionData` completo,
     no mergea la base por vos). Por eso la tool arma el payload wire final
     tomando el estado actual completo como base y **solo pisa los campos
     que el input trae explícitamente** (`input[campo] !== undefined`). Así
     el input puede seguir siendo parcial (el caller solo pasa lo que quiere
     cambiar) sin riesgo de vaciar accidentalmente un campo que no tocó.
   - `fieldDiffs`: solo los campos donde el valor final (post-merge) difiere
     del actual — es decir, exactamente los campos que el input pisó y que
     además cambiaron de valor.
   - Si `input.version !== estadoActual.version` → agrega a `warnings`:
     `"La versión enviada (X) ya no es la vigente (Y) — releé con get_action
     antes de guardar."`.
   - `mode: 'update'`.
2. **Si `input.actionId` está ausente (modo create):** no hay diff — el
   `summary` lista los campos a crear. `mode: 'create'`.
3. **Warnings fijos** (ambos modos) cuando `commandType` es `GROOVY`/`PYTHON`
   y hay `command`: aviso de compilación sincrónica server-side. Siempre:
   aviso de propagación de caché a otros nodos del cluster.
4. **Si `confirm` no es `true`:** devuelve `{ applied: false, mode, preview }`
   — no llama a ROS.
5. **Si `confirm: true`:** arma el payload wire real (`actionData` +
   claves de config a nivel top) y llama
   `client.postJson('/actionDetail/saveAction', payload)`.
   - Si la respuesta trae `requestData` con `actionId` → éxito:
     `{ applied: true, mode, preview, result: { actionId, version,
     successMessage } }`.
   - Si la respuesta indica error (falta `requestData`, o `responseStatus`/
     `errorMessage` lo señalan) → `{ applied: false, mode, preview,
     error: { message } }` — **no** se lanza una excepción; un rechazo de
     ROS (versión obsoleta, fallo de compilación, `actionCode` duplicado) es
     una respuesta de negocio esperable, no una falla de transporte.

### Registro MCP (`server.ts`)

`save_action` solo se agrega a la lista de tools registradas si
`config.enableWrite === true`. Si está apagada, el tool **no existe** para el
cliente MCP (no es un check en runtime que devuelve un error) — más difícil
de invocar por accidente que un flag interno.

### `config.ts`

```typescript
export interface RosConfig {
  // ... campos existentes
  enableWrite: boolean;
}
```
`enableWrite = env.ROS_MCP_ENABLE_WRITE === 'true'` — cualquier otro valor o
ausencia → `false` (apagado por defecto, dado que ROS es un sistema
productivo real con datos de DEV/QA reales).

## Testing

Fake `RosClientLike` (sin HTTP real), casos:

- **Create, confirm:false** → `applied:false`, `mode:'create'`, `summary`
  lista los campos, sin `fieldDiffs`.
- **Update, confirm:false** → `getAction` se llama con el `actionId`
  correcto; `fieldDiffs` solo contiene campos que cambiaron, no los que
  quedaron iguales.
- **Update parcial, confirm:true** → el payload enviado a `postJson` trae
  **todos** los campos del `actionData` (los pisados por el input + los
  heredados del estado actual vía merge) — nunca un campo queda `undefined`/
  ausente por el solo hecho de que el input no lo mencionó.
- **Create sin `actionCode`/`actionType`/`commandType`/`command`** → error de
  validación, ni `getAction` ni `postJson` se llaman.
- **Update con `version` desactualizada, confirm:false** → warning de
  versión obsoleta presente, `applied` sigue `false` (el preview no bloquea,
  solo avisa).
- **`commandType: GROOVY` con `command` distinto** → warning de compilación
  presente; **`commandType: REST` sin `command` nuevo** → warning de
  compilación ausente.
- **Create, confirm:true, éxito** → payload enviado a `postJson` tiene la
  forma wire real (`actionData.actionCommands`, no `command`;
  `actionData.version` es string); resultado `applied:true` con `actionId`
  del `requestData`.
- **Update, confirm:true, éxito** → mismo, con `actionId` real en el path del
  `actionData`.
- **confirm:true, ROS devuelve error** (ej. `responseStatus` de error /
  `requestData` ausente) → `applied:false`, `error.message` presente, la
  tool **no** lanza excepción.
- **`ROS_MCP_ENABLE_WRITE` ausente o `'false'`** → `config.enableWrite` es
  `false`, y `save_action` no aparece en la lista de tools que registra
  `server.ts`.
- **`ROS_MCP_ENABLE_WRITE=true`** → `save_action` sí se registra.

## Rollout

- Mismo repo `ros-ai-mcp`, mismo `master`, sin rama nueva (consistente con
  Fases 1-4).
- Ejecución vía `superpowers:subagent-driven-development`: hay judgment real
  (mapeo de nombres de campo, lógica de diff, decisión de qué es warning
  fijo vs condicional) — modelo estándar (sonnet), no el tier barato.
- Sin criterio de aceptación MVP en vivo obligatorio para esta fase en sí
  misma — a diferencia de Fase 1, escribir de verdad contra ROS real
  (aunque sea DEV/QA) es una acción con efectos reales (compilación,
  broadcast de caché, fila de historial), así que cualquier prueba end-to-end
  contra ROS real debe ser una decisión explícita del usuario en el momento
  (qué action de prueba usar, en qué ambiente), no algo que este plan
  automatice o de por sentado.

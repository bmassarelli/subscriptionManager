# ros-ai-mcp — Fase 7: consulta de estado de job (`get_job_status`)

- **Date:** 2026-09-06
- **Status:** Approved (design)
- **Repo:** `ros-ai-mcp` (local, `C:\Users\52554\Documents\ros-ai-mcp`, sin remoto)
- **Depends on:** Fase 6's `RosAuthClient` y la infraestructura de auth JWT
  (`ros-authorization` + `ros-rest`). Fases 1-6 ya están commiteadas; Fase 5
  (`save_action`) está validada en vivo, Fase 6 (`execute_flow`) todavía no.

## Purpose

Fase 6 agregó `execute_flow`, que programa un job de mass-scheduler en
`ros-rest` y devuelve un `jobId`. El spec original del usuario contemplaba,
como pieza separada, poder consultar después cómo quedó ese job — hoy no hay
ninguna forma de hacerlo desde `ros-ai-mcp`. Fase 7 agrega `get_job_status`,
una tool de **solo lectura** que envuelve `GET /jobDetail` de `ros-rest` para
responder esa pregunta.

## Goals

- 1 tool MCP nueva, `get_job_status(jobId)`, de solo lectura — sin `confirm`,
  sin preview/diff (no hay nada que aprobar, es una consulta).
- Reutiliza toda la infraestructura de auth JWT ya construida en Fase 6
  (`RosAuthClient`, mismo reintento único ante 401 que `execute_flow`).
- Gateada bajo `ROS_MCP_ENABLE_WRITE` — mismo flag que `save_action`/
  `execute_flow`, no se introduce un flag nuevo.
- Passthrough completo (sin curar/resumir) de `SearchJobDetailResponse`,
  mismo estilo que las tools de lectura de Fase 1 (`get_flow`, `get_action`).

## Non-goals

- `GET /job` (búsqueda/listado de jobs por flowId/statusId/rango de fecha,
  paginado) — decisión explícita del usuario al brainstormear esta fase;
  el caso de uso real es "tengo un jobId de `execute_flow`, quiero saber
  cómo quedó", no un browser genérico de jobs.
- `ChangeJobStatus` (`POST` para cambiar estado/reprogramar un job) — es una
  escritura real, no encaja en el alcance de solo-lectura de esta fase.
- Detección de "job no encontrado" vía excepción de ROS — ROS mismo no la
  tiene (`SearchJobDetailOperation` devuelve una respuesta casi vacía en
  silencio si el `jobId` no existe en `MassScheduler` ni en
  `MassSchedulerHist`). Esta fase agrega una heurística propia (ver Design)
  para no dejar al caller interpretando un objeto vacío a ciegas, pero no
  inventa un mensaje de error que ROS no produce.
- No se toca `RosClient`/`session.ts` ni ninguna tool de Fases 1-6 — Fase 7
  es aditiva sobre `rosRestClient.ts`.

## Design

### Contrato real verificado (`ros-rest`, checkout `ros5`)

**Endpoint:** `GET /jobDetail?jobId=<long>` en
`RosInterfaceRestController.java:325-334` ("Search a Job Detail") —
delega en `RosInterfaceProcessor.processSearchJobDetail` →
`SearchJobDetailOperation.java:36-190`.

**Request:** un único parámetro, `jobId` (long, requerido; ROS valida
`jobId > 0` y tira si no).

**Response — `SearchJobDetailResponse`** (generado por JAXB desde
`ros_interface-xsd.xsd:902-1000`, no hay `.java` a mano; extiende
`BaseResponse`, así que siempre trae `responseStatus{status, statusCode,
statusMessage}` igual que `CreateJobResponse` de Fase 6):

```json
{
  "responseStatus": { "status": 100, "statusCode": "...", "statusMessage": "..." },
  "jobId": 98765,
  "flowId": 12345,
  "flowCode": "...",
  "flowDes": "...",
  "filename": "...",
  "createUser": "...",
  "statusId": 90,
  "statusCode": "FINISHED",
  "statusDes": "...",
  "entryDate": "...",
  "startDate": "...",
  "items": 120,
  "progressPercentage": 100,
  "historyDetails": true,
  "schedulerNotification": { "notificationId": 1, "email": ["..."] },
  "monitorProcessJob": { "item": [ { "stepId": 1, "actionId": 2, "actionCode": "...", "actionDes": "...", "statusId": 100, "statusCode": "...", "statusDes": "...", "items": 40 } ] },
  "monitorProcessJobHist": { "item": [ /* mismo shape que monitorProcessJob */ ] },
  "historyJob": { "item": [ { "histId": 1, "statusDate": "...", "modUser": "...", "statusId": 0, "statusCode": "SCHEDULED", "statusDes": "...", "startDate": "..." } ] },
  "errorCodeGroup": { "errorItem": [ { "errorCode": "...", "items": 3, "actionId": 2, "actionDes": "...", "areSubflows": false, "isEvaluatorAction": false, "errorType": "..." } ] }
}
```

Semántica confirmada por lectura de `SearchJobDetailOperation.java`:
- Busca primero en `MassScheduler` (jobs en curso); si no lo encuentra, cae a
  `MassSchedulerHist` y marca `historyDetails: true` (líneas 53-57).
- `errorCodeGroup` solo se puebla cuando `!historyDetails` (línea 128) — un
  job ya finalizado/histórico nunca lo trae.
- `monitorProcessJobHist` solo se calcula como query secundaria cuando el
  job es de la tabla en-curso (líneas 96-104).
- **Job inexistente en ambas tablas**: no se tira excepción — la respuesta
  vuelve con `responseStatus` de éxito y el resto de los campos (`jobId`,
  `statusId`, `flowId`, etc.) simplemente ausentes/`undefined`. Este es el
  caso que la heurística de esta fase tiene que cubrir explícitamente.

**Status codes** — enum fijo en `Status.java:11-29` (valores numéricos
confirmados por código; los strings `statusCode`/`statusDes` que ROS
serializa salen de una tabla en BD vía `RosCache`, no del enum, así que sus
valores de texto exactos no están confirmados por código):
```
ERROR(-1), CIRCUIT_OPEN(-2), NOTIFY_ERROR(-3), SCHEDULED(0), STARTED(10),
PROCESSED(15), BYPASSED(20), TRANSFERRED(25), IGNORED(30),
PENDING_CANCEL(40), PENDING_CANCEL_ALL(50), STOPPED(-10), FINISHED(90),
SUCCESS(100), CANCEL(200), CANCEL_ALL(-200), ERROR_CANCEL(-4),
ERROR_CANCEL_ALL(-5)
```

**Auth:** mismo mecanismo de `AuthorizationFilter`/`RosFlowRoutingDetect`
que ya se verificó para `POST /job` en Fase 6 — el bypass de `JWTAuthorizer`
depende de si existe una fila `RosFlowRouting` para `(GET, /jobDetail)` en
BD, dato no verificable desde el código fuente solo. Por identidad de
mecanismo con `POST /job` (mismo controller, misma clase de ruta de
monitoreo, no una ruta de integración partner-facing), se asume el mismo
comportamiento (probable bypass), pero **esto es una inferencia, no un
hecho confirmado en BD** — igual se manda el JWT siempre, mismo criterio
que Fase 6.

### Estructura de archivos (nueva, sobre lo ya construido)

```
src/
  rosClient/
    rosRestClient.ts     # se amplía: getJobDetail(baseUrl, token, jobId, timeoutMs)
    types.ts              # se amplía: JobDetailResponse + sub-tipos (MonitorProcessJobItem, HistoryJobItem, ErrorCodeGroupItem, SchedulerNotification)
  tools/
    getJobStatus.ts        # NUEVO — sin preview/confirm, llama authClient.getToken() + getJobDetail()
  server.ts                # se amplía: registro condicional de get_job_status bajo el mismo enableWrite
test/
  rosClient/
    rosRestClient.test.ts  # se amplía: casos de getJobDetail
  tools/
    getJobStatus.test.ts    # NUEVO
```

No hay cliente de auth nuevo — `get_job_status` reutiliza `ExecuteFlowDeps`
(el mismo shape de deps que ya usa `execute_flow`: `restBaseUrl`,
`authClient`, `httpTimeoutMs`) construido una sola vez en `index.ts`. No
necesita `auditOrigin`/`auditUsername` (esos son específicos del body de
`POST /job`), así que la tool solo toma del deps lo que le hace falta.

### `getJobDetail` (`rosRestClient.ts`)

```typescript
export async function getJobDetail(
  baseUrl: string, token: string, jobId: number, timeoutMs: number
): Promise<JobDetailResponse> { ... }
```
`rawRequest('GET', `${baseUrl}/jobDetail?jobId=${jobId}`, ...)` con header
`Authorization: Bearer <token>`. Si `status < 200 || status >= 300` →
`throw mapHttpError(...)` (mismo comportamiento que `createJob`). Si 200,
parsea el JSON y lo devuelve tal cual — no interpreta `responseStatus` ni
decide "found" acá, igual que `createJob` no interpreta `responseStatus.status`
de `POST /job`; esa interpretación vive en la tool.

### `get_job_status(input: GetJobStatusInput): Promise<GetJobStatusResult>`

```typescript
interface GetJobStatusInput {
  jobId: number;
}

interface GetJobStatusResult {
  found: boolean;               // heurística propia, no viene de ROS
  jobId?: number;
  flowId?: number;
  flowCode?: string;
  flowDes?: string;
  filename?: string;
  createUser?: string;
  statusId?: number;
  statusCode?: string;
  statusDes?: string;
  entryDate?: string;
  startDate?: string;
  items?: number;
  progressPercentage?: number;
  historyDetails?: boolean;
  schedulerNotification?: { notificationId?: number; email?: string[] };
  monitorProcessJob?: { item: MonitorProcessJobItem[] };
  monitorProcessJobHist?: { item: MonitorProcessJobItem[] };
  historyJob?: { item: HistoryJobItem[] };
  errorCodeGroup?: { errorItem: ErrorCodeGroupItem[] };
}
```

Firma real:
```typescript
export async function getJobStatus(
  restDeps: ExecuteFlowDeps,
  input: GetJobStatusInput
): Promise<GetJobStatusResult> { ... }
```

Lógica:
1. **Validación:** `jobId` debe ser un entero > 0 (mismo criterio que ROS
   aplica server-side) → si no, error de validación, ni `authClient` ni
   `getJobDetail` se llaman.
2. `token = await restDeps.authClient.getToken()`.
3. `response = await getJobDetail(restDeps.restBaseUrl, token, jobId, restDeps.httpTimeoutMs)`.
   - Si tira `RosAuthError` (401) **y no era ya un retry**: fuerza
     `token = await restDeps.authClient.getToken(true)` y reintenta
     `getJobDetail` **una sola vez**; si vuelve a fallar, se propaga tal
     cual (excepción real, mismo criterio que `execute_flow`).
   - Cualquier otro error de `getJobDetail` (timeout, 5xx, etc.) se propaga
     como excepción sin reintento — lo captura `fail()` en `server.ts`,
     igual que las demás tools.
4. **Heurística "found"**: si `response.statusId === undefined &&
   response.flowId === undefined` → `{ found: false }` (todo lo demás queda
   `undefined`, sin inventar un mensaje que ROS no produce). Si no,
   `{ found: true, ...resto de los campos mapeados tal cual }`.
5. No hay `confirm`/preview — es una lectura, se llama directo sin gate de
   confirmación (a diferencia de `save_action`/`execute_flow`, que sí mutan
   estado en ROS).

### Registro MCP (`server.ts` / `index.ts`)

`get_job_status` se registra en `server.ts` bajo el mismo
`if (options.enableWrite)` que ya envuelve a `save_action`/`execute_flow` —
no un flag nuevo. Reutiliza el mismo `restDeps` que ya arma `index.ts` para
`execute_flow` (si `restDeps` es `undefined` porque faltan las 6 variables
de `.env`, `get_job_status` tampoco se registra — a diferencia de
`execute_flow`, que sí se registra siempre y solo falla en `confirm:true`,
acá no tiene sentido registrar una tool de solo-lectura que nunca podría
completar su única operación).

## Testing

Mismo enfoque que fases anteriores — sin red real, `rawRequest` mockeado.

**`getJobDetail`:**
- Éxito → devuelve el body parseado tal cual (incl. arrays anidados).
- HTTP 401/500 → tira el error mapeado (`mapHttpError`), no devuelve un
  `JobDetailResponse`.

**`getJobStatus`:**
- `jobId` inválido (0, negativo, no entero) → error de validación, ni
  `authClient.getToken` ni `getJobDetail` se llaman.
- Éxito con job existente (rama `MassScheduler`, `historyDetails: false`) →
  `found: true`, todos los campos top-level y `monitorProcessJob`/
  `monitorProcessJobHist`/`errorCodeGroup` mapeados correctamente.
- Éxito con job histórico (`historyDetails: true`, sin `errorCodeGroup`
  ni `monitorProcessJobHist` en el body) → `found: true`, esos campos
  quedan `undefined`, el resto se mapea igual.
- Respuesta sin `statusId` ni `flowId` (job inexistente) → `found: false`,
  resto de campos `undefined`.
- `confirm:true` sin `restDeps` — N/A, cubierto porque la tool ni se
  registra sin `restDeps` (ver arriba); test de `server.ts`/`index.ts`
  cubre que no aparece en la lista de tools cuando falta config.
- `getJobDetail` tira 401 la primera vez → se llama `getToken(true)` y se
  reintenta una sola vez; si la segunda también falla, la excepción se
  propaga.
- `ROS_MCP_ENABLE_WRITE` en `false`/ausente → `get_job_status` no aparece
  en la lista de tools registradas (mismo flag ya cubierto por Fases 5/6,
  se agrega el caso de que ahora también gatea esta tool).

## Rollout

- Mismo repo `ros-ai-mcp`, mismo `master`, sin rama nueva (consistente con
  Fases 1-6).
- Ejecución vía `superpowers:subagent-driven-development` — poco judgment
  nuevo real (reutiliza casi toda la infraestructura de Fase 6); estimado
  2-3 tareas: `getJobDetail` + tipos en `rosRestClient.ts`/`types.ts` →
  tool `getJobStatus` → wiring en `server.ts`/`index.ts`. Modelo estándar
  (sonnet), salvo la tarea de tipos/wiring que puede ir en haiku por ser
  mayormente transcripción del XSD verificado arriba.
- **Preservar el workspace de SDD al final**
  (`.superpowers/sdd/2026-09-06-ros-ai-mcp-phase7-job-status/`), no
  borrarlo — mismo motivo de siempre (plan en `ts-skills-1`, código en
  `ros-ai-mcp`).
- Sin criterio de aceptación en vivo obligatorio para esta fase en sí
  misma — la primera prueba real requiere un `jobId` real de un
  `execute_flow` que ya se haya corrido en vivo, lo cual todavía depende de
  la verificación en vivo pendiente de Fase 6 (ver
  `docs/superpowers/specs/2026-09-04-ros-ai-mcp-phase6-execute-flow-design.md`).
  Puede probarse contra un `jobId` inexistente (caso `found:false`) sin
  ninguna de esas dependencias, si se quiere una señal parcial en vivo antes.

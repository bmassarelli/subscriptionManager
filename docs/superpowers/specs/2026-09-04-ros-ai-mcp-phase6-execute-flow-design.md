# ros-ai-mcp — Fase 6: ejecución de flows vía ros-rest + JWT

- **Date:** 2026-09-04
- **Status:** Approved (design)
- **Repo:** `ros-ai-mcp` (local, `C:\Users\52554\Documents\ros-ai-mcp`, sin remoto)
- **Depends on:** Fase 1's `getFlow` (para el preview). Fases 1-5 ya están
  commiteadas y validadas en vivo (incluyendo `save_action`).

## Purpose

Fases 1-5 hablan siempre con `masros-gui` vía sesión (`JSESSIONID`). El spec
original del usuario pide, como última pieza, una tool `execute_flow` que
dispare la ejecución de un flow — pero eso vive en un servicio HTTP
completamente distinto, `ros-rest`, protegido con un JWT bearer obtenido de
un tercer servicio, `ros-authorization` (`POST /authenticate` con
`clientId`/`clientSecret`). Fase 6 agrega esa tool y la infraestructura de
auth JWT que le hace falta, sin tocar el cliente de sesión existente.

## Goals

- 1 tool MCP nueva, `execute_flow`, con el mismo mecanismo de preview/confirm
  obligatorio que `save_action` (Fase 5) — sin `confirm:true` nunca se llama
  a `ros-rest` ni a `ros-authorization`.
- Un cliente de auth JWT nuevo y aislado (`RosAuthClient`) que obtiene y
  cachea el token de `POST /authenticate`, renovándolo antes de que expire.
- Reutiliza el `rawRequest`/`mapHttpError` de `httpClient.ts` para las
  llamadas a `ros-rest`/`ros-authorization` — son HTTP simple con header
  `Authorization: Bearer`, no necesitan el manejo de sesión/cookie de
  `RosClient`.
- Deshabilitable con el mismo flag que Fase 5, `ROS_MCP_ENABLE_WRITE` — no se
  introduce un segundo flag. El **preview** de `execute_flow` funciona sin
  credenciales de `ros-rest`/`ros-authorization` configuradas (solo necesita
  `getFlow`, que ya usa la sesión existente); solo el paso `confirm:true`
  requiere que las 6 variables nuevas de `.env` estén completas.

## Non-goals

- Las rutas dinámicas por-integración de `ros-rest` (`TSKEndpointRest`,
  configuradas vía `RosFlowRouting` en BD) — su contrato depende de config
  por flow, no de código fijo; no son genéricamente envolvibles en una tool.
  Confirmado con el usuario que Fase 6 cubre únicamente `POST /job`.
- Una tool para consultar el estado del job después de crearlo (`GET /job`,
  `GET /jobDetail`) — fuera de alcance de esta fase; se puede agregar después
  si hace falta.
- Ejecución real contra ROS en el smoke test automático (`scripts/smoke.ts`)
  — a diferencia de las tools de lectura, disparar un job real no es algo
  seguro de automatizar sin supervisión. La primera prueba en vivo queda
  para un paso posterior explícito del usuario, mismo patrón que
  `save_action` tuvo con su action descartable dedicada.
- No se toca `RosClient`/`session.ts` ni ninguna tool de Fases 1-5 — Fase 6
  es aditiva, salvo la extensión de `config.ts` para las 6 variables nuevas.
- No hay reintento automático más allá de un único refresh-y-retry ante un
  401 — si vuelve a fallar, se propaga el error tal cual.

## Design

### Contrato real verificado (`ros-rest`/`ros-authorization`, checkout `ros5`)

**Auth:** `POST /authenticate` en `ros-authorization` (`JwtAuthenticationController`)
— body `{clientId, clientSecret}` → `{token, expiryHours}`. El JWT se manda
como header `Authorization: Bearer <token>` en cada llamada a `ros-rest`
(`JWTAuthorizer.getJwtTokenFromAuthorizationHeader`).

**Ejecución:** `POST /job` en `ros-rest` (`RosInterfaceRestController.java:336-344`,
"Create a Job by Flow") — programa un job de mass-scheduler para el flow, no
ejecuta un ítem puntual de forma síncrona:
```json
{
  "audit": { "origin": "...", "username": "..." },
  "flowId": 12345,
  "flowCode": "...",
  "notification": { "email": ["..."] }
}
```
`flowId`/`flowCode` son ambos opcionales en el XSD pero se exige al menos uno
en código (`CreateJobOperation.java:33`); `audit.origin`/`audit.username` son
obligatorios (`OperationUtil.basicValidation`).

**Respuesta — siempre HTTP 200 desde este controlador**, el resultado real
viene en el body:
```json
{
  "responseStatus": { "status": 100, "statusCode": "...", "statusMessage": "..." },
  "jobId": 98765,
  "jobStatusId": ...,
  "jobStatusCode": "SCHEDULED"
}
```
`status: 100` = éxito (`Status.SUCCESS`); cualquier otro valor (típicamente
`-1`, `Status.ERROR`) = fallo de negocio (flow no encontrado, falta
`audit`, etc.), con el detalle en `statusMessage` — `statusCode` no es útil
para distinguir casos, casi siempre viene `"ros.generalError"`.

**Errores de transporte/seguridad** (HTTP ≠ 200: JWT inválido/expirado → 401
vía `JwtAuthenticationEntryPoint`, ruta no encontrada → 404, etc.) sí usan el
status HTTP real, con body `{errorCode, errorMessage}`.

**Caveat de auth verificado por lectura de código, no en vivo:**
`AuthorizationFilter` solo corre `JWTAuthorizer` cuando la ruta matchea un
`RosFlowRouting` configurado en BD (las rutas dinámicas de integración); las
rutas fijas de `RosInterfaceRestController` — incluida `/job` — no tienen
esa fila, así que el filtro las deja pasar como autenticadas sin validar el
JWT en absoluto. Igual hay que mandarlo (es el comportamiento
documentado/esperado y puede no ser así en todos los ambientes) — no cambia
el diseño de la tool, solo significa que un 401 de `/job` puede no llegar a
darse nunca en la práctica, y por eso el manejo de ese caso es defensivo, no
el camino principal.

### Estructura de archivos (nueva, sobre lo ya construido)

```
src/
  rosClient/
    rosAuthClient.ts     # NUEVO — POST /authenticate + cache/refresh del JWT
    rosRestClient.ts      # NUEVO — POST /job (createJob), usa rawRequest/mapHttpError
  tools/
    executeFlow.ts         # NUEVO — preview/summary + confirm:true → createJob real
  config.ts                # se amplía: 6 campos opcionales nuevos (ver abajo)
  index.ts                 # se amplía: arma rosRestDeps (o undefined) y lo pasa a registerTools
  server.ts                # se amplía: registro condicional de execute_flow (mismo enableWrite)
test/
  rosClient/
    rosAuthClient.test.ts  # NUEVO
    rosRestClient.test.ts  # NUEVO
  tools/
    executeFlow.test.ts    # NUEVO
  config.test.ts           # se amplía: casos de los 6 campos nuevos
```

### `config.ts`

```typescript
export interface RosConfig {
  // ...campos existentes (baseUrl, username, password, httpTimeoutMs, enableWrite)
  rosRestBaseUrl?: string;
  rosAuthorizationBaseUrl?: string;
  rosClientId?: string;
  rosClientSecret?: string;
  auditOrigin?: string;
  auditUsername?: string;
}
```
Ninguno de los 6 es obligatorio para que `loadRosConfig` cargue (a diferencia
de `ROS_BASE_URL`/`ROS_USERNAME`/`ROS_PASSWORD`, que siguen siendo
obligatorios) — quedan `undefined` si no están en `.env`, exactamente como
están hoy en el `.env.example` real (placeholders sin valor). Env vars:
`ROS_REST_BASE_URL`, `ROS_AUTHORIZATION_BASE_URL`, `ROS_CLIENT_ID`,
`ROS_CLIENT_SECRET`, `ROS_MCP_AUDIT_ORIGIN`, `ROS_MCP_AUDIT_USERNAME`.

### `RosAuthClient` (`rosAuthClient.ts`)

```typescript
export interface RosAuthClientLike {
  getToken(forceRefresh?: boolean): Promise<string>;
}

export class RosAuthClient implements RosAuthClientLike {
  constructor(private readonly opts: {
    baseUrl: string; clientId: string; clientSecret: string; httpTimeoutMs: number;
  }) {}
  async getToken(forceRefresh = false): Promise<string> { ... }
}
```
- Cachea `{ token, expiresAt }` en memoria (campo privado de la instancia,
  una instancia vive todo el proceso del servidor MCP).
- `getToken()` reusa el cache si `!forceRefresh && Date.now() < expiresAt - SAFETY_MARGIN_MS`
  (margen fijo, ej. 5 minutos) — si no, llama `POST /authenticate` vía
  `rawRequest`, calcula `expiresAt = Date.now() + expiryHours * 3600_000`, y
  cachea el nuevo token antes de devolverlo.
- Un `POST /authenticate` fallido (HTTP ≠ 200, o body sin `token`) se
  propaga como `RosAuthError`/`RosServerError` (reusando `mapHttpError`) —
  no hay reintento acá, el reintento único vive en `executeFlow` sobre el
  401 de `/job`, no sobre el login en sí.

### `createJob` (`rosRestClient.ts`)

```typescript
export interface CreateJobBody {
  audit: { origin: string; username: string };
  flowId?: number;
  flowCode?: string;
  notification?: { email: string[] };
}
export interface CreateJobResponse {
  responseStatus: { status: number; statusCode: string; statusMessage: string };
  jobId?: number;
  jobStatusId?: number;
  jobStatusCode?: string;
}
export async function createJob(
  baseUrl: string, token: string, body: CreateJobBody, timeoutMs: number
): Promise<CreateJobResponse> { ... }
```
Usa `rawRequest('POST', ...)` con headers `Authorization: Bearer <token>` +
`Content-Type: application/json`. Si `status < 200 || status >= 300` →
`throw mapHttpError(...)` (mismo comportamiento que `RosClient`, error de
transporte real). Si 200, parsea el JSON y lo devuelve tal cual — **no**
interpreta el body acá; la interpretación de `responseStatus.status` vive en
`executeFlow`, no en el cliente HTTP, para mantener este módulo un
wrapper delgado y testeable con fetch/HTTP mockeado únicamente.

### `execute_flow(input: ExecuteFlowInput): Promise<ExecuteFlowResult>`

```typescript
interface ExecuteFlowInput {
  flowId?: number;
  flowCode?: string;
  emails?: string[];
  confirm?: boolean;
}
interface ExecuteFlowResult {
  applied: boolean;
  preview: { summary: string; warnings: string[] };
  result?: { jobId: number; jobStatusCode: string };
  error?: { message: string };
}
```
Firma real de la función (deps explícitas en vez de un solo `client`, porque
Fase 6 necesita dos clientes distintos — el de sesión para el preview, el de
auth+rest para la ejecución):
```typescript
export interface ExecuteFlowDeps {
  restBaseUrl: string;
  authClient: RosAuthClientLike;
  auditOrigin: string;
  auditUsername: string;
  httpTimeoutMs: number;
}
export async function executeFlow(
  rosClient: RosClientLike,
  restDeps: ExecuteFlowDeps | undefined,
  input: ExecuteFlowInput
): Promise<ExecuteFlowResult> { ... }
```
`restDeps` es `undefined` cuando cualquiera de las 6 variables de config no
está seteada — construido una sola vez en `index.ts`, no dentro de la tool.

Lógica:

0. **Validación:** si no viene `flowId` ni `flowCode` → error de validación,
   no se llama a nada (mismo estilo que `save_action`'s validación de modo
   create).
1. **Preview** (siempre, tenga o no `confirm`):
   - Si vino `flowId`, llama `getFlow(rosClient, { flowId })` (Fase 1, ya
     existente) para mostrar `flowDes`/`activeFlag`/`massFlag` reales en el
     `summary`. Si `getFlow` tira `RosNotFoundError`, el `summary` lo dice
     explícitamente ("Flow <flowId> no encontrado") como parte del preview,
     no como excepción — no bloquea que se intente `confirm:true` después
     (ROS es la autoridad final, igual que en `save_action`).
   - Si solo vino `flowCode` (sin `flowId`), no se resuelve localmente —
     no existe hoy una tool de "get flow por code"; el `summary` lo indica
     tal cual con un warning ("flowCode no resuelto localmente, ROS lo
     validará al ejecutar").
   - Warnings fijos: siempre "Esto programa un job en el mass-scheduler; no
     es una ejecución síncrona inmediata."; si vino `emails`, agrega
     "Se notificará a: <emails>."
2. **Si `confirm` no es `true`:** devuelve `{ applied: false, preview }` sin
   tocar `restDeps` en absoluto (ni siquiera verifica que exista).
3. **Si `confirm: true`:**
   - Si `restDeps` es `undefined` → `{ applied: false, preview, error: {
     message: "ROS_REST_BASE_URL/ROS_AUTHORIZATION_BASE_URL/ROS_CLIENT_ID/ROS_CLIENT_SECRET/ROS_MCP_AUDIT_ORIGIN/ROS_MCP_AUDIT_USERNAME deben estar configurados para ejecutar (el preview sigue disponible sin esto)." } }`
     — no se intenta ninguna llamada de red.
   - `token = await restDeps.authClient.getToken()`.
   - `body = { audit: { origin: restDeps.auditOrigin, username: restDeps.auditUsername }, flowId, flowCode, notification: emails?.length ? { email: emails } : undefined }`.
   - `response = await createJob(restDeps.restBaseUrl, token, body, restDeps.httpTimeoutMs)`.
     - Si `createJob` tira `RosAuthError` (401) **y no era ya un retry**:
       fuerza `token = await restDeps.authClient.getToken(true)` y reintenta
       `createJob` **una sola vez**; si vuelve a fallar, se propaga tal cual
       (excepción real, no un resultado `applied:false` — mismo criterio que
       cualquier otro error de transporte en el resto del proyecto).
     - Cualquier otro error de `createJob` (timeout, 5xx, etc.) se propaga
       como excepción sin reintento — lo captura `fail()` en `server.ts`,
       igual que las demás tools.
   - Con `response` en mano (HTTP 200 ya garantizado si llegamos acá):
     - `response.responseStatus.status === 100` → `{ applied: true, preview,
       result: { jobId: response.jobId!, jobStatusCode: response.jobStatusCode! } }`.
     - cualquier otro valor → `{ applied: false, preview, error: { message:
       response.responseStatus.statusMessage } }` — **no** se lanza
       excepción; un rechazo de negocio de ROS (flow no encontrado, audit
       incompleto) es una respuesta esperable, mismo criterio que
       `save_action`.

### Registro MCP (`server.ts` / `index.ts`)

`index.ts` arma `restDeps` una sola vez al arrancar:
```typescript
const restDeps = (config.rosRestBaseUrl && config.rosAuthorizationBaseUrl &&
  config.rosClientId && config.rosClientSecret && config.auditOrigin && config.auditUsername)
  ? {
      restBaseUrl: config.rosRestBaseUrl,
      authClient: new RosAuthClient({ baseUrl: config.rosAuthorizationBaseUrl, clientId: config.rosClientId, clientSecret: config.rosClientSecret, httpTimeoutMs: config.httpTimeoutMs }),
      auditOrigin: config.auditOrigin,
      auditUsername: config.auditUsername,
      httpTimeoutMs: config.httpTimeoutMs,
    }
  : undefined;
```
`execute_flow` se registra en `server.ts` bajo el mismo `if (options.enableWrite)`
que ya envuelve a `save_action` — no un segundo flag. Si `enableWrite` es
`true` pero `restDeps` es `undefined` (credenciales de `ros-rest` no
configuradas), la tool **igual se registra** y funciona en modo preview;
solo el paso `confirm:true` devuelve el error de configuración de arriba.

## Testing

Mismo enfoque que fases anteriores — sin red real, `rawRequest` mockeado
donde haga falta.

**`RosAuthClient`:**
- Primera llamada sin cache → llama `/authenticate`, cachea, devuelve token.
- Segunda llamada dentro de la vigencia → no vuelve a llamar `/authenticate`
  (assert sobre el mock de `rawRequest`).
- Llamada después de vencido (o con `forceRefresh:true`) → sí vuelve a
  llamar `/authenticate`.
- `/authenticate` responde error → se propaga como `RosAuthError`/`RosServerError`.

**`createJob`:**
- Éxito (`status:100`) → devuelve el body parseado tal cual.
- Body con `status:-1` → igual devuelve el body tal cual (no interpreta acá).
- HTTP 401/500 → tira el error mapeado (`mapHttpError`), no devuelve un
  `CreateJobResponse`.

**`executeFlow`:**
- Sin `flowId` ni `flowCode` → error de validación, ni `getFlow` ni
  `authClient`/`createJob` se llaman.
- `confirm` ausente/`false` → `applied:false`, `restDeps` nunca se toca
  (assert: `authClient.getToken` no se llama), aunque esté configurado.
- `confirm:true` sin `restDeps` → `applied:false`, `error.message` menciona
  las variables faltantes, ni `getFlow` (ya se llamó para el preview, eso sí
  corre) ni `createJob` se invocan.
- `confirm:true`, éxito (`status:100`) → `applied:true`, `result.jobId`
  correcto, body enviado a `createJob` tiene `audit`/`flowId`/`flowCode`
  bien armados.
- `confirm:true`, ROS devuelve `status:-1` → `applied:false`,
  `error.message` = el `statusMessage` real, no se lanza excepción.
- `confirm:true`, `createJob` tira 401 la primera vez → se llama
  `getToken(true)` y se reintenta `createJob` una sola vez; si la segunda
  también falla, la excepción se propaga (no se traga como
  `applied:false`).
- `getFlow` tira `RosNotFoundError` en el preview → el `summary` lo refleja,
  `confirm:true` posterior igual intenta `createJob` (no bloquea).
- Solo `flowCode` (sin `flowId`) → preview trae el warning de "no resuelto
  localmente", no llama `getFlow`.
- `ROS_MCP_ENABLE_WRITE` en `false`/ausente → `execute_flow` no aparece en
  la lista de tools registradas (ya cubierto por el flag existente, solo se
  agrega el caso de que ahora también gatea `execute_flow`, no solo
  `save_action`).

## Rollout

- Mismo repo `ros-ai-mcp`, mismo `master`, sin rama nueva (consistente con
  Fases 1-5).
- Ejecución vía `superpowers:subagent-driven-development` — hay judgment
  real (cache/expiración del JWT, el reintento único sobre 401, la
  distinción error-de-transporte-vs-error-de-negocio) — modelo estándar
  (sonnet).
- **Preservar el workspace de SDD al final** (`.superpowers/sdd/2026-09-04-ros-ai-mcp-phase6-execute-flow/`),
  no borrarlo — el plan vive en `ts-skills-1` y el código en `ros-ai-mcp`,
  mismo motivo por el que Fases 1/3/4 lo preservaron y Fase 5 no debió
  haberlo borrado.
- Sin criterio de aceptación MVP en vivo obligatorio para esta fase en sí
  misma — ejecutar un flow real en ROS (aunque sea DEV/QA) tiene efectos
  reales (crea un `MassScheduler`/`MassSchedulerHist`, puede disparar
  notificaciones por email); cualquier prueba end-to-end contra ROS real
  requiere que el usuario decida explícitamente qué flow de prueba usar y
  cuándo, además de conseguir/crear el `clientId`/`clientSecret` real y
  confirmar el host:puerto de `ros-rest`/`ros-authorization` en el ambiente
  — ninguno de esos tres datos está disponible todavía (decisión explícita
  del usuario al brainstormear esta fase).

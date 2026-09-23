# ros-ai-mcp — cómo funciona

## 1. Qué es

`ros-ai-mcp` es un **servidor MCP (Model Context Protocol)** que le da a Claude Code acceso directo a **ROS** (el `masros-gui` de ThinkSkink: la plataforma de orquestación de flujos/acciones/items de ThinkSkink), sin que un humano tenga que pasar por la interfaz web, Postman o FSearch. En vez de eso, durante una conversación Claude puede invocar herramientas como "dame el flujo 34606" o "busca acciones parecidas a X" y el servidor las traduce en llamadas HTTP reales contra ROS.

Es un proyecto Node.js/TypeScript (`type: module`, Node ≥18.15), con solo 3 dependencias de runtime: el SDK oficial de MCP (`@modelcontextprotocol/sdk`), `dotenv` y `zod` (validación de los parámetros de cada herramienta). El cliente HTTP, la autenticación y el manejo de sesión están hechos a mano sobre `fetch`.

**Nunca se conecta a producción.** `ROS_BASE_URL` apunta siempre a DEV/QA (`http://172.19.91.145:8081/masros-gui`) y solo es alcanzable con la VPN Ivanti Secure Access activa.

Hay dos copias del mismo código:
- **Repo maestro**: `C:\Users\52554\Documents\ros-ai-mcp` (con su propio git).
- **Copia vendorizada dentro de este proyecto**: `subscriptionManager/tools/ros-ai-mcp` — es una copia byte-idéntica del `src/`, pensada para que este repo la registre localmente vía su propio `.mcp.json` en vez de depender de un registro global (`claude mcp add -s user`).

## 2. Estructura de archivos

```
ros-ai-mcp/
├── .env / .env.example        # credenciales y config (ver §4)
├── package.json                # nombre, deps, scripts (build/dev/test/smoke)
├── README.md                   # guía de instalación y registro en Claude Code
├── src/
│   ├── index.ts                 # entrypoint: carga .env, arma clientes, registra tools, abre stdio
│   ├── server.ts                 # registerTools(): da de alta las 19 herramientas MCP
│   ├── config.ts                 # valida .env → objeto RosConfig tipado (lanza ConfigError si falta algo)
│   ├── errors.ts                  # jerarquía de errores: RosAuthError, RosNotFoundError, RosServerError, RosTimeoutError...
│   ├── rosClient/
│   │   ├── session.ts             # login por cookie (POST /dologin) — ver §3.1
│   │   ├── rosClient.ts           # cliente HTTP autenticado contra masros-gui (re-login automático)
│   │   ├── httpClient.ts          # wrapper fetch de bajo nivel (timeout, mapeo de errores por status)
│   │   ├── curlClient.ts          # hace shell-out a `curl` para POSTs grandes (workaround, ver §3.1)
│   │   ├── rosAuthClient.ts       # cliente JWT contra ros-authorization — ver §3.2
│   │   ├── rosRestClient.ts       # POST /job y GET /jobDetail contra ros-rest — ver §3.2
│   │   └── types.ts               # interfaces TS que reflejan los DTOs Java reales de ROS
│   └── tools/                    # un archivo por herramienta MCP (funciones puras (client, input) => output)
│       ├── getFlow.ts, getFlowSteps.ts, searchFlows.ts, searchActions.ts, getAction.ts,
│       │   getActionCommand.ts, getActionTemplate.ts, getItemInfo.ts, searchRosItems.ts   # Fase 1 (lectura base)
│       ├── findSimilarFlows.ts, findSimilarActions.ts, analyzeFlow.ts, analyzeItem.ts,
│       │   similarity.ts                                                                   # Fase 2 (cruces derivados)
│       ├── summarizeFlowSkeleton.ts                                                        # Fase 3
│       ├── saveAction.ts                                                                   # Fase 5 (escritura, gated)
│       ├── executeFlow.ts, getJobStatus.ts                                                  # Fases 6-7 (JWT, gated)
│       └── createFlow.ts, saveFlowSteps.ts, flowStepTree.ts                                # Fase 8 (crear flow, gated)
├── scripts/
│   └── smoke.ts                  # prueba opcional contra ROS real (RUN_SMOKE_TESTS=true)
└── test/                         # suite vitest (26 archivos), todo con HTTP mockeado — no requiere VPN
```

## 3. Cómo se conecta con ROS

Hay **dos mecanismos de autenticación completamente separados**, según qué herramienta se use.

### 3.1 Sesión de `masros-gui` (cookie) — usada por las 14 herramientas de lectura y por `save_action`/`create_flow`/`save_flow_steps`

`session.ts` hace un login clásico por formulario:

```
POST {ROS_BASE_URL}/dologin
Content-Type: application/x-www-form-urlencoded
body: username=...&password=...
redirect: 'manual'   # importante: NO sigue el 302
```

Se fuerza `redirect: 'manual'` porque ROS responde con un 302 que trae el header `Set-Cookie: JSESSIONID=...`; si `fetch` siguiera la redirección automáticamente, ese header se perdería (solo quedarían los headers de la página final). La cookie se guarda en memoria mientras vive el proceso Node.

Cada request posterior:
- manda `Cookie: JSESSIONID=...`, `Accept: application/json` y `X-Requested-With: XMLHttpRequest` (para que ROS responda JSON en vez de HTML/XML, igual que su propio frontend).
- si la respuesta "parece" una página de login (detecta `action="/dologin"` o un campo password), asume que la sesión expiró, se re-loguea una vez y reintenta.
- los status HTTP no-2xx se traducen a errores tipados (401/403 → `RosAuthError`, 404 → `RosNotFoundError`, 5xx → `RosServerError`).

**Detalle particular:** los POST con JSON de más de ~1KB fallan con `ECONNRESET` si se mandan con `fetch` de Node a través de la VPN. El workaround (`curlClient.ts`) es hacer esos POSTs específicos con el binario `curl` del sistema en vez de `fetch` (los GET y el login siguen usando `fetch` normal, ahí nunca dio problema).

Endpoints de `masros-gui` usados: `/dologin`, `/getFlowInfo`, `/getFlowStepInfo`, `/getUserFlows`, `/getRosActions`, `/getActionsAdmin`, `/actionInformation/{id}`, `/actionDBConfig/{id}`, `/actionDetail/getCurrentCommand`, `/actionTemplate/{GROOVY|PYTHON}`, `/searchros`, `/getStepDataExtraDetails`, `/actionDetail/saveAction` (escritura), `/saveFlowDetail` (escritura), `/saveFlowStep` (escritura).

### 3.2 `ros-rest` + `ros-authorization` (JWT) — usada solo por `execute_flow` y `get_job_status`

Flujo cliente-credenciales, totalmente independiente del anterior:

```
POST {ROS_AUTHORIZATION_BASE_URL}/authenticate
body: { "clientId": ..., "clientSecret": ... }
→ { "token": "...", "expiryHours": N }
```

El token se cachea en memoria y se refresca 5 minutos antes de expirar. Con ese token:

- `POST {ROS_REST_BASE_URL}/job` — crea un job del mass-scheduler (lo que dispara `execute_flow`). Body: `{ audit: {origin, username}, flowId?, flowCode?, notification?: {email: [...]} }`. ROS siempre responde HTTP 200; hay que revisar `responseStatus.status` (100 = éxito) para saber si realmente funcionó.
- `GET {ROS_REST_BASE_URL}/jobDetail?jobId=X` — consulta el estado/progreso de un job (`get_job_status`). Un `jobId` inexistente también responde 200, con los campos vacíos.

Ambos endpoints van con `Authorization: Bearer <jwt>`. Si responden 401/403, el cliente fuerza un refresh del token y reintenta una vez.

### 3.3 Patrón de seguridad para escritura

Las 5 herramientas de escritura (`save_action`, `execute_flow`, `create_flow`, `save_flow_steps`, y el flag que habilita `get_job_status`) están todas apagadas por defecto (`ROS_MCP_ENABLE_WRITE=false`). Cuando se activan, **todas** siguen el mismo patrón: sin `confirm: true` en el llamado, la herramienta solo calcula y devuelve una vista previa (diff/resumen) sin tocar ROS; recién con `confirm: true` se ejecuta la escritura real. Esto es una invariante de diseño explícita del proyecto, no solo documentación.

## 4. Variables de entorno (`.env`)

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `ROS_BASE_URL` | Sí | Base de `masros-gui` (DEV/QA, requiere VPN) |
| `ROS_USERNAME` / `ROS_PASSWORD` | Sí | Credenciales de login por cookie (§3.1) |
| `ROS_HTTP_TIMEOUT_MS` | No (15000) | Timeout de cada request a ROS |
| `ROS_MCP_ENABLE_WRITE` | No (false) | Llave maestra que habilita las 5 herramientas de escritura |
| `ROS_REST_BASE_URL` | No | Base de `ros-rest` (solo `execute_flow`/`get_job_status`) |
| `ROS_AUTHORIZATION_BASE_URL` | No | Base de `ros-authorization` (emisor del JWT) |
| `ROS_CLIENT_ID` / `ROS_CLIENT_SECRET` | No | Credenciales cliente para pedir el JWT |
| `ROS_MCP_AUDIT_ORIGIN` / `ROS_MCP_AUDIT_USERNAME` | No | Metadatos de auditoría que ROS exige al crear un job |
| `RUN_SMOKE_TESTS` | No (false) | Habilita `npm run smoke` contra ROS real |

Si faltan las 6 variables de `ros-rest`/`ros-authorization`, `get_job_status` directamente no se registra; `execute_flow` sí se registra pero solo puede hacer preview (no `confirm:true`).

## 5. Herramientas MCP expuestas

### Siempre activas (14, solo lectura)

| Herramienta | Qué hace |
|---|---|
| `get_flow` | Trae un flow por `flowId` (grupos, ruteo, schema) |
| `get_flow_steps` | Árbol de pasos del flow (acciones, decisiones, bypass) |
| `search_flows` | Busca flows visibles para el usuario configurado |
| `search_actions` | Busca acciones por texto/tipo/comando (o scope admin) |
| `get_action` | Configuración completa de una acción |
| `get_action_command` | Código/comando crudo de una acción (ej. Groovy) |
| `get_action_template` | Templates de código Groovy/Python disponibles |
| `get_item_info` | Diagnóstico de un item: estado, topología de pasos, historial |
| `search_ros_items` | Busca items por flow/status/acción/cliente/error/etc. |
| `find_similar_flows` | Flows parecidos a un requerimiento en lenguaje natural |
| `find_similar_actions` | Acciones parecidas a un requerimiento en lenguaje natural |
| `analyze_flow` | Reconstruye el árbol de pasos de un flow |
| `analyze_item` | Diagnostica un item (paso actual/anterior, items relacionados) |
| `summarize_flow_skeleton` | Clasifica cada paso de un flow en un rol técnico (subflow/decision/end/...) |

### Solo con `ROS_MCP_ENABLE_WRITE=true` (5)

| Herramienta | Qué hace |
|---|---|
| `save_action` | Crea/actualiza una acción (preview/confirm) |
| `execute_flow` | Dispara la ejecución de un flow vía `ros-rest` (preview/confirm) |
| `create_flow` | Crea el header de un flow nuevo (preview/confirm) |
| `save_flow_steps` | Arma el árbol de pasos de un flow nuevo desde un DSL simplificado (rechaza si el flow ya tiene pasos) |
| `get_job_status` | Consulta el estado de un job creado por `execute_flow` |

## 6. Lógica de "similares" (`find_similar_flows` / `find_similar_actions`)

**No hay embeddings ni índice persistido.** Es un ranking por coincidencia de palabras clave, calculado en el momento:

1. Trae **todos** los flows/acciones visibles para el usuario (sin filtros) llamando en vivo a `search_flows`/`search_actions` — nada se cachea entre llamadas.
2. Tokeniza el `requirement` (texto libre) quitando stopwords en español e inglés.
3. Puntúa cada flow/acción contando cuántas de esas palabras aparecen como substring de su código+descripción.
4. Descarta los de score 0, ordena descendente y corta al `limit` (10 por defecto).

Es una decisión de diseño deliberada: "cero endpoints ROS nuevos, solo estructurar/cruzar hechos de forma determinística" — sin inferencia semántica ni reglas de negocio inventadas.

## 7. ¿Los datos vienen en vivo o de una caché local?

**Todo se pide en vivo a ROS**, en cada llamada. No existe base de conocimiento local ni archivo de índice. Lo único que se cachea en memoria es:
- la cookie de sesión (`SessionManager`), mientras vive el proceso, y
- el JWT (`RosAuthClient`), con refresh 5 minutos antes de expirar.

Ambas son cachés de *autenticación*, no de datos. El modelo de dominio (qué es un Flow/Action/Item/Step) no lo inventa este proyecto: `rosClient/types.ts` es un espejo TypeScript, mantenido a mano, de los DTOs Java reales de ROS.

## 8. Cómo se registra en Claude Code

```bash
npm run build
claude mcp add ros-ai-mcp -s user -- node "C:\Users\52554\Documents\ros-ai-mcp\dist\index.js"
```

`-s user` lo registra globalmente (todos los proyectos). Las credenciales se leen del `.env` del repo al arrancar el proceso — no se pasan por línea de comandos.

En este proyecto (`subscriptionManager`) en particular, la copia vendorizada en `tools/ros-ai-mcp` se registra automáticamente vía `.mcp.json` en la raíz del repo:

```json
{
  "mcpServers": {
    "ros-ai-mcp": {
      "command": "node",
      "args": ["tools/ros-ai-mcp/dist/index.js"]
    }
  }
}
```

Nota operativa: si el proceso MCP ya está corriendo y se edita `.env` o se recompila `dist/`, Claude Code puede seguir conectado al proceso viejo — hay que reiniciarlo para que los cambios tomen efecto.

## 9. Evolución por fases

| Fase | Qué agregó |
|---|---|
| 1 — lectura base | Los 9 tools que reflejan casi 1 a 1 un endpoint de `masros-gui` cada uno |
| 2 — inteligencia | `find_similar_flows/actions`, `analyze_flow`, `analyze_item` — cruces derivados, cero endpoints nuevos |
| 3 — skeleton de flow | `summarize_flow_skeleton`, construido sobre `analyze_flow` |
| 4 — skill de diseño | (no es un tool MCP) skill de Claude Code que orquesta las fases 1-3 para ayudar a diseñar flows/acciones nuevos por analogía |
| 5 — escritura: acciones | `save_action`, primer tool de escritura, gated, con preview/confirm |
| 6 — ejecutar flow | `execute_flow`, introduce la autenticación JWT separada (`ros-rest`/`ros-authorization`) |
| 7 — estado de job | `get_job_status`, sobre la misma infraestructura JWT de la fase 6 |
| 8 — crear flow | `create_flow` + `save_flow_steps` — crear un flow nuevo de punta a punta (solo creación, no edición de un flow existente) |

Esta progresión (primero solo lectura, después escritura con aprobación humana obligatoria) fue un requisito explícito del proyecto desde el inicio.

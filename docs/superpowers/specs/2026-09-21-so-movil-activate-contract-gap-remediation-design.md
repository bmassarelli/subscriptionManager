# Service Ordering - Movil - Activate Contract — Gap Remediation Design

## 1. Goal

Close the gap between the real ROS flow `Service Ordering - Movil - Activate Contract` (flowId **64506**, flowCode `S_O_ACTIVATE_CONTRACT`) and the functional/technical requirements documented in `bitacoraActivadorAprov_v1.0 (2).xlsx` (`Pasos`/`Procesos` tabs), for the 4 processes: Alta Postpago, Alta Prepago, Alta Línea Portada, Alta – Línea de Servicio de Locución. Additionally, correct the scope of `SYSTEMCS` (Charging System), which today is wired to the wrong branch of the flow.

This design is the output of a read-only analysis + iterative clarification session — nothing has been applied to ROS yet except one new read-only tool in `ros-ai-mcp` (§5). Every design decision below was either confirmed directly by the user or derived from real data read from ROS; anywhere real data wasn't available, the design is explicitly marked as a prototype/placeholder, never invented.

## 2. Background

The flow currently implements only a **prepaid vs. non-prepaid** split (one `INLINEDEC`, `binding.hasVariable('prepaidContract')`) plus a `SYSTEMCS`-gated Charging System chain and a `SYSTEMIL`-gated InstantLink call — both already-working integrations. It has **zero** of the SP/Function/REST steps the Excel requires (RESERVAR LINEA, ALTA IMSI, DATOS SOM, INVENTARIO) wired in as flow steps, for any of the 4 processes. Some of the underlying ROS Actions for those steps already exist (found via `search_actions`/`find_similar_actions`); others don't and need to be created.

Critically, `SYSTEMCS` is currently reachable only from the flow's **non-prepaid** branch — but the real business rule (confirmed by the user across this session) is: SYSTEMCS applies to Alta Línea Portada and Alta Línea de Servicio de Locución, but **not** to Alta Postpago **and not** to Alta Prepago. The flow has no concept of "Portada" or "Locución" as distinct from "Postpago"/"Prepago" today — it only forks on prepaid-or-not.

## 3. Scope

**In scope:**
- Update the flow's validation Action (`SO - Movil - Activate Validation`, actionId **90333**) to derive a `tipoAlta` variable from `serviceOrderItem.category`, and to set `SYSTEMCS` correctly per §6.
- Create two new Groovy actions with fully-confirmed real signatures: `ALTA_IMSI_GROOVY`, `RESERVAR_LINEA_GROOVY`.
- Create two new **prototype** actions (no real connection/domain data available yet, built as placeholders per explicit user instruction): `SOM_OBTENER_PARAMETROS_TECNICOS` (Groovy), `RESOURCE_INVENTORY_UPDATE` (REST).
- Add new decision steps and wire the above (plus the already-existing `OBTIENE_CM_IMSI_HRLUD`/`RESERVAR_LINEA_INVE` actions, if reused instead of the new Groovy wrappers — see §7.1) into flow 64506's step tree, per the topology in §6.

**Out of scope:**
- The InstantLink SOAP integration (`INSTANTLINKCREATEREQ` / subflow `INSTANTLINK_BSCS9`) — confirmed correct and already wired into both branches; not touched.
- The Charging System actions themselves (`CSINSTALSUBSCRIBER` #74376, `CSUPDATEBALANCEANDDATE` #74377) and their 3 downstream multiply-subflows — reused as-is, not modified.
- Full (non-prototype) implementation of `SOM_OBTENER_PARAMETROS_TECNICOS` and `RESOURCE_INVENTORY_UPDATE` — blocked on real connection/schema/domain/auth data (§9).
- Editing/removing/reordering any of the flow's 23 existing steps beyond what's needed to insert the new ones — nothing existing is deleted or replaced.
- Live execution of the flow — this design has not been tested against a real item yet (§8).

## 4. Verified data (Excel ↔ ROS cross-reference)

Full step-by-step tables were produced and reviewed with the user during this session's read-only analysis phase (not repeated here in full). Summary of what's confirmed:

| Excel step | ROS Action found | Status |
|---|---|---|
| RESERVAR LINEA (Postpago only) | `RESERVAR_LINEA_INVE` (actionId 88138, schema `inverec`/`jdbcHelperINVENTDB`) | Exists, not wired into the flow. User confirmed this is the action to base the new Groovy on (§7.1). |
| ALTA IMSI (all 4 processes) | `OBTIENE_CM_IMSI_HRLUD` (actionId 86538, schema `jdbcHelperAUCDES`) | Exists, not wired into the flow. Real IN/OUT signature confirmed via the new `get_action_parameters` tool (§5) — 2 IN, 4 OUT (2 of the 4 OUTs are orphaned, no `STORE_PARAM`; not explained, not invented a purpose for them). |
| DATOS SOM (all except Locución) | none found | Genuinely new — no existing ROS action matches `SOM.obtenerParametrosTecnicos` under any search. |
| INSTANT LINK (all 4 processes) | `INSTANTLINKCREATEREQ` (actionId 77133, SOAP) | Already exists **and already wired into the flow** (via subflow `INSTANTLINK_BSCS9`, both branches) — no action needed here. |
| INVENTARIO (all except Locución) | none found matching the literal `PATCH /api/v1/resource-inventory` | A different, SP-based "inventory" action family already exists (`ASIGNAR_LINEA_INVENTARIO`, `LIBERAR_LINEA_INVENTARIO`, etc.) but doesn't match the Excel's REST contract — treated as a separate, coexisting mechanism, not a substitute. |

**Real parameter signatures** (confirmed live via the new `get_action_parameters` tool, not from the Excel, which turned out to describe different parameter names than the real actions):

- `OBTIENE_CM_IMSI_HRLUD` (86538): IN `imsiLinea` (String), `usuarioEai` (String) → OUT position 3 (VARCHAR, stored as `codigo`), position 4 (VARCHAR, orphaned), position 5 (VARCHAR, orphaned), position 6 (VARCHAR, stored as `p_cmdaltaudb`).
- `RESERVAR_LINEA_INVE` (88138): IN `typeRecurso` (Number), `xIdUsuarioHeaderRequest` (String) → OUT position 3 (VARCHAR, stored as `XMSISDN`), position 4 (NUMBER, stored as `OUT_COD_RESPUESTA`), position 5 (VARCHAR, stored as `OUT_MSJ_RESPUESTA`).

## 5. New `ros-ai-mcp` capability: `get_action_parameters`

Built and live-verified during this session (code complete, tests passing, `npm run build` clean — **not yet committed**, per the user's explicit choice to hold off).

- **Why it was needed**: `get_action`/`/actionDBConfig` never expose a `PROCEDURE`-type action's real stored-procedure parameter bindings — confirmed by reading `ActionDBConfigController.java` directly, which only ever returns generic protocol/YML config, never parameter bindings. The real data lives in a separate table (`RosActionParser`), behind the CRUD-style `POST /rosActionParserExecute` endpoint (same generic framework as `FlowRoutingController`, investigated earlier this session for Phase 9 of `ros-ai-mcp`).
- **New files**: `src/tools/getActionParameters.ts` (`getActionParameters(client, {actionId})` → raw `RosActionParser[]`; `summarizeProcedureSignature(parsers)` → `{inputs, outputs}` joining `OUTPUT_PARAM_TYPE`/`STORE_PARAM` rows by `seqId`). New type `RosActionParser` + `SCHEMA_DEF_ID_NAMES` map in `src/rosClient/types.ts`. New MCP tool `get_action_parameters` registered in `src/server.ts` (always-on, read-only, no `ROS_MCP_ENABLE_WRITE` gate needed).
- **Verified live** against actionId 88138 and 86538 — output matches what was independently confirmed by hand in masros-gui's UI.
- **Corrected a wrong earlier finding**: the masros-gui UI's "Parsers" tab showed "No data available" for action 86538, which was taken at face value in an earlier report — the new tool proved this was a UI-side loading glitch, not real absence of data. The action genuinely has 8 parser rows.

## 6. Flow topology design

```
3.  INLINEDEC "¿Alta Prepago pura?" → binding.hasVariable('prepaidContract')

    Y (Prepago puro — tipoAlta == "PREPAGO"):
      [FALTA] ALTA IMSI
      [FALTA] DATOS SOM
      [Ya existe] INFLOW → INSTANTLINK_BSCS9 → OUTFLOW
      [FALTA] INVENTARIO
      [Ya existe] INFLOW → SERVICE_ORDERING_PROVISIONING_NOTIF → OUTFLOW → ES

    N (Postpago / Portada / Locución):
      9.  [Ya existe] INLINEDEC "CS?" → SYSTEMCS=="Y"
          Y: [Ya existe] CSINSTALSUBSCRIBER → CSUPDATEBALANCEANDDATE → 3 subflows multiply
          N: (converge directo)
      [NUEVO] INLINEDEC "¿Es Postpago?" → tipoAlta=="POSTPAGO"
          Y: [FALTA] RESERVAR LINEA
          N: (converge directo — Portada y Locución no la necesitan)
      [FALTA] ALTA IMSI (siempre — Postpago, Portada y Locución la piden)
      [NUEVO] INLINEDEC "¿Es Locución?" (gate 1) → tipoAlta=="LOCUCION"
          Y: (nada — salta DATOS SOM)
          N: [FALTA] DATOS SOM
      18. [Ya existe] INLINEDEC "IL?" → SYSTEMIL=="Y"
          Y: [Ya existe] INFLOW → INSTANTLINK_BSCS9 → OUTFLOW
          N: (converge directo)
      [NUEVO] INLINEDEC "¿Es Locución?" (gate 2) → tipoAlta=="LOCUCION"
          Y: (nada — salta INVENTARIO)
          N: [FALTA] INVENTARIO
      21. [Ya existe] INFLOW → SERVICE_ORDERING_PROVISIONING_NOTIF → OUTFLOW → ES
```

**`tipoAlta` derivation** (see §7.1): from `serviceOrderItem[].category`, mapped `AltaPostpago→POSTPAGO`, `AltaPre→PREPAGO`, `AltaPorta→PORTADA`, `AltaLocu→LOCUCION`. `serviceOrderItem.type` (which only ever carries `POSTPAGO`/`PREPAGO`) is **not** used for this — it was the first design attempt and was superseded once the user confirmed `category` alone fully disambiguates all 4 processes.

**`SYSTEMCS` scope** (confirmed explicitly, overriding the initial "applies to everything except Postpago" phrasing): `Y` for Portada and Locución, `N` for Postpago, **not set at all for Prepago** — the `CS?` node structurally doesn't even exist on the Prepago (Y) branch, so this is enforced by topology, not just by the variable's value.

**Resolved (2026-09-21, Task 0 of the implementation plan):**
- **Gate shape**: two separate `¿Es Locución?` gates, preserving the Excel's literal step order (DATOS SOM before INSTANT LINK, INVENTARIO after) — the single-gate alternative was rejected.
- **Reuse vs. new Groovy**: create the new Groovy actions (`ALTA_IMSI_GROOVY`, `RESERVAR_LINEA_GROOVY`) rather than reusing the existing `PROCEDURE`-type actions as-is — both proceed as designed in §7.2/§7.3.

~~Open design point~~ **Resolved**: two separate `¿Es Locución?` gates (not one), preserving the Excel's literal step order — see the "Resolved" note right after the diagram above.

## 7. Action designs

### 7.1 Updated validation — `SO - Movil - Activate Validation` (actionId 90333)

```groovy
@SkLog @Field GroovyLogger log;
@Field Map<String,Object> returnMap=[:];

@SkValue @Field String msisdn;
@SkValue @Field String imsi;
@SkValue @Field String prepaidContract;
@SkValue @Field String tipoAlta;        // NUEVO — POSTPAGO | PREPAGO | PORTADA | LOCUCION
@SkValue @Field String SYSTEMCS;        // NUEVO — "Y"/"N", consumido por INLINEDEC "CS?" (paso 9)
@SkValue @Field List<Map<String, Object>> serviceOrderItem;

@CompileStatic
def run(Map<String, Object> args){
    execute();
    return returnMap;
}

def validateAlta(){

    if(msisdn==null){
        serviceOrderItem.each { item ->
            item.service?.serviceCharacteristic?.each { characteristic ->
                if (characteristic.name == "MSISDN") {
                    msisdn = characteristic.value
                    returnMap.put("msisdn", msisdn)
                }
            }
        }
    }

    if(imsi==null){
        serviceOrderItem.each { item ->
            item.service?.serviceCharacteristic?.each { characteristic ->
                if (characteristic.name == "IMSI") {
                    imsi = characteristic.value
                    returnMap.put("imsi", imsi)
                }
            }
        }
    }

    // tipoAlta se deriva de serviceOrderItem.category (raíz de cada item) —
    // confirmado por el usuario que este campo por sí solo distingue los 4
    // procesos (a diferencia de serviceOrderItem.type, que solo trae
    // POSTPAGO/PREPAGO y no alcanza para Portada/Locución).
    if (tipoAlta == null) {
        serviceOrderItem.each { item ->
            switch (item.category) {
                case "AltaPostpago": tipoAlta = "POSTPAGO"; break
                case "AltaPre":      tipoAlta = "PREPAGO";  break
                case "AltaPorta":    tipoAlta = "PORTADA";  break
                case "AltaLocu":     tipoAlta = "LOCUCION"; break
            }
        }
        if (tipoAlta == null) {
            throw new SkException("-1", "Missing or unrecognized Parameter: serviceOrderItem.category")
        }
        returnMap.put("tipoAlta", tipoAlta)
    }

    // prepaidContract == "es Alta Prepago pura" (única que va por la rama Y).
    if (prepaidContract == null && tipoAlta == "PREPAGO") {
        prepaidContract = "true"
        returnMap.put("prepaidContract", true)
    }

    // SYSTEMCS aplica a Portada y Locución, NO a Postpago ni a Prepago
    // (confirmado explícitamente por el usuario).
    if (SYSTEMCS == null && tipoAlta != "PREPAGO") {
        SYSTEMCS = (tipoAlta != "POSTPAGO") ? "Y" : "N"
        returnMap.put("SYSTEMCS", SYSTEMCS)
    }

    def requiredFields = ["msisdn": msisdn, "imsi": imsi, "tipoAlta": tipoAlta]
    requiredFields.each { fieldName, value ->
        if (value == null) {
            log.info("Campo ${fieldName} no viene")
            throw new SkException("-1", "Missing Parameter: ${fieldName}")
        }
    }
}

@CompileStatic
def execute(){
    validateAlta()
    buildParameter()   // sin cambios — preexistente, contenido ajeno a este proceso (ver §9)
}
```

### 7.2 `ALTA_IMSI_GROOVY` (nuevo, basado en `OBTIENE_CM_IMSI_HRLUD` #86538)

```groovy
@Field Map<String,Object> returnMap = [:]
@Field GroovyLogger log
@SkValue @Field String imsiLinea
@SkValue @Field String usuarioEai

def run(Map<String,Object> args) {
    log = args.get("log")
    altaImsi()
    return returnMap
}

def altaImsi() {
    SkinkDBExecutor.execute(new SkinkDBCallable<String>() {
        String call(JDBCHelper jdbcHelper) throws SkException {
            def cStmt = jdbcHelper.prepareCall(
                "{ call AUC.PKG_IMSI.sp_obtienecmdaltaimsi_hrludb(?,?,?,?,?,?) }")

            jdbcHelper.setCallableObject(cStmt, 1, imsiLinea)
            jdbcHelper.setCallableObject(cStmt, 2, usuarioEai)
            jdbcHelper.registerCallableOutParam(cStmt, 3, java.sql.Types.VARCHAR)
            jdbcHelper.registerCallableOutParam(cStmt, 4, java.sql.Types.VARCHAR)
            jdbcHelper.registerCallableOutParam(cStmt, 5, java.sql.Types.VARCHAR)
            jdbcHelper.registerCallableOutParam(cStmt, 6, java.sql.Types.VARCHAR)

            jdbcHelper.executeCall(cStmt)

            returnMap.put("codigo", jdbcHelper.getCallableObject(cStmt, 3))
            // OUT 4 y 5: sin STORE_PARAM en la Action original (86538) — huérfanos,
            // no se les inventa destino (ver §9).
            returnMap.put("p_cmdaltaudb", jdbcHelper.getCallableObject(cStmt, 6))
            return "OK"
        }
    }, "jdbcHelperAUCDES")
}
```

### 7.3 `RESERVAR_LINEA_GROOVY` (nuevo, basado en `RESERVAR_LINEA_INVE` #88138)

```groovy
@Field Map<String,Object> returnMap = [:]
@Field GroovyLogger log
@SkValue @Field Integer typeRecurso
@SkValue @Field String xIdUsuarioHeaderRequest

def run(Map<String,Object> args) {
    log = args.get("log")
    reservarLinea()
    return returnMap
}

def reservarLinea() {
    SkinkDBExecutor.execute(new SkinkDBCallable<String>() {
        String call(JDBCHelper jdbcHelper) throws SkException {
            def cStmt = jdbcHelper.prepareCall(
                "{ call inverec.PKG_SCJ_APROVISIONAMIENTO.SPU_BUSCAR_RESERVAR_NUMERO(?,?,?,?,?) }")

            jdbcHelper.setCallableObject(cStmt, 1, typeRecurso)
            jdbcHelper.setCallableObject(cStmt, 2, xIdUsuarioHeaderRequest)
            jdbcHelper.registerCallableOutParam(cStmt, 3, java.sql.Types.VARCHAR)
            jdbcHelper.registerCallableOutParam(cStmt, 4, java.sql.Types.NUMERIC)
            jdbcHelper.registerCallableOutParam(cStmt, 5, java.sql.Types.VARCHAR)

            jdbcHelper.executeCall(cStmt)

            returnMap.put("XMSISDN", jdbcHelper.getCallableObject(cStmt, 3))
            returnMap.put("OUT_COD_RESPUESTA", jdbcHelper.getCallableObject(cStmt, 4))
            returnMap.put("OUT_MSJ_RESPUESTA", jdbcHelper.getCallableObject(cStmt, 5))
            return "OK"
        }
    }, "jdbcHelperINVENTDB")
}
```

**Note on the real `JDBCHelper` procedure-calling API** (confirmed via source investigation across the `masros/ros5` checkout, since `JDBCHelper` itself lives in an external jar not vendored in this checkout): `prepareCall(String sql)` → `setCallableObject(CallableStatement, int index, Object value)` for each IN → `registerCallableOutParam(CallableStatement, int index, int sqlType)` for each OUT → `executeCall(CallableStatement)` → `getCallableObject(CallableStatement, int index)` per scalar OUT (or `getCallableCursorAsList` for a `REF CURSOR` OUT, not needed here since neither target procedure has one). Real Groovy examples of this exact pattern exist embedded in exported flow YAMLs elsewhere in the repo (e.g. `claro-peru-gui/projects/CPR_CR202102_SXRX/MULTIPLE_FLOWS_SXRX_FIJA.yml:6587-6606`), including the `{ ? = call ... }` variant used for actual PL/SQL **functions** (return value in OUT position 1) as opposed to the `{ call ... }` form used here for plain **procedures**.

### 7.4 `SOM_OBTENER_PARAMETROS_TECNICOS` (prototipo — sin schema real, por decisión explícita del usuario)

```groovy
@Field String SCHEMA_TEST = "jdbcHelperTODO_CONFIRMAR"  // placeholder de prueba, no hay Action existente que revele el schema real
@Field Map<String,Object> returnMap = [:]
@Field GroovyLogger log
@SkValue @Field String planValor
@SkValue @Field String actionIdVal

def run(Map<String,Object> args) {
    log = args.get("log")
    log.info("PROTOTIPO DE PRUEBA — sin schema/firma real confirmada, no crear en ROS todavía")
    obtenerParametros()
    return returnMap
}

def obtenerParametros() {
    SkinkDBExecutor.execute(new SkinkDBCallable<String>() {
        String call(JDBCHelper jdbcHelper) throws SkException {
            def cStmt = jdbcHelper.prepareCall(
                "{ ? = call SOM.obtenerParametrosTecnicos(?, ?) }") // nombre real sin confirmar
            jdbcHelper.registerCallableOutParam(cStmt, 1, oracle.jdbc.OracleTypes.CURSOR)
            jdbcHelper.setCallableObject(cStmt, 2, planValor)
            jdbcHelper.setCallableObject(cStmt, 3, actionIdVal)
            jdbcHelper.executeCall(cStmt)
            returnMap.put("responseData", jdbcHelper.getCallableCursorAsList(cStmt, 1))
            return "OK"
        }
    }, SCHEMA_TEST)
}
```

### 7.5 `RESOURCE_INVENTORY_UPDATE` (prototipo REST — sin dominio/auth real, por decisión explícita del usuario)

- Método: PATCH, endpoint `${URL.RESOURCE_INVENTORY_TODO}/api/v1/resource-inventory/${resourceId}` (placeholder).
- Body (de `Procesos`, confirmado por el Excel — no inventado): `{ relatedParty: {id:""}, resourceStatus: "Asignado", resourceCharacteristic: [{name:"statusReason", value:"Alta linea nueva"}, {name:"portabilityDirection", value:"false"}], resourceSpecification: {id:"Recurso numérico"}, value: "${msisdn}" }`.
- Referencia de estilo: `SRREADPRODUCTIDFORIMSI` (actionId 77333) — mismo patrón de dominio parametrizado + timeouts (10000/10000 propuestos por convención, no confirmados).

## 8. Testing / verification approach

This is ROS platform configuration, not application code — there is no unit-test suite to run. Verification will happen in two stages once implementation starts:

1. **Preview-first, per action**: every `save_action` call for the new/updated actions runs without `confirm:true` first, reviewed before applying — same discipline as every prior `ros-ai-mcp` write phase.
2. **Live item test, per `tipoAlta`**: after wiring the new steps into flow 64506, run a real (or throwaway) item through each of the 4 categories (`AltaPostpago`/`AltaPre`/`AltaPorta`/`AltaLocu`) and use `get_item_info`/`analyze_item` to confirm: the right steps executed for that category, `SYSTEMCS` was `Y`/`N` as expected, and no existing step's behavior changed.

## 9. Open questions / risks carried into implementation

1. ~~Not yet reconfirmed~~ **Resolved 2026-09-21**: two separate `¿Es Locución?` gates, preserving the Excel's literal order (DATOS SOM before InstantLink, INVENTARIO after) — see §6.
2. `SOM_OBTENER_PARAMETROS_TECNICOS`'s real schema/connection and exact procedure/function name are unconfirmed — stays a prototype, not to be created for real in ROS until provided.
3. `RESOURCE_INVENTORY_UPDATE`'s real domain/auth are unconfirmed — same, stays a prototype.
4. `OBTIENE_CM_IMSI_HRLUD`'s OUT positions 4 and 5 have no `STORE_PARAM` in the existing action — unclear if they're genuinely unused or a pre-existing configuration gap. Not fixed here (out of scope — this design only creates a new Groovy alternative, `ALTA_IMSI_GROOVY`, that carries the same orphaned-output pattern forward without inventing a destination for it).
5. `SO - Movil - Activate Validation` (90333)'s existing `buildParameter()` method contains dead/unrelated content referencing "Desactivar VMS"/actionId 40247 — flagged in the original read-only report, not addressed by this design (out of scope), left as-is.
6. ~~Whether to reuse the existing PROCEDURE-type actions~~ **Resolved 2026-09-21**: create the new Groovy wrappers (§7.2/7.3) — `ALTA_IMSI_GROOVY` and `RESERVAR_LINEA_GROOVY` go ahead as designed, not a reuse of `OBTIENE_CM_IMSI_HRLUD`/`RESERVAR_LINEA_INVE` as-is.
7. `get_action_parameters` (§5) is implemented and live-verified but **not committed** in the `ros-ai-mcp` master repo — needs an explicit go-ahead before any commit, per this project's standing no-autonomous-commit rule.
8. Nothing in this design has been applied to ROS. Every new/updated action and every new flow step is still a proposal pending explicit approval before any `save_action`/flow-editing work begins.

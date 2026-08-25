# Análisis: alineación de Subscription Manager con TM Forum Open APIs

**Fecha:** 2026-08-20
**Tipo:** Análisis y propuesta de arquitectura — ningún cambio de código incluido en esta etapa.
**APIs TM Forum evaluadas:** TMF629 (Customer), TMF620 (Product Catalog), TMF622 (Product Ordering),
TMF637 (Product Inventory), TMF641 (Service Ordering), TMF638 (Service Inventory), TMF639 (Resource Inventory).

---

## 0. Corrección crítica respecto de la versión anterior de este análisis

Se pidió una revisión crítica de la propuesta original, específicamente sobre si
`ProductOffering`, `Platform`, `Product`, `Service` y `ProductOrder` estaban correctamente
diferenciados. La revisión encontró **dos errores de hecho** en la versión anterior y produjo una
resolución definitiva de la ambigüedad `PO` vs `PLATFORM` que antes quedó pendiente ("se solapan,
evaluar en fase 2"). Se documentan aquí ambos errores, la evidencia que los corrige, y la
conclusión final. El resto del documento se actualizó para ser consistente con esta corrección.

### 0.1 Error 1 — "no se registra una `Operation CREATE` en el alta" (falso)

La versión anterior afirmaba, en §6 y §12, que `SubscriptionService.create()` no grababa una
`Operation` de tipo `CREATE`, y lo proponía como "cambio mínimo". Al releer
`SubscriptionService.java` línea por línea para esta revisión, la línea 69 muestra:

```java
Subscription saved = repository.save(subscription);
operationRecorder.record(saved, "CREATE", "COMPLETED", null, "Subscription created", null);
```

**Sí se registra.** El error vino de inferir el comportamiento desde el controller y los DTOs sin
leer el service completo. Corregido en §6 y §12 — el "order log" vía `OPERATIONS` ya cubre el
ciclo de vida completo (alta incluida), lo cual hace que el mapeo `Operation` ≈ historial de
`Product Order` (TMF622) sea **más sólido** de lo que se dijo antes, no menos.

### 0.2 Error 2 — "`PO` es el campo mejor listo para alinear con TMF620" (apresurado, y luego sobre-corregido)

Esto requirió dos pasadas para resolverse bien:

**Primera pasada (dentro de esta misma revisión):** un `grep` de `setPo\(` en todo el backend
confirmó que **ningún flujo de esta aplicación escribe `po` jamás** — ni
`SubscriptionService.create()`, ni ninguna `LifecycleAction`. Solo se lee (`getPo()`) en el DTO de
detalle. Con eso concluí, incorrectamente, que `PLATFORM` (que sí se valida, se exige al crear, y
se muta vía `CHANGE_PLAN`) debía ser el `ProductOffering` real, y que `PO` era un campo muerto sin
relación con TM Forum.

**Corrección final, con evidencia externa:** el README documenta el payload real de
`POST /subsmanActivate` (el contrato *externo* que el ROS/API Gateway usaría, no implementado
localmente):

```json
{
  "platform": "MOBILE_BSCS9",
  "contract": "CONTR_00001",
  "po": "claroVideo",
  "amount": 29.75,
  ...
}
```

Esto es decisivo: `platform` y `po` **coexisten como valores distintos y no redundantes** en el
contrato completo — `po: "claroVideo"` es, literalmente, el nombre de un producto comercial
vendible (un bundle de streaming), mientras que `platform: "MOBILE_BSCS9"` describe **cómo** se
realiza técnicamente (acceso móvil, motor de cobro BSCS9). No se solapan — son dos ejes distintos:
**qué se vende** (`po`) vs. **cómo se factura/aprovisiona** (`platform`). Mi primera pasada de esta
misma revisión se equivocó en la dirección opuesta al documento original. La resolución correcta
está en §0.3.

### 0.3 Resolución definitiva: diferenciación de los 5 conceptos

| Concepto | Qué es en TM Forum | Qué es hoy en el código | Veredicto |
|---|---|---|---|
| **ProductOffering** (TMF620) | Lo que el cliente compra: nombre comercial, catálogo, precio | El campo `PO` (`"claroVideo"`) — confirmado por el payload externo | `PO` es conceptualmente correcto como `ProductOffering`, pero **no implementado de punta a punta en esta app**: no existe en `SubscriptionRequestDTO`, ninguna lifecycle action lo puede cambiar, y las 6 suscripciones de ejemplo en la BD lo tienen vacío. Esto no es una ambigüedad de modelado — es un **gap de implementación real** frente al contrato ya documentado. |
| **Platform** (entidad actual) | No es `ProductOffering` — es un atributo técnico de **cómo se realiza** la oferta (acceso + motor de cobro) | Tabla catálogo real (`PLATFORM`), validada en `ChangePlanAction`/`SubscriptionService.create()`, pero sin FK real en el esquema SQL | Corregido respecto a la versión anterior: no es "mitad ProductOffering, mitad ServiceSpecification" — es enteramente un atributo de realización técnica, más cercano a **ServiceSpecification** (TMF638) o a una característica del catálogo que describe con qué especificación técnica se relaciona una oferta. No debe promoverse a `Product.productOffering`. |
| **Product** (TMF637) | La instancia que el cliente tiene | `Subscription` (núcleo: id, client, status, fechas, amount, contract) | Confirmado, sin cambios respecto a la versión anterior. |
| **Service** (TMF638) | La realización técnica/de red del Product | No existe como entidad. Sus atributos (`MSISDN`, `SIM_ICCID`) viven aplanados en `Subscription` — y ahora se suma `PLATFORM` a este grupo (ver arriba) | Gap confirmado, y ahora con un miembro más (`PLATFORM`) de lo que se dijo antes. |
| **Product Order** (TMF622) | El registro de la transacción de alta/modificación/baja | `Operation` — **y sí incluye el alta** (corrección §0.1) | Mapeo más fuerte de lo que se documentó antes. |

**Consecuencia directa sobre `CHANGE_PLAN`:** con `PLATFORM` reclasificado como atributo técnico
(no comercial), `ChangePlanAction` — que hoy solo puede cambiar `PLATFORM`, nunca `po` — no es en
realidad un cambio de plan comercial en el sentido que su nombre sugiere. Es más bien un
**re-aprovisionamiento técnico** (cambiar el motor/plataforma que realiza la misma oferta), es
decir, algo más cercano a un **Service Order** que a un **Product Order** comercial. Y se descubre
un gap adicional: **hoy no existe ninguna acción para cambiar la oferta comercial real (`po`)** —
solo para cambiar cómo se realiza técnicamente. Esto se documenta en §7 y §14.

### 0.4 Qué debe representar `Subscription`, exactamente

`Subscription` no es una sola entidad TM Forum — es una tabla física que hoy hospeda **cuatro
particiones lógicas distintas**, no tres como sugería la versión anterior:

1. **Núcleo de Product (TMF637):** `ID`, `CLIENT_ID`, `STATUS`, `ENTRY_DATE`, `MODIFY_DATE`,
   `ACTIVATE_DATE`, `DEACTIVATE_DATE`, `CANCEL_DATE`, `AMOUNT`, `CONTRACT`, y — una vez
   implementado de punta a punta — `PO` como `productOffering`.
2. **Atributos técnicos de Service (TMF638), hospedados hoy en la fila de Product por
   pragmatismo:** `MSISDN`, `SIM_ICCID`, y **`PLATFORM`** (se agrega tras esta revisión — antes se
   trataba como si fuera parcialmente Product).
3. **Bolsa de extensión de Charging/ROS, fuera de las 7 APIs pedidas:** `TRANSACTION_DATE`,
   `FLOW`, `ERROR_CODE`, `ERROR_MSG`, `PROMOTION`, `PAYMENT_MODE_ID`, `START_TRIAL_DATE`/
   `END_TRIAL_DATE`, `OBSERVATION`.
4. **Estado de proceso puramente interno, sin concepto TM Forum:** `PRE_SUSPEND_STATUS`.

`Subscription` **debe representar (1)** — el `Product` — y las particiones (2)-(4) deben
reconocerse explícitamente como lo que son (Service, extensión de Charging, y estado interno
respectivamente), aunque sigan viviendo en la misma fila física mientras no se ejecute la fase 2
(separar Service). Esto no es ambiguo: la partición (2) en particular ahora incluye `PLATFORM`,
lo cual no estaba resuelto en la versión anterior.

---

## 1. Estado actual

Subscription Manager es una app Spring Boot + React que administra el ciclo de vida de una
suscripción telco contra una única base Oracle (`SUBSCRIPTION_MANAGER`). Todo lo implementado
es **local** — no hay integración real con la API Gateway ni con el ROS Loader; esos flujos están
documentados en `README.md` como contrato *externo* de referencia, no como código que exista hoy.

Lo que existe realmente en el código (`backend/src/main/java/com/subscriptionmanager/`):

- **6 entidades JPA**: `Client`, `Subscription`, `Platform`, `PaymentMode`, `Operation`, `Resource`.
- **4 tablas de catálogo/soporte** minúsculas: `PLATFORM`, `PAYMENT_MODE` (catálogos ya normalizados,
  con FK) y `RESOURCES`/`OPERATIONS` (tablas de detalle/auditoría).
- **Una tabla central, `SUBSCRIPTIONS`**, con 23 columnas que mezcla — en una sola fila — datos de
  cliente-relación, identidad comercial del producto, fechas de ciclo de vida, información técnica
  de servicio (MSISDN/SIM propios), bookkeeping del motor de cobro (ROS Loader) y estado de proceso
  interno (`PRE_SUSPEND_STATUS`).
- **Un único endpoint genérico de lifecycle actions** (`POST /api/subscriptions/{id}/actions`),
  con 6 acciones registradas (`SuspendAction`, `ReconnectAction`, `CancelAction`, `ChangePlanAction`,
  `ChangeMsisdnAction`, `ChangeSimAction`) que validan transición de estado, aplican el cambio y
  graban un `Operation` (auditoría).
- **Sin capa de Servicio ni de Recurso separada del Producto** en el sentido TM Forum: `RESOURCES`
  ya es una tabla independiente, pero cuelga directamente de `SUBSCRIPTION_ID` — no existe una
  entidad "Service" intermedia.

Dato clave para todo lo que sigue: el campo `PO` en `SUBSCRIPTIONS` **ya se llama, literalmente,
"Product Offering"** en el README (`PO | VARCHAR2(400) | Product Offering — determines charging
behavior`). El proyecto ya usa vocabulario TM Forum sin saberlo — el trabajo de alineación es más
de formalizar relaciones que de inventar conceptos nuevos.

---

## 2. Modelo actual

```
CLIENT (1) ──< SUBSCRIPTIONS (N) >── (1) PLATFORM   [FK por nombre, no por ID]
                     │
                     ├──< OPERATIONS   (auditoría de cada lifecycle action)
                     ├──< RESOURCES    (IP/VLAN/CPE/PORT/EQUIPMENT/NODE)
                     └── (0..1) PAYMENT_MODE [FK real]
```

`SUBSCRIPTIONS` es, hoy, simultáneamente:
- el **Product** (instancia comercial que el cliente tiene contratada),
- el **Product Order** implícito (el alta y cada lifecycle action quedan registradas como fila en
  `OPERATIONS` — ver corrección en §0.1: el alta sí se registra),
- el **Service** (`MSISDN`/`SIM_ICCID` propios de la suscripción, y — tras la revisión de §0 —
  también `PLATFORM`, viven aquí en vez de en una entidad de servicio), y
- el **libro de cobro** (`TRANSACTION_DATE`, `FLOW`, `ERROR_CODE`, `ERROR_MSG` son bookkeeping del
  ROS Loader, no atributos de producto).

`PLATFORM` no es una FK real (es un `VARCHAR2` que se valida contra la tabla `PLATFORM` en
`ChangePlanAction`, pero `SUBSCRIPTIONS.PLATFORM` no tiene `FOREIGN KEY` — a diferencia de
`PAYMENT_MODE_ID`, que sí es FK real). Esto ya es una inconsistencia del modelo actual, independiente
de TM Forum.

---

## 3. Modelo TM Forum propuesto

```
Customer (TMF629)
    │  relatedParty
    ▼
Product (TMF637 Product Inventory)
    │  realizingService
    ▼
Service (TMF638 Service Inventory)
    │  supportingResource
    ▼
Resource (TMF639 Resource Inventory)

Product Offering (TMF620) ──instanceOf──▶ Product
Product Order (TMF622)    ──creates/modifies/deletes──▶ Product
Service Order (TMF641)    ──creates/modifies/deletes──▶ Service
```

**Validación de la cadena para este proyecto:** la cadena Customer→Product→Product Order→
Service→Resource **sí aplica**, con un matiz importante: hoy el proyecto tiene Customer, Product
(fusionado con Order) y Resource, pero **no tiene Service como entidad independiente**. Los campos
técnicos que deberían vivir en Service (`MSISDN`, `SIM_ICCID`) están hoy en la fila de Product, y
`RESOURCES` cuelga directamente de lo que hace de Product, saltándose la capa Service. Esa es la
brecha estructural más importante que este análisis identifica (ver §11).

---

## 4. Mapeo de entidades

| Entidad actual | Rol real hoy | Entidad(es) TMF propuesta(s) | Veredicto |
|---|---|---|---|
| `Client` | Cliente | **Customer** (TMF629) | Ya casi 1:1. Matiz: TMF629 `Customer` envuelve un `engagedParty` (Individual/Organization) que tiene `givenName`/`familyName`/`contactMedium` — hoy esos campos están aplanados directo en `Client`. Aceptable para fase 1. |
| `Subscription` | Producto + Orden + Servicio + bookkeeping de cobro, todo junto | **Product** (TMF637) como núcleo; algunos campos → **Service** (TMF638); algunos campos → extensión propia (fuera de TMF) | Requiere división de campos — ver §0.4 y §5. |
| `Platform` | Catálogo de "plataforma de cobro/acceso" (`MOBILE_BSCS9`, `FIXED_BSCS7`, ...) | **Service Specification** (TMF638) — atributo técnico de realización, **no** Product Offering | Corregido en §0.3: no es "mitad y mitad" — es enteramente técnico. El verdadero `ProductOffering` es `PO` (ver fila `PO` en §5). |
| `PaymentMode` | Catálogo de método de cobro | Territorio de Account/Billing Management (TMF666/TMF676) — **no está en las 7 APIs pedidas** | Se mantiene como extensión local en fase 1 (ver §14). |
| `Operation` | Auditoría de cada lifecycle action | Historial aplanado de **Product Order** (TMF622) / **Service Order** (TMF641) ya completadas | No es una entidad nueva — es, en esencia, el order log que TM Forum pediría, ya existente y casi listo. |
| `Resource` | IP/VLAN/CPE/PORT/EQUIPMENT/NODE por suscripción | **Resource** (TMF639) | Ya es la entidad más alineada del proyecto — solo le falta colgar de un Service en vez de colgar directo del Product. |

---

## 5. Mapeo campo por campo — `Subscription`

| Campo actual | Entidad TMF propuesta | Atributo TMF | Mantener | Transformación | Comentarios |
|---|---|---|---|---|---|
| `ID` | Product | `id` | Sí | Ninguna | Ya es el identificador natural del Product. |
| `CLIENT_ID` | Product | `relatedParty[role=Customer].id` | Sí | Ninguna (FK ya existe) | Directo. |
| `ENTRY_DATE` | Product / Lifecycle | `Product.creationDate` (no estándar exacto, pero convención común) | Sí | Ninguna | Marca cuándo se creó el registro — equivalente a cuándo se completó la orden de alta. |
| `MODIFY_DATE` | Product | `lastUpdate` | Sí | Ninguna | Coincide exactamente con el atributo estándar TMF637. |
| `PLATFORM` | **Service** (TMF638) | `serviceSpecification.name` / `ServiceCharacteristic("realizationPlatform")` | Sí | Ninguna (reclasificación conceptual, no transformación de dato) | Corregido en §0.3: no es "mitad ProductOffering". El payload externo documentado (`subsmanActivate`) manda `platform` y `po` juntos y distintos — `platform` describe **cómo** se realiza técnicamente (acceso + motor de cobro: `MOBILE_BSCS9`, `FIXED_BSCS7`...), nunca **qué** se vende. Se une al grupo Service junto con `MSISDN`/`SIM_ICCID`. |
| `CONTRACT` | Product | `ProductCharacteristic("contractNumber")` | Sí | Sin pérdida, vía característica | TMF637 no tiene un campo "contract" nativo; se modela como característica sin inventar una API nueva. |
| `STATUS` | Product | `status` (`ProductStatusType`) | Sí | **Mapeo de valores** | Ver tabla de valores más abajo — 4 de 6 valores tienen equivalente directo, 2 no son estándar. |
| `PO` | Product | `productOffering` (`ProductOfferingRef`, TMF620) | Sí | Formalizar como FK real a un catálogo **+ implementarlo en el flujo de alta/cambio, que hoy no existe** | Confirmado por el payload externo (`po: "claroVideo"`) como el verdadero `ProductOffering`. Pero es un **gap de implementación real**, no solo de catálogo: `SubscriptionRequestDTO` no tiene campo `po`, ninguna lifecycle action lo puede cambiar, y las suscripciones creadas hoy lo dejan vacío. Formalizarlo requiere más que una tabla catálogo — requiere que el flujo de alta (y una futura acción de "cambio de oferta comercial") realmente lo use. |
| `ACTIVATE_DATE` | Product | `startDate` | Sí | Ninguna | Coincide exactamente con el atributo estándar TMF637. |
| `DEACTIVATE_DATE` | Product | `terminationDate` (parcial) | Sí | Aclarar semántica | Se solapa con `CANCEL_DATE` — ver comentario. |
| `CANCEL_DATE` | Product / Product Order | `terminationDate` o `ProductOrder.orderDate` de la orden de baja | Sí | Aclarar semántica | Hoy hay **tres** fechas de "fin de servicio" posibles (`DEACTIVATE_DATE`, `CANCEL_DATE`, y el estado `EX`/`ER` sin fecha dedicada) sin una jerarquía clara. No se elimina nada — se documenta la ambigüedad para fase 2. |
| `START_TRIAL_DATE` | Product | `ProductCharacteristic("trialStartDate")` | Sí | Vía característica | TM Forum modela trial normalmente vía `ProductOfferingPrice` con validez temporal (TMF620), fuera del alcance de las 7 APIs pedidas — característica es la vía mínima sin nueva API. |
| `END_TRIAL_DATE` | Product | `ProductCharacteristic("trialEndDate")` | Sí | Vía característica | Igual que arriba. |
| `AMOUNT` | Product | `productPrice[].price` | Sí | Ninguna (TMF637 `Product` sí tiene `productPrice`) | Uno de los campos con mejor encaje directo. |
| `TRANSACTION_DATE` | **Ninguna de las 7 APIs** — extensión propia (Charging/Billing) | — | Sí | Ninguna | Bookkeeping del ROS Loader; corresponde a Billing/Charging (fuera del alcance pedido). Se mantiene tal cual. |
| `FLOW` | Extensión propia | — | Sí | Ninguna | Igual que `TRANSACTION_DATE`. |
| `OBSERVATION` | Product | `ProductCharacteristic("observation")` o nota libre | Sí | Vía característica | Bajo riesgo, sin pérdida. |
| `ERROR_CODE` | Extensión propia (Charging) | — | Sí | Ninguna | No es un atributo de Product/Service/Resource — es resultado de un intento de cobro. |
| `ERROR_MSG` | Extensión propia (Charging) | — | Sí | Ninguna | Igual que `ERROR_CODE`. |
| `PROMOTION` | Extensión propia / territorio TMF620 (Offering Price) | — | Sí | Ninguna por ahora | Relación con descuentos de catálogo — fuera de las 7 APIs pedidas; se revisita si se incorpora TMF620 completo. |
| `PAYMENT_MODE_ID` | Extensión propia / territorio Account-Billing (no pedido) | — | Sí | Ninguna | Ya es FK real (a diferencia de `PLATFORM`). Correcto conceptualmente, solo que su "hogar" TMF natural (Account Management) no está en las 7 APIs solicitadas. |
| `MSISDN` (de la suscripción) | **Service** (TMF638) | `ServiceCharacteristic("msisdn")` | Sí | **Mover conceptualmente a Service** | Ya el README distingue explícitamente esto del MSISDN de contacto del cliente — es exactamente la separación Product vs. Service que falta modelar. |
| `SIM_ICCID` | **Service** (TMF638) o **Resource** (TMF639) | `ServiceCharacteristic("simIccid")` o un nuevo `RESOURCE_TYPE = 'SIM'` | Sí | **Mover conceptualmente** | Un ICCID es más "tangible" que un MSISDN — encaja igual de bien como Resource (junto a IP/VLAN/CPE que ya existen) que como Service characteristic. Se recomienda evaluarlo en fase 2, no decidir ahora. |
| `PRE_SUSPEND_STATUS` | **Ninguna — extensión propia pura** | — | Sí | Ninguna | No es un concepto TM Forum; es un truco de implementación local para que `Reconnect` sepa a qué estado volver. Se mantiene como está. |

### Mapeo de valores de `STATUS` → `ProductStatusType`

| Código actual | Significado actual | `ProductStatusType` TMF637 | Nota |
|---|---|---|---|
| `AC` | Activo, cobrando | `active` | Coincide exacto. |
| `TR` | Trial, sin cobro | *(no estándar)* | TMF637 no tiene "trial" como valor de status; se recomienda `active` + `ProductCharacteristic("billingMode"="trial")`, no forzar un valor inventado en el enum estándar. |
| `SU` | Suspendido | `suspended` | Coincide exacto — el único valor con mapeo perfecto. |
| `EX` | Expirado por falla de cobro | *(no estándar)* | Más cercano a `suspended` con `statusReason="paymentFailure"`, o a un valor de extensión. TMF637 no distingue "suspendido por el cliente" de "suspendido por impago" en su enum base. |
| `CA` | Cancelado por el cliente | `terminated` | El más cercano; `cancelled` en TMF637 típicamente significa "la orden se canceló antes de activarse", no "el cliente canceló un producto activo" — `terminated` es semánticamente más correcto aquí. |
| `ER` | Error de proceso | *(no estándar)* | Normalmente `created` (nunca llegó a activarse) + característica de error; no tiene equivalente 1:1. |

**Nada de esto implica cambiar los códigos `AC/TR/SU/EX/CA/ER` en la base ni en el frontend** — es
una tabla de traducción para cuando el sistema necesite exponer o consumir un estado TMF637 hacia
afuera (por ejemplo, si algún día se expone una API TMF637 real).

---

## 6. Flujo de Alta

**Hoy:** `POST /api/subscriptions` → `SubscriptionController.create()` → `SubscriptionService.create()`
inserta una fila en `SUBSCRIPTIONS` con `status = TR` **y sí registra** una `Operation` de tipo
`CREATE` (`operationRecorder.record(saved, "CREATE", "COMPLETED", ...)`, línea 69 — corrección de
un error de la versión anterior, ver §0.1). El "order log" vía `OPERATIONS` ya cubre el alta.

**Propuesto (conceptual, TMF622 + TMF637):**
```
Cliente solicita alta
        ↓
Product Order (action = add) — referencia Customer + ProductOffering (PO)
        ↓
Order se completa → se instancia un Product en Product Inventory (status inicial: active/trial)
```
**Gap real (no de modelado, de implementación):** `SubscriptionRequestDTO` no acepta `po` — el
alta local solo captura `platform`, `contract`, `amount`, `clientId`, `paymentModeId`. El contrato
externo documentado (`POST /subsmanActivate`) sí espera `po` junto con `platform`. Mientras no se
agregue `po` al DTO de creación, el `Product.productOffering` de toda suscripción creada por esta
app queda vacío — no es una decisión de modelado pendiente, es un campo faltante en el request.

---

## 7. Flujo de Modificación

**Hoy:** `CHANGE_PLAN`, `CHANGE_MSISDN`, `CHANGE_SIM` vía el endpoint genérico de acciones.

**Hallazgo corregido (la versión anterior tenía esto invertido):** las tres acciones son en
realidad **todas** modificaciones de atributos de **Service**, no de Product:
- `CHANGE_PLAN` modifica únicamente `PLATFORM` — y tras la corrección de §0.3, `PLATFORM` es un
  atributo técnico de **Service**, no de Product. Es decir: pese a su nombre, `CHANGE_PLAN` no
  cambia ninguna oferta comercial — cambia cómo se realiza técnicamente la misma oferta. Debería
  ser un **Service Order** (`action = modify`, TMF641), igual que las otras dos.
- `CHANGE_MSISDN` y `CHANGE_SIM` modifican atributos que, según el mapeo de §5, pertenecen a
  **Service** → también **Service Order** (`action = modify`).

**Gap descubierto por esta revisión:** no existe ninguna lifecycle action que modifique `po`. Es
decir, hoy **no hay forma de ejecutar un verdadero cambio de oferta comercial** (mover a un cliente
de un producto a otro) — solo de cambiar su realización técnica. Si se necesita esa capacidad,
haría falta una nueva acción tipo `CHANGE_OFFERING` que sí sea un **Product Order** (`action =
modify`) sobre `po`.

Hoy las tres acciones existentes pasan por el mismo `LifecycleActionRegistry`/endpoint sin
distinción — funcionalmente correcto, pero conceptualmente el proyecto no tiene, todavía, ninguna
acción de dominio Product Order más allá de `CREATE` y `CANCEL`. Esto es consecuencia directa de no
tener Service como entidad separada (§11).

---

## 8. Flujo de Baja

**Hoy:** `CancelAction` (elegible desde `AC`, `TR`, `SU`) exige `immediate: boolean`, pone
`status = CA`, `CANCEL_DATE = hoy`, y si `immediate = true` también `DEACTIVATE_DATE = hoy`.

**Propuesto:** Product Order (`action = delete`) → `Product.status = terminated`,
`Product.terminationDate` fijado. Si existiera Service (§11), la baja debería propagar un
Service Order de terminación y liberar los Resources asociados — **hoy el código no toca
`RESOURCES` al cancelar una suscripción**, lo cual es un gap real (ver §14, Riesgos).

---

## 9. Flujo de Suspensión

Esta es la pregunta que el usuario pidió evaluar con más cuidado.

**Hoy:** `SuspendAction` (elegible desde `AC`, `TR`) simplemente guarda el status previo en
`PRE_SUSPEND_STATUS` y pone `status = SU`. No toca `RESOURCES`, no hay noción de "servicio de red".

**Evaluación TM Forum:**
- **Estado final del Product:** `status = suspended` — mapeo directo y limpio (el único valor 1:1
  perfecto de toda la tabla de §5).
- **¿Requiere Service Order?** — En un modelo TM Forum completo, suspender comercialmente el Product
  normalmente **sí** dispara un Service Order que pone el Service subyacente en `inactive`/`stopped`,
  porque suspender de verdad implica cortar tráfico en la red (algo que vive en Service/Resource, no
  en Product). **Hoy el proyecto no modela esto** — no existe una entidad Service cuyo estado
  cambiar, así que la suspensión actual es puramente un cambio de status en el Product. Esto es
  correcto como primer paso, pero es incompleto frente a lo que TM Forum esperaría en un dominio
  telco real: la propuesta es que, cuando exista Service (fase 2), `SuspendAction` dispare también
  un Service Order.
- **Estado final del Resource:** no cambia (un recurso IP/VLAN/CPE típicamente permanece asignado
  durante una suspensión — solo se bloquea el tráfico a nivel de red/servicio, no se libera el
  recurso). El código actual, al no tocar `RESOURCES`, ya está — por accidente — alineado con este
  comportamiento esperado.

---

## 10. Flujo de Reconexión

**Hoy:** `ReconnectAction` (elegible solo desde `SU`) restaura `status` desde `PRE_SUSPEND_STATUS`
(o `AC` si es null) y limpia `PRE_SUSPEND_STATUS`.

**Evaluación TM Forum:**
- **Estado final del Product:** vuelve a `active` (o el estado previo a la suspensión) — mapeo
  directo.
- **Estado final del Service:** simétrico a la suspensión — en un modelo completo, reconectar
  debería disparar un Service Order que reactive el Service (`active`/`running`). Hoy no aplica
  porque Service no existe como entidad.
- **Nota:** el README documenta que la reconexión real (`Reconnect Contract` vía API Gateway) es
  distinta de la reactivación por pago (`Payment Received`, que aplica solo a `EX`) — esa distinción
  de negocio ya está bien capturada hoy (`ReconnectAction` solo acepta `SU`), y se traduce
  naturalmente a TM Forum: son dos Service Orders con triggers de negocio distintos pero el mismo
  efecto en el Service.

---

## 11. Relación Product → Service → Resource

Esta es la brecha estructural central identificada en este análisis:

```
HOY:           Product (=Subscription, con MSISDN/SIM/PLATFORM propios) ──┐
                                                                            ├──> Resource (RESOURCES)
                                                                            ┘
               (sin capa Service intermedia)

TM FORUM:      Product ──> Service (MSISDN/SIM/PLATFORM/estado de red) ──> Resource (IP/VLAN/CPE/...)
```

`Resource` (TMF639) ya es la entidad mejor alineada del proyecto — tiene su propia tabla, su propia
clave foránea, y tipos ya acotados (`IP`, `VLAN`, `CPE`, `PORT`, `EQUIPMENT`, `NODE`, vía
`CHK_RESOURCES_TYPE`). Su único defecto frente a TM Forum es que `RESOURCES.SUBSCRIPTION_ID` apunta
a lo que hoy hace de Product, cuando en el modelo objetivo debería apuntar a un Service (que a su vez
referencia el Product). Introducir Service como entidad separada es, con diferencia, el cambio de
mayor apalancamiento estructural — pero también el de mayor alcance, por eso se recomienda para
fase 2, no fase 1 (ver §12–13).

---

## 12. Cambios mínimos recomendados (fase 1 — bajo riesgo, sin romper nada)

1. **Documentar (no forzar en código) el mapeo de valores de `STATUS`** de §5 como una tabla de
   referencia para cualquier integración futura con una API TMF637 real — cero riesgo, solo
   claridad.
2. **Documentar explícitamente que `PLATFORM` es un atributo de Service, no de Product**, y que
   `PO` es el `ProductOffering` real (§0.3) — evita que cualquier trabajo futuro repita el error de
   esta misma revisión. Cero riesgo, solo documentación/comentarios de código.
3. **Formalizar `PO` end-to-end** (no solo el catálogo): agregar `po` a `SubscriptionRequestDTO`,
   crear el catálogo de Product Offerings (mismo patrón que `PLATFORM`/`PAYMENT_MODE`), y decidir si
   se necesita una nueva acción (`CHANGE_OFFERING`) para modificarlo después del alta. Este punto
   **ya no es "bajo riesgo, sin tocar código"** como se calificó en la versión anterior — implica
   tocar el contrato de creación (aditivo: un campo opcional nuevo no rompe clientes existentes,
   pero sí es más que agregar una tabla catálogo).

## 13. Cambios opcionales (fase 2 en adelante — mayor alcance, requieren diseño propio)

1. Introducir **Service** como entidad independiente (tabla + FK desde `RESOURCES`), moviendo
   `MSISDN`/`SIM_ICCID`/`PLATFORM` conceptualmente ahí.
2. Separar `Product Order` de `Product` de verdad (hoy están fusionados en `SUBSCRIPTIONS`).
3. Mover `CHANGE_PLAN`/`CHANGE_MSISDN`/`CHANGE_SIM` a un registro/endpoint de "Service actions"
   distinto del de "Product actions" (`CREATE`, `CANCEL`, y el futuro `CHANGE_OFFERING`) — ver §7.
4. Resolver la ambigüedad entre `DEACTIVATE_DATE` y `CANCEL_DATE`.
5. Evaluar si `SIM_ICCID` se modela mejor como `Service characteristic` o como un nuevo
   `RESOURCE_TYPE = 'SIM'`.
6. Evaluar Account/Billing Management (TMF666/676) para `PAYMENT_MODE`/`PROMOTION` si se decide
   ampliar el alcance más allá de las 7 APIs pedidas.
7. Separar `Client` en `Party`/`Individual` + `Customer` (TMF629 completo).

---

## 14. Riesgos

- **Gap funcional ya existente (no introducido por esta propuesta):** cancelar una suscripción hoy
  no libera sus `RESOURCES` — si se avanza hacia un modelo Service→Resource más estricto, este gap
  se vuelve más visible y debería resolverse a la vez.
- **Sobrecarga de significado en `STATUS`:** dos de los seis valores (`TR`, `EX`, `ER`) no tienen
  equivalente 1:1 en `ProductStatusType`; cualquier integración futura con una API TMF637 real
  necesitará characteristics/reason codes adicionales, no solo el enum.
- **`PLATFORM` vs `PO` — resuelto en §0.3, pero con un riesgo residual:** si en el futuro se
  formaliza `PO` sin documentar la distinción que deja esta revisión (`PO` = qué se vende,
  `PLATFORM` = cómo se realiza técnicamente), alguien podría volver a tratarlos como redundantes.
  Mitigación: el punto 2 de §12 (documentarlo explícitamente) existe justo para evitar esto.
- **`CHANGE_PLAN` es un nombre engañoso:** hoy no cambia ninguna oferta comercial (§7) — cualquier
  persona nueva en el proyecto puede asumir, por el nombre, que sí lo hace.
- **Alcance de PaymentMode/Promotion:** quedan fuera de las 7 APIs pedidas por diseño explícito del
  usuario; si en algún momento se requiere modelarlos con TM Forum, se necesitará una API adicional
  (Account/Billing) no contemplada aquí — flagged, no resuelto.
- **Ninguna entidad nueva implica romper el contrato REST actual** si las fases 1 se ejecutan como
  se describe — todos los cambios mínimos son aditivos o puramente de documentación/catálogo.

## 15. Plan de migración por fases

| Fase | Alcance | Riesgo | Rompe contrato API/frontend |
|---|---|---|---|
| **1** | Documentar mapeo de `STATUS` y la distinción `PLATFORM` (Service) vs `PO` (Product Offering); luego formalizar `PO` end-to-end (catálogo + campo en el alta) | Bajo–Medio (la documentación es bajo riesgo; formalizar `PO` end-to-end es algo más que un catálogo, ver §12.3) | No |
| **2** | Introducir `Service` como entidad; mover `MSISDN`/`SIM_ICCID` conceptualmente; separar acciones Product vs Service | Medio | Posible (requiere diseño de API cuidadoso) |
| **3** | Separar `Product Order` de `Product` de verdad; resolver `DEACTIVATE_DATE`/`CANCEL_DATE` | Medio | Posible |
| **4** | Evaluar Account/Billing (`PaymentMode`/`Promotion`) y `Party`/`Individual` completo | Alto (nueva API fuera de alcance actual) | Sí, si se decide |

---

## Recomendación concreta: primera modificación a implementar

Esta recomendación se actualiza respecto a la versión anterior del documento, que proponía
formalizar `PO` como el primer paso y lo calificaba de "bajo riesgo, sin tocar código más allá de
un catálogo". Tras esta revisión crítica, ese paso sigue siendo el destino correcto, pero **no es
el primer paso** — el primer paso debe ser puramente documental, precisamente porque esta misma
revisión demostró lo fácil que es equivocar la relación `PLATFORM`/`PO` sin evidencia directa del
código.

**Primer paso real: documentar, en el propio código (comentarios en `Subscription.java` sobre los
campos `platform` y `po`) y no solo en este análisis, que `PO` es el `ProductOffering` (TMF620) y
`PLATFORM` es un atributo técnico de `Service` (TMF638) — nunca el mismo concepto.**

Razones:
1. Es el cambio de **menor riesgo posible** — cero líneas de comportamiento, solo comentarios/
   documentación. No puede romper nada porque no ejecuta nada.
2. Previene exactamente el error que esta misma revisión cometió en su primera pasada (concluir que
   `PLATFORM` era el `ProductOffering` por estar validado y mutable, sin haber visto el payload
   externo que prueba lo contrario). Sin este paso, cualquier futura sesión de trabajo sobre este
   código puede volver a invertir la relación.
3. Es el prerequisito real del siguiente paso (formalizar `PO` end-to-end, §12.3): antes de tocar
   código, hay que dejar escrito, sin ambigüedad, qué campo es cuál — de lo contrario se corre el
   riesgo de construir el catálogo equivocado sobre el campo equivocado.

**Segundo paso** (ya con código, cuando se decida avanzar): agregar `po` a
`SubscriptionRequestDTO`, crear el catálogo de Product Offerings, y decidir si se necesita una
acción `CHANGE_OFFERING` — descrito en §12.3.

No se ha modificado ningún código como parte de este análisis.

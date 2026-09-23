# Introduce Service as an Entity — Design Spec

**Date:** 2026-08-26
**Status:** Approved

---

## Overview

Extracts `PLATFORM`/`MSISDN`/`SIM_ICCID` off `SUBSCRIPTIONS` into a new `SERVICE` table,
one row per subscription (1:1). This is the lowest-risk slice of Phase 2 of the TM Forum
alignment work (`docs/superpowers/specs/2026-08-20-tmforum-alignment-analysis.md`, §13.1):
`Service` (TMF638) becomes a real, addressable entity instead of three columns living on
`SUBSCRIPTIONS`, and `RESOURCES` gets a technically correct parent — a resource (IP/VLAN/
CPE/PORT/EQUIPMENT/NODE) is something assigned to realize a Service, not to a Product
Order — matching the §13.1 note ("tabla + FK desde RESOURCES").

The prior commit (`44799c8`, "additive service grouping and internal action domain
classification") already added a read-only `service` object to the subscription detail
response and classified lifecycle actions as `PRODUCT`/`SERVICE` internally — this spec
is the schema-level follow-through that groundwork was preparing for.

**Explicitly scoped down**, based on discussion:
- Still 1:1 (one `Service` per `Subscription`) — no support for multiple services per
  subscription.
- No change to the external API contract: `platform`/`msisdn`/`simIccid` stay flat,
  top-level fields on `SubscriptionDTO`/`SubscriptionRequestDTO`/`SubscriptionDetailDTO`
  exactly as today. The backend resolves them through the new `Service` relation
  internally; the frontend is untouched.
- No split of the lifecycle-action endpoint into separate Product-actions/Service-actions
  endpoints — the single generic `POST` action endpoint stays as-is. The already-existing
  internal `LifecycleDomain` classification (`PRODUCT`/`SERVICE`) is not exposed via API.
- No change to how `SIM_ICCID` is modeled (still a dedicated field, not a
  `RESOURCE_TYPE='SIM'` row) — left for a future iteration per §13.5 of the TM Forum doc.

---

## Data Model

New table, following the same sequence+trigger pattern as `RESOURCES`/`OPERATIONS`
(child/transactional table, not a catalog like `PLATFORM`/`PRODUCT_OFFERING` which use
`IDENTITY`):

```sql
CREATE SEQUENCE SUBSCRIPTION_MANAGER.SEQ_SERVICE_ID START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE SUBSCRIPTION_MANAGER.SERVICE (
    ID              NUMBER PRIMARY KEY,
    SUBSCRIPTION_ID NUMBER NOT NULL UNIQUE,
    PLATFORM        VARCHAR2(100),
    MSISDN          VARCHAR2(400),
    SIM_ICCID       VARCHAR2(400),
    CONSTRAINT FK_SERVICE_SUBSCRIPTION
        FOREIGN KEY (SUBSCRIPTION_ID)
        REFERENCES SUBSCRIPTION_MANAGER.SUBSCRIPTIONS (ID)
);
-- + TRG_SERVICE_ID trigger, same shape as TRG_RESOURCE_ID
```

Column sizes/nullability copied verbatim from the columns being replaced (`PLATFORM
VARCHAR2(100)`, `MSISDN`/`SIM_ICCID VARCHAR2(400)`, all nullable).

Migration (`database/006-service.sql`) runs in this order — each step depends on the
previous one completing cleanly, matching the "validate before drop" style already used
in `005-product-offering.sql`:

1. Create `SERVICE` (+ sequence + trigger).
2. Backfill: one `SERVICE` row per existing `SUBSCRIPTIONS` row (`INSERT ... SELECT ID,
   PLATFORM, MSISDN, SIM_ICCID FROM SUBSCRIPTIONS`). Unlike the `PO` backfill, this cannot
   leave unresolved rows — every subscription gets exactly one `SERVICE` row from its own
   data, no external catalog lookup involved.
3. `RESOURCES` FK swap: add `SERVICE_ID`, backfill by joining `RESOURCES.SUBSCRIPTION_ID`
   to `SERVICE.SUBSCRIPTION_ID`, make it `NOT NULL`, add `FK_RESOURCES_SERVICE`, drop the
   old `FK_RESOURCES_SUBSCRIPTION` constraint and the `SUBSCRIPTION_ID` column.
4. Drop `PLATFORM`/`MSISDN`/`SIM_ICCID` from `SUBSCRIPTIONS`.

No down-migration script, consistent with `005-product-offering.sql`.

---

## Backend

**New entity** — `entity/Service.java`: `id` (own sequence), `subscription`
(`@OneToOne`, unique `SUBSCRIPTION_ID`), `platform`/`msisdn`/`simIccid`.

**Naming collision:** the entity `Service` collides by simple name with
`org.springframework.stereotype.Service`, already used by `SubscriptionService` and
`ResourceService`. In files annotated `@Service`, the entity is referenced fully
qualified (`com.subscriptionmanager.entity.Service`, no import) rather than imported
under its simple name. Files that are `@Component` instead of `@Service`
(`ChangePlanAction`, `ChangeMsisdnAction`, `ChangeSimAction`, `CancelAction`) import it
normally.

**`Subscription.java`:** drops `platform`/`msisdn`/`simIccid` (fields, getters, setters,
constructor parameter). Gains `@OneToOne(mappedBy="subscription", cascade=ALL,
orphanRemoval=true) service` — `cascade=ALL` means saving a new `Subscription` with its
`service` set persists the `Service` row too, no separate repository call needed.

**`Resource.java`:** FK moves from `SUBSCRIPTION_ID`/`subscription` to
`SERVICE_ID`/`service` (type `Service`).

**Repositories:**
- `SubscriptionRepository.findAllWithClient()` gains `JOIN FETCH s.service` in its JPQL
  (same reason `client` is already fetched eagerly there: `toDTO()` runs after the
  repository call returns, outside the open persistence context, so a lazy `service`
  would throw `LazyInitializationException`).
- `ResourceRepository.findBySubscriptionIdOrderByIdAsc` →
  `findByService_Subscription_IdOrderByIdAsc`; `deleteBySubscriptionId` →
  `deleteByService_Subscription_Id`.

**Service-layer call sites** (every `s.getPlatform()`/`getMsisdn()`/`getSimIccid()`
becomes `s.getService().getX()`):
- `SubscriptionService.create()` — builds and links the `Service` alongside the
  `Subscription` before `save()`.
- `SubscriptionService.getById()` / `toDTO()` — read via `s.getService()`.
- `ChangePlanAction` / `ChangeMsisdnAction` / `ChangeSimAction` (`.apply()`) — mutate
  `subscription.getService()`.
- `ResourceService` (`addResource`/`deleteResource`/`toDTO`/`getResources`) — construct/
  filter/map via `subscription.getService()` and `resource.getService().getSubscription()`.
- `CancelAction.apply()` — same behavior, only the repository method name changes.

**Unchanged:** every DTO (`ServiceDTO`, `SubscriptionDTO`, `SubscriptionDetailDTO`,
`SubscriptionRequestDTO`, `SubscriptionUpdateDTO`), every endpoint, and the frontend
(zero changes) — the wire contract is identical before and after.

No new `ServiceController` or `ServiceRepository` — everything is reached through
`subscription.getService()`; nothing in this scope needs to query `SERVICE` directly.

---

## Testing

Any test constructing `Subscription` directly needs updating for the changed constructor
signature (no more `platform` parameter), or updating call sites that used the removed
getters/setters:
- `SubscriptionServiceTest` — `create`/`getById`/`toDTO` cases
- `LifecycleActionServiceTest` — `ChangePlanAction`/`ChangeMsisdnAction`/`ChangeSimAction`
  assertions
- `ResourceServiceTest` — `Resource` construction now goes through `Service`, not
  `Subscription`
- Any other test building a `Subscription` fixture (checked case-by-case during
  implementation, e.g. `DashboardServiceTest`)

No new test class is needed — no controller or repository is added for `Service` itself.

**Manual verification (optional, same pattern as prior changes):** create a subscription
and confirm exactly one `SERVICE` row appears; assign a resource and confirm its
`SERVICE_ID` resolves to the right subscription; cancel a subscription with resources and
confirm they're still released.

---

## Risks

- The migration does `DROP COLUMN` on both `SUBSCRIPTIONS` and `RESOURCES` against the
  live training Oracle DB, with no rollback script — same risk profile already accepted
  in `005-product-offering.sql`.
- Migration step order matters: `SERVICE` + its backfill must complete before touching
  `RESOURCES`, and `RESOURCES` must be fully migrated before dropping columns from
  `SUBSCRIPTIONS`. A partial run leaves the app broken until the rest of the script runs.

## Out of Scope

- Splitting the lifecycle-action endpoint into Product-actions/Service-actions endpoints
- Evaluating `SIM_ICCID` as a `RESOURCE_TYPE='SIM'` row instead of a dedicated field
- Any frontend change or API contract change
- Supporting more than one `Service` per `Subscription`

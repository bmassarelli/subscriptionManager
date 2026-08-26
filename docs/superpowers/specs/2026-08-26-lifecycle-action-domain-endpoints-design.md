# Split Lifecycle Actions into Product/Service Endpoints — Design Spec

**Date:** 2026-08-26
**Status:** Approved

---

## Overview

Splits the single generic `POST /api/subscriptions/{id}/actions` endpoint into two:
`POST /api/subscriptions/{id}/product-actions` (SUSPEND, RECONNECT, CANCEL) and
`POST /api/subscriptions/{id}/service-actions` (CHANGE_PLAN, CHANGE_MSISDN, CHANGE_SIM).
This is Phase 2 item 2 of the TM Forum alignment work
(`docs/superpowers/specs/2026-08-20-tmforum-alignment-analysis.md` §7, §13.3): actions that
change the commercial Product (activation state) are architecturally distinct from actions
that change the technical Service realization, and each `LifecycleAction` already carries an
internal `PRODUCT`/`SERVICE` `domain()` classification (added in the archived
`2026-08-25-introduce-service-concept` change) that nothing has consumed until now.

**Full replacement, no compatibility shim**: the old `/actions` endpoint is removed in the
same change. Both the backend and the only consumer (this repo's own frontend) are updated
together — there is no external caller to preserve compatibility for.

**No visible UI change**: the subscription detail screen keeps its single flat row of action
buttons. The domain split is an API/architecture change, not a UX change — matching how
`2026-08-25-introduce-service-concept` deliberately kept its own domain classification
invisible to the frontend.

---

## API Surface

- `POST /api/subscriptions/{id}/product-actions` and `POST /api/subscriptions/{id}/service-actions`
  replace `POST /api/subscriptions/{id}/actions`. Same request body shape
  (`LifecycleActionRequestDTO`: `type` + arbitrary `data`) and same response shape
  (`LifecycleActionResultDTO`: `{subscription, operation}`) as today.
- Posting a `type` to the wrong endpoint (e.g. `CHANGE_PLAN` to `/product-actions`) is
  rejected with `400`, via a new `WrongLifecycleDomainException`, mapped in
  `GlobalExceptionHandler` exactly like `UnknownLifecycleActionException` is today:
  `Map.of("type", ex.getMessage())`.
- `GET /api/subscriptions/{id}`'s `SubscriptionDetailDTO.availableActions` (today a single
  `List<String>`) becomes two fields: `availableProductActions` and
  `availableServiceActions` (both `List<String>`). This is the mechanism the frontend uses
  to know which endpoint a given action type belongs to, without duplicating the
  classification itself.
- `GET /api/subscriptions/{id}/operations`, `GET /api/operations`, and the dashboard are
  unchanged — the domain split applies only to the action-dispatch endpoint, not to the
  audit/read model.

---

## Backend

**Shared pipeline, two thin entry points.** `LifecycleActionService.execute(subscriptionId,
type, data)` becomes a private method taking an additional `LifecycleDomain requiredDomain`
parameter. It gains one new check, right after resolving the action from the registry: if
`action.domain() != requiredDomain`, throw `WrongLifecycleDomainException` before validating
eligibility/data — wrong-endpoint should fail before wrong-status or wrong-payload. Two new
public methods, `executeProductAction(subscriptionId, type, data)` and
`executeServiceAction(subscriptionId, type, data)`, call the private method with
`LifecycleDomain.PRODUCT`/`LifecycleDomain.SERVICE` respectively. `SubscriptionLifecycleController`
gains two `@PostMapping`s calling these, replacing the single `executeAction` method.

**Considered and rejected:** separate `ProductActionService`/`ServiceActionService` classes,
each with their own domain-filtered registry. Rejected — the actual business logic
(eligibility check → validate → apply → record → save) is identical regardless of domain;
splitting the service class would either duplicate that pipeline or require extracting a
shared base/helper anyway, for no behavioral gain over a single parameterized method.

**`LifecycleActionRegistry`** gains `availableProductActionsFor(status)` and
`availableServiceActionsFor(status)`, each filtering `eligibleStatuses().contains(status)`
AND `domain() == <the respective domain>`, replacing the single `availableActionsFor(status)`.

**`SubscriptionService.getById()`** (which builds `SubscriptionDetailDTO`) calls both new
registry methods instead of the one it calls today, populating the two new
`availableProductActions`/`availableServiceActions` fields.

---

## Frontend

**`SubscriptionDetail.jsx`:**
- Reads `detail.availableProductActions` and `detail.availableServiceActions` instead of
  `detail.availableActions`; renders them concatenated into the same single flat button row
  as today (no visual change) — order: product actions first, then service actions, each
  list already alphabetically sorted by the backend as today.
- `submitAction()` needs to know which list `activeAction` came from to pick the URL. Track
  this alongside `activeAction` when a button is clicked (e.g. a second piece of state,
  `activeActionDomain`, set to `'product'`/`'service'` at click time from which list the
  button was rendered from) rather than re-deriving it later from a static table — avoids
  the frontend maintaining its own PRODUCT/SERVICE classification.
- Everything else (the per-action inline forms for CANCEL/CHANGE_PLAN/CHANGE_MSISDN/
  CHANGE_SIM, `ACTION_LABELS`, error handling) is unchanged.

---

## Testing

- `SubscriptionLifecycleControllerTest.java`: existing tests posting to `/actions` are
  split/rewritten to post to `/product-actions` or `/service-actions` matching each test's
  action type; add a case covering the `400` wrong-domain rejection (e.g. `CHANGE_PLAN` to
  `/product-actions`).
- A `LifecycleActionServiceTest` (or new test class) case per new public method
  (`executeProductAction`/`executeServiceAction`), covering: correct-domain success,
  wrong-domain rejection, and that `WrongLifecycleDomainException` fires before
  `InvalidLifecycleTransitionException`/`LifecycleActionValidationException` when multiple
  things are wrong at once (domain check ordered first, per the Backend section above).
- `SubscriptionServiceTest.getById()` case(s) updated for the two-list `availableActions`
  split.
- Frontend: `SubscriptionDetail.test.js` cases updated for the two-field response shape and
  to assert the right endpoint is called per action type.

---

## Risks

- **Frontend/backend must ship together** — this is a genuine breaking change to
  `/api/subscriptions/{id}/actions` and to `SubscriptionDetailDTO`'s shape. Accepted: both
  sides live in this repo and are part of the same change, so there's no window where one
  side is updated and the other isn't.
- **Ordering of the wrong-domain check matters for API consumers debugging a 400** — putting
  it before eligibility/validation means a wrong-endpoint call always surfaces the domain
  mismatch first, not a possibly-confusing eligibility or validation error for an action the
  caller didn't intend to invoke on that endpoint anyway.

## Out of Scope

- No change to `GET .../operations`, `GET /api/operations`, or the dashboard.
- No visual grouping of action buttons by domain in the UI.
- No compatibility shim for the old `/actions` endpoint.

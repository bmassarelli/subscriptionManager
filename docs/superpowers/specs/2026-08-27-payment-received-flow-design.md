# Payment Received Flow (+ Mark Expired) — Design Spec

**Date:** 2026-08-27
**Status:** Approved

---

## Overview

Adds two new `LifecycleAction`s, both `PRODUCT` domain, both dispatched through the
existing `POST /api/subscriptions/{id}/product-actions` endpoint — no new endpoint, no
controller change:

- **`MARK_EXPIRED`** — `AC`/`TR` → `EX`. Stands in for the charging pipeline described in
  `README.md`'s "Charge Subscription — ROS Loader" section, which is explicitly out of
  scope (that system is external and not implemented here — see CLAUDE.md's "What's Not
  Built Yet"). Without it, `EX` is unreachable from inside the app and `PAYMENT_RECEIVED`
  would have nothing to react to.
- **`PAYMENT_RECEIVED`** — `EX` → `AC` (always `AC`, never back to `TR`, per README's
  Payment Received Flow: "STATUS = AC (Active)" unconditionally). Implements the
  `Subscription Manager - Payment Received flow` documented in README (the inbound half —
  the API Gateway's outbound call into this flow is simulated by the UI button, not a real
  network listener).

This is the first slice of the "Charging/billing" gap called out in `CLAUDE.md`'s "What's
Not Built Yet"; the periodic ROS Loader charging engine, promotions, and Account/Billing
Management (TMF666/676, TM Forum roadmap items 6-7) remain explicitly out of scope and were
deliberately not designed here (YAGNI) — see "Out of Scope" below.

Both actions require no additional request data, matching `SuspendAction`/`ReconnectAction`
today. Neither touches `PRE_SUSPEND_STATUS` — that field is exclusive to the Suspend/Reconnect
pair.

---

## API Surface

No new endpoints. Both actions are posted to the existing
`POST /api/subscriptions/{id}/product-actions` with `{"type": "MARK_EXPIRED"}` or
`{"type": "PAYMENT_RECEIVED"}` and no `data` — same `LifecycleActionRequestDTO`/
`LifecycleActionResultDTO` shapes as every other product action.

`GET /api/subscriptions/{id}`'s `availableProductActions` will include `MARK_EXPIRED` when
`status` is `AC`/`TR`, and `PAYMENT_RECEIVED` when `status` is `EX` — automatic, via the
existing `LifecycleActionRegistry.availableProductActionsFor(status)` filtering by
`eligibleStatuses()`. No DTO change needed.

---

## Backend

Two new `@Component` classes in `service/lifecycle/`, following the exact shape of
`SuspendAction`/`ReconnectAction`:

```java
public class MarkExpiredAction implements LifecycleAction {
    public String getType() { return "MARK_EXPIRED"; }
    public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }
    public List<String> eligibleStatuses() { return List.of("AC", "TR"); }
    public void validate(Subscription s, Map<String, Object> data) { /* no additional data */ }
    public String apply(Subscription s, Map<String, Object> data) {
        String from = s.getStatus();
        s.setStatus("EX");
        return from + " -> EX";
    }
}
```

```java
public class PaymentReceivedAction implements LifecycleAction {
    public String getType() { return "PAYMENT_RECEIVED"; }
    public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }
    public List<String> eligibleStatuses() { return List.of("EX"); }
    public void validate(Subscription s, Map<String, Object> data) { /* no additional data */ }
    public String apply(Subscription s, Map<String, Object> data) {
        s.setStatus("AC");
        return "EX -> AC";
    }
}
```

Both auto-register in `LifecycleActionRegistry` via Spring component scanning (the registry's
constructor already collects every `LifecycleAction` bean) — no registry code changes.
`LifecycleActionService`, `SubscriptionLifecycleController`,
`SubscriptionService.getById()`, and `OperationRecorder` are all unchanged — the existing
pipeline (resolve action → check domain → check eligibility → validate → apply → record
`Operation` → save) handles both new types with zero modification.

No new DB columns. `TRANSACTION_DATE`, `ERROR_CODE`, `ERROR_MSG`, `PROMOTION` stay out of
scope (see "Out of Scope").

---

## Frontend

- `SubscriptionDetail.jsx`: add to `ACTION_LABELS` —
  `MARK_EXPIRED: 'Mark Expired'`, `PAYMENT_RECEIVED: 'Payment Received'`. Both actions need
  no confirmation form beyond the existing default (matching Suspend/Reconnect); no new form
  branch needed in the action-detail render.
- `constants.js`: add `'MARK_EXPIRED'` and `'PAYMENT_RECEIVED'` to `ALL_OPERATION_TYPES`, and
  matching entries in `OPERATION_TYPE_LABELS`. `OPERATION_TYPE_CHART_TOKEN` picks up both
  automatically (derived from `ALL_OPERATION_TYPES`'s order) so the history timeline,
  Operations module, and dashboard operation-type distribution all render both new types with
  a stable category color.

No other UI change — both buttons appear in the same flat action-button row as every other
product action, gated purely by `availableProductActions` from the backend.

---

## Testing

- Backend unit tests for `MarkExpiredAction` and `PaymentReceivedAction`: eligible-status
  transition succeeds and returns the right `from -> to` string; ineligible status is
  rejected by the existing `LifecycleActionService` eligibility check (reuse the pattern from
  `SuspendAction`/`ReconnectAction` tests, no new test infrastructure).
- `SubscriptionLifecycleControllerTest`: one case per new type posted to `/product-actions` —
  success path and eligibility-rejection path.
- `SubscriptionServiceTest.getById()`: assert `MARK_EXPIRED` appears in
  `availableProductActions` for `AC`/`TR`, and `PAYMENT_RECEIVED` for `EX`.
- Frontend `SubscriptionDetail.test.js`: assert the "Mark Expired" button renders only when
  `status` is `AC`/`TR`, and "Payment Received" only when `status` is `EX`; assert clicking
  each posts the right `type` to `/product-actions`.

---

## Risks

- **`EX` becomes reachable from the UI without a real charging failure behind it.** Accepted
  and intentional — `MARK_EXPIRED` is explicitly a stand-in for the unimplemented charging
  pipeline, scoped so the `EX ⇄ AC` pair is demonstrable end-to-end. Framed in the UI purely
  by its label ("Mark Expired"), not disguised as a real billing event.
- **No audit distinction between "expired by real charging" vs. "expired by manual test
  action."** Both would look identical in `OPERATIONS` (`type = MARK_EXPIRED`). Acceptable
  for now since there is no real charging pipeline to distinguish from; revisit if/when one is
  built.

## Out of Scope

- The periodic ROS Loader charging engine (recurring cobro, eligibility validations,
  retries) — remains an external, unimplemented system per `CLAUDE.md`.
- `TRANSACTION_DATE`, `FLOW`, `ERROR_CODE`, `ERROR_MSG`, `PROMOTION` columns/fields — no
  business logic or storage added for any of them in this change.
- A dedicated `POST /api/payment-events`-style endpoint simulating the API Gateway calling
  in — the UI button is the only trigger for now; revisit if the app ever needs to demo the
  Gateway-initiated path specifically.
- TM Forum roadmap items 6-7 (Account/Billing Management, `Party`/`Individual`/`Customer`) —
  explicitly paused, unrelated to this slice.

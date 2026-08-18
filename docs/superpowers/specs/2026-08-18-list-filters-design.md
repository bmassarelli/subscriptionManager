# Subscriptions/Clients/Operations Filters — Design Spec

**Date:** 2026-08-18
**Status:** Approved

---

## Overview

Subscriptions already has a fully functional filter sidebar (search, status, platform,
entry-date range, Apply/Clear). This adds one more search criterion there (`contract`),
and gives Clients and Operations their own filters for the first time — both currently
render an unfiltered table. Everything stays client-side, filtering the array each
module already fetches; no backend or API changes.

---

## Architecture

```
Subscriptions (App.jsx)      Clients (ClientsModule.jsx)   Operations (OperationsModule.jsx)
        |                              |                              |
   existing fetch                 existing fetch                 existing fetch
        |                              |                              |
  applyFilters() ---+            applyClientSearch()          applyOperationFilters()
  (add: contract)   |                  |                              |
        |           +----- all in utils/filterSort.js (pure functions, unit-tested) ---+
        v                              v                              v
  SubscriptionTable              filtered <table>              filtered <table>
```

No new endpoints, no new state management library — each module keeps its own local
`useState` for its filter, matching how each module already owns its own
fetch/loading/error state today (Subscriptions is the one exception, whose filter/sort/
page state lives in `App.jsx` because it must survive navigating into and back out of
`SubscriptionDetail`; Clients and Operations have no such requirement).

---

## Components

### Subscriptions (extend existing)

- `utils/filterSort.js` — `applyFilters`'s search predicate adds `item.contract` to the
  existing `clientName`/`email`/`msisdn` check (same case-insensitive substring match).
- `components/FilterSidebar.jsx` — search input placeholder becomes
  `"Name / Email / MSISDN / Contract"`. No other change; Apply/Clear behavior is
  untouched.

### Clients (new)

- `components/ClientsModule.jsx` — adds local `const [search, setSearch] = useState('')`.
  Renders a single search input above the table (no sidebar — one field doesn't
  justify the full layout) with a "×" button to clear it. Filters **live**, on every
  keystroke, no Apply step.
- `utils/filterSort.js` — new pure function:
  ```js
  export function applyClientSearch(clients, search) {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.lastName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.msisdn || '').includes(q)
    );
  }
  ```
- Empty state: when `clients.length > 0` but the filtered result is empty, show
  "No clients match your search" instead of the existing "No clients registered yet"
  (which stays for the true-empty-backend case).

### Operations (new)

- `components/OperationsModule.jsx` — adds a left sidebar matching `FilterSidebar`'s
  visual style (reusing its Bootstrap classes, not the component itself — its shape is
  Subscriptions-specific). Local filter state: `search`, `types` (array), `statuses`
  (array), `dateFrom`, `dateTo`. Filters **live** — no Apply button, since the user
  chose live-filtering as the pattern for the two new modules; a single "Clear" button
  resets all four fields at once.
  - Type checkboxes: `CREATE`, `SUSPEND`, `RECONNECT`, `CANCEL`, `CHANGE_PLAN`,
    `CHANGE_MSISDN`, `CHANGE_SIM` — the exact strings the backend writes (confirmed in
    `LifecycleActionService`/`SubscriptionService`), not a guessed vocabulary.
  - Status checkboxes: `COMPLETED`, `FAILED` — the only two values the backend ever
    writes to `Operation.status`.
  - Date range applies to `createdDate` (string-prefix compare on its ISO date portion,
    same technique `filterSort.js` already uses for `entryDate`).
- `constants.js` — new `OPERATION_TYPE_LABELS` and `OPERATION_STATUS_LABELS` maps
  (human-readable labels), following the existing `STATUS_LABELS` pattern.
- `utils/filterSort.js` — new pure function:
  ```js
  export function applyOperationFilters(operations, filters) {
    const { search, types, statuses, dateFrom, dateTo } = filters;
    return operations.filter(op => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          (op.clientName || '').toLowerCase().includes(q) ||
          String(op.subscriptionId).includes(q);
        if (!matches) return false;
      }
      if (types.length === 0 || !types.includes(op.operationType)) return false;
      if (statuses.length === 0 || !statuses.includes(op.status)) return false;
      const created = (op.createdDate || '').slice(0, 10); // ISO date portion
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return true;
    });
  }
  ```
- Empty state: "No operations match your filters" vs. the existing
  "No operations recorded yet".

---

## Data Flow

Unchanged fetch pattern in all three modules — one `fetch()` on mount into local state.
Each module wraps its render in a `useMemo` keyed on `[data, filterState]` that calls
the relevant pure filter function before mapping to table rows. No debounce, no new
network calls — filtering is instant and synchronous over already-fetched data.

---

## Error Handling

No new error states. Existing `loading`/`error` handling around the initial fetch is
untouched in all three modules. The only new UI branch is the filtered-to-zero case
described per-component above, which is a normal (non-error) empty state, distinct
from "no data exists at all."

---

## Testing

- `utils/filterSort.test.js`: add cases for `applyClientSearch` (matches each field,
  case-insensitive, empty search returns all) and `applyOperationFilters` (search,
  each type checkbox, each status checkbox, date range, and a combined-filters case).
- `components/ClientsModule.test.js`: typing in the search box filters the rendered
  rows; clearing restores all clients; the new empty-state message appears when a
  search matches nothing but clients exist.
- `components/OperationsModule.test.js`: toggling a type/status checkbox filters rows
  live; the date range filters by `createdDate`; Clear resets every field; the new
  empty-state message appears under the same condition as above.

No backend tests are affected — this is a frontend-only change, `npm test` count goes
up, `mvn test` count is unchanged.

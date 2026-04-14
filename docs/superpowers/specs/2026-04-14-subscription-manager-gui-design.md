# Subscription Manager GUI — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

---

## Overview

A single-page React frontend (Create React App + Bootstrap) for browsing and filtering subscription records. No backend — mock data only. One index page, no routing.

---

## Architecture

- **Framework:** Create React App (React 18)
- **Styling:** Bootstrap 5 (CDN or npm)
- **Data:** In-memory mock array seeded from the `SUBSCRIPTIONS + CLIENT` schema
- **State:** React `useState` / `useEffect` — no external state library needed for this scope
- **No routing:** Single `index.html` / `App.jsx` entry point

---

## Component Structure

```
App
├── Navbar
├── MainLayout
│   ├── FilterSidebar
│   │   ├── SearchInput
│   │   ├── StatusCheckboxes
│   │   ├── PlatformDropdown
│   │   ├── DateRangePicker (Entry Date from/to)
│   │   └── Apply / Clear buttons
│   └── SubscriptionTable
│       ├── ResultsInfo ("Showing 1–10 of 142")
│       ├── TableHeader (sortable columns)
│       ├── TableBody (rows)
│       └── Pagination (rows-per-page + prev/next)
```

Each component has one clear responsibility and receives data/callbacks via props.

---

## Data

Mock array of 20–30 subscription objects shaped after the DB schema:

```js
{
  id: 1,
  clientName: "John Smith",
  email: "john@email.com",
  msisdn: "+1234567890",
  platform: "Netflix",
  contract: "CONT-001",
  status: "AC",           // AC=Active, TR=Trial, CA=Cancelled, IN=Inactive
  entryDate: "2024-01-10",
  amount: 9.99
}
```

Status codes match the DB `VARCHAR2(2)` field. Display labels mapped in a constant:  
`AC → Active`, `TR → Trial`, `CA → Cancelled`, `IN → Inactive`.

---

## FilterSidebar

| Control | Type | Behavior |
|---|---|---|
| Search | Text input | Filters on clientName, email, msisdn (case-insensitive) |
| Status | Checkboxes (multi-select) | Shows Active, Trial, Cancelled, Inactive; all checked by default |
| Platform | Dropdown | Populated from distinct values in mock data; default "All" |
| Entry Date From/To | Date inputs | Inclusive range filter on entryDate |
| Apply button | Triggers filter | Applies all criteria at once |
| Clear button | Resets all controls | Back to full unfiltered list |

Filtering is applied client-side on the mock array.

---

## SubscriptionTable

**Columns:** Client (name + email + MSISDN subtext), Platform, Contract, Status (Bootstrap badge), Entry Date, Amount, Actions (View link — no-op for now).

**Sortable columns:** Client, Platform, Entry Date, Amount. Click header to toggle asc/desc. Active sort shown with ↑/↓ indicator.

**Pagination:** Rows-per-page selector (10, 25, 50). Previous/Next buttons. "Showing X–Y of Z" label.

**Status badge colors:**
- Active → `badge bg-success`
- Trial → `badge bg-warning text-dark`
- Cancelled → `badge bg-danger`
- Inactive → `badge bg-secondary`

---

## Data Flow

```
mockData (array)
    ↓
App applies filters + sort + pagination
    ↓
filtered + sorted + paginated slice → SubscriptionTable
current filter state → FilterSidebar (controlled inputs)
```

All filter/sort/page state lives in `App`. `FilterSidebar` and `SubscriptionTable` are stateless — they receive props and call callbacks.

---

## Error Handling

No API calls, so no loading/error states needed. If the filtered result is empty, the table shows a "No subscriptions found" message row.

---

## Out of Scope

- Backend / API integration
- Create / Edit / Delete subscriptions
- Authentication
- Routing or additional pages
- Export (CSV, etc.)

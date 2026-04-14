# Subscription Manager GUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single React index page with a sidebar filter panel and a sortable/paginated subscription table using Bootstrap 5 and mock data.

**Architecture:** All filter/sort/pagination state lives in `App.jsx`. Pure utility functions in `filterSort.js` handle data manipulation. `FilterSidebar` and `SubscriptionTable` receive props and emit callbacks. `FilterSidebar` holds its own draft state (pre-Apply form values); this is UI-local state, not business state.

**Tech Stack:** React 18, Create React App, Bootstrap 5 (npm), Jest + React Testing Library (bundled with CRA)

---

## File Map

```
frontend/                                  ← CRA project root (inside C:\subscriptionManager\)
├── public/index.html                      ← CRA default, untouched
├── src/
│   ├── index.js                           ← entry point; imports Bootstrap CSS
│   ├── App.jsx                            ← root: state (filters, sort, page) + layout
│   ├── mockData.js                        ← 25 hard-coded subscription records
│   ├── constants.js                       ← STATUS_LABELS, STATUS_BADGE_CLASSES, ALL_STATUSES
│   ├── utils/
│   │   ├── filterSort.js                  ← applyFilters, applySort, paginate (pure functions)
│   │   └── filterSort.test.js             ← unit tests for the above
│   └── components/
│       ├── Navbar.jsx                     ← Bootstrap navbar with app title
│       ├── FilterSidebar.jsx              ← sidebar: search, status checkboxes, platform, date range
│       └── SubscriptionTable.jsx          ← table: sortable headers, status badges, pagination
└── package.json
```

---

## Task 1: Bootstrap the CRA project

**Files:**
- Create: `frontend/` (entire CRA scaffold)
- Modify: `frontend/src/index.js`
- Delete: `frontend/src/App.css`, `frontend/src/App.test.js`, `frontend/src/logo.svg`, `frontend/src/reportWebVitals.js`, `frontend/src/index.css`

- [ ] **Step 1: Scaffold the CRA project**

Run from `C:\subscriptionManager\`:
```bash
npx create-react-app frontend
```
Expected: `frontend/` directory created with default CRA structure.

- [ ] **Step 2: Install Bootstrap**

```bash
cd frontend && npm install bootstrap
```
Expected: `bootstrap` appears in `frontend/package.json` dependencies.

- [ ] **Step 3: Remove CRA boilerplate files**

```bash
rm src/App.css src/App.test.js src/logo.svg src/reportWebVitals.js src/index.css
```

- [ ] **Step 4: Replace `src/index.js`**

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Replace `src/App.js` with a placeholder `src/App.jsx`**

Delete `src/App.js` and create `src/App.jsx`:
```jsx
export default function App() {
  return <div className="p-4">Subscription Manager — coming soon</div>;
}
```

- [ ] **Step 6: Verify it runs**

```bash
npm start
```
Expected: Browser opens at `http://localhost:3000` showing "Subscription Manager — coming soon" with no console errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold CRA project with Bootstrap 5"
```

---

## Task 2: Create constants and mock data

**Files:**
- Create: `frontend/src/constants.js`
- Create: `frontend/src/mockData.js`

- [ ] **Step 1: Create `src/constants.js`**

```js
export const ALL_STATUSES = ['AC', 'TR', 'CA', 'IN'];

export const STATUS_LABELS = {
  AC: 'Active',
  TR: 'Trial',
  CA: 'Cancelled',
  IN: 'Inactive',
};

export const STATUS_BADGE_CLASSES = {
  AC: 'badge bg-success',
  TR: 'badge bg-warning text-dark',
  CA: 'badge bg-danger',
  IN: 'badge bg-secondary',
};
```

- [ ] **Step 2: Create `src/mockData.js`**

```js
export const mockData = [
  { id: 1,  clientName: 'John Smith',      email: 'john.smith@email.com',      msisdn: '+15551234567', platform: 'Netflix',         contract: 'CONT-001', status: 'AC', entryDate: '2024-01-10', amount: 9.99  },
  { id: 2,  clientName: 'Maria García',    email: 'maria.garcia@email.com',    msisdn: '+15559876543', platform: 'Spotify',         contract: 'CONT-002', status: 'TR', entryDate: '2024-01-08', amount: 4.99  },
  { id: 3,  clientName: 'Bob Lee',         email: 'bob.lee@email.com',         msisdn: '+15551122334', platform: 'Disney+',         contract: 'CONT-003', status: 'CA', entryDate: '2024-01-05', amount: 7.99  },
  { id: 4,  clientName: 'Ana Torres',      email: 'ana.torres@email.com',      msisdn: '+15555566778', platform: 'HBO Max',         contract: 'CONT-004', status: 'AC', entryDate: '2024-01-03', amount: 14.99 },
  { id: 5,  clientName: 'Carlos Ruiz',     email: 'carlos.ruiz@email.com',     msisdn: '+15553344556', platform: 'Amazon Prime',    contract: 'CONT-005', status: 'AC', entryDate: '2024-01-15', amount: 8.99  },
  { id: 6,  clientName: 'Linda Wong',      email: 'linda.wong@email.com',      msisdn: '+15557788990', platform: 'Apple TV+',       contract: 'CONT-006', status: 'IN', entryDate: '2023-12-20', amount: 6.99  },
  { id: 7,  clientName: 'James Martin',    email: 'james.martin@email.com',    msisdn: '+15552233445', platform: 'Netflix',         contract: 'CONT-007', status: 'TR', entryDate: '2024-01-18', amount: 15.99 },
  { id: 8,  clientName: 'Sofia Rossi',     email: 'sofia.rossi@email.com',     msisdn: '+15558899001', platform: 'YouTube Premium', contract: 'CONT-008', status: 'AC', entryDate: '2024-01-12', amount: 13.99 },
  { id: 9,  clientName: 'David Chen',      email: 'david.chen@email.com',      msisdn: '+15554455667', platform: 'Spotify',         contract: 'CONT-009', status: 'CA', entryDate: '2023-12-15', amount: 9.99  },
  { id: 10, clientName: 'Emma Johnson',    email: 'emma.johnson@email.com',    msisdn: '+15556677889', platform: 'Disney+',         contract: 'CONT-010', status: 'AC', entryDate: '2024-01-20', amount: 7.99  },
  { id: 11, clientName: 'Liam Brown',      email: 'liam.brown@email.com',      msisdn: '+15551234568', platform: 'HBO Max',         contract: 'CONT-011', status: 'TR', entryDate: '2024-01-22', amount: 14.99 },
  { id: 12, clientName: 'Olivia Davis',    email: 'olivia.davis@email.com',    msisdn: '+15559876544', platform: 'Amazon Prime',    contract: 'CONT-012', status: 'AC', entryDate: '2024-01-14', amount: 8.99  },
  { id: 13, clientName: 'Noah Wilson',     email: 'noah.wilson@email.com',     msisdn: '+15551122335', platform: 'Apple TV+',       contract: 'CONT-013', status: 'IN', entryDate: '2023-11-30', amount: 6.99  },
  { id: 14, clientName: 'Isabella Moore',  email: 'isabella.moore@email.com',  msisdn: '+15555566779', platform: 'Netflix',         contract: 'CONT-014', status: 'CA', entryDate: '2023-12-01', amount: 9.99  },
  { id: 15, clientName: 'Ethan Taylor',    email: 'ethan.taylor@email.com',    msisdn: '+15553344557', platform: 'Spotify',         contract: 'CONT-015', status: 'AC', entryDate: '2024-01-25', amount: 4.99  },
  { id: 16, clientName: 'Mia Anderson',    email: 'mia.anderson@email.com',    msisdn: '+15557788991', platform: 'YouTube Premium', contract: 'CONT-016', status: 'AC', entryDate: '2024-01-16', amount: 13.99 },
  { id: 17, clientName: 'Oliver Thomas',   email: 'oliver.thomas@email.com',   msisdn: '+15552233446', platform: 'Disney+',         contract: 'CONT-017', status: 'TR', entryDate: '2024-01-28', amount: 7.99  },
  { id: 18, clientName: 'Ava Jackson',     email: 'ava.jackson@email.com',     msisdn: '+15558899002', platform: 'HBO Max',         contract: 'CONT-018', status: 'AC', entryDate: '2024-01-11', amount: 14.99 },
  { id: 19, clientName: 'William White',   email: 'william.white@email.com',   msisdn: '+15554455668', platform: 'Amazon Prime',    contract: 'CONT-019', status: 'CA', entryDate: '2023-12-25', amount: 8.99  },
  { id: 20, clientName: 'Sophia Harris',   email: 'sophia.harris@email.com',   msisdn: '+15556677890', platform: 'Apple TV+',       contract: 'CONT-020', status: 'AC', entryDate: '2024-01-09', amount: 6.99  },
  { id: 21, clientName: 'Benjamin Clark',  email: 'ben.clark@email.com',       msisdn: '+15551234569', platform: 'Netflix',         contract: 'CONT-021', status: 'IN', entryDate: '2023-11-15', amount: 15.99 },
  { id: 22, clientName: 'Charlotte Lewis', email: 'charlotte.lewis@email.com', msisdn: '+15559876545', platform: 'Spotify',         contract: 'CONT-022', status: 'AC', entryDate: '2024-01-30', amount: 9.99  },
  { id: 23, clientName: 'Henry Robinson',  email: 'henry.rob@email.com',       msisdn: '+15551122336', platform: 'YouTube Premium', contract: 'CONT-023', status: 'TR', entryDate: '2024-02-01', amount: 13.99 },
  { id: 24, clientName: 'Amelia Walker',   email: 'amelia.w@email.com',        msisdn: '+15555566780', platform: 'Disney+',         contract: 'CONT-024', status: 'CA', entryDate: '2023-12-10', amount: 7.99  },
  { id: 25, clientName: 'Lucas Hall',      email: 'lucas.hall@email.com',      msisdn: '+15553344558', platform: 'HBO Max',         contract: 'CONT-025', status: 'AC', entryDate: '2024-01-07', amount: 14.99 },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/constants.js src/mockData.js
git commit -m "feat: add constants and mock subscription data"
```

---

## Task 3: Filter/sort utilities (TDD)

**Files:**
- Create: `frontend/src/utils/filterSort.test.js`
- Create: `frontend/src/utils/filterSort.js`

- [ ] **Step 1: Create the `utils/` directory and write the failing test file**

Create `src/utils/filterSort.test.js`:
```js
import { applyFilters, applySort, paginate } from './filterSort';

const data = [
  { id: 1, clientName: 'Alice Smith', email: 'alice@test.com', msisdn: '+111', platform: 'Netflix', status: 'AC', entryDate: '2024-01-10', amount: 9.99 },
  { id: 2, clientName: 'Bob Jones',   email: 'bob@test.com',   msisdn: '+222', platform: 'Spotify', status: 'TR', entryDate: '2024-01-15', amount: 4.99 },
  { id: 3, clientName: 'Carol Lee',   email: 'carol@test.com', msisdn: '+333', platform: 'Netflix', status: 'CA', entryDate: '2024-01-20', amount: 7.99 },
];

describe('applyFilters', () => {
  test('returns all records when filters are empty/default', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    expect(applyFilters(data, filters)).toHaveLength(3);
  });

  test('filters by clientName (case-insensitive)', () => {
    const filters = { search: 'alice', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by email', () => {
    const filters = { search: 'bob@', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by msisdn', () => {
    const filters = { search: '+333', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  test('filters by single status', () => {
    const filters = { search: '', statuses: ['AC'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('returns empty array when no statuses selected', () => {
    const filters = { search: '', statuses: [], platform: 'All', dateFrom: '', dateTo: '' };
    expect(applyFilters(data, filters)).toHaveLength(0);
  });

  test('filters by platform', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'Netflix', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([1, 3]));
  });

  test('filters by dateFrom (inclusive)', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '2024-01-15', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([2, 3]));
  });

  test('filters by dateTo (inclusive)', () => {
    const filters = { search: '', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '2024-01-15' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining([1, 2]));
  });
});

describe('applySort', () => {
  test('sorts by clientName ascending', () => {
    const result = applySort(data, { column: 'clientName', direction: 'asc' });
    expect(result[0].clientName).toBe('Alice Smith');
    expect(result[2].clientName).toBe('Carol Lee');
  });

  test('sorts by clientName descending', () => {
    const result = applySort(data, { column: 'clientName', direction: 'desc' });
    expect(result[0].clientName).toBe('Carol Lee');
    expect(result[2].clientName).toBe('Alice Smith');
  });

  test('sorts by amount ascending', () => {
    const result = applySort(data, { column: 'amount', direction: 'asc' });
    expect(result[0].amount).toBe(4.99);
    expect(result[2].amount).toBe(9.99);
  });

  test('does not mutate the input array', () => {
    const original = [...data];
    applySort(data, { column: 'clientName', direction: 'desc' });
    expect(data[0].id).toBe(original[0].id);
  });
});

describe('paginate', () => {
  test('returns first page with correct total', () => {
    const { rows, total } = paginate(data, 1, 2);
    expect(rows).toHaveLength(2);
    expect(total).toBe(3);
    expect(rows[0].id).toBe(1);
  });

  test('returns second page', () => {
    const { rows, total } = paginate(data, 2, 2);
    expect(rows).toHaveLength(1);
    expect(total).toBe(3);
    expect(rows[0].id).toBe(3);
  });

  test('returns empty rows when page exceeds data length', () => {
    const { rows } = paginate(data, 10, 2);
    expect(rows).toHaveLength(0);
  });

  test('returns all records when rowsPerPage exceeds data length', () => {
    const { rows, total } = paginate(data, 1, 100);
    expect(rows).toHaveLength(3);
    expect(total).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --watchAll=false --testPathPattern=filterSort --verbose
```
Expected: All tests fail with `Cannot find module './filterSort'`.

- [ ] **Step 3: Create `src/utils/filterSort.js`**

```js
export function applyFilters(data, filters) {
  const { search, statuses, platform, dateFrom, dateTo } = filters;
  return data.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      const matches =
        item.clientName.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.msisdn.includes(q);
      if (!matches) return false;
    }
    if (statuses.length > 0 && !statuses.includes(item.status)) return false;
    if (platform !== 'All' && item.platform !== platform) return false;
    if (dateFrom && item.entryDate < dateFrom) return false;
    if (dateTo && item.entryDate > dateTo) return false;
    return true;
  });
}

export function applySort(data, sort) {
  const { column, direction } = sort;
  return [...data].sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function paginate(data, page, rowsPerPage) {
  const total = data.length;
  const start = (page - 1) * rowsPerPage;
  const rows = data.slice(start, start + rowsPerPage);
  return { rows, total };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --watchAll=false --testPathPattern=filterSort --verbose
```
Expected: All tests pass. Output shows `PASS src/utils/filterSort.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/
git commit -m "feat: add filter/sort/paginate utility functions with tests"
```

---

## Task 4: Navbar component

**Files:**
- Create: `frontend/src/components/Navbar.jsx`

- [ ] **Step 1: Create `src/components/Navbar.jsx`**

```jsx
export default function Navbar() {
  return (
    <nav className="navbar navbar-dark bg-primary">
      <div className="container-fluid">
        <span className="navbar-brand mb-0 h1">Subscription Manager</span>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Navbar.jsx
git commit -m "feat: add Navbar component"
```

---

## Task 5: FilterSidebar component

**Files:**
- Create: `frontend/src/components/FilterSidebar.jsx`

- [ ] **Step 1: Create `src/components/FilterSidebar.jsx`**

```jsx
import { useState } from 'react';
import { ALL_STATUSES, STATUS_LABELS } from '../constants';

export default function FilterSidebar({ filters, platforms, onApply, onClear }) {
  const [draft, setDraft] = useState(filters);

  function handleStatusChange(status) {
    setDraft(prev => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses };
    });
  }

  function handleClear() {
    const reset = { search: '', statuses: ALL_STATUSES, platform: 'All', dateFrom: '', dateTo: '' };
    setDraft(reset);
    onClear(reset);
  }

  return (
    <div className="bg-light border-end p-3" style={{ width: '220px', flexShrink: 0 }}>
      <h6 className="fw-bold mb-3">Filters</h6>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Search</label>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Name / Email / MSISDN"
          value={draft.search}
          onChange={e => setDraft(prev => ({ ...prev, search: e.target.value }))}
        />
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Status</label>
        {ALL_STATUSES.map(status => (
          <div className="form-check" key={status}>
            <input
              className="form-check-input"
              type="checkbox"
              id={`status-${status}`}
              checked={draft.statuses.includes(status)}
              onChange={() => handleStatusChange(status)}
            />
            <label className="form-check-label small" htmlFor={`status-${status}`}>
              {STATUS_LABELS[status]}
            </label>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Platform</label>
        <select
          className="form-select form-select-sm"
          value={draft.platform}
          onChange={e => setDraft(prev => ({ ...prev, platform: e.target.value }))}
        >
          <option value="All">All platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="mb-3">
        <label className="form-label small fw-semibold text-secondary">Entry Date</label>
        <input
          type="date"
          className="form-control form-control-sm mb-1"
          value={draft.dateFrom}
          onChange={e => setDraft(prev => ({ ...prev, dateFrom: e.target.value }))}
        />
        <input
          type="date"
          className="form-control form-control-sm"
          value={draft.dateTo}
          onChange={e => setDraft(prev => ({ ...prev, dateTo: e.target.value }))}
        />
      </div>

      <div className="d-grid gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => onApply(draft)}>Apply</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={handleClear}>Clear</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FilterSidebar.jsx
git commit -m "feat: add FilterSidebar component"
```

---

## Task 6: SubscriptionTable component

**Files:**
- Create: `frontend/src/components/SubscriptionTable.jsx`

- [ ] **Step 1: Create `src/components/SubscriptionTable.jsx`**

```jsx
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from '../constants';

const SORTABLE_COLUMNS = ['clientName', 'platform', 'entryDate', 'amount'];

const COLUMNS = [
  { key: 'clientName', label: 'Client' },
  { key: 'platform',   label: 'Platform' },
  { key: 'contract',   label: 'Contract' },
  { key: 'status',     label: 'Status' },
  { key: 'entryDate',  label: 'Entry Date' },
  { key: 'amount',     label: 'Amount' },
  { key: 'actions',    label: 'Actions' },
];

function SortIndicator({ column, sort }) {
  if (sort.column !== column) return <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>↕</span>;
  return <span className="ms-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>;
}

export default function SubscriptionTable({ rows, total, sort, onSort, page, rowsPerPage, onPageChange, onRowsPerPageChange }) {
  const totalPages = Math.ceil(total / rowsPerPage) || 1;
  const from = total === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const to = Math.min(page * rowsPerPage, total);

  function handleHeaderClick(colKey) {
    if (!SORTABLE_COLUMNS.includes(colKey)) return;
    onSort({
      column: colKey,
      direction: sort.column === colKey && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }

  return (
    <div className="flex-grow-1 p-3 overflow-auto">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <small className="text-muted">
          Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> subscriptions
        </small>
        <div className="d-flex align-items-center gap-2">
          <small className="text-muted">Rows per page:</small>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={rowsPerPage}
            onChange={e => { onRowsPerPageChange(Number(e.target.value)); onPageChange(1); }}
          >
            {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            className="btn btn-outline-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >◀</button>
          <small className="text-muted">{page} / {totalPages}</small>
          <button
            className="btn btn-outline-secondary btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >▶</button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-bordered table-hover table-sm">
          <thead className="table-light">
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={SORTABLE_COLUMNS.includes(col.key) ? { cursor: 'pointer', userSelect: 'none' } : {}}
                  onClick={() => handleHeaderClick(col.key)}
                >
                  {col.label}
                  {SORTABLE_COLUMNS.includes(col.key) && (
                    <SortIndicator column={col.key} sort={sort} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  No subscriptions found
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <div className="fw-semibold">{row.clientName}</div>
                    <div className="text-muted small">{row.email} · {row.msisdn}</div>
                  </td>
                  <td>{row.platform}</td>
                  <td className="text-muted">{row.contract}</td>
                  <td>
                    <span className={STATUS_BADGE_CLASSES[row.status]}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="text-muted">{row.entryDate}</td>
                  <td>${row.amount.toFixed(2)}</td>
                  <td>
                    <button className="btn btn-link btn-sm p-0">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SubscriptionTable.jsx
git commit -m "feat: add SubscriptionTable component with sorting and pagination"
```

---

## Task 7: Wire App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Replace `src/App.jsx` with the complete implementation**

```jsx
import { useState, useMemo } from 'react';
import { mockData } from './mockData';
import { ALL_STATUSES } from './constants';
import { applyFilters, applySort, paginate } from './utils/filterSort';
import Navbar from './components/Navbar';
import FilterSidebar from './components/FilterSidebar';
import SubscriptionTable from './components/SubscriptionTable';

const INITIAL_FILTERS = {
  search: '',
  statuses: ALL_STATUSES,
  platform: 'All',
  dateFrom: '',
  dateTo: '',
};

const INITIAL_SORT = { column: 'entryDate', direction: 'desc' };

const platforms = [...new Set(mockData.map(d => d.platform))].sort();

export default function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { rows, total } = useMemo(() => {
    const filtered = applyFilters(mockData, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, rowsPerPage);
  }, [filters, sort, page, rowsPerPage]);

  function handleApply(newFilters) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleClear(resetFilters) {
    setFilters(resetFilters);
    setSort(INITIAL_SORT);
    setPage(1);
  }

  function handleSort(newSort) {
    setSort(newSort);
    setPage(1);
  }

  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex flex-grow-1">
        <FilterSidebar
          filters={filters}
          platforms={platforms}
          onApply={handleApply}
          onClear={handleClear}
        />
        <SubscriptionTable
          rows={rows}
          total={total}
          sort={sort}
          onSort={handleSort}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={setRowsPerPage}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test -- --watchAll=false --verbose
```
Expected: All tests pass. No test suite failures.

- [ ] **Step 3: Start dev server and manually verify**

```bash
npm start
```
Open `http://localhost:3000` and verify:
- Navbar shows "Subscription Manager"
- Sidebar shows search, status checkboxes, platform dropdown, date inputs, Apply/Clear
- Table shows 10 rows from mock data sorted by Entry Date descending
- Typing in search filters the table after clicking Apply
- Status checkboxes filter correctly
- Platform dropdown filters correctly
- Column headers for Client, Platform, Entry Date, Amount toggle sort on click
- Pagination controls work (◀/▶, rows-per-page selector)
- Clearing all filters restores all 25 records

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire App.jsx — complete subscription manager index page"
```

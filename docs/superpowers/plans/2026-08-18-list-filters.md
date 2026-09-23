# Subscriptions/Clients/Operations Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `contract` field to Subscriptions' existing search filter, and give Clients and Operations their own client-side filters for the first time.

**Architecture:** Pure filter functions live in `frontend/src/utils/filterSort.js` (unit-tested in isolation); each module (`ClientsModule`, `OperationsModule`) owns its own local filter state and calls the relevant pure function inside a `useMemo`, mirroring the pattern `App.jsx`/`FilterSidebar` already use for Subscriptions. No backend changes.

**Tech Stack:** React 18 (Create React App), Bootstrap 5, Jest + React Testing Library.

## Global Constraints

- Frontend-only change — do not modify anything under `backend/`.
- All new filtering is client-side, over data already fetched by each module's existing `fetch` call — no new network requests.
- Follow the spec at `docs/superpowers/specs/2026-08-18-list-filters-design.md` exactly: Clients gets a single live-filtering search bar (no sidebar, no Apply button); Operations gets a sidebar styled like Subscriptions' but with **no Apply button** — every change filters immediately, with one "Clear" button.
- Operation type vocabulary is exactly `CREATE`, `SUSPEND`, `RECONNECT`, `CANCEL`, `CHANGE_PLAN`, `CHANGE_MSISDN`, `CHANGE_SIM`; operation status vocabulary is exactly `COMPLETED`, `FAILED` — these are the literal strings the backend writes (confirmed by reading `LifecycleActionService`/`SubscriptionService` and a live `GET /api/operations` response), not to be changed or extended.

---

## Task 1: Subscriptions — search also matches contract

**Files:**
- Modify: `frontend/src/utils/filterSort.js`
- Modify: `frontend/src/utils/filterSort.test.js`
- Modify: `frontend/src/components/FilterSidebar.jsx`
- Modify: `frontend/src/components/FilterSidebar.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyFilters(data, filters)` (existing signature, unchanged) now also matches `item.contract` in its search predicate. No other task depends on this.

- [ ] **Step 1: Add a `contract` field to the shared test fixture and write the failing test**

In `frontend/src/utils/filterSort.test.js`, replace the shared `data` array (used by all three `describe` blocks) so each record has a `contract` field, and add a new test inside the `describe('applyFilters', ...)` block:

```js
const data = [
  { id: 1, clientName: 'Alice Smith', email: 'alice@test.com', msisdn: '+111', platform: 'Netflix', status: 'AC', entryDate: '2024-01-10', amount: 9.99, contract: 'CONT-001' },
  { id: 2, clientName: 'Bob Jones',   email: 'bob@test.com',   msisdn: '+222', platform: 'Spotify', status: 'TR', entryDate: '2024-01-15', amount: 4.99, contract: 'CONT-002' },
  { id: 3, clientName: 'Carol Lee',   email: 'carol@test.com', msisdn: '+333', platform: 'Netflix', status: 'CA', entryDate: '2024-01-20', amount: 7.99, contract: 'CONT-003' },
];
```

Add this test at the end of the `describe('applyFilters', ...)` block (after the `dateTo` test, before its closing `});`):

```js
  test('filters by contract (case-insensitive)', () => {
    const filters = { search: 'cont-002', statuses: ['AC', 'TR', 'CA', 'IN'], platform: 'All', dateFrom: '', dateTo: '' };
    const result = applyFilters(data, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort -t "filters by contract"`
Expected: FAIL — result has length 0, not 1 (contract isn't checked yet).

- [ ] **Step 3: Implement the minimal change**

In `frontend/src/utils/filterSort.js`, update `applyFilters`'s search predicate:

```js
export function applyFilters(data, filters) {
  const { search, statuses, platform, dateFrom, dateTo } = filters;
  return data.filter(item => {
    if (search) {
      const q = search.toLowerCase();
      const matches =
        (item.clientName || '').toLowerCase().includes(q) ||
        (item.email || '').toLowerCase().includes(q) ||
        (item.msisdn || '').includes(q) ||
        (item.contract || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (statuses.length === 0) return false;
    if (!statuses.includes(item.status)) return false;
    if (platform !== 'All' && item.platform !== platform) return false;
    if (dateFrom && item.entryDate < dateFrom) return false;
    if (dateTo && item.entryDate > dateTo) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort`
Expected: PASS — all `filterSort.test.js` tests green, including the new one.

- [ ] **Step 5: Update the search placeholder and its tests**

In `frontend/src/components/FilterSidebar.jsx`, change:

```jsx
          placeholder="Name / Email / MSISDN"
```

to:

```jsx
          placeholder="Name / Email / MSISDN / Contract"
```

In `frontend/src/components/FilterSidebar.test.js`, update both occurrences of the old placeholder string to match:

```js
  userEvent.type(screen.getByPlaceholderText('Name / Email / MSISDN / Contract'), 'alice');
```

and:

```js
  expect(screen.getByPlaceholderText('Name / Email / MSISDN / Contract')).toHaveValue('');
```

- [ ] **Step 6: Run the FilterSidebar tests to verify they still pass**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=FilterSidebar`
Expected: PASS — all `FilterSidebar.test.js` tests green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/filterSort.js frontend/src/utils/filterSort.test.js frontend/src/components/FilterSidebar.jsx frontend/src/components/FilterSidebar.test.js
git commit -m "feat: search subscriptions by contract too"
```

---

## Task 2: Clients — live search bar

**Files:**
- Modify: `frontend/src/utils/filterSort.js`
- Modify: `frontend/src/utils/filterSort.test.js`
- Modify: `frontend/src/components/ClientsModule.jsx`
- Modify: `frontend/src/components/ClientsModule.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyClientSearch(clients, search)` — pure function, returns the subset of `clients` whose `name`, `lastName`, `email`, or `msisdn` (case-insensitive substring) matches `search`; returns `clients` unchanged when `search` is falsy. No other task depends on this.

- [ ] **Step 1: Write the failing tests for `applyClientSearch`**

Add to `frontend/src/utils/filterSort.test.js` (new `import` member and new `describe` block at the end of the file):

```js
import { applyFilters, applySort, paginate, applyClientSearch } from './filterSort';
```

```js
describe('applyClientSearch', () => {
  const clients = [
    { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
    { clientId: 2, name: 'Bob', lastName: 'Jones', email: 'bob@test.com', msisdn: '+222' },
  ];

  test('returns all clients when search is empty', () => {
    expect(applyClientSearch(clients, '')).toHaveLength(2);
  });

  test('matches by first name (case-insensitive)', () => {
    const result = applyClientSearch(clients, 'ALICE');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(1);
  });

  test('matches by last name', () => {
    const result = applyClientSearch(clients, 'Jones');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(2);
  });

  test('matches by email', () => {
    const result = applyClientSearch(clients, 'bob@');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(2);
  });

  test('matches by msisdn', () => {
    const result = applyClientSearch(clients, '+111');
    expect(result).toHaveLength(1);
    expect(result[0].clientId).toBe(1);
  });

  test('returns empty array when nothing matches', () => {
    expect(applyClientSearch(clients, 'nomatch')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort`
Expected: FAIL with `applyClientSearch is not a function` (or similar) for every new test.

- [ ] **Step 3: Implement `applyClientSearch`**

Add to `frontend/src/utils/filterSort.js`:

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort`
Expected: PASS — all `filterSort.test.js` tests green.

- [ ] **Step 5: Write the failing component tests**

Add to `frontend/src/components/ClientsModule.test.js` (uses the `waitFor` already imported at the top of the file):

```js
test('filters the client list as the user types in the search box', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
      { clientId: 2, name: 'Bob', lastName: 'Jones', email: 'bob@test.com', msisdn: '+222' },
    ]),
  });

  render(<ClientsModule />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.type(screen.getByPlaceholderText(/Name \/ Last Name \/ Email \/ MSISDN/i), 'bob');

  await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  expect(screen.getByText('Bob')).toBeInTheDocument();
});

test('shows a no-match message when the search matches nothing, and clearing restores the list', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { clientId: 1, name: 'Alice', lastName: 'Smith', email: 'alice@test.com', msisdn: '+111' },
    ]),
  });

  render(<ClientsModule />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.type(screen.getByPlaceholderText(/Name \/ Last Name \/ Email \/ MSISDN/i), 'zzz');
  expect(await screen.findByText(/no clients match your search/i)).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: /clear search/i }));
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=ClientsModule`
Expected: FAIL — the search input and no-match message don't exist yet.

- [ ] **Step 7: Implement the search bar in `ClientsModule.jsx`**

Replace the full contents of `frontend/src/components/ClientsModule.jsx` with:

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import AddClientForm from './AddClientForm';
import { applyClientSearch } from '../utils/filterSort';

export default function ClientsModule() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [search, setSearch] = useState('');

  const loadClients = useCallback(() => {
    setLoading(true);
    return fetch('http://localhost:8080/api/clients')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch clients');
        return res.json();
      })
      .then(data => {
        setClients(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(
    () => applyClientSearch(clients, search),
    [clients, search]
  );

  return (
    <div className="flex-grow-1 p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">Clients</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowAddClient(prev => !prev)}
        >
          {showAddClient ? 'Close' : 'Add Client'}
        </button>
      </div>

      {showAddClient && (
        <div className="border rounded p-3 mb-3 bg-light">
          <AddClientForm onCreated={loadClients} />
        </div>
      )}

      <div className="mb-3">
        <div className="input-group" style={{ maxWidth: '320px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Name / Last Name / Email / MSISDN"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search clients"
          />
          {search && (
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {!loading && !error && clients.length === 0 && (
        <div className="alert alert-secondary">No clients registered yet.</div>
      )}

      {!loading && !error && clients.length > 0 && filteredClients.length === 0 && (
        <div className="alert alert-secondary">No clients match your search.</div>
      )}

      {!loading && !error && filteredClients.length > 0 && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Last Name</th>
              <th>Email</th>
              <th>MSISDN</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.clientId}>
                <td>{client.clientId}</td>
                <td>{client.name}</td>
                <td>{client.lastName}</td>
                <td>{client.email}</td>
                <td>{client.msisdn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=ClientsModule`
Expected: PASS — all `ClientsModule.test.js` tests green, including the two new ones and the three pre-existing ones.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/filterSort.js frontend/src/utils/filterSort.test.js frontend/src/components/ClientsModule.jsx frontend/src/components/ClientsModule.test.js
git commit -m "feat: add live search filter to Clients module"
```

---

## Task 3: Operations — filter sidebar (search, type, status, date range)

**Files:**
- Modify: `frontend/src/constants.js`
- Modify: `frontend/src/utils/filterSort.js`
- Modify: `frontend/src/utils/filterSort.test.js`
- Modify: `frontend/src/components/OperationsModule.jsx`
- Modify: `frontend/src/components/OperationsModule.test.js`

**Interfaces:**
- Consumes: `ALL_OPERATION_TYPES`, `OPERATION_TYPE_LABELS`, `ALL_OPERATION_STATUSES`, `OPERATION_STATUS_LABELS` (added to `constants.js` in Step 3 of this task).
- Produces: `applyOperationFilters(operations, filters)` — pure function; `filters` is `{ search, types, statuses, dateFrom, dateTo }` where `types`/`statuses` are arrays of the vocabulary above. Returns the matching subset of `operations`. No other task depends on this.

- [ ] **Step 1: Write the failing tests for `applyOperationFilters`**

Add to `frontend/src/utils/filterSort.test.js` (extend the `import` line again, and add a new `describe` block at the end of the file):

```js
import { applyFilters, applySort, paginate, applyClientSearch, applyOperationFilters } from './filterSort';
```

```js
describe('applyOperationFilters', () => {
  const ops = [
    { id: 1, subscriptionId: 10, clientName: 'Alice Smith', operationType: 'SUSPEND', status: 'COMPLETED', createdDate: '2026-08-10T09:00:00' },
    { id: 2, subscriptionId: 20, clientName: 'Bob Jones', operationType: 'CANCEL', status: 'FAILED', createdDate: '2026-08-15T09:00:00' },
    { id: 3, subscriptionId: 30, clientName: 'Carol Lee', operationType: 'CREATE', status: 'COMPLETED', createdDate: '2026-08-20T09:00:00' },
  ];
  const ALL = {
    search: '',
    types: ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'],
    statuses: ['COMPLETED', 'FAILED'],
    dateFrom: '',
    dateTo: '',
  };

  test('returns all when filters are default', () => {
    expect(applyOperationFilters(ops, ALL)).toHaveLength(3);
  });

  test('filters by client name search', () => {
    const result = applyOperationFilters(ops, { ...ALL, search: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by subscription id search', () => {
    const result = applyOperationFilters(ops, { ...ALL, search: '20' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by operation type', () => {
    const result = applyOperationFilters(ops, { ...ALL, types: ['CANCEL'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by status', () => {
    const result = applyOperationFilters(ops, { ...ALL, statuses: ['FAILED'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by created-date range (inclusive)', () => {
    const result = applyOperationFilters(ops, { ...ALL, dateFrom: '2026-08-12', dateTo: '2026-08-18' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('returns empty array when no types selected', () => {
    expect(applyOperationFilters(ops, { ...ALL, types: [] })).toHaveLength(0);
  });

  test('returns empty array when no statuses selected', () => {
    expect(applyOperationFilters(ops, { ...ALL, statuses: [] })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort`
Expected: FAIL with `applyOperationFilters is not a function` (or similar) for every new test.

- [ ] **Step 3: Add the operation constants**

Add to `frontend/src/constants.js`:

```js
export const ALL_OPERATION_TYPES = ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM'];

export const OPERATION_TYPE_LABELS = {
  CREATE: 'Create',
  SUSPEND: 'Suspend',
  RECONNECT: 'Reconnect',
  CANCEL: 'Cancel',
  CHANGE_PLAN: 'Change Plan',
  CHANGE_MSISDN: 'Change MSISDN',
  CHANGE_SIM: 'Change SIM',
};

export const ALL_OPERATION_STATUSES = ['COMPLETED', 'FAILED'];

export const OPERATION_STATUS_LABELS = {
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};
```

- [ ] **Step 4: Implement `applyOperationFilters`**

Add to `frontend/src/utils/filterSort.js`:

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
    const created = (op.createdDate || '').slice(0, 10);
    if (dateFrom && created < dateFrom) return false;
    if (dateTo && created > dateTo) return false;
    return true;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=filterSort`
Expected: PASS — all `filterSort.test.js` tests green (this file now covers `applyFilters`, `applySort`, `paginate`, `applyClientSearch`, `applyOperationFilters`).

- [ ] **Step 6: Write the failing component tests**

Add `waitFor` to the existing import line and add these tests to `frontend/src/components/OperationsModule.test.js`:

```js
import { render, screen, waitFor } from '@testing-library/react';
```

```js
test('filters by operation type checkbox', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { id: 1, subscriptionId: 10, clientName: 'Alice', operationType: 'SUSPEND', status: 'COMPLETED', createdDate: '2026-08-10T09:00:00', updatedDate: '2026-08-10T09:00:00', errorMessage: null, description: '' },
      { id: 2, subscriptionId: 20, clientName: 'Bob', operationType: 'CANCEL', status: 'COMPLETED', createdDate: '2026-08-11T09:00:00', updatedDate: '2026-08-11T09:00:00', errorMessage: null, description: '' },
    ]),
  });

  render(<OperationsModule onViewSubscription={jest.fn()} />);
  expect(await screen.findByText('SUSPEND')).toBeInTheDocument();

  userEvent.click(screen.getByLabelText('Suspend'));

  await waitFor(() => expect(screen.queryByText('SUSPEND')).not.toBeInTheDocument());
  expect(screen.getByText('CANCEL')).toBeInTheDocument();
});

test('filters live by search text', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { id: 1, subscriptionId: 10, clientName: 'Alice', operationType: 'SUSPEND', status: 'COMPLETED', createdDate: '2026-08-10T09:00:00', updatedDate: '2026-08-10T09:00:00', errorMessage: null, description: '' },
      { id: 2, subscriptionId: 20, clientName: 'Bob', operationType: 'CANCEL', status: 'COMPLETED', createdDate: '2026-08-11T09:00:00', updatedDate: '2026-08-11T09:00:00', errorMessage: null, description: '' },
    ]),
  });

  render(<OperationsModule onViewSubscription={jest.fn()} />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.type(screen.getByPlaceholderText('Client / Subscription ID'), 'bob');

  await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  expect(screen.getByText('Bob')).toBeInTheDocument();
});

test('shows a no-match message and Clear resets every filter', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ([
      { id: 1, subscriptionId: 10, clientName: 'Alice', operationType: 'SUSPEND', status: 'COMPLETED', createdDate: '2026-08-10T09:00:00', updatedDate: '2026-08-10T09:00:00', errorMessage: null, description: '' },
    ]),
  });

  render(<OperationsModule onViewSubscription={jest.fn()} />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();

  userEvent.click(screen.getByLabelText('Suspend'));
  expect(await screen.findByText(/no operations match your filters/i)).toBeInTheDocument();

  userEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=OperationsModule`
Expected: FAIL — the sidebar, checkboxes, search input, and Clear button don't exist yet.

- [ ] **Step 8: Implement the filter sidebar in `OperationsModule.jsx`**

Replace the full contents of `frontend/src/components/OperationsModule.jsx` with:

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ALL_OPERATION_TYPES, OPERATION_TYPE_LABELS,
  ALL_OPERATION_STATUSES, OPERATION_STATUS_LABELS,
} from '../constants';
import { applyOperationFilters } from '../utils/filterSort';

const INITIAL_OPERATION_FILTERS = {
  search: '',
  types: ALL_OPERATION_TYPES,
  statuses: ALL_OPERATION_STATUSES,
  dateFrom: '',
  dateTo: '',
};

export default function OperationsModule({ onViewSubscription }) {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(INITIAL_OPERATION_FILTERS);

  const loadOperations = useCallback(() => {
    setLoading(true);
    return fetch('http://localhost:8080/api/operations')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch operations');
        return res.json();
      })
      .then(data => {
        setOperations(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  function handleTypeChange(type) {
    setFilters(prev => {
      const types = prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type];
      return { ...prev, types };
    });
  }

  function handleStatusChange(status) {
    setFilters(prev => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses };
    });
  }

  function handleClear() {
    setFilters(INITIAL_OPERATION_FILTERS);
  }

  const filteredOperations = useMemo(
    () => applyOperationFilters(operations, filters),
    [operations, filters]
  );

  return (
    <>
      <div className="bg-light border-end p-3" style={{ width: '220px', flexShrink: 0 }}>
        <h6 className="fw-bold mb-3">Filters</h6>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Search</label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Client / Subscription ID"
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Type</label>
          {ALL_OPERATION_TYPES.map(type => (
            <div className="form-check" key={type}>
              <input
                className="form-check-input"
                type="checkbox"
                id={`op-type-${type}`}
                checked={filters.types.includes(type)}
                onChange={() => handleTypeChange(type)}
              />
              <label className="form-check-label small" htmlFor={`op-type-${type}`}>
                {OPERATION_TYPE_LABELS[type]}
              </label>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Status</label>
          {ALL_OPERATION_STATUSES.map(status => (
            <div className="form-check" key={status}>
              <input
                className="form-check-input"
                type="checkbox"
                id={`op-status-${status}`}
                checked={filters.statuses.includes(status)}
                onChange={() => handleStatusChange(status)}
              />
              <label className="form-check-label small" htmlFor={`op-status-${status}`}>
                {OPERATION_STATUS_LABELS[status]}
              </label>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary">Created Date</label>
          <input
            type="date"
            className="form-control form-control-sm mb-1"
            value={filters.dateFrom}
            onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
          />
          <input
            type="date"
            className="form-control form-control-sm"
            value={filters.dateTo}
            onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
          />
        </div>

        <div className="d-grid">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="flex-grow-1 p-3">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h4 mb-0">Operations</h2>
        </div>

        {loading && (
          <div className="d-flex justify-content-center align-items-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="alert alert-danger">{error}</div>
        )}

        {!loading && !error && operations.length === 0 && (
          <div className="alert alert-secondary">No operations recorded yet.</div>
        )}

        {!loading && !error && operations.length > 0 && filteredOperations.length === 0 && (
          <div className="alert alert-secondary">No operations match your filters.</div>
        )}

        {!loading && !error && filteredOperations.length > 0 && (
          <table className="table table-striped">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subscription</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredOperations.map(operation => (
                <tr key={operation.id}>
                  <td>{operation.id}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-link p-0"
                      onClick={() => onViewSubscription(operation.subscriptionId)}
                    >
                      {operation.subscriptionId}
                    </button>
                  </td>
                  <td>{operation.clientName}</td>
                  <td>{operation.operationType}</td>
                  <td>{operation.status}</td>
                  <td>{operation.createdDate}</td>
                  <td>{operation.updatedDate}</td>
                  <td>{operation.errorMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd frontend && npx react-scripts test --watchAll=false --testPathPattern=OperationsModule`
Expected: PASS — all `OperationsModule.test.js` tests green, including the three new ones and the three pre-existing ones.

- [ ] **Step 10: Run the full frontend test suite**

Run: `cd frontend && npx react-scripts test --watchAll=false`
Expected: PASS — every suite green (this confirms nothing in `App.test.js` or elsewhere broke from the `OperationsModule` layout change).

- [ ] **Step 11: Manually verify in the browser**

```bash
cd backend && mvn spring-boot:run
```
```bash
cd frontend && npm start
```
Open `http://localhost:3000`, go to Operations, and verify: unchecking a type/status checkbox hides matching rows immediately (no Apply button present), typing in the search box filters live, a date range filters by created date, and Clear resets every field and restores the full list. Then check Clients: typing in its search bar filters live and the "×" button clears it. Then check Subscriptions: typing part of a contract number into Search and clicking Apply filters correctly.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/constants.js frontend/src/utils/filterSort.js frontend/src/utils/filterSort.test.js frontend/src/components/OperationsModule.jsx frontend/src/components/OperationsModule.test.js
git commit -m "feat: add filter sidebar to Operations module"
```

# Subscription Manager

A subscription management system backed by an Oracle database. Currently has a React frontend (mock data) and a SQL schema. Backend API is not yet built.

## Project Structure

```
subscriptionManager/
├── database/
│   └── 001-baseline.sql        # Oracle schema (SUBSCRIBER_MANAGER user)
├── frontend/                   # React app (Create React App + Bootstrap 5)
│   └── src/
│       ├── App.jsx             # Root: all filter/sort/page state lives here
│       ├── mockData.js         # 25 mock subscription records
│       ├── constants.js        # STATUS_LABELS, STATUS_BADGE_CLASSES, ALL_STATUSES
│       ├── utils/filterSort.js # Pure functions: applyFilters, applySort, paginate
│       └── components/
│           ├── Navbar.jsx
│           ├── FilterSidebar.jsx
│           └── SubscriptionTable.jsx
└── docs/superpowers/           # Specs and implementation plans
```

## Running the Frontend

```bash
cd frontend
npm install
npm start        # http://localhost:3000
npm test         # run tests (17 tests, all passing)
npm run build    # production build
```

## Database

Oracle DB, schema: `SUBSCRIBER_MANAGER`. Two tables:

- `CLIENT` — CLIENT_ID, NAME, LAST_NAME, EMAIL, MSISDN
- `SUBSCRIPTIONS` — ID, CLIENT_ID, PLATFORM, CONTRACT, STATUS (VARCHAR2(2)), AMOUNT, dates...

Status codes used in the frontend:
- `AC` = Active
- `TR` = Trial
- `CA` = Cancelled
- `IN` = Inactive

## Architecture Notes

- All filter/sort/pagination state lives in `App.jsx`
- `FilterSidebar` holds local draft state (pre-Apply form values) — not business state
- `applyFilters`, `applySort`, `paginate` are pure functions in `utils/filterSort.js`
- Date fields use ISO format `YYYY-MM-DD` — string comparison works correctly for sorting/filtering
- The frontend currently uses mock data. When a backend API is ready, replace `mockData` with API calls in `App.jsx`

## What's Not Built Yet

- Backend API (no endpoints exist)
- Create / Edit / Delete subscriptions
- Authentication
- Real database connection from the frontend

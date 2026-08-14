# Subscription Manager

A subscription management system for Telco Operations, backed by an Oracle database.
Handles subscription lifecycle (activation, cancellation, charging) and integrates with
the API Gateway and ROS Loader for network events and recurring billing.

## Project Structure

```
subscriptionManager/
├── database/
│   └── 001-baseline.sql              # Oracle schema — SUBSCRIPTION_MANAGER user
├── backend/                          # Spring Boot 3, Java 25, Maven
│   └── src/main/
│       ├── java/com/subscriptionmanager/
│       │   ├── SubscriptionManagerApplication.java
│       │   ├── config/CorsConfig.java
│       │   ├── controller/SubscriptionController.java
│       │   ├── dto/SubscriptionDTO.java
│       │   ├── entity/Client.java
│       │   ├── entity/Subscription.java
│       │   ├── repository/SubscriptionRepository.java
│       │   └── service/SubscriptionService.java
│       └── resources/
│           └── application.properties  # ⚠ local only — never commit (see below)
├── frontend/                          # React app (Create React App + Bootstrap 5)
│   └── src/
│       ├── App.jsx                    # Root: all filter/sort/page state lives here
│       ├── mockData.js                # 25 mock subscription records
│       ├── constants.js               # STATUS_LABELS, STATUS_BADGE_CLASSES, ALL_STATUSES
│       ├── utils/filterSort.js        # Pure functions: applyFilters, applySort, paginate
│       └── components/
│           ├── Navbar.jsx
│           ├── FilterSidebar.jsx
│           └── SubscriptionTable.jsx
├── postman/                           # Postman collections for the ROS API
├── openspec/                          # OpenSpec change specs and config
├── docs/superpowers/                  # Implementation plans and design specs
└── .claude/                           # Claude Code project config (skills, commands)
```

## Running the Project

### Backend (Spring Boot)

```bash
cd backend
mvn spring-boot:run        # http://localhost:8080
mvn compile -DskipTests    # compile only
mvn test                   # run tests
```

> Before running, fill in your local Oracle connection details in
> `backend/src/main/resources/application.properties` (see template below).
> This file is gitignored — never commit it.

```properties
spring.datasource.url=jdbc:oracle:thin:@//HOST:PORT/SERVICE_NAME
spring.datasource.username=SUBSCRIPTION_MANAGER
spring.datasource.password=your_password
spring.datasource.driver-class-name=oracle.jdbc.OracleDriver
spring.jpa.database-platform=org.hibernate.dialect.OracleDialect
spring.jpa.hibernate.ddl-auto=none
server.port=8080
```

### Frontend (React)

```bash
cd frontend
npm install
npm start        # http://localhost:3000
npm test         # run tests (17 tests, all passing)
npm run build    # production build
```

The frontend currently uses mock data (`mockData.js`). When connecting to the backend,
replace the mock import with a `fetch('http://localhost:8080/api/subscriptions')` call
in `App.jsx`.

## Database

Oracle DB, schema: `SUBSCRIPTION_MANAGER`. Main tables:

- `CLIENT` — CLIENT_ID, NAME, LAST_NAME, EMAIL, MSISDN
- `SUBSCRIPTIONS` — ID, CLIENT_ID, PLATFORM, CONTRACT, STATUS, AMOUNT, dates...

Full column reference is in `README.md`.

## Status Codes

| Code | Meaning    | When set                                                        |
|------|------------|-----------------------------------------------------------------|
| AC   | Active     | Subscription is active and being charged                        |
| TR   | Trial      | Within trial period — no charges yet                            |
| SU   | Suspended  | Temporarily suspended — can be reconnected                      |
| EX   | Expired    | Payment failed (insufficient balance or any other reason)       |
| CA   | Cancelled  | Explicitly cancelled by the client — `CANCEL_DATE` is set       |
| ER   | Error      | Processing error during charging or activation                  |

> **Important:** `CA` is only ever set by the Cancel Subscription flow (client request).
> Payment failures result in `EX`, never `CA`.

## Architecture Notes

### Frontend
- All filter/sort/pagination state lives in `App.jsx`
- `FilterSidebar` holds local draft state (pre-Apply form values) — not business state
- `applyFilters`, `applySort`, `paginate` are pure functions in `utils/filterSort.js`
- Date fields use ISO format `YYYY-MM-DD` — string comparison works for sorting/filtering

### Backend (Spring Boot)
- Exposes `GET /api/subscriptions` — returns all subscriptions joined with client data
- CORS configured to allow requests from `http://localhost:3000`
- JPA with Oracle dialect — DDL auto is `none` (schema managed by SQL scripts)
- `SubscriptionDTO` is a flat projection built from the JOIN; no lazy-loading issues

### ROS API (separate service)
- Base URL: `https://ts-training-2.io/ros-rest/`
- Endpoints: `POST /subsmanActivate`, `POST /subsmanCancel`, `GET /subsmanGetSubscriptions`
- Full API and flow documentation lives in `README.md`

### API Gateway
- Shared routing service for contract lifecycle events and payment orders
- Subscription Manager sends events to it (via Network Activate / Network Deactivate subflows)
- Subscription Manager also receives events from it (Payment Received flow)

## ⚠ Never Commit

- `backend/src/main/resources/application.properties` — contains real DB credentials.
  It is listed in `.gitignore`. If git starts tracking it again (e.g. after a rebase),
  run `git rm --cached backend/src/main/resources/application.properties`.

## What's Not Built Yet

- Create / Edit / Delete subscriptions via the frontend
- Authentication / authorization
- Frontend connected to real backend (currently uses mock data)
- Reconnect / Suspend endpoints in the ROS API
- Retry mechanism for failed charges
- Email/SMS notifications

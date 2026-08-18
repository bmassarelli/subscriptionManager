# Subscription Manager

A subscription management system for Telco Operations, backed by an Oracle database.
Handles subscription lifecycle (activation, cancellation, charging) and integrates with
the API Gateway and ROS Loader for network events and recurring billing.

## Project Structure

```
subscriptionManager/
├── database/
│   └── 001-baseline.sql              # Oracle schema — SUBSCRIPTION_MANAGER user
│                                      # (CLIENT, SUBSCRIPTIONS, PLATFORM, PAYMENT_MODE)
├── backend/                          # Spring Boot 3, Java 21, Maven
│   └── src/main/
│       ├── java/com/subscriptionmanager/
│       │   ├── SubscriptionManagerApplication.java
│       │   ├── config/CorsConfig.java
│       │   ├── controller/
│       │   │   ├── CatalogController.java       # GET /api/platforms, /api/payment-modes
│       │   │   ├── ClientController.java        # GET/POST /api/clients
│       │   │   ├── GlobalExceptionHandler.java  # validation + invalid-reference -> 400
│       │   │   └── SubscriptionController.java  # GET/POST /api/subscriptions
│       │   ├── dto/
│       │   │   ├── ClientRequestDTO.java / ClientResponseDTO.java
│       │   │   ├── SubscriptionDTO.java / SubscriptionRequestDTO.java
│       │   │   └── PlatformDTO.java / PaymentModeDTO.java
│       │   ├── entity/
│       │   │   ├── Client.java / Subscription.java (full 19-column mapping)
│       │   │   └── Platform.java / PaymentMode.java
│       │   ├── repository/
│       │   │   ├── ClientRepository.java / SubscriptionRepository.java
│       │   │   └── PlatformRepository.java / PaymentModeRepository.java
│       │   └── service/
│       │       ├── ClientService.java / SubscriptionService.java
│       │       └── InvalidClientReferenceException.java,
│       │         InvalidPlatformException.java, InvalidPaymentModeException.java
│       └── resources/
│           └── application.properties  # ⚠ local only — never commit (see below)
├── frontend/                          # React app (Create React App + Bootstrap 5)
│   └── src/
│       ├── App.jsx                    # Root: activeModule, subscription list/filter/sort/page state
│       ├── constants.js               # STATUS_LABELS, STATUS_BADGE_CLASSES, ALL_STATUSES (6-status model)
│       ├── utils/filterSort.js        # Pure functions: applyFilters, applySort, paginate
│       └── components/
│           ├── Navbar.jsx             # Brand bar only
│           ├── Sidebar.jsx            # Left module menu (Subscriptions, Clients)
│           ├── FilterSidebar.jsx
│           ├── SubscriptionTable.jsx  # "View" action not yet wired (see roadmap)
│           ├── AddSubscriptionForm.jsx
│           ├── ClientsModule.jsx
│           └── AddClientForm.jsx
├── postman/                           # Postman collections for the ROS API
├── openspec/                          # OpenSpec: openspec/specs/ is the archived baseline
│                                      # (client-management, app-navigation,
│                                      # subscription-management); openspec/changes/
│                                      # holds the active Telco-lifecycle roadmap
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

The frontend is connected to the real backend — `App.jsx` fetches
`http://localhost:8080/api/subscriptions` on load. There is no mock data in the
codebase anymore.

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

This is now the single, enforced status model — `frontend/src/constants.js` and the
backend agree on it. New subscriptions are created in `TR`. `ER` is reserved for a
future charging/activation pipeline; nothing in the current codebase writes it.
Lifecycle transitions between these statuses (suspend, reconnect, cancel, etc.) are
not built yet — see "What's Not Built Yet" and `openspec/changes/` for the roadmap.

## Architecture Notes

### Frontend
- All filter/sort/pagination state lives in `App.jsx`
- `FilterSidebar` holds local draft state (pre-Apply form values) — not business state
- `applyFilters`, `applySort`, `paginate` are pure functions in `utils/filterSort.js`
- Date fields use ISO format `YYYY-MM-DD` — string comparison works for sorting/filtering

### Backend (Spring Boot)
- `GET/POST /api/subscriptions`, `GET/POST /api/clients`, `GET /api/platforms`,
  `GET /api/payment-modes` — no `PUT`/`DELETE` anywhere yet
- Validation errors and invalid-reference errors (unknown `clientId`/`platform`/
  `paymentModeId`) both return `400` with a field→message body via
  `GlobalExceptionHandler` — never a raw `500`
- `platform` is validated against the `PLATFORM` catalog by name (no DB-level FK);
  `paymentModeId` is a real FK, validated against `PAYMENT_MODE`
- CORS configured to allow requests from `http://localhost:3000`
- JPA with Oracle dialect — DDL auto is `none` (schema managed by SQL scripts).
  Entities generated via `@GeneratedValue(SEQUENCE)` mapped to the matching
  `SEQ_*` sequence — every entity needs this or `persist()` fails
  (`IdentifierGenerationException`); `PLATFORM`/`PAYMENT_MODE` use `IDENTITY`
  instead, matching their `GENERATED BY DEFAULT AS IDENTITY` columns
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

- Any subscription lifecycle transition (suspend, reconnect, cancel, change plan,
  change MSISDN, change SIM) — creation and listing only, for both clients and
  subscriptions
- Edit / Delete for clients or subscriptions
- A subscription detail screen (`SubscriptionTable`'s "View" action exists but does
  nothing yet)
- Any cross-subscription operations/audit view, or a dashboard
- Authentication / authorization
- Charging/billing, promotions, and payment-received reactivation
- Real integration with the ROS API or the API Gateway (this app is local-only —
  see `README.md`'s API section, which documents that *external* system's contract,
  not something implemented here)
- Email/SMS notifications

See `openspec/changes/` for the active roadmap (`subscription-foundation` →
`subscription-lifecycle-actions` → ... ) building toward the items above, in that
order — each change's `proposal.md` explains its scope and dependencies.

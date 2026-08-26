# Subscription Manager

A subscription management system for Telco Operations, backed by an Oracle database.
Handles subscription lifecycle (activation, cancellation, charging) and integrates with
the API Gateway and ROS Loader for network events and recurring billing.

## Project Structure

```
subscriptionManager/
├── database/
│   ├── 001-baseline.sql               # Oracle schema — SUBSCRIPTION_MANAGER user
│   │                                   # (CLIENT, SUBSCRIPTIONS, PLATFORM, PAYMENT_MODE)
│   ├── 002-lifecycle-actions.sql      # lifecycle-mutable columns + OPERATIONS table
│   ├── 003-hardening.sql              # PRE_SUSPEND_STATUS + CLIENT email/msisdn uniqueness
│   ├── 004-resources.sql              # RESOURCES table + SEQ_RESOURCE_ID + trigger
│   ├── 005-product-offering.sql       # PRODUCT_OFFERING table + SUBSCRIPTIONS FK, drops PO
│   └── 006-service.sql                # SERVICE table (PLATFORM/MSISDN/SIM_ICCID moved off
│                                       # SUBSCRIPTIONS); RESOURCES FK swapped to SERVICE_ID
├── backend/                            # Spring Boot 3, Java 21, Maven
│   └── src/main/
│       ├── java/com/subscriptionmanager/
│       │   ├── SubscriptionManagerApplication.java
│       │   ├── config/CorsConfig.java
│       │   ├── controller/
│       │   │   ├── CatalogController.java             # GET /api/platforms, /api/payment-modes,
│       │   │   │                                         # /api/product-offerings
│       │   │   ├── ClientController.java              # GET/POST /api/clients, GET/PUT/DELETE
│       │   │   │                                         # /api/clients/{id}
│       │   │   ├── SubscriptionController.java         # GET/POST /api/subscriptions, PUT
│       │   │   │                                         # /api/subscriptions/{id} (contract/amount only)
│       │   │   ├── SubscriptionLifecycleController.java # POST lifecycle actions, GET operations,
│       │   │   │                                         # GET /api/operations (all), subscription detail
│       │   │   ├── ResourceController.java             # GET/POST/DELETE /api/subscriptions/{id}/resources
│       │   │   ├── DashboardController.java            # GET /api/dashboard/summary
│       │   │   └── GlobalExceptionHandler.java         # validation + invalid-reference/not-found -> 400/404
│       │   ├── dto/
│       │   │   ├── ClientRequestDTO.java / ClientResponseDTO.java
│       │   │   ├── SubscriptionDTO.java / SubscriptionRequestDTO.java / SubscriptionDetailDTO.java /
│       │   │   │   SubscriptionUpdateDTO.java
│       │   │   ├── PlatformDTO.java / PaymentModeDTO.java / ProductOfferingDTO.java
│       │   │   ├── LifecycleActionRequestDTO.java / LifecycleActionResultDTO.java / OperationDTO.java
│       │   │   ├── ResourceDTO.java / ResourceRequestDTO.java
│       │   │   └── DashboardSummaryDTO.java
│       │   ├── entity/
│       │   │   ├── Client.java / Subscription.java (full column mapping incl. PRE_SUSPEND_STATUS)
│       │   │   ├── Platform.java / PaymentMode.java / ProductOffering.java
│       │   │   ├── Service.java (PLATFORM/MSISDN/SIM_ICCID, 1:1 with Subscription)
│       │   │   ├── Operation.java (lifecycle audit trail)
│       │   │   └── Resource.java (IP/VLAN/CPE/PORT/EQUIPMENT/NODE; FKs to Service)
│       │   ├── repository/
│       │   │   ├── ClientRepository.java / SubscriptionRepository.java
│       │   │   ├── PlatformRepository.java / PaymentModeRepository.java / ProductOfferingRepository.java
│       │   │   ├── OperationRepository.java / ResourceRepository.java
│       │   ├── service/
│       │   │   ├── ClientService.java / SubscriptionService.java
│       │   │   ├── DashboardService.java              # aggregates counts/status breakdown/recent ops
│       │   │   ├── OperationMapper.java / OperationRecorder.java
│       │   │   ├── InvalidClientReferenceException.java, InvalidPlatformException.java,
│       │   │   │   InvalidPaymentModeException.java, InvalidProductOfferingException.java,
│       │   │   │   DuplicateClientFieldException.java, ClientNotFoundException.java,
│       │   │   │   ClientHasSubscriptionsException.java
│       │   │   ├── lifecycle/                         # SUSPEND/RECONNECT/CANCEL/CHANGE_PLAN/
│       │   │   │   ├── LifecycleAction.java, LifecycleActionRegistry.java,   # CHANGE_MSISDN/CHANGE_SIM
│       │   │   │   ├── LifecycleActionService.java     # actions, one per class implementing LifecycleAction
│       │   │   │   ├── SuspendAction.java, ReconnectAction.java, CancelAction.java,
│       │   │   │   ├── ChangePlanAction.java, ChangeMsisdnAction.java, ChangeSimAction.java
│       │   │   │   └── SubscriptionNotFoundException.java, InvalidLifecycleTransitionException.java,
│       │   │   │       LifecycleActionValidationException.java, UnknownLifecycleActionException.java,
│       │   │   │       WrongLifecycleDomainException.java
│       │   │   └── resource/
│       │   │       ├── ResourceService.java            # plain CRUD, not an auditable lifecycle action
│       │   │       └── InvalidResourceTypeException.java, ResourceNotFoundException.java
│       └── resources/
│           └── application.properties  # ⚠ local only — never commit (see below)
├── frontend/                          # React app (Create React App + Bootstrap 5)
│   └── src/
│       ├── App.jsx                    # Root: activeModule, subscription list/filter/sort/page state
│       ├── constants.js               # STATUS_LABELS, STATUS_BADGE_CLASSES, ALL_STATUSES (6-status model);
│       │                              # ALL_OPERATION_TYPES, OPERATION_TYPE_LABELS, ALL_OPERATION_STATUSES,
│       │                              # OPERATION_STATUS_LABELS
│       ├── utils/filterSort.js        # Pure functions: applyFilters, applySort, paginate, applyClientSearch,
│       │                              # applyOperationFilters
│       └── components/
│           ├── Navbar.jsx             # Brand bar only
│           ├── Sidebar.jsx            # Left module menu (Subscriptions, Clients, Operations, Dashboard)
│           ├── FilterSidebar.jsx
│           ├── SubscriptionTable.jsx  # "View" opens SubscriptionDetail
│           ├── SubscriptionDetail.jsx # lifecycle actions, history timeline, Resources section
│           ├── SubscriptionHistoryTimeline.jsx  # chronological ops view; FAILED entries stand out
│           ├── AddSubscriptionForm.jsx
│           ├── ClientsModule.jsx
│           ├── AddClientForm.jsx
│           ├── OperationsModule.jsx   # cross-subscription operations list, links back to detail
│           └── DashboardModule.jsx    # client/subscription counts, status breakdown, recent ops
├── postman/                           # Postman collections for the ROS API
├── openspec/                          # OpenSpec: openspec/specs/ holds the current-truth capability
│                                      # specs (app-navigation, client-management, subscription-management,
│                                      # subscription-status-model, subscription-lifecycle,
│                                      # subscription-detail, subscription-audit, subscription-operations,
│                                      # subscription-dashboard, subscription-resources);
│                                      # openspec/changes/ is empty — the P3 Telco-lifecycle roadmap
│                                      # is fully archived under openspec/changes/archive/
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
npm test         # run tests (93 tests, all passing)
npm run build    # production build
```

The frontend is connected to the real backend — `App.jsx` fetches
`http://localhost:8080/api/subscriptions` on load. There is no mock data in the
codebase anymore.

## Database

Oracle DB, schema: `SUBSCRIPTION_MANAGER`. All six migrations (`001`–`006`) are
applied to the live training DB. Main tables:

- `CLIENT` — CLIENT_ID, NAME, LAST_NAME, EMAIL, MSISDN (EMAIL and MSISDN are
  unique — `UQ_CLIENT_EMAIL`, `UQ_CLIENT_MSISDN`, added in `003-hardening.sql`)
- `SUBSCRIPTIONS` — ID, CLIENT_ID, CONTRACT, STATUS, AMOUNT, dates,
  PRE_SUSPEND_STATUS (remembers status before a suspend, for
  Reconnect), PRODUCT_OFFERING_ID (FK to `PRODUCT_OFFERING`, added in
  `005-product-offering.sql`, replacing the old unused `PO` free-text column)
  — PLATFORM/MSISDN/SIM_ICCID moved off this table in `006-service.sql`, see `SERVICE` below
- `OPERATIONS` — lifecycle-action audit trail (added in `002-lifecycle-actions.sql`)
- `RESOURCES` — ID, SERVICE_ID, RESOURCE_TYPE (`IP`/`VLAN`/`CPE`/`PORT`/
  `EQUIPMENT`/`NODE`), VALUE (added in `004-resources.sql`; FK swapped from
  SUBSCRIPTION_ID to SERVICE_ID in `006-service.sql`)
- `PRODUCT_OFFERING` — ID, NAME (catalog for `po`, added in `005-product-offering.sql`)
- `SERVICE` — ID, SUBSCRIPTION_ID (FK to `SUBSCRIPTIONS`, unique — 1:1), PLATFORM,
  MSISDN, SIM_ICCID (added in `006-service.sql`, extracted off `SUBSCRIPTIONS`)

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

This is the single, enforced status model — `frontend/src/constants.js` and the
backend agree on it. New subscriptions are created in `TR`. `ER` is reserved for a
future charging/activation pipeline; nothing in the current codebase writes it.
Lifecycle transitions between these statuses (Suspend, Reconnect, Cancel, Change
Plan, Change MSISDN, Change SIM) are implemented via two domain-specific action
endpoints — see `subscription-lifecycle` under Architecture Notes below.

## Architecture Notes

### Frontend
- **Subscriptions**: filter/sort/pagination state lives in `App.jsx` (must survive navigating into and back out of `SubscriptionDetail`)
- **Clients**: filter state lives locally in `ClientsModule.jsx` (via `useState`)
- **Operations**: filter state lives locally in `OperationsModule.jsx` (via `useState`)
- `FilterSidebar` holds local draft state (pre-Apply form values) — not business state
- Pure filter helpers: `applyFilters`, `applySort`, `paginate` (Subscriptions); `applyClientSearch` (Clients); `applyOperationFilters` (Operations) in `utils/filterSort.js`
- Date fields use ISO format `YYYY-MM-DD` — string comparison works for sorting/filtering

### Backend (Spring Boot)
- `GET/POST /api/subscriptions`, `GET /api/subscriptions/{id}` (full detail),
  `PUT /api/subscriptions/{id}` (edit `contract`/`amount` only — no `Operation`
  recorded, unlike the lifecycle actions), `GET/POST /api/clients`,
  `GET /api/clients/{id}`, `PUT /api/clients/{id}`, `DELETE /api/clients/{id}`
  (`409` if the client still has subscriptions, via `ClientHasSubscriptionsException`),
  `GET /api/platforms`, `GET /api/payment-modes`
- Validation errors and invalid-reference/not-found errors (unknown `clientId`/
  `platform`/`paymentModeId`/`po`/subscription id/resource id) return `400`/`404`
  with a field→message body via `GlobalExceptionHandler` — never a raw `500`
- `platform` is validated against the `PLATFORM` catalog by name (no DB-level FK);
  `paymentModeId` and `po` (Product Offering) are both real FKs, validated
  against `PAYMENT_MODE` and `PRODUCT_OFFERING` respectively — `po` is accepted
  and returned as a name string on the wire (matching the documented external
  contract) but resolved/stored as `PRODUCT_OFFERING_ID` internally
- `platform` and `productOffering`/`po` are distinct, non-overlapping concepts —
  `platform` is *how* a subscription is technically realized (access + billing
  engine), `po` is *what* was commercially sold (TMF620 ProductOffering); see the
  class Javadoc on `Subscription.java` and
  `docs/superpowers/specs/2026-08-20-tmforum-alignment-analysis.md` for the full
  TM Forum alignment rationale
- CORS configured to allow requests from `http://localhost:3000`
- JPA with Oracle dialect — DDL auto is `none` (schema managed by SQL scripts).
  Entities generated via `@GeneratedValue(SEQUENCE)` mapped to the matching
  `SEQ_*` sequence — every entity needs this or `persist()` fails
  (`IdentifierGenerationException`); `PLATFORM`/`PAYMENT_MODE` use `IDENTITY`
  instead, matching their `GENERATED BY DEFAULT AS IDENTITY` columns
- `SubscriptionDTO` is a flat projection built from the JOIN; no lazy-loading issues

#### Lifecycle actions (`subscription-lifecycle`, `subscription-detail`)
- `SubscriptionLifecycleController` exposes two domain-specific action endpoints
  (`POST /api/subscriptions/{id}/product-actions` for `SUSPEND`/`RECONNECT`/
  `CANCEL`, `POST /api/subscriptions/{id}/service-actions` for `CHANGE_PLAN`/
  `CHANGE_MSISDN`/`CHANGE_SIM`; each takes `type` + action-specific payload)
  plus `GET /api/subscriptions/{id}` (detail),
  `GET /api/subscriptions/{id}/operations`, and `GET /api/operations` (all,
  cross-subscription, most recent first)
- Every action (`SUSPEND`, `RECONNECT`, `CANCEL`, `CHANGE_PLAN`, `CHANGE_MSISDN`,
  `CHANGE_SIM`) is a `LifecycleAction` implementation registered in
  `LifecycleActionRegistry`, run through one pipeline in `LifecycleActionService`:
  validate current status against the transition table, validate the action's
  data, record an `Operation` (via `OperationRecorder`), apply the change
- `Suspend` stashes the pre-suspend status in `PRE_SUSPEND_STATUS` so `Reconnect`
  can restore it
- `Operation` → `OperationDTO` mapping lives in the shared `OperationMapper`,
  reused by both the per-subscription operations list and the dashboard summary

#### Resources (`subscription-resources`)
- `ResourceController` / `ResourceService`: plain CRUD (`GET`/`POST`/`DELETE` on
  `/api/subscriptions/{id}/resources`), not a `LifecycleAction` — no `Operation`
  is recorded for assigning/removing a resource
- Valid `resourceType`s: `IP`, `VLAN`, `CPE`, `PORT`, `EQUIPMENT`, `NODE`.
  MSISDN/SIM ICCID intentionally stay dedicated columns on `SERVICE` (owned by the
  `CHANGE_MSISDN`/`CHANGE_SIM` lifecycle actions) rather than living in
  `RESOURCES` — see the resolved open question in
  `openspec/changes/archive/2026-08-17-subscription-resources-module/proposal.md`
  (`Resource` FKs to `Service` — see `docs/superpowers/specs/2026-08-26-service-entity-design.md`)

#### Operations & Dashboard modules (`subscription-operations`, `subscription-dashboard`)
- `GET /api/operations` (all subscriptions) backs the Operations sidebar module;
  each row links back to that operation's subscription detail screen
- `DashboardController`/`DashboardService` expose `GET /api/dashboard/summary`:
  total clients, total subscriptions, a per-status breakdown (all six statuses
  always present, even at zero), the most recent operations, and an
  operation-type distribution — all in one call

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

- Authentication / authorization
- Charging/billing, promotions, and payment-received reactivation
- Real integration with the ROS API or the API Gateway (this app is local-only —
  see `README.md`'s API section, which documents that *external* system's contract,
  not something implemented here)
- Email/SMS notifications

The Telco-lifecycle roadmap (`subscription-foundation` → `subscription-lifecycle-actions`
→ `subscription-detail-view` → `subscription-operations-module` →
`subscription-audit-history` → `subscription-resources-module` →
`subscription-dashboard`) is complete and fully archived under
`openspec/changes/archive/`. The most recently shipped change is
`2026-08-25-add-client-subscription-crud-gaps` (client Edit/Delete, narrow
subscription contract/amount Edit); `openspec/changes/` itself currently has
no active changes.
`openspec/specs/` holds the current-truth capability specs for everything listed
above.

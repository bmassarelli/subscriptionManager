# Backend API + Frontend Integration — Design Spec

**Date:** 2026-04-15
**Status:** Approved

---

## Overview

Add a Spring Boot 3 backend (`backend/`) that connects to Oracle and exposes a REST API. Update the React frontend to fetch real data from the API instead of using mock data. Filtering, sorting, and pagination stay client-side.

---

## Architecture

```
Oracle DB (SUBSCRIBER_MANAGER schema)
    ↓
Spring Boot API  →  GET /api/subscriptions
    ↓
React Frontend (fetch + existing filter/sort/paginate)
```

---

## Backend — Spring Boot 3, Java 21, Maven

### Project location
`C:\subscriptionManager\backend\`

### File structure

```
backend/
├── pom.xml
└── src/main/
    ├── java/com/subscriptionmanager/
    │   ├── SubscriptionManagerApplication.java
    │   ├── config/CorsConfig.java
    │   ├── controller/SubscriptionController.java
    │   ├── dto/SubscriptionDTO.java
    │   ├── entity/Client.java
    │   ├── entity/Subscription.java
    │   ├── repository/SubscriptionRepository.java
    │   └── service/SubscriptionService.java
    └── resources/application.properties
```

### Endpoint

`GET /api/subscriptions` — returns all subscriptions joined with client data.

Response shape (matches existing frontend mock data shape):
```json
[
  {
    "id": 1,
    "clientName": "John Smith",
    "email": "john@email.com",
    "msisdn": "+15551234567",
    "platform": "Netflix",
    "contract": "CONT-001",
    "status": "AC",
    "entryDate": "2024-01-10",
    "amount": 9.99
  }
]
```

`clientName` = `NAME || ' ' || LAST_NAME` from CLIENT table.

### JPA Entities

**Client** maps to `SUBSCRIBER_MANAGER.CLIENT`:
- `clientId` (PK), `name`, `lastName`, `email`, `msisdn`

**Subscription** maps to `SUBSCRIBER_MANAGER.SUBSCRIPTIONS`:
- `id` (PK), `client` (@ManyToOne → Client), `platform`, `contract`, `status`, `entryDate`, `amount`

### DTO
`SubscriptionDTO` — flat projection built from the JOIN, returned directly from the controller.

### CORS
Allow all methods from `http://localhost:3000`.

### application.properties
```properties
spring.datasource.url=jdbc:oracle:thin:@//HOST:PORT/SERVICE_NAME
spring.datasource.username=SUBSCRIBER_MANAGER
spring.datasource.password=th1nksk1nk
spring.datasource.driver-class-name=oracle.jdbc.OracleDriver
spring.jpa.database-platform=org.hibernate.dialect.OracleDialect
spring.jpa.hibernate.ddl-auto=none
server.port=8080
```
Host/port/service name are placeholders — developer fills them in locally.

### Key dependencies
- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- `ojdbc11` (Oracle JDBC)

---

## Frontend — React changes

**`src/App.jsx`:** Replace `mockData` import + `platforms` constant with:
- `useEffect` → `fetch('http://localhost:8080/api/subscriptions')`
- `loading` state → show spinner while fetching
- `error` state → show error message if fetch fails
- `platforms` derived from API response (same logic, different source)

**`src/mockData.js`** and **`src/utils/filterSort.js`** — no changes needed.

---

## Out of Scope

- Pagination / filtering server-side (stays client-side)
- POST / PUT / DELETE endpoints
- Authentication
- Production deployment / environment config

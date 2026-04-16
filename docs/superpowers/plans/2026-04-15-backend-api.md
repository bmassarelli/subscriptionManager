# Backend API + Frontend Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Spring Boot 3 REST API that connects to Oracle and expose `GET /api/subscriptions`, then update the React frontend to fetch real data from it.

**Architecture:** Spring Boot (Java 21, Maven) in `backend/`. JPA entities map to Oracle tables. A service maps entities to DTOs. Controller exposes one endpoint. React frontend replaces mockData with a `fetch` call, keeps all filtering/sorting/pagination client-side.

**Tech Stack:** Spring Boot 3.2, Java 21, Maven, ojdbc11, Spring Data JPA, React 18

---

## File Map

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

frontend/src/App.jsx     ← modified (replace mockData with fetch)
```

---

## Task 1: Spring Boot project scaffold

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/com/subscriptionmanager/SubscriptionManagerApplication.java`
- Create: `backend/src/main/resources/application.properties`

- [ ] **Step 1: Create `backend/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>com.subscriptionmanager</groupId>
    <artifactId>subscription-manager</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>subscription-manager</name>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>com.oracle.database.jdbc</groupId>
            <artifactId>ojdbc11</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: Create `SubscriptionManagerApplication.java`**

Create directory `backend/src/main/java/com/subscriptionmanager/` and file:

```java
package com.subscriptionmanager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SubscriptionManagerApplication {
    public static void main(String[] args) {
        SpringApplication.run(SubscriptionManagerApplication.class, args);
    }
}
```

- [ ] **Step 3: Create `backend/src/main/resources/application.properties`**

```properties
spring.datasource.url=jdbc:oracle:thin:@//HOST:PORT/SERVICE_NAME
spring.datasource.username=SUBSCRIBER_MANAGER
spring.datasource.password=th1nksk1nk
spring.datasource.driver-class-name=oracle.jdbc.OracleDriver
spring.jpa.database-platform=org.hibernate.dialect.OracleDialect
spring.jpa.hibernate.ddl-auto=none
server.port=8080
```

- [ ] **Step 4: Commit**

```bash
cd C:/subscriptionManager
git add backend/
git commit -m "feat: scaffold Spring Boot project with Maven and Oracle deps"
```

---

## Task 2: JPA Entities

**Files:**
- Create: `backend/src/main/java/com/subscriptionmanager/entity/Client.java`
- Create: `backend/src/main/java/com/subscriptionmanager/entity/Subscription.java`

- [ ] **Step 1: Create `entity/Client.java`**

```java
package com.subscriptionmanager.entity;

import jakarta.persistence.*;

@Entity
@Table(schema = "SUBSCRIBER_MANAGER", name = "CLIENT")
public class Client {

    @Id
    @Column(name = "CLIENT_ID")
    private Long clientId;

    @Column(name = "NAME")
    private String name;

    @Column(name = "LAST_NAME")
    private String lastName;

    @Column(name = "EMAIL")
    private String email;

    @Column(name = "MSISDN")
    private String msisdn;

    public Long getClientId() { return clientId; }
    public String getName() { return name; }
    public String getLastName() { return lastName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
}
```

- [ ] **Step 2: Create `entity/Subscription.java`**

```java
package com.subscriptionmanager.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(schema = "SUBSCRIBER_MANAGER", name = "SUBSCRIPTIONS")
public class Subscription {

    @Id
    @Column(name = "ID")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "CLIENT_ID")
    private Client client;

    @Column(name = "PLATFORM")
    private String platform;

    @Column(name = "CONTRACT")
    private String contract;

    @Column(name = "STATUS")
    private String status;

    @Column(name = "ENTRY_DATE")
    private LocalDate entryDate;

    @Column(name = "AMOUNT")
    private BigDecimal amount;

    public Long getId() { return id; }
    public Client getClient() { return client; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/subscriptionManager
git add backend/src/main/java/com/subscriptionmanager/entity/
git commit -m "feat: add JPA entities for Client and Subscription"
```

---

## Task 3: DTO and Repository

**Files:**
- Create: `backend/src/main/java/com/subscriptionmanager/dto/SubscriptionDTO.java`
- Create: `backend/src/main/java/com/subscriptionmanager/repository/SubscriptionRepository.java`

- [ ] **Step 1: Create `dto/SubscriptionDTO.java`**

```java
package com.subscriptionmanager.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public class SubscriptionDTO {

    private Long id;
    private String clientName;
    private String email;
    private String msisdn;
    private String platform;
    private String contract;
    private String status;
    private LocalDate entryDate;
    private BigDecimal amount;

    public SubscriptionDTO(Long id, String clientName, String email, String msisdn,
                           String platform, String contract, String status,
                           LocalDate entryDate, BigDecimal amount) {
        this.id = id;
        this.clientName = clientName;
        this.email = email;
        this.msisdn = msisdn;
        this.platform = platform;
        this.contract = contract;
        this.status = status;
        this.entryDate = entryDate;
        this.amount = amount;
    }

    public Long getId() { return id; }
    public String getClientName() { return clientName; }
    public String getEmail() { return email; }
    public String getMsisdn() { return msisdn; }
    public String getPlatform() { return platform; }
    public String getContract() { return contract; }
    public String getStatus() { return status; }
    public LocalDate getEntryDate() { return entryDate; }
    public BigDecimal getAmount() { return amount; }
}
```

- [ ] **Step 2: Create `repository/SubscriptionRepository.java`**

```java
package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    @Query("SELECT s FROM Subscription s JOIN FETCH s.client")
    List<Subscription> findAllWithClient();
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/subscriptionManager
git add backend/src/main/java/com/subscriptionmanager/dto/ backend/src/main/java/com/subscriptionmanager/repository/
git commit -m "feat: add SubscriptionDTO and SubscriptionRepository"
```

---

## Task 4: Service, Controller, and CORS config

**Files:**
- Create: `backend/src/main/java/com/subscriptionmanager/service/SubscriptionService.java`
- Create: `backend/src/main/java/com/subscriptionmanager/controller/SubscriptionController.java`
- Create: `backend/src/main/java/com/subscriptionmanager/config/CorsConfig.java`

- [ ] **Step 1: Create `service/SubscriptionService.java`**

```java
package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubscriptionService {

    private final SubscriptionRepository repository;

    public SubscriptionService(SubscriptionRepository repository) {
        this.repository = repository;
    }

    public List<SubscriptionDTO> getAll() {
        return repository.findAllWithClient()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    private SubscriptionDTO toDTO(Subscription s) {
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();
        return new SubscriptionDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getPlatform(),
                s.getContract(),
                s.getStatus(),
                s.getEntryDate(),
                s.getAmount()
        );
    }
}
```

- [ ] **Step 2: Create `controller/SubscriptionController.java`**

```java
package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.service.SubscriptionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class SubscriptionController {

    private final SubscriptionService service;

    public SubscriptionController(SubscriptionService service) {
        this.service = service;
    }

    @GetMapping("/subscriptions")
    public List<SubscriptionDTO> getAll() {
        return service.getAll();
    }
}
```

- [ ] **Step 3: Create `config/CorsConfig.java`**

```java
package com.subscriptionmanager.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("http://localhost:3000")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
    }
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/subscriptionManager
git add backend/src/main/java/com/subscriptionmanager/service/ backend/src/main/java/com/subscriptionmanager/controller/ backend/src/main/java/com/subscriptionmanager/config/
git commit -m "feat: add service, controller, and CORS config"
```

---

## Task 5: Build the backend

- [ ] **Step 1: Check Maven is available**

```bash
mvn -version
```
Expected: Maven 3.x, Java 21.

- [ ] **Step 2: Build (skip tests — no DB available at build time)**

```bash
cd C:/subscriptionManager/backend
mvn clean package -DskipTests
```
Expected: `BUILD SUCCESS` and `target/subscription-manager-0.0.1-SNAPSHOT.jar` created.

- [ ] **Step 3: Commit the .gitignore for backend**

Create `backend/.gitignore`:
```
target/
*.class
*.jar
```

```bash
cd C:/subscriptionManager
git add backend/.gitignore
git commit -m "chore: add .gitignore for backend build artifacts"
```

---

## Task 6: Update React frontend

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Replace `frontend/src/App.jsx`**

```jsx
import { useState, useEffect, useMemo } from 'react';
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

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sort, setSort] = useState(INITIAL_SORT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetch('http://localhost:8080/api/subscriptions')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch subscriptions');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const platforms = useMemo(
    () => [...new Set(data.map(d => d.platform))].sort(),
    [data]
  );

  const { rows, total } = useMemo(() => {
    const filtered = applyFilters(data, filters);
    const sorted = applySort(filtered, sort);
    return paginate(sorted, page, rowsPerPage);
  }, [data, filters, sort, page, rowsPerPage]);

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

  if (loading) return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex justify-content-center align-items-center flex-grow-1">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar />
      <div className="d-flex justify-content-center align-items-center flex-grow-1">
        <div className="alert alert-danger">{error}</div>
      </div>
    </div>
  );

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

- [ ] **Step 2: Run frontend tests to confirm nothing broke**

```bash
cd C:/subscriptionManager/frontend
export PATH="/c/Program Files/nodejs:$PATH"
CI=true npm test -- --watchAll=false --verbose 2>&1 | tail -10
```
Expected: All 17 tests pass (filterSort tests — not affected by this change).

- [ ] **Step 3: Commit**

```bash
cd C:/subscriptionManager
git add frontend/src/App.jsx
git commit -m "feat: connect frontend to Spring Boot API, remove mockData dependency"
```

- [ ] **Step 4: Push everything**

```bash
git push origin main
```

---

## Running the full stack

**Backend:**
```bash
# Fill in real DB values in backend/src/main/resources/application.properties first
cd backend
mvn spring-boot:run
# API available at http://localhost:8080/api/subscriptions
```

**Frontend:**
```bash
cd frontend
npm start
# UI at http://localhost:3000
```

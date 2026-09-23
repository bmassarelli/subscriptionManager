# Payment Received Flow (+ Mark Expired) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new `PRODUCT`-domain lifecycle actions — `MARK_EXPIRED` (`AC`/`TR` → `EX`)
and `PAYMENT_RECEIVED` (`EX` → `AC`) — so the `EX` status becomes reachable and recoverable
from inside the app, dispatched through the existing `POST /api/subscriptions/{id}/product-actions`
endpoint.

**Architecture:** Two new `LifecycleAction` implementations following the exact shape of
`SuspendAction`/`ReconnectAction`, auto-registered into `LifecycleActionRegistry` via Spring
component scanning. No controller, DTO, registry, or service-pipeline changes. Frontend picks
up both actions automatically via the existing `availableProductActions`-driven button
rendering; only display labels need adding.

**Tech Stack:** Spring Boot 3 / Java 21 / Maven (backend), React / Create React App / Jest +
Testing Library (frontend).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-27-payment-received-flow-design.md` — read it
  before starting; this plan implements it exactly.
- No new DB columns, no new endpoints, no `TRANSACTION_DATE`/`ERROR_CODE`/`ERROR_MSG`/
  `PROMOTION` fields — out of scope per the spec.
- `PAYMENT_RECEIVED` always transitions to `AC` (never `TR`), regardless of what status the
  subscription was in before it became `EX`.
- Neither action touches `PRE_SUSPEND_STATUS`.
- Backend test environment limitation: `mvn test` is not reliable in this dev environment
  (known Mockito/JDK25 incompatibility, unrelated to any code change). For every backend task,
  run `mvn test-compile -DskipTests` as the real verification bar (must be clean), and
  separately attempt `mvn test -Dtest=<ClassName>` — if it fails or hangs for reasons that look
  environmental (not an assertion failure tied to the new code), don't treat that as a blocker;
  read the test code carefully instead of trusting execution.
- **Deviation from the design spec's Testing section:** the spec listed a
  `SubscriptionServiceTest.getById()` case asserting `MARK_EXPIRED`/`PAYMENT_RECEIVED` show up
  in `availableProductActions`. That test class mocks `LifecycleActionRegistry` entirely
  (`when(actionRegistry.availableProductActionsFor(...)).thenReturn(...)`), so a case for these
  two types would only prove Mockito echoes back whatever it's told to — it wouldn't exercise
  either new action's real `eligibleStatuses()`. That real behavior is already fully covered by
  Task 1's `LifecycleActionServiceTest` cases, which use the real action instances through the
  real registry. Skipped here as redundant; not a task below.

---

### Task 1: `MarkExpiredAction` and `PaymentReceivedAction`

**Files:**
- Create: `backend/src/main/java/com/subscriptionmanager/service/lifecycle/MarkExpiredAction.java`
- Create: `backend/src/main/java/com/subscriptionmanager/service/lifecycle/PaymentReceivedAction.java`
- Modify: `backend/src/test/java/com/subscriptionmanager/service/lifecycle/LifecycleActionServiceTest.java`

**Interfaces:**
- Consumes: `LifecycleAction` interface (`String getType()`, `LifecycleDomain domain()`,
  `List<String> eligibleStatuses()`, `void validate(Subscription, Map<String,Object>)`,
  `String apply(Subscription, Map<String,Object>)`) — from `service/lifecycle/LifecycleAction.java`.
  `Subscription.getStatus()`/`setStatus(String)` — from `entity/Subscription.java`.
- Produces: two new `LifecycleAction` beans with `getType()` returning `"MARK_EXPIRED"` and
  `"PAYMENT_RECEIVED"` respectively — auto-discovered by `LifecycleActionRegistry`'s
  constructor (`List<LifecycleAction> actionList`) via Spring component scanning in the running
  app, and manually added to the `actions` list in this test file's `setUp()` for the unit
  tests in this task.

- [ ] **Step 1: Write the failing tests in `LifecycleActionServiceTest`**

  Add `new MarkExpiredAction()` and `new PaymentReceivedAction()` to the `actions` list built
  in `setUp()` (around line 46-53):

  ```java
  List<LifecycleAction> actions = List.of(
          new SuspendAction(),
          new ReconnectAction(),
          new CancelAction(resourceRepository),
          new ChangePlanAction(platformRepository),
          new ChangeMsisdnAction(),
          new ChangeSimAction(),
          new MarkExpiredAction(),
          new PaymentReceivedAction()
  );
  ```

  Then add these test methods (anywhere after `rejectsReconnectOnIneligibleStatus`, matching
  the file's existing SUSPEND/RECONNECT test style):

  ```java
  @Test
  void marksActiveSubscriptionExpired() {
      Subscription subscription = buildSubscription("AC");
      when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

      service.executeProductAction(1L, "MARK_EXPIRED", Map.of());

      assertEquals("EX", subscription.getStatus());
      ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
      verify(operationRepository).save(captor.capture());
      assertEquals("COMPLETED", captor.getValue().getStatus());
      assertEquals("AC -> EX", captor.getValue().getDescription());
  }

  @Test
  void marksTrialSubscriptionExpired() {
      Subscription subscription = buildSubscription("TR");
      when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

      service.executeProductAction(1L, "MARK_EXPIRED", Map.of());

      assertEquals("EX", subscription.getStatus());
  }

  @Test
  void rejectsMarkExpiredOnIneligibleStatus() {
      Subscription subscription = buildSubscription("SU");
      when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

      assertThrows(InvalidLifecycleTransitionException.class,
              () -> service.executeProductAction(1L, "MARK_EXPIRED", Map.of()));
      assertEquals("SU", subscription.getStatus());
      verify(operationRepository, never()).save(any());
  }

  @Test
  void reactivatesExpiredSubscriptionOnPaymentReceived() {
      Subscription subscription = buildSubscription("EX");
      when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

      service.executeProductAction(1L, "PAYMENT_RECEIVED", Map.of());

      assertEquals("AC", subscription.getStatus());
      ArgumentCaptor<Operation> captor = ArgumentCaptor.forClass(Operation.class);
      verify(operationRepository).save(captor.capture());
      assertEquals("COMPLETED", captor.getValue().getStatus());
      assertEquals("EX -> AC", captor.getValue().getDescription());
  }

  @Test
  void rejectsPaymentReceivedOnIneligibleStatus() {
      Subscription subscription = buildSubscription("AC");
      when(subscriptionRepository.findById(1L)).thenReturn(Optional.of(subscription));

      assertThrows(InvalidLifecycleTransitionException.class,
              () -> service.executeProductAction(1L, "PAYMENT_RECEIVED", Map.of()));
      assertEquals("AC", subscription.getStatus());
      verify(operationRepository, never()).save(any());
  }
  ```

  Also extend the existing `classifiesEachActionsDomainCorrectly` test (around line 360) by
  adding these two lines inside it:

  ```java
  assertEquals(LifecycleDomain.PRODUCT, new MarkExpiredAction().domain());
  assertEquals(LifecycleDomain.PRODUCT, new PaymentReceivedAction().domain());
  ```

- [ ] **Step 2: Confirm the test file fails to compile (the two classes don't exist yet)**

  Run: `cd backend && mvn test-compile -DskipTests`
  Expected: `COMPILE ERROR` — `cannot find symbol: class MarkExpiredAction` (and
  `PaymentReceivedAction`)

- [ ] **Step 3: Create `MarkExpiredAction`**

  ```java
  package com.subscriptionmanager.service.lifecycle;

  import com.subscriptionmanager.entity.Subscription;
  import org.springframework.stereotype.Component;

  import java.util.List;
  import java.util.Map;

  @Component
  public class MarkExpiredAction implements LifecycleAction {

      @Override
      public String getType() { return "MARK_EXPIRED"; }

      @Override
      public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }

      @Override
      public List<String> eligibleStatuses() { return List.of("AC", "TR"); }

      @Override
      public void validate(Subscription subscription, Map<String, Object> data) {
          // no additional data required
      }

      @Override
      public String apply(Subscription subscription, Map<String, Object> data) {
          String from = subscription.getStatus();
          subscription.setStatus("EX");
          return from + " -> EX";
      }
  }
  ```

- [ ] **Step 4: Create `PaymentReceivedAction`**

  ```java
  package com.subscriptionmanager.service.lifecycle;

  import com.subscriptionmanager.entity.Subscription;
  import org.springframework.stereotype.Component;

  import java.util.List;
  import java.util.Map;

  @Component
  public class PaymentReceivedAction implements LifecycleAction {

      @Override
      public String getType() { return "PAYMENT_RECEIVED"; }

      @Override
      public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }

      @Override
      public List<String> eligibleStatuses() { return List.of("EX"); }

      @Override
      public void validate(Subscription subscription, Map<String, Object> data) {
          // no additional data required
      }

      @Override
      public String apply(Subscription subscription, Map<String, Object> data) {
          subscription.setStatus("AC");
          return "EX -> AC";
      }
  }
  ```

- [ ] **Step 5: Verify compile is clean, then attempt the targeted test run**

  Run: `cd backend && mvn test-compile -DskipTests`
  Expected: `BUILD SUCCESS`

  Then attempt: `cd backend && mvn test -Dtest=LifecycleActionServiceTest`
  Expected: ideally `Tests run: <N>, Failures: 0, Errors: 0` — but per the Global Constraints
  test-environment note, a hang or unrelated failure here is not a blocker; if that happens,
  re-read Steps 1/3/4 above to confirm the test and implementation match (status strings,
  `eligibleStatuses()` lists, `apply()` return values).

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/main/java/com/subscriptionmanager/service/lifecycle/MarkExpiredAction.java \
          backend/src/main/java/com/subscriptionmanager/service/lifecycle/PaymentReceivedAction.java \
          backend/src/test/java/com/subscriptionmanager/service/lifecycle/LifecycleActionServiceTest.java
  git commit -m "feat: add MARK_EXPIRED and PAYMENT_RECEIVED lifecycle actions"
  ```

---

### Task 2: Controller-level coverage for the two new action types

**Files:**
- Modify: `backend/src/test/java/com/subscriptionmanager/controller/SubscriptionLifecycleControllerTest.java`

**Interfaces:**
- Consumes: `LifecycleActionService.executeProductAction(Long, String, Map)` (mocked in this
  test class — the controller itself is action-type-agnostic, so this task only needs the
  service mock, not the real `MarkExpiredAction`/`PaymentReceivedAction` classes from Task 1).
  `LifecycleActionResultDTO(SubscriptionDTO, OperationDTO)`, `SubscriptionDTO` and
  `OperationDTO` constructors — same shapes already used elsewhere in this file (see the
  `executesActionAndPassesTypeAndDataThrough` test for the exact constructor argument order).
- Produces: nothing new consumed by later tasks — this task only adds test coverage.

- [ ] **Step 1: Write the failing tests**

  Add these two test methods to `SubscriptionLifecycleControllerTest`, next to
  `executesActionAndPassesTypeAndDataThrough`:

  ```java
  @Test
  void executesMarkExpiredAction() throws Exception {
      SubscriptionDTO subscriptionDTO = new SubscriptionDTO(1L, "John Doe", "john@doe.com", "+11234567890",
              "MOBILE_BSCS9", "CONTR_001", "EX", LocalDate.now(), new BigDecimal("10.00"), null);
      OperationDTO operationDTO = new OperationDTO(1L, 1L, "John Doe", "MARK_EXPIRED", "COMPLETED",
              LocalDateTime.now(), LocalDateTime.now(), null, "AC -> EX");
      when(service.executeProductAction(eq(1L), eq("MARK_EXPIRED"), any())).thenReturn(
              new LifecycleActionResultDTO(subscriptionDTO, operationDTO));

      mockMvc.perform(post("/api/subscriptions/1/product-actions")
                      .contentType("application/json")
                      .content("{\"type\":\"MARK_EXPIRED\"}"))
              .andExpect(status().isOk())
              .andExpect(jsonPath("$.subscription.status").value("EX"))
              .andExpect(jsonPath("$.operation.operationType").value("MARK_EXPIRED"));
  }

  @Test
  void executesPaymentReceivedAction() throws Exception {
      SubscriptionDTO subscriptionDTO = new SubscriptionDTO(1L, "John Doe", "john@doe.com", "+11234567890",
              "MOBILE_BSCS9", "CONTR_001", "AC", LocalDate.now(), new BigDecimal("10.00"), null);
      OperationDTO operationDTO = new OperationDTO(1L, 1L, "John Doe", "PAYMENT_RECEIVED", "COMPLETED",
              LocalDateTime.now(), LocalDateTime.now(), null, "EX -> AC");
      when(service.executeProductAction(eq(1L), eq("PAYMENT_RECEIVED"), any())).thenReturn(
              new LifecycleActionResultDTO(subscriptionDTO, operationDTO));

      mockMvc.perform(post("/api/subscriptions/1/product-actions")
                      .contentType("application/json")
                      .content("{\"type\":\"PAYMENT_RECEIVED\"}"))
              .andExpect(status().isOk())
              .andExpect(jsonPath("$.subscription.status").value("AC"))
              .andExpect(jsonPath("$.operation.operationType").value("PAYMENT_RECEIVED"));
  }
  ```

- [ ] **Step 2: Verify compile is clean, then attempt the targeted test run**

  Run: `cd backend && mvn test-compile -DskipTests`
  Expected: `BUILD SUCCESS`

  Then attempt: `cd backend && mvn test -Dtest=SubscriptionLifecycleControllerTest`
  Expected: ideally all green; per the Global Constraints note, treat an environmental
  failure/hang as non-blocking and re-check the test body against the existing
  `executesActionAndPassesTypeAndDataThrough` pattern instead.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/test/java/com/subscriptionmanager/controller/SubscriptionLifecycleControllerTest.java
  git commit -m "test: cover MARK_EXPIRED and PAYMENT_RECEIVED at the controller layer"
  ```

---

### Task 3: Frontend labels and UI test coverage

**Files:**
- Modify: `frontend/src/components/SubscriptionDetail.jsx`
- Modify: `frontend/src/constants.js`
- Modify: `frontend/src/components/SubscriptionDetail.test.js`

**Interfaces:**
- Consumes: `detail.availableProductActions` (array of type strings, e.g. `['MARK_EXPIRED']`
  when `status` is `AC`/`TR`, or `['PAYMENT_RECEIVED']` when `status` is `EX`) — already
  returned by the backend via Task 1's `eligibleStatuses()`, no frontend fetch/shape change.
  `ACTION_LABELS` object (`SubscriptionDetail.jsx` line 11) and `ALL_OPERATION_TYPES`/
  `OPERATION_TYPE_LABELS` (`constants.js` lines 27/36) — existing plain objects/arrays being
  extended, not restructured.
- Produces: nothing new consumed by later tasks — this is the final task in this plan.

- [ ] **Step 1: Write the failing test in `SubscriptionDetail.test.js`**

  Add this test after `renders only the fetched available actions as buttons` (around line 81):

  ```js
  test('renders Mark Expired for AC and Payment Received for EX, with correct labels', async () => {
    mockFetch({ detail: { ...BASE_DETAIL, status: 'AC', availableProductActions: ['MARK_EXPIRED'], availableServiceActions: [] } });
    const { unmount } = render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
    await screen.findByText('John Doe');

    expect(screen.getByRole('button', { name: 'Mark Expired' })).toBeInTheDocument();
    unmount();

    mockFetch({ detail: { ...BASE_DETAIL, status: 'EX', availableProductActions: ['PAYMENT_RECEIVED'], availableServiceActions: [] } });
    render(<SubscriptionDetail subscriptionId={1} onBack={jest.fn()} />);
    await screen.findByText('John Doe');

    expect(screen.getByRole('button', { name: 'Payment Received' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark Expired' })).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `cd frontend && npx jest SubscriptionDetail.test.js -t "Mark Expired for AC and Payment Received for EX"`
  Expected: FAIL — button name resolves to the raw type string (`MARK_EXPIRED`/
  `PAYMENT_RECEIVED`) instead of the human label, because `ACTION_LABELS[type] || type` falls
  back to the raw type today.

- [ ] **Step 3: Add the two labels to `ACTION_LABELS` in `SubscriptionDetail.jsx`**

  ```js
  const ACTION_LABELS = {
    SUSPEND: 'Suspend',
    RECONNECT: 'Reconnect',
    CANCEL: 'Cancel',
    CHANGE_PLAN: 'Change Plan',
    CHANGE_MSISDN: 'Change MSISDN',
    CHANGE_SIM: 'Change SIM',
    MARK_EXPIRED: 'Mark Expired',
    PAYMENT_RECEIVED: 'Payment Received',
  };
  ```

- [ ] **Step 4: Add the two types to `constants.js`**

  ```js
  export const ALL_OPERATION_TYPES = ['CREATE', 'SUSPEND', 'RECONNECT', 'CANCEL', 'CHANGE_PLAN', 'CHANGE_MSISDN', 'CHANGE_SIM', 'MARK_EXPIRED', 'PAYMENT_RECEIVED'];
  ```

  ```js
  export const OPERATION_TYPE_LABELS = {
    CREATE: 'Create',
    SUSPEND: 'Suspend',
    RECONNECT: 'Reconnect',
    CANCEL: 'Cancel',
    CHANGE_PLAN: 'Change Plan',
    CHANGE_MSISDN: 'Change MSISDN',
    CHANGE_SIM: 'Change SIM',
    MARK_EXPIRED: 'Mark Expired',
    PAYMENT_RECEIVED: 'Payment Received',
  };
  ```

  (`OPERATION_TYPE_CHART_TOKEN`, just below, is derived from `ALL_OPERATION_TYPES` by index —
  no change needed there, it picks up the two new entries automatically.)

- [ ] **Step 5: Run the test to verify it passes**

  Run: `cd frontend && npx jest SubscriptionDetail.test.js`
  Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 6: Run the full frontend suite**

  Run: `cd frontend && npm test -- --watchAll=false`
  Expected: all tests passing (no regressions from the `ACTION_LABELS`/`constants.js`
  additions — both are additive, no existing key changed).

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/SubscriptionDetail.jsx frontend/src/constants.js frontend/src/components/SubscriptionDetail.test.js
  git commit -m "feat: add UI labels for MARK_EXPIRED and PAYMENT_RECEIVED lifecycle actions"
  ```

---

## Post-Implementation

- Update `CLAUDE.md`'s "Lifecycle actions" section to mention `MARK_EXPIRED`/
  `PAYMENT_RECEIVED` alongside `SUSPEND`/`RECONNECT`/`CANCEL`, and adjust its "What's Not
  Built Yet" bullet on charging/billing to note this slice is done (payment-received
  reactivation) while the periodic charging engine and promotions remain unbuilt. This isn't
  a separate task above because it's a small doc edit best done once the real diff exists to
  describe accurately — do it as part of wrapping up this change, before opening/updating the
  PR.

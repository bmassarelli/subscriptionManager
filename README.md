# Subscription Manager

## Overview

**Subscription Manager** is a web application designed to manage subscriptions with recurring charges, primarily intended for **Telco Operations**.

Subscriptions are associated with clients and product offerings (POs). The application handles activation, cancellation, and charging across multiple payment platforms.

---

## Payment Modes

Charging is determined by the `PAYMENT_MODE` table:

| ID | Name        | Description                              |
|----|-------------|------------------------------------------|
| 1  | OCC         | Postpaid charging via third-party BSCS   |
| 2  | Saldo       | Prepaid — deducted from customer bucket  |
| 3  | Credit Card | Payment gateway call                     |

---

## Database Tables

### `CLIENTS`
Stores customer information: email, first name, last name, and MSISDN.

### `SUBSCRIPTIONS`

| Column             | Type            | Description                                              |
|--------------------|-----------------|----------------------------------------------------------|
| ID                 | NUMBER PK       | Sequence-generated subscription ID                      |
| CLIENT_ID          | NUMBER          | Reference to the client                                  |
| ENTRY_DATE         | DATE            | Record creation date                                     |
| MODIFY_DATE        | DATE            | Last update date — updated on every change               |
| PLATFORM           | VARCHAR2(100)   | Charging platform (e.g., `MOBILE_BSCS9`)                 |
| CONTRACT           | VARCHAR2(400)   | Contract identifier                                      |
| STATUS             | VARCHAR2(2)     | Current subscription status (see status table below)     |
| PO                 | VARCHAR2(400)   | Product Offering — determines charging behavior          |
| ACTIVATE_DATE      | DATE            | Effective start date                                     |
| DEACTIVATE_DATE    | DATE            | Expiration/deactivation date                             |
| CANCEL_DATE        | DATE            | Set when the user requests cancellation                  |
| START_TRIAL_DATE   | DATE            | Trial period start                                       |
| END_TRIAL_DATE     | DATE            | Trial period end                                         |
| AMOUNT             | NUMBER(15,2)    | Subscription charge amount                               |
| TRANSACTION_DATE   | DATE            | Set by ROS loader during charge processing               |
| FLOW               | VARCHAR2(400)   | Charging flow used — set by ROS loader                   |
| OBSERVATION        | VARCHAR2(4000)  | General notes or processing details                      |
| ERROR_CODE         | VARCHAR2(400)   | Error code if charging fails                             |
| ERROR_MSG          | VARCHAR2(4000)  | Error message if charging fails                          |
| PROMOTION          | NUMBER          | Promotion ID from the promotions application             |

### Subscription Statuses

| Code | Description | When set                                                                 |
|------|-------------|--------------------------------------------------------------------------|
| AC   | Active      | Subscription is active and charges are being processed                   |
| TR   | Trial       | Within the trial period — no charges yet                                 |
| SU   | Suspended   | Temporarily suspended — service interrupted, can be reconnected          |
| EX   | Expired     | Payment failed (e.g., insufficient balance); service deactivated         |
| CA   | Cancelled   | Explicitly cancelled by the client via a cancellation request (`CANCEL_DATE` is set) |
| ER   | Error       | A processing error occurred during charging or activation                |

> **Important:** `CA` is exclusively set when the **client requests cancellation**. Payment failures must never result in a `CA` status — they result in `EX` instead.

---

## APIs — ROS Application

Base URL: `https://ts-training-2.io/ros-rest/`

---

### Activate Subscription

**Creates a new subscription.** Also creates the client record if `clientId` is null. A client may have multiple subscriptions with different contracts.

> If a subscription with status `CA` (Cancelled) or `EX` (Expired) already exists for the same contract, it is set to **pending reactivation** instead of creating a new record.

After persisting the subscription, the Activate service triggers the **Subscription Manager - Network Activate** subflow, which notifies the API Gateway to activate the contract on the network.

#### Activation Flow

```
POST /subsmanActivate
        ↓
Create/update SUBSCRIPTIONS record in DB
(create CLIENT record if clientId is null)
        ↓
Call subflow: Subscription Manager - Network Activate
        ↓
API Gateway → Create Contract event sent to network
        ↓
Network activation confirmed
```

**Endpoint:** `POST /subsmanActivate`

**Payload:**
```json
{
  "platform": "MOBILE_BSCS9",
  "contract": "CONTR_00001",
  "po": "claroVideo",
  "amount": 29.75,
  "client": {
    "clientId": 1,
    "name": "Roney",
    "lastName": "Totti",
    "email": "bruno.massarelli@example.com",
    "msisdn": "51989998881"
  },
  "trial": {
    "number": "7",
    "type": "D"
  },
  "duration": {
    "number": "30",
    "type": "D"
  },
  "paymentMode": "1"
}
```

| Field         | Description                                                    |
|---------------|----------------------------------------------------------------|
| `platform`    | Charging platform                                              |
| `contract`    | Contract identifier                                            |
| `po`          | Product Offering — determines the charging method              |
| `amount`      | Recurring charge amount                                        |
| `client`      | Customer details — `clientId` can be null to auto-create       |
| `trial`       | Trial period duration (`D` = days, `M` = months)               |
| `duration`    | Subscription duration (`D` = days, `M` = months)               |
| `paymentMode` | ID from `PAYMENT_MODE` table (1=OCC, 2=Saldo, 3=Credit Card)  |

---

### Cancel Subscription

Sets the `CANCEL_DATE`, sets `STATUS = CA`, and stops further charges. This endpoint is **only triggered by an explicit client request** — payment failures must never invoke this flow.

The `immediate` flag controls whether network deactivation happens right away or at the end of the billing period.

**Endpoint:** `POST /subsmanCancel`

**Payload:**
```json
{
  "id": 2,
  "immediate": false
}
```

| Field       | Description                                                  |
|-------------|--------------------------------------------------------------|
| `id`        | Subscription ID                                              |
| `immediate` | `true` = deactivate now; `false` = deactivate at period end  |

#### Cancellation Flow

```
POST /subsmanCancel
        ↓
Set CANCEL_DATE = now
Set STATUS = CA
        ↓
        ├─── immediate: false ───────────────────────────────────────┐
        │                                                            │
        │    Schedule deactivation for end of billing period         │
        │    (DEACTIVATE_DATE remains as originally set)             │
        │    No network call is made at this point.                  │
        │                                                            │
        └─── immediate: true ────────────────────────────────────────┘
             │
             Set DEACTIVATE_DATE = now
             │
             Call subflow: Subscription Manager - Network Deactivate
             │
             API Gateway → Deactivate Contract event sent to network
             │
             Network deactivation confirmed
```

#### Subflow: Subscription Manager - Network Deactivate

This subflow is exclusively responsible for triggering the network-side contract deactivation. It is only invoked when `immediate: true`.

It communicates with the **API Gateway**, which routes the `Deactivate Contract` transaction to the appropriate network systems. The API Gateway is a shared service that accepts contract lifecycle events (activate, deactivate, suspend, reconnect, customer data changes) from any authorized client service.

---

### Get Subscription

Retrieves client and subscription information by **email** or **client ID**.

```
GET /subsmanGetSubscriptions?clientId=1
GET /subsmanGetSubscriptions?email=xxxx@email.com
```

---

## Charge Subscription — ROS Loader

The ROS Loader periodically queries `SUBSCRIPTION_MANAGER.SUBSCRIPTIONS` for subscriptions eligible for charging. The **PO (Product Offering)** determines which charging platform to use via the catalog.

### Charging Flow

```
Loader queries eligible subscriptions
        ↓
Reads PO → Catalog lookup → Payment Mode
        ↓
OCC (postpaid)  |  Saldo (prepaid bucket)  |  Credit Card (gateway)
        ↓
Updates SUBSCRIPTIONS:
  - TRANSACTION_DATE = execution date
  - FLOW = charging flow used
  - ERROR_CODE / ERROR_MSG (if failed)
  - STATUS = EX (Expired) if payment fails for any reason
  - MODIFY_DATE = now
```

### Eligibility Validations

Before charging, the loader must validate:

- Subscription **status** (must be chargeable, e.g., AC or TR)
- **ACTIVATE_DATE** and **DEACTIVATE_DATE** (subscription must be within active window)
- **Trial period dates** (no charge during trial if applicable)
- **CANCEL_DATE** (cancelled subscriptions should not be charged)
- **Promotion eligibility** (free periods must be respected)
- **Existing errors** or pending retry attempts

---

## API Gateway — Events

The API Gateway is a shared routing service that accepts transactions from authorized client services (including Subscription Manager) and forwards them to the appropriate downstream systems. It handles two categories of events: **contract lifecycle** and **payment**.

### Contract Lifecycle Events

| Event                          | Description                                  |
|-------------------------------|----------------------------------------------|
| Create Contract               | New subscription creation                    |
| Deactivate Contract           | Contract termination                         |
| Suspend Contract              | Temporary suspension                         |
| Reconnect Contract            | Reactivation after suspension                |
| Change Plan                   | Plan modification                            |
| Change MSISDN                 | Phone number update                          |
| Change SIM                    | SIM card replacement                         |
| Takeover                      | Change of customer (ownership transfer)      |
| Migration postpaid → prepaid  | Account migration                            |
| Migration prepaid → postpaid  | Account migration                            |
| Add PO                        | Add Product Offering to subscription         |
| Add Addon                     | Add addon to subscription                    |
| Del PO                        | Remove Product Offering                      |
| Del Addon                     | Remove addon                                 |
| Change BillCycle              | Update billing cycle                         |

### Payment Events

| Event             | Description                                                              |
|-------------------|--------------------------------------------------------------------------|
| Payment Received  | Inbound payment order routed to the Subscription Manager payment flow    |

When the API Gateway receives a **Payment Received** event, it forwards the payment order to the **Subscription Manager - Payment Received** flow for processing.

#### Payment Received Flow

This flow receives a payment order containing the **client** and **subscription** identifiers, confirming that payment was previously processed by an external system. Its responsibility is to reestablish the service for subscriptions that expired due to payment failure.

> **Note:** This flow targets `EX` (Expired) subscriptions only — those that were deactivated because a charge could not be collected. Suspended (`SU`) subscriptions are reestablished via the `Reconnect Contract` event on the API Gateway, not through this flow.

```
External payment source
        ↓
API Gateway → Payment Received event
(contains client ID + subscription ID, payment already confirmed externally)
        ↓
Subscription Manager - Payment Received flow
        ↓
Look up subscription in SUBSCRIPTIONS table
        ↓
Validate subscription status = EX (Expired — payment failure)
        ↓
Update SUBSCRIPTIONS:
  - STATUS = AC (Active)
  - MODIFY_DATE = now
        ↓
Call subflow: Subscription Manager - Network Activate
        ↓
Service reestablished for the client
```

---

## Planned / Future Features

- **Retry mechanism** for failed charges
- **Email/SMS notifications** before subscription expiration
- **Promotion campaigns** and temporary discounts
- **Subscription history and audit logs**
- **Integration** with external CRM and billing systems
- **Manual suspension and reactivation**
- **Reporting dashboards** for Telco Operations teams

---

## Notes

- The `PROMOTION` field stores a promotion ID from an external promotions application. Promotions may grant free periods and can be applied by external systems.
- The subscription charge is handled as a **fee**; final billing is generated by a separate billing system that includes this additional amount.
- `TRANSACTION_DATE` and `FLOW` are reserved for ROS Loader processing and should not be set manually.

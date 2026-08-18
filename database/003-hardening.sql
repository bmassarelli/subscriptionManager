# Oracle Schema additions for P2 hardening (RECONNECT prior-status + Client uniqueness)

-- =========================
-- SUBSCRIPTIONS: remember status before suspension
-- =========================

ALTER TABLE SUBSCRIPTION_MANAGER.SUBSCRIPTIONS
    ADD PRE_SUSPEND_STATUS VARCHAR2(2);

-- =========================
-- CLIENT: uniqueness on EMAIL and MSISDN
-- =========================

-- IMPORTANT: run this check first — if it returns any rows, dedupe those
-- clients (or decide how to reconcile them) before adding the constraints
-- below, or the ALTER TABLE statements will fail.
--
-- SELECT EMAIL, COUNT(*) FROM SUBSCRIPTION_MANAGER.CLIENT
--   GROUP BY EMAIL HAVING COUNT(*) > 1;
-- SELECT MSISDN, COUNT(*) FROM SUBSCRIPTION_MANAGER.CLIENT
--   GROUP BY MSISDN HAVING COUNT(*) > 1;

ALTER TABLE SUBSCRIPTION_MANAGER.CLIENT
    ADD CONSTRAINT UQ_CLIENT_EMAIL UNIQUE (EMAIL);

ALTER TABLE SUBSCRIPTION_MANAGER.CLIENT
    ADD CONSTRAINT UQ_CLIENT_MSISDN UNIQUE (MSISDN);

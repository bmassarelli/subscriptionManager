---
name: developing-subscription-manager
description: Use when developing in the subscriptionManager repo — starting the backend/frontend locally, writing or applying a database migration against the training Oracle DB, or wrapping up an OpenSpec change (syncing specs and archiving).
---

# Developing Subscription Manager

## Overview

Spring Boot 3 (Java 21) + React (CRA) app, backed by a hand-managed Oracle
schema (`spring.jpa.hibernate.ddl-auto=none` — JPA never creates/alters
tables). There is no migration tool (no Flyway/Liquibase) and no runner
script: every `database/*.sql` file is applied by hand, once, against the
live training DB.

## Running Locally

- Backend: create `backend/src/main/resources/application.properties`
  (gitignored — never commit it) with `spring.datasource.url/username/password`
  pointing at the training Oracle instance, then `cd backend && mvn spring-boot:run`
  (port 8080).
- Frontend: `cd frontend && npm install && npm start` (port 3000). It calls
  `http://localhost:8080/api/...` directly — no env-based base URL, no Docker.
- Tests: `mvn test` (backend) and `npm test` (frontend). Counts are tracked in
  CLAUDE.md's Running section — update that number whenever a commit changes
  the test count, it drifts otherwise.

## Database Migrations

Files live in `database/`, numbered sequentially (`001-baseline.sql`,
`002-lifecycle-actions.sql`, ...). `database/site/001-site.sql` is a separate,
easy-to-miss seed file (`PLATFORM`/`PAYMENT_MODE` catalog rows) — not
mentioned in README.md, remember it exists when seeding a fresh schema.

**Before assuming the training DB is unreachable**, actually check —
connectivity outages get fixed without anyone updating the docs:
```bash
powershell -Command "Test-NetConnection -ComputerName <host> -Port 1521"
```

**Before adding a `UNIQUE` constraint**, check for existing violators first
(follow the pattern already in `003-hardening.sql`):
```sql
SELECT <col>, COUNT(*) FROM SUBSCRIPTION_MANAGER.<table> GROUP BY <col> HAVING COUNT(*) > 1;
```

**To actually apply a `.sql` file** — there's no `sqlplus` on this machine and
no runner script. Use the backend's own `ojdbc11` dependency instead of
installing anything:
```bash
cd backend && mvn -q dependency:build-classpath -Dmdep.outputFile=../cp.txt
```
Then compile and run a throwaway `java.sql.DriverManager` program against
that classpath (one `Statement.execute()` call per DDL/DML statement — split
the file's `;`-terminated statements by hand, skip the leading `#` header
line, and use JDBC's own `CREATE OR REPLACE TRIGGER ... END;` string as one
statement, no `/` needed). Delete `cp.txt` when done — it's a local build
artifact, not something to commit. Same driver also confirms whether a
migration was already applied — query `USER_TAB_COLUMNS` / `USER_CONSTRAINTS`
/ `USER_TABLES` for the column/constraint/table name before assuming it's
missing.

After applying, smoke-test with a real request (`curl` an endpoint that
touches the new column/table), not just "the app started" — Hikari only
proves it can open a connection, not that your DDL matches what the entities
expect.

## Wrapping Up an OpenSpec Change

1. Confirm `tasks.md` has no unchecked items and
   `openspec status --change <name> --json` shows every artifact `done`.
2. **Before syncing delta specs into `openspec/specs/`, verify the delta
   against the actual shipped code — not just against the design doc.**
   Delta specs are written during planning and can go stale if an "Open
   Questions" section got resolved differently during implementation (e.g. a
   type vocabulary or an extra endpoint added later) without anyone updating
   the delta file. Check the real controller/service before trusting the
   delta as truth; fix the delta file first if it disagrees with the code.
3. Sync (new capability → new `openspec/specs/<name>/spec.md`; existing
   capability → merge ADDED/MODIFIED/REMOVED into it), then
   `openspec validate --specs --strict` — all specs must pass.
4. Move the change directory to `openspec/changes/archive/YYYY-MM-DD-<name>/`.
5. Update CLAUDE.md's structure tree, Architecture Notes, and "What's Not
   Built Yet" section — it's hand-maintained and goes stale fast; update
   README.md's column/endpoint reference too if the change touched those.

## Git Notes

- `openspec/changes/` and `openspec/specs/` are gitignored — local planning
  tooling only, never reaches the shared repo. `.claude/skills/` and
  `.claude/commands/` (this file included) **are** tracked, unlike
  `.claude/worktrees/`.
- `backend/src/main/resources/application.properties` is gitignored (real DB
  credentials). If it starts showing in `git status`, `git rm --cached` it
  rather than committing.

## Common Mistakes

- Assuming a DB connectivity issue is still open without testing the port
  again — outages get fixed silently.
- Trusting a delta spec's requirements at archive time without diffing them
  against the code that actually shipped.
- Forgetting `database/site/001-site.sql` when reasoning about what seed data
  exists.
- Leaving a generated `cp.txt` classpath file or other scratch build output
  sitting in the repo root after a manual migration run.

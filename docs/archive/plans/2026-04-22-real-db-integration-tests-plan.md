---
title: Real-DB Integration Tests for the Roster Rules Tool
type: test-infra
status: active
date: 2026-04-22
origin: Session 72 conversation (after Phase 3 merge of docs/plans/2026-04-21-feat-roster-rules-il-slots-and-fees-plan.md)
---

# Real-DB Integration Tests for the Roster Rules Tool

Scope doc for a dedicated end-to-end integration test suite that exercises the Phase 1–3 roster rules pipeline against a real Postgres database. Written at end of Session 72 to hand off to a fresh session.

## Context

The roster-rules feature shipped over 3 PRs this session:

- **PR #111** — Phase 1 foundation: schema migration, guard libs, audit script, 65 unit tests.
- **PR #113 + #114** — Phase 2a/2b: endpoints `/il-stash`, `/il-activate`, enforcement in `/claim`, `/drop`, waiver processor, commissioner PATCH. 18 integration tests (mocked Prisma).
- **PR #115** — Phase 3: `ilFeeService`, outbox drainer, period-close hook, backdate reconcile hooks, `/reconcile-il-fees` recovery endpoint. 17 unit tests for the service + 15 unit tests for the drainer (both against mocked Prisma).

**Session 72 test total: 712 server tests passing, zero failures, zero real-DB coverage.**

## Why this work matters

Unit tests stop at the mock boundary. There are six plan-documented correctness invariants that have never been exercised against real infrastructure:

| Invariant | Currently verified? | Source |
|---|---|---|
| Partial unique index on `il_fee` (`type='il_fee' AND voidedAt IS NULL`) prevents duplicate active rows | ❌ SQL hand-written in migration; never load-tested | Plan R10 / R11 |
| `pg_advisory_xact_lock` serializes concurrent reconciles for the same period | ❌ | Plan Phase 3 §D |
| Outbox → drainer → ilFeeService chain converges end-to-end | ❌ Each piece mocked in isolation | Plan Phase 3 §B |
| `assertNoOwnershipConflict` handles real Postgres timestamp semantics across backdated writes | ❌ | Plan R11 mitigation |
| Phase 1 schema migration applies cleanly to a real Postgres instance | ❌ | Plan Phase 1 deliverable |
| `Roster.assignedPosition='IL'` + real FK constraints survive god-mode cross-team reassign without orphans | ❌ | Plan Q8 + R12 |

Each is a correctness claim from the spec. If any breaks in prod, we find out by seeing wrong dollar totals in `FinanceLedger` or a corrupt roster state — not by a test failing. This test suite closes that gap.

## Scope

### Scenarios (priority order)

1. **Happy path: stash → period close → fee lands.**
   Call `POST /transactions/il-stash` with a valid MLB-IL'd player + replacement → verify `Roster`, `RosterSlotEvent`, `TransactionEvent` rows. Then PATCH the period to `completed` → wait for drainer tick → verify a new `FinanceLedger` row with `type='il_fee'`, correct `amount`, `periodId`, `playerId`.

2. **Backdate across closed period → reconcile writes void + reversal.**
   Existing `il_fee` row at $10 for period P. Backdate an IL_ACTIVATE into P that wipes the stint. Verify:
   - Original row marked `voidedAt IS NOT NULL`
   - New row inserted with `amount = -10`, `reversalOf = original.id`
   - No DELETE ever issued

3. **Partial unique index actually fires.**
   Manually `INSERT INTO "FinanceLedger"` two identical `il_fee` rows with same `(teamId, periodId, playerId)` + `voidedAt IS NULL`. Expect Postgres unique violation. Also: a voided row + active row for same key = allowed.

4. **Advisory lock serializes concurrent reconciles for same period.**
   Two concurrent `reconcileIlFeesForPeriod(leagueId, sameId)` calls from different connections. Neither crashes; both return correct counts; ledger has no duplicates. Requires two parallel Prisma clients.

5. **Cross-team reassign via backdated `/il-stash`.**
   Player X currently on Team A's roster. Commissioner backdates `/il-stash` moving X to Team B's IL. Verify:
   - Team A's Roster row has `releasedAt = effectiveDate`, `source = 'COMMISSIONER_REASSIGN'`
   - Team B has a new Roster row with `assignedPosition = 'IL'`, correct `acquiredAt`
   - `RosterSlotEvent` on Team B with correct provenance
   - `TransactionEvent` rows capture both halves
   - No orphaned windows (`assertNoOwnershipConflict` would reject a subsequent add that overlaps)

6. **Ghost-IL blocks subsequent stashes.**
   Stash X (MLB status = "Injured List 10-Day"). Flip the mocked MLB API to return "Active" for X. Attempt a second `/il-stash` on the same team → 400 GHOST_IL. Verify `listGhostIlPlayersForTeam` returns X.

7. **Position-inherit lands correctly in the Roster row.**
   Team has SS player Alpha. `/il-stash` Alpha + add Bravo (posList="2B,SS"). Verify Bravo's new Roster row has `assignedPosition = 'SS'` (Alpha's former slot), NOT Bravo's primary-position default.

### Out of scope for this plan

- Commissioner recovery endpoint rate limiter at the route layer — an attempt in Session 72 was dropped due to middleware-import cascades; belongs to Phase 4 or a fresh attempt using the real-DB app harness.
- UI/E2E flows (Phase 4 territory in the parent plan).
- Real MLB API calls — always mock `getMlbPlayerStatus` at the module boundary.
- Waiver processor real-DB coverage — valuable but separately scoped; leave for a follow-up after this foundation ships.

## Infrastructure — decision pending

### Option A: Testcontainers (RECOMMENDED)

- `@testcontainers/postgresql` spins up a throwaway Postgres container per test suite.
- `prisma migrate deploy` applies the full schema.
- Teardown on suite completion.
- Works out of the box on GitHub Actions (Docker-in-Docker supported).
- Cost: ~5–10s boot per suite file. Given we'd likely have one integration file, that's a one-time cost per CI run.

### Option B: Dedicated local test DB

- `DATABASE_URL_TEST=postgresql://.../fbst_test` env var.
- Every dev runs a local Postgres.
- Each test truncates tables between runs.
- Fastest (no container boot), but fragility risk (shared state between parallel tests).
- CI needs a `services: postgres` block in GH Actions.

### Option C: Per-test-file DB with random names

- Connect as a superuser; each test file `CREATE DATABASE fbst_test_<random>` then applies migration.
- Strongest isolation short of containers.
- ~1s per suite, but requires admin creds locally AND in CI.

**Recommendation: A.** Matches FBST's containerized production deploy (Railway → Postgres), portable to any CI, zero local setup beyond Docker. Boot cost is paid once per suite file; single file means ~10s amortized across all tests.

## Deliverables

```
server/src/__tests__/integration/
├── setup/
│   ├── testDb.ts              # Testcontainers bootstrap + prisma migrate deploy
│   ├── fixtures.ts            # League/team/player/roster/rule factories
│   ├── mlbFeed.ts             # Controllable mock for getMlbPlayerStatus
│   └── httpClient.ts          # Pre-authed supertest against the real Express app
└── rosterRules.integration.test.ts   # The 7 scenarios
```

Plus:

- `package.json` script: `npm run test:integration` (separate from unit `test:server` so CI can run in parallel).
- `.github/workflows/ci.yml` update: add an integration-test job that boots Docker and runs `test:integration`.
- (Optional) `docker-compose.test.yml` for local-dev ergonomics — Testcontainers doesn't require it but it's nice for "I want to prod the test DB by hand."

## Phased implementation

To keep PRs reviewable, recommended split:

1. **PR-1 (foundation, ~2h)**: Testcontainers harness + `setup/*` files + one happy-path test (Scenario 1). Gets the infra proven end-to-end in CI.
2. **PR-2 (correctness core, ~2h)**: Scenarios 2 (backdate + reversal), 3 (partial unique), 4 (advisory lock). The highest-value "plan claim verification" group.
3. **PR-3 (workflow scenarios, ~2h)**: Scenarios 5 (cross-team reassign), 6 (ghost-IL), 7 (position-inherit). Rounds out the feature coverage.
4. **PR-4 (CI wiring + debugging, ~1h)**: Make sure it actually runs in Railway CI, not just locally.

Total: ~7 hours across four PRs. Doable in 1–2 focused sessions.

## Open questions for the next session

1. **Confirm infrastructure choice (A/B/C).** My recommendation is A.
2. **`DATABASE_URL` in CI** — does Railway's ci.yml already have a Postgres service, or do we need to add one?
3. **Do we want to run unit and integration tests in separate Vitest configs?** Current `vitest.config.ts` globbing includes everything under `src/**/*.test.ts`. An integration-specific config lets us exclude them from fast `test:server` runs.
4. **Where does the "seeded OGBA data" scaffolding live?** Fixtures should be close enough to realistic OGBA data that tests read sensibly, but not so coupled to OGBA that they drift when we support other leagues.

## Non-goals

- Backfill integration tests for pre-Phase-3 code (the Phase 1 Explore agent already surfaced latent bugs from the pure audit of what was untested; nothing else has surfaced).
- Performance/load testing (separate spec).
- Mocking the OutboxEvent drainer — in these tests the drainer is REAL and we want it ticking against a real `OutboxEvent` table; that's the whole point.

## References

- Parent plan: `docs/plans/2026-04-21-feat-roster-rules-il-slots-and-fees-plan.md`
- Phase 3 commits: `20b479e` (feature), `6733d01` (merge PR #115)
- Session 72 FEEDBACK entry in `FEEDBACK.md` captures the PR history that precedes this test work.
- Testcontainers for Node.js: https://node.testcontainers.org/
- Vitest integration with Testcontainers patterns: https://node.testcontainers.org/supported-container-databases/postgres/

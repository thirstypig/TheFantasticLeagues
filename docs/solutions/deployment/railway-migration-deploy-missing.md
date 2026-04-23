---
title: "Railway deploy pipeline silently skipped Prisma migrations for 5+ weeks"
category: deployment
tags:
  - railway
  - prisma
  - migrations
  - supabase
  - deploy-config
  - schema-drift
  - il-stash
module: infrastructure
symptom: "Code deployed to production referenced Prisma models (RosterSlotEvent, OutboxEvent, FinanceLedger.periodId) that did not exist in the database. Every /transactions/il-stash request would 500 with 'relation \"public.RosterSlotEvent\" does not exist' once it got past the guard checks."
root_cause: "railway.json startCommand was 'npm start' with no prior 'prisma migrate deploy'. Every deploy since the Render → Railway migration (Session 51, ~2026-03-21) silently advanced the Prisma client types while the live DB schema stayed frozen at migration 20260320000000_add_trade_block_player_ids. Two later migrations (add_user_session_tracking, roster_rules_foundation) shipped in merged PRs but were never applied."
severity: critical
date_resolved: 2026-04-22
session: 74
---

# Railway deploy pipeline silently skipped Prisma migrations for 5+ weeks

## Symptom

Discovered during a browser walkthrough of PR #117 (roster-rules Phase 4 UI). Attempting to stash Mookie Betts via `POST /api/transactions/il-stash` returned:

```json
{
  "error": "Internal Server Error",
  "detail": "Invalid `tx.rosterSlotEvent.create()` invocation ... The table `public.RosterSlotEvent` does not exist in the current database."
}
```

This happened only **after** a separate predicate bug (PR #118) was fixed — before that, every request was rejected earlier by the `isMlbIlStatus` guard, which masked the underlying schema gap. Two bugs were stacked on top of each other; fixing the predicate exposed the migration gap.

## Investigation

1. `npx prisma migrate status` against the Supabase URL:
    ```
    16 migrations found in prisma/migrations
    Following migrations have not yet been applied:
      20260413200000_add_user_session_tracking
      20260421000000_roster_rules_foundation
    ```

2. Queried `_prisma_migrations`: latest applied was `20260320000000_add_trade_block_player_ids` on 2026-03-21 — exactly matching the Render → Railway migration date in session notes.

3. Read `railway.json`:
    ```json
    "deploy": { "startCommand": "npm start", ... }
    ```
    No `migrate deploy` step anywhere. The build phase runs `prisma generate` (Prisma client types) but that doesn't touch the DB.

4. Verified the missing schema:
    - `RosterSlotEvent`, `OutboxEvent` tables did not exist.
    - `FinanceLedger` had 6 original columns; the 5 nullable additions (`periodId`, `playerId`, `voidedAt`, `reversalOf`, `createdBy`) were missing.
    - `LeagueRule` had no `il.slot_count=2` rows for any league (the idempotent backfill had never run).

5. Partial finding: the `UserSession` / `UserMetrics` / `UserDeletionLog` tables *did* exist with the right columns and indexes. The `add_user_session_tracking` migration had been applied out-of-band (likely via `prisma db push` or direct SQL from a local session) without being recorded in `_prisma_migrations`. That's why `migrate deploy` initially failed with `relation "UserSession" already exists`.

## Fix

### Immediate (unstall the DB)

1. `npx prisma migrate resolve --applied 20260413200000_add_user_session_tracking` — mark the out-of-band migration as applied so `migrate deploy` skips it.
2. `npx prisma migrate deploy` — applies `20260421000000_roster_rules_foundation`.
3. Verify: new tables exist, `FinanceLedger` has the 5 new columns, `LeagueRule` has `il.slot_count=2` for every league.
4. Re-run the originally-failing `POST /api/transactions/il-stash`: returns `{"success":true,...}`, creates a `RosterSlotEvent` row with `mlbStatusSnapshot` capturing the live MLB status at stash time.

### Structural (prevent recurrence)

Change `railway.json` startCommand so every deploy runs `migrate deploy` before starting the server:

```json
"startCommand": "cd server && npx prisma migrate deploy --schema ../prisma/schema.prisma && cd .. && npm start"
```

Why startCommand (not build):
- Build boxes don't always have DB access.
- A failed build wouldn't produce a deployable artifact; a failed startCommand keeps the last healthy version running while the new one fails its health check.
- startCommand is serialized per deploy — no risk of two builds racing to apply the same migration.

## Lessons

1. **Platform migrations change the invariants the codebase assumes.** The Render era had a preDeploy hook that ran migrations. That invariant died when `render.yaml` was deleted in Session 51, and nothing else asserted "migrations run automatically on deploy." Code merged against Prisma's type system kept assuming schema evolution was happening. Audit every implicit pre/post-deploy hook when switching platforms.

2. **Out-of-band schema changes poison `migrate deploy` for everyone later.** The `UserSession` migration was applied via some other mechanism (likely `prisma db push` during development) and never recorded. That's invisible until the next `migrate deploy` hits a `relation already exists` error. Lesson: **only use `prisma migrate dev` / `prisma migrate deploy` on databases that are meant to be tracked**. Don't reach for `db push` against a shared Supabase DB.

3. **Two latent bugs in the same code path can hide each other.** The `isMlbIlStatus` predicate bug (PR #118) was rejecting all stashes at the guard layer, so the stash flow *never executed* `rosterSlotEvent.create()` and the missing table was invisible. Discovering this required fixing the predicate first, which immediately exposed the next layer. When a fix stops reproducing a failure, continue testing — the fix may have exposed a new bug rather than resolved the only one.

4. **Unit tests missed both.** The server tests mocked the Prisma client entirely, so no test ever exercised the real DB schema. Integration tests against a real Postgres would have caught the schema gap; live-MLB-API tests would have caught the predicate gap. Both are called out in `docs/plans/2026-04-22-real-db-integration-tests-plan.md` as future work — this incident is the justification to prioritize that plan.

## Detection query

To check whether a Prisma-tracked database is behind the checked-in migrations:

```sh
cd server && npx prisma migrate status --schema ../prisma/schema.prisma
```

Non-zero exit → pending migrations. Add this to a pre-release checklist.

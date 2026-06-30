---
title: "Prisma P3009 freeze — bare CREATE TYPE/TABLE fails with PG 42710 'already exists' and blocks every deploy"
date: 2026-06-29
type: deployment-failure
module: migrations
symptom: "All Railway deploys silently failed for 8 days; prod served a stale image because the ClaimStatus enum migration was a bare CREATE TYPE that errored PG 42710 'already exists', leaving finished_at=null in _prisma_migrations and triggering P3009 on every boot"
severity: critical
impact_scope:
  - 8 consecutive Railway deploys FAILED (2026-06-21 → 2026-06-29); prod frozen on the 2026-06-21 image
  - None of Phase 1 (draft) / Phase 2 (multisport) / Phase 3 (scoring) / Week 2 (standings) reached prod despite being marked "ready to deploy / shipped"
  - No data corruption; the enum + table the migrations targeted already existed
  - Went undetected for 8 days — no deploy-failure alerting
root_cause: "Migration 20260311000000_create_claim_status_enum is a bare `CREATE TYPE \"ClaimStatus\" AS ENUM (...)`. The enum already existed in prod (created out-of-band via an earlier db push — it even carried an extra CANCELLED label and was already in use by WaiverClaim.status). CREATE TYPE failed with PG error 42710 'type already exists' on the first deploy attempt, recording the migration with finished_at=null, rolled_back_at=null, applied_steps_count=0. P3009 then aborts `prisma migrate deploy` on every subsequent Railway boot."
tags:
  - prisma
  - p3009
  - railway
  - postgres
  - migration-failure
  - create-type
  - create-table
  - pg-42710
  - finished-at-null
  - prisma-migrate-resolve
  - supabase
  - deploy-alerting
related:
  - railway-prisma-concurrent-index-p3009-block.md
  - railway-migration-deploy-missing.md
  - prisma-client-stale-after-migration.md
---

# Prisma P3009 freeze — bare CREATE TYPE/TABLE "already exists"

## Symptom

- Production was serving a **stale build** (last good deploy 2026-06-21 11:57). Eight consecutive Railway deploys since then showed **FAILED**, while GitHub Docker builds looked fine.
- Railway boot logs (`railway logs --deployment <id>`) repeated:
  ```
  Error: P3009
  migrate found failed migrations in the target database, new migrations will not be applied.
  The `20260311000000_create_claim_status_enum` migration started at 2026-06-22 22:08:26 UTC failed
  ```
- Nobody noticed for 8 days — there is no deploy-failure alert, and several features were recorded as "shipped" when they had never actually deployed.

## Investigation

1. `railway deployment list` → last `SUCCESS` was 2026-06-21; everything after = `FAILED`.
2. `railway logs --deployment <latest-failed>` → **P3009**, naming the ClaimStatus enum migration.
3. Read the migration — it's a one-liner: `CREATE TYPE "ClaimStatus" AS ENUM (...)` (no `IF NOT EXISTS`; Postgres has no `IF NOT EXISTS` for `CREATE TYPE` anyway).
4. Queried prod (read-only) for the actual state:
   ```sql
   -- enum already present, with MORE labels than the migration defines:
   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='ClaimStatus';
   -- PENDING, SUCCESS, FAILED_OUTBID, FAILED_INVALID, CANCELLED, FAILED_CONDITION

   SELECT migration_name, finished_at, rolled_back_at, applied_steps_count, logs
   FROM _prisma_migrations WHERE migration_name='20260311000000_create_claim_status_enum';
   -- finished_at=NULL, rolled_back_at=NULL, applied_steps_count=0
   -- logs: 'Database error code: 42710 ... type "ClaimStatus" already exists'

   SELECT table_name, column_name FROM information_schema.columns WHERE udt_name='ClaimStatus';
   -- WaiverClaim.status  → the enum is already in use
   ```
5. Enumerated all migration rows to size the blast radius:
   - `create_claim_status_enum` — failed, **`rolled_back_at` NULL → the single active blocker.**
   - `add_player_values`, `add_user_session_tracking`, `add_snake_draft_tables` — each had a failed row **with `rolled_back_at` set** + a successful row → Prisma ignores rolled-back rows, **not blocking.**
   - `baseline_transaction_event` (20260420) — **0 rows**, but its SQL is `CREATE TABLE IF NOT EXISTS` (idempotent) and `TransactionEvent` already exists in prod.

**Key distinction:** a failed migration only triggers P3009 when `finished_at IS NULL AND rolled_back_at IS NULL`. Failed-then-rolled-back duplicate rows are harmless noise.

## Root cause

The migration was authored to `CREATE TYPE "ClaimStatus"` for an enum that **already existed** (created out-of-band by an earlier `db push`/manual change — it even had the extra `CANCELLED` label and a live column dependency). On the first deploy that reached it, `CREATE TYPE` failed with **PG 42710 "type already exists"**. Prisma recorded the failure (`finished_at=null`) and, per P3009, refused to run any migration on every subsequent boot — freezing deploys indefinitely. The intended end-state (the enum) was already present, so nothing actually needed to change in the schema; only Prisma's bookkeeping was wrong.

This is the **flip side** of [`railway-prisma-concurrent-index-p3009-block.md`](railway-prisma-concurrent-index-p3009-block.md): there, P3009 came from `CREATE INDEX CONCURRENTLY` (error 25001) inside Prisma's per-migration transaction. Same freeze symptom, different SQL trigger; same recovery family (`migrate resolve`). The "out-of-band schema change poisons migrate deploy with already-exists" pattern also appears in [`railway-migration-deploy-missing.md`](railway-migration-deploy-missing.md).

## Solution (recovery)

Bookkeeping-only — no data or schema change. Point Prisma at prod first (prod DB URL lives **only** in Railway env; the local `.env` no longer points at prod):

```bash
cd thefantasticleagues-app
VARS="$(env -u RAILWAY_API_TOKEN railway variables --kv)"
export DATABASE_URL="$(printf '%s\n' "$VARS" | grep '^DATABASE_URL=' | cut -d= -f2-)"
export DIRECT_URL="$(printf '%s\n' "$VARS" | grep '^DIRECT_URL=' | cut -d= -f2-)"

cd server
# 1. Mark the failed migration applied — the enum already exists, so DON'T
#    re-run it (--rolled-back would re-execute CREATE TYPE → 42710 again).
npx prisma migrate resolve --applied 20260311000000_create_claim_status_enum --schema ../prisma/schema.prisma
# 2. Record the 0-row idempotent baseline as applied (table already exists).
npx prisma migrate resolve --applied 20260420000000_baseline_transaction_event --schema ../prisma/schema.prisma
# 3. Confirm.
npx prisma migrate status --schema ../prisma/schema.prisma   # → "Database schema is up to date!"
```

Then redeploy:

```bash
env -u RAILWAY_API_TOKEN railway redeploy --yes
```

**Verification (observed):** boot log printed `No pending migrations to apply.`, the server bound port 4010 (HTTP + HTTPS, WebSockets, outbox drainer), and `curl https://app.thefantasticleagues.com/api/health` → **HTTP 200**. Prod unfroze on the current `main`.

> `--applied` vs `--rolled-back`: use **`--applied`** when the object the migration creates **already exists** (the desired state is in place). Use `--rolled-back` only when the migration's changes are NOT present and you want Prisma to re-run it — which would just fail again here.

## Prevention

1. **Never author a bare `CREATE TYPE`/`CREATE TABLE` for an object that may already exist.** For tables/indexes use `IF NOT EXISTS`. Postgres has no `IF NOT EXISTS` for `CREATE TYPE` — guard it in a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` block, or generate the migration from the schema instead of hand-writing it. Out-of-band `db push`/manual DDL is what creates the drift that poisons later migrations.
2. **Add deploy-failure alerting.** This froze prod for 8 days unnoticed. A Railway deploy-failure notification (or a post-merge `railway deployment list` check that the newest row is `SUCCESS`, per the [prod-build verification rule](supabase-railway-ipv6-pooler-and-pool-exhaustion.md)) would have caught it same-day.
3. **"Ready to deploy" ≠ deployed.** Memories/changelogs claimed Phase 1/2/3 shipped; they never reached prod. Confirm with `railway deployment list` (newest `SUCCESS` commit) before recording a feature as live.
4. **Triage P3009 by the right predicate.** Only rows with `finished_at IS NULL AND rolled_back_at IS NULL` block deploys. Don't waste time on failed-then-rolled-back duplicates.

### Diagnosis recipe (reusable)

```bash
env -u RAILWAY_API_TOKEN railway deployment list          # spot FAILED runs + last SUCCESS
env -u RAILWAY_API_TOKEN railway logs --deployment <id>   # find P3009 + the offending migration
# then, against prod:
#   SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
#   -> these are the true blockers; resolve each with migrate resolve --applied|--rolled-back
```

## Related

- [`railway-prisma-concurrent-index-p3009-block.md`](railway-prisma-concurrent-index-p3009-block.md) — the other P3009 trigger (`CREATE INDEX CONCURRENTLY`, error 25001). Same freeze, recovery family.
- [`railway-migration-deploy-missing.md`](railway-migration-deploy-missing.md) — out-of-band schema changes poisoning `migrate deploy`; the deploy pipeline silently skipping migrations.
- [`prisma-client-stale-after-migration.md`](../runtime-errors/prisma-client-stale-after-migration.md) — `npx prisma generate` needed after a migration applies.

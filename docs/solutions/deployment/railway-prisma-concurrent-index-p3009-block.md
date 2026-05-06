---
title: "Prisma migrate deploy blocks all Railway deploys when CREATE INDEX CONCURRENTLY fails inside transaction"
date: 2026-05-05
type: deployment-failure
module: migrations
symptom: "Production frozen 21h at yesterday's build; 5 consecutive Railway deploys failed healthcheck despite green Docker builds"
severity: high
impact_scope:
  - All 6 merges to main (PRs #244–#249) failed to deploy to app.thefantasticleagues.com
  - Railway healthcheck at /api/health timed out because server never bound port
  - Every subsequent migrate deploy blocked by P3009 until failed row cleared
  - No data corruption; neither target index was created
root_cause: "Migration 20260504000000_ai_history_indexes used CREATE INDEX CONCURRENTLY; Prisma migrate deploy wraps each migration in a transaction, and Postgres rejects CONCURRENTLY inside transactions with error 25001. First failure marked the migration failed (applied_steps_count=0), and P3009 blocked all later boots."
tags:
  - prisma
  - migrate-deploy
  - railway
  - postgres
  - create-index-concurrently
  - p3009
  - error-25001
  - healthcheck-timeout
  - failed-migration-recovery
  - supabase
---

# Prisma migrate deploy blocks all Railway deploys when CREATE INDEX CONCURRENTLY fails inside transaction

## Problem statement

Production at app.thefantasticleagues.com (Railway-hosted FBST) was frozen at yesterday's build for 21 hours. Six PRs merged to main throughout 2026-05-05; none of them appeared at the prod URL. The first surface signal was a user reporting "/season looks like it hasn't been merged" after expecting today's UX changes to be live.

Build hash `index-BnMmV7L9.js` from May 4 23:24 UTC kept serving while Railway silently FAILED every subsequent deploy. Five PRs from the day's session (#244–#248) all merged but their deploys all hit the same wall.

## Root cause

A migration committed yesterday used `CREATE INDEX CONCURRENTLY`, which Postgres refuses to run inside a transaction block (error 25001). Prisma's `migrate deploy` wraps every migration in a transaction, so the first statement failed on the first deploy attempt and Prisma marked the migration as failed-in-flight:

- `_prisma_migrations.applied_steps_count = 0`
- `finished_at IS NULL`, `rolled_back_at IS NULL`
- Neither target index present in `pg_indexes`

Once a migration is in that failed state, every subsequent boot trips P3009:

```
Error: P3009 — migrate found failed migrations in the target
database, new migrations will not be applied
```

Railway's `startCommand` (per `railway.json`) runs `prisma migrate deploy && <server>`. The migrate command exits non-zero before the server binds the port. Railway's `/api/health` check times out at 30s and marks the deploy FAILED, holding the previous successful build live.

The contradiction at the policy layer: CLAUDE.md's "Migrations" section *recommends* `CONCURRENTLY` for hot tables — directly opposite Prisma's transactional invariant for `migrate deploy`. The migration author followed the documented policy and shipped a poison pill.

## Investigation

```bash
# 1. Confirm prod is stale
curl -sI https://app.thefantasticleagues.com/
# last-modified: Mon, 04 May 2026 23:24:24 GMT  (yesterday)

# 2. Find the Railway service (link can't infer from project alone)
railway list
# + GraphQL to resolve service name "The Fantastic Leagues - App"

# 3. See the failure pattern
railway deployment list --limit 5 --json
# 5 consecutive FAILED entries, one per merged PR

# 4. Build phase OK, healthcheck phase fails at 30s
railway logs --build <latest-deployment-id>
# "1/1 replicas never became healthy! Healthcheck failed!"

# 5. Runtime logs surface the actual error
railway logs --deployment <id>
# → P3009, migration 20260504000000_ai_history_indexes
# → Database error code: 25001
# → CREATE INDEX CONCURRENTLY cannot run inside a transaction block

# 6. Read the offending SQL — confirms CONCURRENTLY on AiInsight + Trade

# 7. Confirm DB state directly
SELECT migration_name, applied_steps_count, finished_at, rolled_back_at
  FROM "_prisma_migrations"
  WHERE migration_name = '20260504000000_ai_history_indexes';
SELECT indexname FROM pg_indexes
  WHERE indexname IN ('AiInsight_leagueId_createdAt_idx',
                      'Trade_leagueId_createdAt_idx');
```

## Working solution

Rewrite the migration without `CONCURRENTLY`. AiInsight and Trade are not on CLAUDE.md's high-write list (Roster, PlayerStatsPeriod, TransactionEvent are the only tables that genuinely need concurrent index builds); AiInsight is explicitly low-write, and OGBA's Trade volume is a few rows per week. A brief table lock at index-build time is acceptable.

```sql
-- prisma/migrations/20260504000000_ai_history_indexes/migration.sql

-- Before
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AiInsight_leagueId_createdAt_idx"
  ON "AiInsight" ("leagueId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Trade_leagueId_createdAt_idx"
  ON "Trade" ("leagueId", "createdAt" DESC);

-- After
CREATE INDEX IF NOT EXISTS "AiInsight_leagueId_createdAt_idx"
  ON "AiInsight" ("leagueId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Trade_leagueId_createdAt_idx"
  ON "Trade" ("leagueId", "createdAt" DESC);
```

Then clear the failed migration row from `_prisma_migrations`. Safe because `applied_steps_count = 0` means nothing was actually applied — Prisma will re-attempt on next boot:

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260504000000_ai_history_indexes'
  AND finished_at IS NULL
  AND applied_steps_count = 0;
```

Push, merge, Railway redeploys. `migrate deploy` runs the rewritten migration cleanly inside its transaction, the server binds the port, `/api/health` returns 200, and the five queued PRs flush through on the next deploy.

Verified by re-checking `last-modified` (now today's 21:14 UTC) and confirming UX changes from all 6 merged PRs are live.

### Escape hatch: when CONCURRENTLY is genuinely needed

If a future migration genuinely requires `CONCURRENTLY` (high-write table, can't tolerate a ShareLock), use **one** of these patterns:

**A. Prisma 5.7+ `migration.toml` flag:**

```toml
# prisma/migrations/<timestamp>_<name>/migration.toml
[migration]
transaction = false
```

Prisma honors this and runs the file outside a transaction.

**B. Two-step out-of-band pattern (for older Prisma or extra control):**
1. Author the migration as a no-op marker: `-- index created out-of-band, see runbook`
2. Apply the index manually against prod: `CREATE INDEX CONCURRENTLY ...`
3. Mark the migration applied: `prisma migrate resolve --applied <name>`
4. Commit the marker; deploy proceeds normally

## Prevention

### 1. CI / pre-commit guardrails

**A. Grep gate (cheap, ship today).** Required CI check on every PR:

```yaml
# .github/workflows/ci.yml
- name: Reject CONCURRENTLY in Prisma migrations
  run: |
    if git grep -nIE 'CONCURRENTLY' -- 'prisma/migrations/**/*.sql'; then
      echo "::error::CONCURRENTLY cannot run inside Prisma's migration transaction."
      echo "Use the two-step pattern (see CLAUDE.md > Migration policy)."
      exit 1
    fi
```

Also reject other transaction-incompatible statements: `VACUUM`, `REINDEX … CONCURRENTLY`, `ALTER SYSTEM`, `CREATE DATABASE`, `CREATE SUBSCRIPTION`.

**B. Ephemeral-DB migrate-deploy check (catches the real failure mode).** Spin up a Postgres service container in CI, seed from a prod schema dump, run `prisma migrate deploy`. This reproduces the exact transactional wrapping `migrate deploy` uses — the grep is belt, this is suspenders.

```yaml
services:
  pg: { image: postgres:16, env: { POSTGRES_PASSWORD: x } }
steps:
  - run: psql ... < prisma/baseline.sql
  - run: npx prisma migrate deploy
```

Make both required in branch protection on `main`.

### 2. CLAUDE.md policy correction

Replace the current "use CONCURRENTLY for hot tables" text with:

> **CONCURRENTLY is forbidden inside Prisma migration files.** `prisma migrate deploy` wraps every migration in a single transaction; CONCURRENTLY aborts and leaves the migration failed-in-flight (P3009), freezing all future deploys.
>
> **Default:** plain `CREATE INDEX`. Acceptable for any table under ~1M rows or write rate <50/s. This covers every table in this repo today.
>
> **Two-step pattern (only when truly needed):**
> 1. Author migration as a no-op marker: `-- index created out-of-band, see runbook`
> 2. Apply the index manually against prod: `CREATE INDEX CONCURRENTLY ...`
> 3. Mark the marker migration applied: `prisma migrate resolve --applied <name>`
> 4. Commit the marker; deploy proceeds normally
>
> **Tables that genuinely warrant two-step today:** none. Revisit when `RosterMove`, `LineupSlot`, or `Transaction` exceed 1M rows (currently <50k each).

### 3. Deploy-chain staleness signal

Three layers, in priority order:

1. **Railway deploy webhook → Slack** on `deployment.failed` and `deployment.crashed`. Two consecutive failures pages. Free, 10 minutes to wire.
2. **Cron healthcheck** (GitHub Action, every 15 min): fetch `https://app.thefantasticleagues.com/api/health` (add a `version: GIT_SHA` field), compare to `git rev-parse origin/main`. If diverged >2 h with no open `[skip deploy]` PR, post to Slack.
3. **Railway deploy-success dashboard** — Railway's built-in metrics panel, threshold alert at <90% rolling 7-day.

The cron healthcheck would have caught this in 15 min instead of 21 h — single highest-value addition.

### 4. Recovery runbook (P3009 from CONCURRENTLY)

When `prisma migrate deploy` reports failed-in-flight, connect via Supabase pooler (`psql $DIRECT_URL`):

**Step 1 — diagnose:**
```sql
SELECT migration_name, started_at, finished_at, applied_steps_count, logs
  FROM _prisma_migrations WHERE finished_at IS NULL;
SELECT indexname FROM pg_indexes WHERE tablename = '<target>';
```

**Step 2 — choose path based on `applied_steps_count`:**

| State | Action | Rationale |
|---|---|---|
| `applied_steps_count = 0`, no index exists | `prisma migrate resolve --rolled-back <name>` (or `DELETE` the row) | Nothing happened; let next deploy retry. Fix the migration to plain `CREATE INDEX` **before** redeploy. |
| Index *does* exist (created manually or partially) | Apply remaining manually, then `prisma migrate resolve --applied <name>` | Avoids re-running broken SQL. |
| Partially applied multi-statement migration | `DELETE FROM _prisma_migrations WHERE migration_name='<name>'`, manually reconcile schema, then `--applied` | Last resort; document the audit gap in the PR. |

**Never** use `--applied` when the index doesn't exist — Prisma will skip it forever and prod schema will silently drift from migrations.

**Step 3 — verify:** `prisma migrate status` should report "Database schema is up to date." Then trigger a Railway redeploy.

## Related documentation

**Memory (foundational + just-saved)**

- `feedback_prisma_migrate_concurrently.md` — Direct origin entry; establishes the rule that `CREATE INDEX CONCURRENTLY` cannot live in `prisma/migrations/*/migration.sql`.
- `deploy_host.md` — Documents the PR #119 / session 74 change that made Railway run `prisma migrate deploy` on boot — the very mechanism that this stuck migration weaponized to freeze prod for 21 hours.

**CLAUDE.md (the contradiction)**

- "Migrations" section currently recommends `CREATE INDEX CONCURRENTLY` for hot tables (Roster, PlayerStatsPeriod, TransactionEvent). That guidance is the foot-gun this incident contradicts; the section needs the "...never inside a Prisma migration" caveat per the policy correction above.

**Solutions library (deployment)**

- `docs/solutions/deployment/railway-migration-deploy-missing.md` — Session 74 / PR #119: the prior Railway+Prisma incident (migrations *never ran* for 5 weeks). Companion to today's incident (migrations *can't* run). Same blast radius, opposite cause.
- `docs/solutions/deployment/silent-railway-build-failures-vite-tsc-gap.md` — Pattern precedent for "Railway deploy fails silently, prod serves stale bundle hash." Same diagnostic surface (stale `last-modified`) that surfaced today's bug.

**Runbooks**

- `docs/runbooks/auto_resolve_slots_rollback.md` — Canonical rollback-runbook template referenced by CLAUDE.md.

**Today's session PRs**

- #244 Prisma regen wakes ghost-IL chip
- #245 MyTeamToday IL filter + team totals
- #246 /my-team race-condition fix
- #247 Cancelled-trade collapse on activity history
- #248 Compound doc — Prisma stale client (sister incident)
- #249 This fix (CONCURRENTLY removal + recovery)

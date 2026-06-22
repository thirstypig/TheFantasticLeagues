# Database Operations

## Schema & Migrations

- **Schema** at `prisma/schema.prisma`
- **Never run migrations without explicit confirmation**
- **Key models**: Franchise, FranchiseMembership, User, UserProfile, League, LeagueMembership, LeagueInvite, Team, Player, Roster, Period, TeamStatsPeriod, TeamStatsSeason, Trade, WaiverClaim, WaiverPeriod, WaiverAddEntry, WaiverDropEntry, AuctionLot, AuctionBid, AuctionSession, AiInsight, TransactionEvent, HistoricalSeason, HistoricalStanding, HistoricalPlayerStat, ChatMessage, PushSubscription, NotificationPreference, Matchup

## Critical Special Columns

- **`Player.posGames Json?`** — per-position games-played map populated daily by `syncPositionEligibility` from the MLB Stats API fielding group. Null until first cron run. Used by hub GP chips and position eligibility logic via `buildGamesByPos` in `teamService.ts`.
- **`Team.rosterVersion Int @default(0)`** — monotonic counter incremented on every roster-mutating transaction (claim, drop, IL stash/activate, slot swap). Used by the hub client for optimistic-concurrency (`If-Match` header, 409 on stale write). See `server/src/features/teams/lib/rosterVersionGuard.ts`.
- **`AiInsight`** — persisted AI-generated analyses (type: "weekly" for team insights, "league_digest" for home page digest; deduped by weekKey)
- **`Trade.aiAnalysis`** — JSON, auto-generated post-trade analysis (fire-and-forget on processing)
- **`WaiverClaim.aiAnalysis`** — JSON, auto-generated post-waiver analysis (fire-and-forget on processing)
- **`AuctionSession.state.draftReport`** — JSON, persisted Draft Report (generated once, survives restarts)

## Migration Best Practices

### Unique Timestamps Required
Prisma applies migrations in lexicographic directory-name order. Two migrations sharing the same timestamp prefix work today via name disambiguation but become non-deterministic if a third lands. Use `20260430000000` then `20260430000001` for same-day migrations.

### CONCURRENTLY Forbidden
**`CONCURRENTLY` is forbidden inside Prisma migration files.** `prisma migrate deploy` wraps every migration in a single transaction; `CREATE INDEX CONCURRENTLY` aborts with Postgres error 25001 and leaves the migration failed-in-flight (P3009), freezing all future deploys. Default to plain `CREATE INDEX IF NOT EXISTS` — acceptable for any table under ~1M rows or write rate <50/s, which covers every table in this repo today. CI greps `prisma/migrations/**/*.sql` for `CONCURRENTLY` and fails the build. For the rare genuine high-write case, use the two-step out-of-band pattern documented in `docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md` (no-op marker migration + manual `CREATE INDEX CONCURRENTLY` in prod + `prisma migrate resolve --applied`).

### Idempotency Guards
Use `IF EXISTS` / `IF NOT EXISTS` guards on all operations so migrations are idempotent. Destructive migrations need a rollback runbook at `docs/runbooks/<migration_name>_rollback.md` documenting the recovery SQL.

### Two-Phase Column Drop
When a migration removes a column or deletes rows that an older deployed container still reads, ship in two PRs: (1) remove every read site in code, then (2) merge the schema change. Railway's blue-green overlap (~10–30s) means the OLD container can serve traffic against the NEW DB; if it still selects a dropped column, every query 500s.

### Baseline Migrations
If a table was created via `prisma db push` against shared Supabase before migrations were canonical, add a backfill `CREATE TABLE IF NOT EXISTS` migration dated BEFORE the first migration that references it. Guards make it a no-op against prod and let `prisma migrate deploy` succeed end-to-end on a fresh DB.

### Auto-Resolve & Roster Rules
**`ENFORCE_ROSTER_RULES=true` triggers unconditional auto-resolve** as of 2026-04-30 (PR #180). The per-league `LeagueRule(transactions.auto_resolve_slots)` was retired — auto-resolve is no longer toggleable per league.

### Pre-Marked Migrations
**`migrate resolve --applied` marks the migration row but does NOT execute the DDL.** If you use it to pre-mark a migration (e.g. for columns already applied manually), verify the column physically exists before deploying code that references it. `prisma migrate status` shows "up to date" whether the DDL ran or not. After deploy, `prisma generate` will make the client SELECT the new column — if the column is absent, every query using it 500s.

## Daily Cron Jobs (server/src/index.ts)

### 12:00 UTC (~5 AM PT): `syncAllPlayers()`
Roster sync for all 30 MLB teams, followed by `syncPositionEligibility(season, 3)` which applies OGBA's three-layer position eligibility and writes `Player.posGames`:

1. **Rule 1** — current season ≥3 GP at a position → eligible
2. **Rule 2** — prior season ≥20 GP at a position → eligible (additive with Rule 1; PR #124). Fail-closed on prior-season MLB API error; prior fetch uses 30-day TTL. Derived-IDs (≥1M) filtered to avoid 404s.
3. **Rule 3** — rookies / minors → primary position only

Global threshold; per-league future. `posGames` uses key-order-normalized `JSON.stringify` for change detection to avoid ~1000 no-op DB writes/day.

**CRITICAL**: `syncAllPlayers()` updates `Player.posPrimary` and `Player.mlbTeam` but **preserves enriched `Player.posList`** — it only overwrites `posList` if the existing value is just the primary position (not enriched by current or prior-season fielding stats). This prevents the daily sync from wiping multi-position eligibility data produced by `syncPositionEligibility`.

### 13:00 UTC (~6 AM PT): `syncAllActivePeriods()`
Player stats sync for active scoring periods. Populates `PlayerStatsPeriod` (PSP). Once PSP rows exist, `computeTeamStatsFromDb` routes via **hybrid attribution (PR #394)**: boundary-aligned players use `computeWithPeriodStats` (end-of-period owner gets full PSP row); players acquired or released strictly mid-period (UTC calendar-date comparison) are windowed through `computeWithDailyStats` automatically. No manual path switching needed. See ADR-013 + ADR-014.

### 14:00 UTC (~7 AM PT): Stats Integrity Reconciliation (ADR-014)
Re-fetches each recently closed period (≤5 days post-close) from the MLB API through the same fetch/parse path as the syncer, diffs against stored `PlayerStatsPeriod`, auto-heals drift via `syncPeriodStats`, and pushes an `ERR-recon-p{id}` admin error on persistent drift. Manual: `POST /api/admin/reconcile-period {periodId?}`. Boundary edits to long-closed periods still require a manual `POST /api/admin/sync-stats {periodId}`.

### Every 5 min: Wire List Auto-Lock
Flips PENDING `WaiverPeriod` rows past their `deadlineAt` to LOCKED so owners can no longer mutate Add/Drop entries. Advisory-locked (`pg_try_advisory_lock(0x57495245)`) for multi-instance safety. Commissioner still finalizes manually.

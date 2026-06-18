# Staging Environment

> **Admin-only reference** · Last updated: June 2026 · Phase 0

A fully isolated copy of the TFL app running against a separate Supabase project.
Use staging to test new features, multi-sport scaffolding, and draft flows without
touching live OGBA data.

---

## Overview

**What staging is for:**
- Test new leagues, drafts, and scoring rules without touching prod data
- Create NFL and NBA league fixtures before the live stats pipelines are wired
- Tear down and re-seed at any time — one command, no prod risk
- A future CI step can seed staging automatically on PR merges to main

> **Important:** Local `.env` still points to **prod** Supabase. Any write from
> `localhost` without swapping the URL hits production. Always use `.env.staging`
> explicitly when running seed or migration commands against staging.

---

## Access & Setup

### 1 · Create the Supabase staging project

1. Log into **supabase.com** → New Project → name it `tfl-staging`
2. Under **Settings → Database**, copy the *Transaction pooler* connection string (port 6543)
3. Append `?connection_limit=1` to the URL — the free-tier pooler requires this
   (IPv6 direct connection is disabled on free plans; see Supabase Railway DB URL memory)

### 2 · Populate .env.staging

Copy `.env.staging.template` (committed to repo) to `.env.staging` (gitignored) and fill in
the values from your staging Supabase project:

```bash
cp .env.staging.template .env.staging
# Edit .env.staging — replace every <...> placeholder with real values
```

### 3 · Apply migrations to staging DB

```bash
# From repo root — applies all pending Prisma migrations to staging
DATABASE_URL=$(grep ^DATABASE_URL .env.staging | cut -d= -f2-) \
DIRECT_URL=$(grep ^DIRECT_URL .env.staging | cut -d= -f2-) \
  npx prisma migrate deploy --schema ./prisma/schema.prisma
```

After this you should see `All migrations have been successfully applied`.
The schema is now in sync with prod but the database is empty — proceed to Seed & Reset.

---

## Seed & Reset

The seed script (`scripts/seed-staging.ts`) creates a complete test environment:
league, teams, owners, and live player data pulled from the MLB Stats API.
It is idempotent — safe to run multiple times.

### One-command seed

```bash
# Full seed (MLB, all active players + current season stats)
npm run seed:staging

# Reset + re-seed (destructive — clears all staging data first)
npm run seed:staging -- --reset

# Seed a specific sport only (Phase 2+)
npm run seed:staging -- --sport mlb
```

### What the seed script creates

| Resource | Count | Source |
|---|---|---|
| League | 1 (OGBA-Staging) | Hardcoded fixture |
| Teams / owners | 10 | Hardcoded fixture |
| MLB players (active) | ~750 | MLB Stats API — live |
| Pitcher stats | Current season | MLB Stats API — live |
| Hitter stats | Current season | MLB Stats API — live |

### Login after seeding

| Role | Email | Password |
|---|---|---|
| Admin | `admin@staging.tfl` | set via Supabase Auth console |
| Commissioner | `commissioner@staging.tfl` | set via Supabase Auth console |
| Player | `player1@staging.tfl` | set via Supabase Auth console |

> Supabase Auth users must be created manually in the staging project console
> (Authentication → Users → Add User). The seed script creates `User` rows in
> the database but cannot create Supabase Auth entries programmatically without
> the service_role key.

---

## Stats APIs by Sport

| Sport | API | Auth | Phase | Notes |
|---|---|---|---|---|
| MLB | MLB Stats API (official) | None — public | Live | statsapi.mlb.com |
| NFL | ESPN Fantasy API (unofficial) | ESPN_S2 cookie | Phase 2 | fantasy.espn.com/apis/v3 |
| NBA | NBA Stats API (unofficial) | None — public | Phase 2 | stats.nba.com |

NFL and NBA entries are for planning reference only — no integration code exists yet.

### MLB Stats API — endpoints used by seed script

```
GET /sports/1/players?season={year}&gameType=R    — All active MLB players
GET /people/{mlbId}/stats?stats=season&group=hitting   — Season hitting stats
GET /people/{mlbId}/stats?stats=season&group=pitching  — Season pitching stats
```

---

## Troubleshooting

**seed-staging.ts fails with P1001 (connection timeout)**
Check `.env.staging` — make sure `DATABASE_URL` points to the **staging** Supabase
pooler, not prod. Both URLs must end with `?connection_limit=1`.

**Players not populating after seed**
MLB Stats API throttles burst requests. Run with a delay flag:
```bash
npm run seed:staging -- --delay 500
```

**Prisma schema out of sync with staging DB**
Run migrate deploy manually (see Access & Setup step 3 above) from the repo root.

**CI passes but staging deploy fails**
Railway uses `NODE_ENV=production` — devDependencies are not installed. Any import
used at runtime must be in `dependencies`, not `devDependencies`.
See: `docs/solutions/runtime-errors/` for past incidents.

**Still stuck?**
Check Railway deployment logs for the `tfl-staging` service, or inspect the Supabase
staging project logs under **Database → Logs**. Staging errors do not page anyone —
it is a safe sandbox.

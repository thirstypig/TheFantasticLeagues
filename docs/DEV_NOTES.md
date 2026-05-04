# FBST - Dev Notes & Change Tracking

Last updated: 2026-05-03

This document describes how we track changes and run key workflows.

---

## 1) File structure and “source of truth”

- App:
  - `server/` - API server (Express + TS)
  - `client/` - React/Vite front-end
  - `prisma/` - Prisma schema + migrations
  - `docs/` - documentation
  - `server/data/planning.json` - unified micro todo + macro roadmap data
- External (sibling folder):
  - `./scripts/stats-worker/` - Python scripts producing CSV/JSON inputs

Legacy folders starting with `_old_` are archive-only and must not be edited.

Do not recreate separate legacy planning files such as `TODO.md`,
`server/data/todo-tasks.json`, or `docs/ROADMAP.md`. Active planning belongs in
`server/data/planning.json`, with broader rationale in `docs/plans/` and
postmortems in `docs/solutions/`.

---

## 2) How code changes are marked

Prefer git history, tests, and the session log over inline changelog banners.
Use comments only when they explain non-obvious behavior.

## 3) Python conventions (stats worker)

macOS often does not provide python by default outside a venv.

Use:

```bash
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/scripts/stats-worker
source .venv/bin/activate
python --version
```

## 4) Prisma conventions

Run Prisma commands from repo root unless you intentionally scope otherwise:

```bash
cd ~/Projects/thefantasticleagues/thefantasticleagues-app
npx prisma format
npx prisma migrate dev --name <migration_name>
npx prisma generate
```

If you get P1000 Authentication failed, treat it as a database credentials/URL problem (Supabase/Railway/local DB), not a Prisma schema problem.

## 5) Transactions import workflow

Generate JSON:

```bash
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/scripts/stats-worker
source .venv/bin/activate

python parse_onroto_transactions_html.py --season 2025 --infile data/onroto_transactions_2025.html \
  --outcsv ogba_transactions_2025.csv --outjson ogba_transactions_2025.json
```

Import into DB:

```bash
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/server
LEAGUE_NAME="OGBA" SEASON=2025 INFILE=".././scripts/stats-worker/ogba_transactions_2025.json" \
  npx tsx src/scripts/import_onroto_transactions.ts
```

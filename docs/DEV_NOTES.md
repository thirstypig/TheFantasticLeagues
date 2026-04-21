# FBST – Dev Notes & Change Tracking

Last updated: 2026-01-03

This document describes how we track changes and run key workflows.

---

## 1) File structure and “source of truth”

- App:
  - `server/` – API server (Express + TS)
  - `client/` – React/Vite front-end
  - `prisma/` – Prisma schema + migrations
  - `docs/` – documentation
- External (sibling folder):
  - `./scripts/stats-worker/` – Python scripts producing CSV/JSON inputs

Legacy folders starting with `_old_` are archive-only and must not be edited.

---

## 2) How code changes are marked

For any full-file replacement we do together:

1) Add or append to a `FBST_CHANGELOG` block at the top of the file:

```ts
// FBST_CHANGELOG
// - 2026-01-03 – Added transaction importer defaults for OGBA + infile resolver.
For large sections, wrap with:

ts
Copy code
// [FBST YYYY-MM-DD] Start: <section>
// ...
// [FBST YYYY-MM-DD] End: <section>
3) Python conventions (stats worker)
macOS often does not provide python by default outside a venv.

Use:

bash
Copy code
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/scripts/stats-worker
source .venv/bin/activate
python --version
4) Prisma conventions
Run Prisma commands from repo root unless you intentionally scope otherwise:

bash
Copy code
cd ~/Projects/thefantasticleagues/thefantasticleagues-app
npx prisma format
npx prisma migrate dev --name <migration_name>
npx prisma generate
If you get P1000 Authentication failed, treat it as a database credentials/URL problem (Neon/Render/local DB), not a Prisma schema problem.

5) Transactions import workflow
Generate JSON:

bash
Copy code
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/scripts/stats-worker
source .venv/bin/activate

python parse_onroto_transactions_html.py --season 2025 --infile data/onroto_transactions_2025.html \
  --outcsv ogba_transactions_2025.csv --outjson ogba_transactions_2025.json
Import into DB:

bash
Copy code
cd ~/Projects/thefantasticleagues/thefantasticleagues-app/server
LEAGUE_NAME="OGBA" SEASON=2025 INFILE=".././scripts/stats-worker/ogba_transactions_2025.json" \
  npx tsx src/scripts/import_onroto_transactions.ts
yaml
Copy code
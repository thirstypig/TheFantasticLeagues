# The Fantastic Leagues (FBST)

Fantasy baseball league management tool for the OGBA league. Full-stack monorepo with React client and Express API server, organized by domain feature modules.

## Architecture

```
fbst/
├── client/                  # React + Vite + TypeScript frontend
│   └── src/
│       ├── features/        # 15 domain feature modules
│       │   ├── auth/        #   Login, signup, password reset
│       │   ├── leagues/     #   League CRUD, rules
│       │   ├── teams/       #   Team management, roster views
│       │   ├── players/     #   Player search, stats
│       │   ├── roster/      #   Roster grid, controls, import
│       │   ├── standings/   #   Standings, categories
│       │   ├── trades/      #   Trade proposals
│       │   ├── waivers/     #   Waiver claims
│       │   ├── transactions/#   Transaction history
│       │   ├── auction/     #   Live auction draft
│       │   ├── keeper-prep/ #   Keeper selection
│       │   ├── commissioner/#   Commissioner tools
│       │   ├── admin/       #   System admin
│       │   ├── archive/     #   Historical data
│       │   └── periods/     #   Stat periods, season views
│       ├── components/      # Shared components (AppShell, NavBar, ui/)
│       ├── api/             # Shared API infra (base, types, barrel)
│       ├── auth/            # AuthProvider (Supabase)
│       └── lib/             # Utilities
├── server/                  # Express + TypeScript API server
│   └── src/
│       ├── features/        # 15 domain feature modules (mirrors client)
│       ├── middleware/      # Auth middleware
│       ├── lib/             # Shared infra (supabase, prisma, logger)
│       └── db/              # Prisma singleton
├── prisma/                  # Schema + migrations
└── scripts/                 # Data processing scripts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Router v6 |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Auth | Supabase (Google/Yahoo OAuth, JWT) |
| Testing | Vitest, React Testing Library, MSW |
| Deployment | Render (HTTP, SSL termination at proxy) |

## Quick Start

### Prerequisites
- Node.js 22.x
- PostgreSQL database (Neon / Render / local)

### Development

```bash
# Install dependencies
cd server && npm install && cd ../client && npm install && cd ..

# Set up environment
cp server/.env.example server/.env
# Edit server/.env with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Database setup
cd server && npx prisma migrate dev && cd ..

# Start both servers (two terminals)
npm run server    # Express on :4010
npm run dev       # Vite on :3010 (proxies /api to :4010)
```

### Testing

```bash
npm run test          # All tests
npm run test:server   # Server unit + integration tests
npm run test:client   # Client unit tests
```

## API Convention

All server routes are behind `/api`. Client uses `VITE_API_BASE_URL` (defaults to `http://localhost:4010`).

Key endpoints:
- `GET /api/health` — Health check
- `GET /api/auth/me` — Current user session
- `GET /api/leagues` — List leagues
- `GET /api/teams` — List teams
- `GET /api/player-season-stats` — Player statistics
- `POST /api/trades` — Propose trade
- `POST /api/waivers` — Submit waiver claim
- `GET /api/auction/state` — Auction state

Client config: never put `/api` inside `VITE_API_BASE_URL`. Always append `/api/...` in code.

## Data Pipeline (OnRoto Transactions)

External stat worker (`fbst-stats-worker/`) produces CSV/JSON inputs:

```bash
# Generate transaction data
cd ../fbst-stats-worker
source .venv/bin/activate
python parse_onroto_transactions_html.py \
  --season 2025 \
  --infile data/onroto_transactions_2025.html \
  --outcsv ogba_transactions_2025.csv \
  --outjson ogba_transactions_2025.json

# Import into FBST database
cd ../fbst/server
LEAGUE_NAME="OGBA" SEASON=2025 INFILE="path/to/transactions.json" \
  npx tsx src/scripts/import_onroto_transactions.ts
```

## Deployment (Render)

- **Server**: Root `server/`, start `npm start`, env: `DATABASE_URL`, `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Client**: Root `client/`, build `npm run build`, publish `client/dist`, env: `VITE_API_BASE_URL`

## Troubleshooting

**Prisma P1000**: Re-copy connection string from Neon, replace `DATABASE_URL` in `.env`, re-run `npx prisma migrate dev`.

**`zsh: command not found: python`**: Use `python3` or activate venv: `source .venv/bin/activate`

## Documentation

- **`CLAUDE.md`** — Architecture reference, conventions, testing strategy, feature module guide
- **`FEEDBACK.md`** — Session-over-session development log, pending items, tech debt tracking
- **`docs/`** — Additional documentation

## Coding Guidelines

- **SOLID Principles** — Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY** — Extract common logic into reusable functions/modules
- **KISS** — Strive for simplicity; avoid over-engineering
- **Clean Code** — Readable, self-documenting with meaningful names
- **Error Handling** — Robust handling with structured logging via `logger`

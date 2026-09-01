# Testing Strategy

## Overview

- **Framework**: Vitest (fast, native TypeScript, Vite-compatible)
- **Coverage**: 1664 server main suite + 7 integration [4 draft + 3 IL-fee] (separate `db-integration` CI job) + 962 client across 34 feature modules; plus 133 MCP tests (83 fbst-app + 50 mlb-data) run separately
- **Approach**: Unit tests per feature + integration tests for cross-feature interactions

Run all: `npm run test` | Server only: `npm run test:server` | Client only: `npm run test:client`

## Unit Tests (per feature module)

Each feature module should have tests co-located with the code:

```
server/src/features/<feature>/
├── __tests__/
│   ├── routes.test.ts         # Route handler tests (mock Prisma, test HTTP)
│   └── <name>Service.test.ts  # Service logic tests (mock DB)

client/src/features/<feature>/
├── __tests__/
│   ├── api.test.ts            # API client tests (mock fetch)
│   └── <Page>.test.tsx        # Component render tests
```

**What to test per module:**
- **Routes**: HTTP method, status codes, request validation, error responses
- **Services**: Business logic, edge cases, error handling
- **API clients**: Request construction, response parsing, error handling
- **Pages/Components**: Rendering, user interactions, loading/error states

## Integration Tests

Cross-feature interactions in `server/src/__tests__/integration/`:

```
server/src/__tests__/integration/
├── auction-roster.test.ts     # Auction draft populates roster
├── trade-roster.test.ts       # Trade execution moves players between rosters
├── waiver-roster.test.ts      # Waiver claims modify rosters and budgets
├── keeper-league.test.ts      # Keeper prep interacts with league settings
└── commissioner-league.test.ts # Commissioner actions affect league state
```

**Key integration scenarios:**
- Auction draft completion should create roster entries and update team budgets
- Trade processing should move players between rosters and adjust budgets
- Waiver claim processing should enforce budget limits and roster rules
- Commissioner roster lock should prevent trades/waivers for locked teams
- Keeper selection should respect league rules and roster constraints

## Test Configuration

- **Server mocking**: Use `vi.mock()` to mock Prisma (`../../db/prisma.js`) and Supabase (`../../lib/supabase.js`) in unit tests
- **Client mocking**: React Testing Library for components; `vi.mock()` for API mocking
- **DB tests**: Use a test database with Prisma migrations for integration tests (future)
- **CI**: Run `npm run test` in CI pipeline before deploy

## Running Tests

```bash
# All tests
npm run test

# Server tests only
npm run test:server

# Client tests only
npm run test:client

# Single feature (from server/ or client/)
npx vitest run src/features/auction/__tests__/

# Watch mode
npx vitest --watch
```

## Current Coverage Snapshot (2026-08-04)

**Server**: 1519 tests across 109 files (main `test` job) + 7 integration [4 draft + 3 IL-fee]
tests (`draft/__tests__/draftIntegration.test.ts`) run in the separate
`db-integration` CI job against a postgres:16 service. That suite is gated by
`test-support/dbSafety.ts:isLocalThrowawayDbUrl` + `ALLOW_DESTRUCTIVE_DB_TESTS=1`
(fail-closed), so it runs only against a local/CI throwaway Postgres, never prod.
The server `test` include also covers the **docs-system script tests** at
`scripts/__tests__/*.test.mjs` (41 tests — `refresh-docs`, `sync-inbox`,
`feature-isolation-baseline`), same pattern as the `../shared/**` contract tests.
The **standings-audit module** (`src/lib/audit/`, 71 tests across 9 files) is
fixture-driven with no network or DB: external-source parsers are tested against
saved HTML, and the pure accumulator/classifier against hand-built roster stints.
Its tests are mutation-verified — see
`docs/solutions/integration-issues/parser-boolean-conflates-membership-with-status-misfiles-stat-total.md`
for why a green suite was not evidence of correctness there.  
**Client**: 960 tests across 76 files  
**MCP**: 133 tests (83 fbst-app + 50 mlb-data)

See `docs/TESTING.md` for the live detailed catalog and per-file breakdown.

**Key test plan from Phase 3 (2026-06-22):** See `SCORING_ENGINE_TEST_PLAN.md` for the comprehensive test specification (20 unit + 11 integration + 7 component tests) for the scoring engine feature. Test execution deferred pending local Supabase migration fix.

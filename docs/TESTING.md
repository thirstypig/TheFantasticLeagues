# TFL Testing Catalog

Owner: engineering + commissioner/admin visibility
Last updated: 2026-04-19 (Session 69)

## What this document is

A single place where any admin or contributor can see **what tests exist, what they cover, how often they run, and what's not yet covered**. Updated at the end of each session.

## Vocabulary

### Unit tests
**What:** Exercise one function/module in isolation with dependencies mocked (DB, HTTP, auth). Fast (ms per test), deterministic, narrow in scope.
**Where:** co-located with code, e.g. `server/src/features/auction/__tests__/routes.test.ts`, `client/src/features/players/__tests__/Players.test.tsx`.
**Stack:** Vitest + React Testing Library (client), Vitest + Supertest for HTTP mocking (server).
**Good at:** catching logic regressions the moment they're introduced, proving a specific edge case, protecting a refactor.
**Bad at:** catching issues that emerge only when real components wire up together.

### Integration tests
**What:** Exercise several modules together, often hitting a real DB or a realistic sub-graph of the app. Medium speed (seconds per test).
**Where:** `server/src/__tests__/integration/` — `auction-roster.test.ts`, `trade-roster.test.ts`, `waiver-roster.test.ts`, etc.
**Good at:** catching contract mismatches between modules — e.g. auction finish creating a roster row with the wrong shape.

### E2E (end-to-end) tests
**What:** Drive the real browser against a running app, simulating a real user flow from login through a multi-step outcome. Slow (tens of seconds per flow), brittle if the UI shifts, highest confidence.
**Where:** `client/e2e/` — `@playwright/test` runner. Run with `cd client && npm run test:e2e` (headless) or `npm run test:e2e:ui` (interactive).
**Good at:** proving "a team owner can claim a free agent and see the star persist across pages" — the kind of thing a user would notice.
**Bad at:** pinpointing which layer broke when they fail.

### The pyramid
Many unit tests, fewer integration tests, few E2E tests — and only the most important flows as E2E because they are the most expensive to write and maintain.

## How often we run

| Trigger | What runs | Why |
|---|---|---|
| Before every commit | `cd client && npx tsc --noEmit` + `cd server && npx tsc --noEmit` | Fast — catches type errors that Vite dev hides. |
| Before every push / PR | `npm run test` (571 server + 201 client = 772 tests, ~7s total) | Required green baseline. |
| After UI change in a feature module | `/feature-test <name>` slash command | Fast iteration on the area you're editing. |
| Before deploy to Railway | Full `npm run test` + Playwright smoke on prod domain | Protects production. |
| Ad-hoc during development | Playwright MCP interactive flows | Used today in place of formal E2E. |

**Current reality (2026-04-19):** we don't have a formal E2E suite in CI. Every session I (Claude Code) verify user-facing changes with Playwright MCP interactive flows — that's good evidence but it's not automated. Next step is to promote the most common flows into `@playwright/test` so they run in CI.

## Current coverage (Session 69 baseline)

### Server — 571 passing, 7 skipped, 42 files

Major covered areas (selected):
- `middleware/` — auth (6), extended auth (28), async handler (4), validate (7), season guard (10)
- `lib/` — utils (36), ipHash (16)
- `features/auth/routes.test.ts` — 16 tests (health, me, dev login)
- `features/auction/` — 23 routes + 8 persistence + 3 auto-finish + 11 retrospective
- `features/trades/routes.test.ts` — 13 (propose, vote, process)
- `features/waivers/routes.test.ts` — 12 (submit, process, cancel)
- `features/standings/` — 26 service + 7 integration + 11 routes
- `features/seasons/` — 14 service + 5 routes
- `features/players/mlbSyncService.test.ts` — 23 (roster sync, position eligibility)
- `features/archive/routes.test.ts` — 38
- `features/admin/routes.test.ts` — 21
- `features/keeper-prep/routes.test.ts` — 8
- `features/periods/routes.test.ts` — 10
- `features/transactions/routes.test.ts` — 8
- `features/franchises/routes.test.ts` — 6
- `__tests__/integration/` — auction-roster (9), auction-simulation (29), trade-roster (10), waiver-roster (11), transaction-claims (25)

### Client — 201 passing, 16 files

- `api/base.test.ts` — 17 (toNum, fmt2, fmt3Avg, fmtRate, yyyyMmDd, addDays)
- `lib/baseballUtils.test.ts` — 32 (POS_ORDER, sortByPosition, positionToSlots)
- `hooks/useSessionHeartbeat.test.ts` — 7
- `features/players/PlayerDetailModal.test.tsx` — 14
- `features/standings/StatsTables.test.tsx` — 22
- `features/auction/AuctionValues.test.tsx` — 10
- `features/teams/Teams.test.tsx` + `Team.test.tsx` — 17
- `features/trades/TradesPage.test.tsx` — 23
- `features/archive/ArchivePage.test.tsx` — 16
- `features/keeper-prep/KeeperSelection.test.tsx` — 8
- `features/periods/Season.test.tsx` — 8
- `features/commissioner/Commissioner.test.tsx` — 8
- `features/transactions/ActivityPage.test.tsx` — 6
- `features/admin/Admin.test.tsx` — 6

### MCP (MLB Data Proxy) — 50 passing (not run by root `npm test`)

- `cache.test.ts` — 8, `rateLimiter.test.ts` — 5, `tools.test.ts` — 16, `integration.test.ts` — 21.
Run from `mcp-servers/mlb-data/` with `npx vitest run`.

### E2E (Playwright) — 1 passing, 1 file

- `client/e2e/watchlist.spec.ts` — 1 test (29.6s): golden-path watchlist round-trip (Players → star → Add/Drop shows filled star → reload → still filled). Guards Session 68/69 `normalizeTwoWayRow` regression.
- Helpers: `client/e2e/helpers/auth.ts` — `loginViaDev()` for shared auth setup.

## What's NOT covered today (gaps worth closing)

1. **Watchlist flows** — no unit or E2E tests. A regression here (Session 68's star-not-rendering bug) would ship silently. Proposed: `features/watchlist/__tests__/useMyWatchlist.test.ts` + E2E flow "owner stars a player on Players page, sees it on Add/Drop, survives reload."
2. **Position eligibility filter** — the CM/MI/specific-position filter bug fixed this session had no test guarding it. Proposed: `features/players/__tests__/positionFilter.test.ts` with table-driven cases.
3. **Commissioner roster tool** — no tests of the new Add/Drop Search in CommissionerRosterTool.
4. **Home dashboard** — no tests. The new team link is visually verified but not unit-tested.
5. **E2E baseline** — ✅ scaffolded (Session 69). One golden-path test passing. Next expansions: auction draft, trade processing, waiver FAAB ordering, roster lock/unlock.
6. **Deploy smoke** — we have ad-hoc Playwright checks against Railway, not a runnable smoke script.

## Cadence proposal

- **Per-feature unit tests in the same PR as the code change.** This was flagged in Session 62 memory (`feedback_test_rot_same_pr`) — keep the discipline. Don't defer.
- **One E2E flow per commissioner-facing feature.** These are the flows that cost real money if they break (claim, drop, trade, roster lock, draft pick).
- **Session-start `npm run test` gate.** If red, fix before adding new work.
- **Session-end update of this doc.** One sentence per test added, one sentence per gap closed.

## How to read this doc as an admin

- **Green areas = tested** — a regression will be caught before deploy.
- **Red/"not covered" areas = not tested** — rely on manual browser verification.
- If you're about to make a change in a red area, ask for a test to be added first.

## Workflow — slash commands

Two reusable commands codify the cadence this doc describes:

- **`/test-new <feature>`** — after finishing a feature, generates unit + (maybe) integration + (maybe) E2E tests, runs them, and updates this catalog. Full prompt in `.claude/commands/test-new.md`. Enforces the pyramid (unit first, E2E only when the flow costs real money if broken) and blocks commits when anything is red.
- **`/test-run`** — runs tsc + unit/integration in ~10s. **`/test-run e2e`** also runs the Playwright suite. Prompt in `.claude/commands/test-run.md`.

Both commands explicitly stop on the first failure rather than masking errors. Both require dev servers (`:3010` + `:4010`) up for E2E — they check and tell you if either is down, but don't start them automatically.

## Beyond the basics — things to add when the suite grows

The pyramid (unit / integration / E2E) is the baseline. These are worth considering as the codebase matures — not all at once, but in rough priority:

1. **Pre-commit enforcement** — a Claude Code `PreToolUse` hook on `git commit` that runs tsc + unit tests and blocks on failure. Planned for Session 70. Git-level (Husky) hook is a backup that catches commits made outside Claude Code.
2. **Coverage reporting** — Vitest has `--coverage` built in; `npm run test:coverage` exists in client. No reporting surface yet. Low priority until you want to see it.
3. **Mutation testing** (Stryker) — flips one operator in a function and checks whether any test fails. Catches tests that pass trivially. Worth running once per quarter on core business logic (standings, auction, trades) to find weak tests.
4. **Contract testing between client and server** — the `normalizeTwoWayRow` bug was a contract mismatch (server returned `id`, client expected `id`, normalization dropped it). A shared Zod schema used by both would have made this a compile error. Highest-impact next investment.
5. **Visual regression** — Playwright has `expect(page).toHaveScreenshot()`. Catches CSS regressions you'd miss otherwise. Start with 3–5 screens (Home, Players, Team, Activity, Commissioner).
6. **Accessibility** — `@axe-core/playwright` runs axe against a rendered page. One assertion per E2E catches common a11y regressions (missing labels, low contrast, wrong heading levels).
7. **Flaky test tracking** — when a test fails once but passes on retry, log it. Flakes are bugs, not noise.
8. **Performance baselines** — Lighthouse CI for the five highest-traffic pages. Fails the build if LCP regresses > X%.
9. **CI pipeline** — today tests run locally. A GitHub Action that runs `/test-run` (and eventually E2E + visual) on every PR is the gate that protects `main` when multiple people work at once.
10. **Test data factories** — right now each server test builds its own Prisma fixture. A small `tests/factories/` helper (`makeUser()`, `makeLeague()`, `makeTeam()`) keeps tests short and forces consistency when schemas change.

## Automation — a loop worth running

The `/loop` skill runs a prompt on a cadence. Two specific uses:

- **`/loop 1w /test-new <area-needing-coverage>`** — weekly sweep of coverage gaps flagged in this doc's "What's NOT covered today" section. Agent picks the top unaddressed item, writes tests, removes it from the list.
- **`/loop 1d npx playwright test`** — nightly E2E run (only useful once the suite grows beyond 1 test). Catches regressions introduced by dependency updates overnight.

Neither is wired today. When you're ready, say "set up a weekly test-gap loop" and I'll configure it with `/loop`.

---
*Future: an `/admin/tests` page that renders this catalog plus live CI status — tracked as a follow-up.*

# TFL Testing Catalog

Owner: engineering + commissioner/admin visibility
Last updated: 2026-05-22

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
| Before every push / PR | `npm run test` (1244 server + 845 client tests, ~20s total) + 83 MCP fbst-app + 50 MCP mlb-data run separately in CI | Required green baseline. |
| After UI change in a feature module | `/feature-test <name>` slash command | Fast iteration on the area you're editing. |
| Before deploy to Railway | Full `npm run test` + Playwright smoke on prod domain | Protects production. |
| Ad-hoc during development | Playwright MCP interactive flows | Used today in place of formal E2E. |

**Current reality (2026-05-04):** we have limited formal Playwright E2E and still rely on targeted browser smoke checks for visual/layout regressions. Recent /ce:review work on PRs #226–#230 was verified with full unit suite (1544 green), both typechecks clean, and a 6-step browser smoke (Home → Team V3 hub → AddDrop preview-gating regression → Place-on-IL → Activate-from-IL) at `http://localhost:3011/`.

## Current coverage (2026-06-03 baseline)

### Server — 1173 passing (last verified 2026-06-03)

Major covered areas (selected):
- `middleware/` — auth (6), extended auth (45: adds requireTeamOwnerOrCommissioner matrix — admin / IDOR / commissioner / toggle / legacy owner / co-owner / fail-closed rule value matrix), async handler (4), validate (7), season guard (10)
- `lib/` — utils (36), ipHash (16), leagueRuleCache (9 + 1 todo: shape, caching, TTL expiry, invalidation per-league, test isolation)
- `db/prisma.test.ts` — 23 (PR #136 retry-middleware boundary: WRITE_OPERATIONS denylist via `it.each`, read-prefix sentinel, TRANSIENT_ERROR_CODES whitelist P1001/P1002/P1008/P1017, logic-code denylist P2002/P2003/P2025/P2034/P3000, `isTransientPrismaError` matrix over PrismaClientInitializationError + PrismaClientKnownRequestError + plain `Error` regex match for "Can't reach database server" / "pooler.supabase.com")
- `features/auth/routes.test.ts` — 16 tests (health, me, dev login)
- `features/auction/` — 23 routes + 8 persistence + 3 auto-finish + 11 retrospective
- `features/trades/routes.test.ts` — 13 (propose, vote, process)
- `features/waivers/routes.test.ts` — 12 (submit, process, cancel)
- `features/wire-list/routes.test.ts` + `processor.test.ts` — 24 (Zod schema validation: CreatePeriodBody / Add / Drop entry bodies, error-code enum, drop-mode enum, period-results response shape)
- `features/standings/` — 26 service + 7 integration + 11 routes + 13 categoryDailySnapshotService (period selection / no-period skip / row-count = teams×categories / idempotent upsert key / UTC-midnight normalization in batch + readback / per-league failure isolation) + 6 releaseAt boundary (free-agent → 0 credit, released before period → 0, traded mid-period → new team, no double-count, dropped pitcher pitching stats → 0, multiple simultaneous free agents → 0 all teams) + 10 IL exclusion (standingsService.IL.test.ts — daily + period paths; includes mid-period pitcher-in-IL-slot scenario where pre-stash W/K/IP count, and period-start-IL pitcher where all pitching stats are zeroed) + 11 path routing (standingsService.pathRouting.test.ts — PSP vs daily selection per todo #260; UTC calendar-date boundary normalization per todo #285; hybrid attribution per todo #286: PSP for boundary-aligned players + daily windows for mid-period players, same-day drop-and-re-add counted once, mid-period release credits dropper pre-release only) + 8 differential (standingsService.differential.test.ts — PSD↔PSP agreement on static ownership, window-split on trades, zero-sum invariant, hybrid source-of-credit proof)
- `features/seasons/` — 14 service + 5 routes
- `features/players/mlbSyncService.test.ts` — 28 (roster sync, position eligibility, Rule 2 prior-year 20-GP fallback)
- `features/mlb-feed/` — 28 Gap 1 boxscore stat lines (gameLogService.test.ts: 18 — extractTodayLine matches by date / gameDate prefix / officialDate / two-way splits / DNP detection / AB=0+PA=0 defensive replacement; deriveGameStatus + buildGameStateDesc TOP/BOT/F/N edge cases; myPlayersToday.test.ts: 10 — hitter line / pitcher line / DNP after FINAL / PRE skips fetch / Promise.allSettled isolates failures / cache hit avoids refetch / 60s LIVE vs 24h FINAL TTL)
- `features/archive/routes.test.ts` — 38
- `features/admin/routes.test.ts` — 21
- `features/keeper-prep/routes.test.ts` — 8
- `features/periods/routes.test.ts` — 10
- `features/transactions/routes.test.ts` — 8
- `features/franchises/routes.test.ts` — 6
- `__tests__/integration/` — auction-roster (9), auction-simulation (29), trade-roster (10), waiver-roster (11), transaction-claims (25)

### Client — tracked baseline plus recent focused additions

- `api/base.test.ts` — 18 (toNum, fmt2, fmt3Avg, fmtRate, yyyyMmDd, addDays; includes IEEE 754 edge case 19/80 → .238)
- `lib/baseball.test.ts` — 9 (fmt3Avg canonical sports/baseball.ts: happy path, zero AB, 1.000, IEEE 754 19/80→.238 edge; fmtRate: strip leading zero, ≥1 display, NaN/Infinity; fmt2: 2 dp, non-finite empty)
- `lib/baseballUtils.test.ts` — 32 (POS_ORDER, sortByPosition, positionToSlots)
- `lib/mlbStatus.test.ts` — 6 (isMlbIlStatus: real MLB format + legacy form + non-IL + malformed + case sensitivity; mirror of `server/src/lib/__tests__/ilSlotGuard.test.ts`)
- `hooks/useSessionHeartbeat.test.ts` — 7
- `features/players/PlayerDetailModal.test.tsx` — 14
- `features/standings/StatsTables.test.tsx` — 22
- `features/auction/AuctionValuesLegacy.test.tsx` — 10 (rendering, tabs, search, sorting, modal — pinned to legacy code path at `/auction-values-classic`)
- `features/auction/AuctionValuesAurora.test.tsx` — 3 (Aurora hero copy, `.aurora-theme` wrapper, footer escape link)
- `features/teams/Teams.test.tsx` + `Team.test.tsx` — 17
- `features/teams/Team.IL.test.tsx` — 4 (Your IL Slots subsection, Ghost-IL badge, stashed-dedup in MLB IL Candidates)
- `features/transactions/components/RosterMovesTab/RosterMovesTab.test.tsx` — 11 (mode default / URL sync / IL count pill / shortcut banner / panel switching; PR #123 re-homing of PlaceOnIlModal + ActivateFromIlModal + standalone add/drop into a single tab)
- `features/transactions/components/RosterMovesTab/AddDropPanel.test.tsx` — includes DROP_REQUIRED in-season + preseason inverse + FA key-uniqueness regression + submit-body contract + default-no-selection regression for free agents without `_dbPlayerId` + SlotRearrangementSection (PR #347): visibility gating, slot dropdown options (slotsFor contract), N-changes badge/revert, slotChanges included/omitted from claim body + chain-drop-candidates (PR #349): 1-hop chain fit appears, direct fit not regressed, no-chain player excluded, updated label text, updated empty-state text, 10-player cap removed (11 players visible), Execute enabled for chain-fit drop in SETUP mode
- `features/transactions/lib/permissions.test.ts` — 9 (canManageRoster matrix: admin / commissioner / owner with self-serve toggle / cross-team IDOR / no-league-rules loading state)
- `lib/positionEligibility.test.ts` — 27 (slotsFor consolidation from the triplicated Phase 4 helpers)
- `features/roster/RosterGrid.test.tsx` — 12 (IL quick-action buttons: place/activate per-row show/hide/fire; unbounded mode drops h-96 + scroll; position dropdown eligibility filter: pitcher→["P"], no posList→all 9, posList="SS"→[SS,MI,DH], posList="2B,SS"→[2B,SS,MI,DH], grandfathered displayPos always included)
- `features/waivers/WaiverClaimForm.test.tsx` — 6 (in-season drop-required label, position eligibility)
- `features/wire-list/__tests__/api.test.ts` — 21 (URL/method/body shape per wrapper: period CRUD + add/drop CRUD + processor — guards against route refactor, verb change, body shape drift, and the load-bearing `createWirePeriod` rename in #264)
- `features/wire-list/__tests__/useWireListOwner.test.ts` — 11 (parallel load: getTeams + getActivePeriod in Promise.all; 404 from getActivePeriod → period null, no error; non-404 → static error + reportError; team not found; isReadOnly logic; early-return guard when leagueId null)
- `features/wire-list/__tests__/WireListRow.test.tsx` — 10 (content rendering; ▲▼× hidden when isReadOnly; ▲ disabled for isFirst, ▼ disabled for isLast; WaiverDropModeToggle shown only for drop rows; opacity 0.5 when isPending)
- `features/wire-list/__tests__/WaiverDropModeToggle.test.tsx` — 5 (REL/IL buttons rendered; onChange fires on toggle; onChange blocked on already-active; onChange blocked when disabled; buttons disabled when disabled prop set)
- `features/wire-list/__tests__/utils.test.ts` — 4 (formatDeadline: non-empty string, numeric day present, no [object Object]/NaN, past date doesn't throw)
- `mobile/__tests__/MobileShell.test.tsx` — 6 (always-mounted drawer invariant: `data-testid="mobile-tab-bar"` present when drawer closed; hamburger aria-expanded starts false, flips true on click; overlay click closes drawer; Escape key closes; drawer persists on non-home paths)
- `mobile/__tests__/MobileTabBar.commish.test.tsx` — 7 (unified 5-tab set present; AI/Commish tabs absent; My Team tab scoped to own team code, not all /teams/ paths)
- `mobile/__tests__/MobileLayoutGate.test.tsx` — 5 (desktop renders AppShell, mobile substitutes twin page, breakpoint boundary at 767px)
- `contexts/__tests__/ThemeContext.test.tsx` — 10 (Score Sheet meta theme-color: dark→#3d434b, light→#ebe6db; rejects old Aurora dark #0a0f1a; updates existing meta tag without duplicate; fbst-theme localStorage key; dark/light class on documentElement; toggleTheme both directions)
- `mobile/__tests__/MobileMore.test.tsx` — 5 (manager profile strip, league section, commish items hidden for non-commish)
- `mobile/__tests__/MobileHome.test.tsx` — 6 (hero card with rank; standings top-5 with YOU badge; activity feed with kind chips; Trade Proposals section with team names and player names; League Board section with card title and author; view-roster link to user's team)
- `mobile/__tests__/MobileTeam.test.tsx` — 23 (roster hub fetch, tab switching, IL tab, hero strip, standings rank, move sheet, IL stash/activate flows, optimistic updates, rollback, refetch-on-success, backdrop dismiss, Hitter Totals row with summed numerators, Pitcher Totals row with rate stats derived from IP/ER/BB_H, IL tab hides totals)
- `mobile/__tests__/MobilePlayers.test.tsx` — 18 (hitter list default, NL filter, position chip filter, pitchers tab, search, sort direction toggle, watch star rendering, addToWatchlist/removeFromWatchlist, star click doesn't expand, row expand/collapse, career table in expanded panel, pitching career endpoint, Available filter chip, Available hides rostered players, Available restores all, Available persists as avail=1 URL param)
- `mobile/__tests__/MobileStandings.test.tsx` — 8 (team rows render, YOU badge in standings row, segmented control switches Hitting/Pitching columns, sort direction toggle, Category Leaders section renders, card per category with key label, top-3 teams with actual stat values, rank numbers 1–3 per card)
- `features/trades/TradesPage.test.tsx` — 23
- `features/archive/ArchivePage.test.tsx` — 16
- `features/keeper-prep/KeeperSelection.test.tsx` — 8
- `features/periods/Season.test.tsx` — 8
- `features/commissioner/Commissioner.test.tsx` — 11 (Phase 4 adds ghost-IL banner + lazy-load assertions)
- `features/transactions/ActivityPage.test.tsx` — 6
- `pages/__tests__/Home.test.tsx` — covers the dashboard sections added in the roster/home workstream: compact Around the League, League Board, quick links, fantasy-team names in League Activity, and pending trade proposal withdrawal affordance
- `features/transactions/api.test.ts` — 6 (ilStash + ilActivate wrappers: URL/method/body shape, optional params, error propagation)
- `features/commissioner/api.test.ts` — 4 (getGhostIlSummary: URL interpolation, error propagation, GET semantics)
- `features/admin/Admin.test.tsx` — 6

### MCP (MLB Data Proxy) — 50 passing (not run by root `npm test`)

- `cache.test.ts` — 8, `rateLimiter.test.ts` — 5, `tools.test.ts` — 16, `integration.test.ts` — 21.
Run from `mcp-servers/mlb-data/` with `npx vitest run`.

### MCP (FBST App Tools) — 83 passing (not run by root `npm test`)

- `tools.test.ts` — 2 (registration + uniqueness for all 16 tool names)
- `contract.test.ts` — 53 (schema validation for 6 representative tools; HTTP shape for all 16 tools; auth flow — Bearer header + no-token clean fail; 5 error-code passthrough; 4 schema drift detectors via `WaiverDropModeSchema`, `CreateAddEntryBodySchema`, `CreateDropEntryBodySchema`, `FailOutcomeBodySchema`)
- `standings.test.ts` — 17 (standings MCP tools: get_current_standings, get_period_standings, get_category_standings; URL construction, bearer auth, empty-period guard, category-name passthrough, invalid-league error shape)
Run from `mcp-servers/fbst-app/` with `npx vitest run`.

### E2E (Playwright) — 1 passing, 1 file

- `client/e2e/watchlist.spec.ts` — 1 test (29.6s): golden-path watchlist round-trip (Players → star → Add/Drop shows filled star → reload → still filled). Guards Session 68/69 `normalizeTwoWayRow` regression.
- Helpers: `client/e2e/helpers/auth.ts` — `loginViaDev()` for shared auth setup.

## What's NOT covered today (gaps worth closing)

1. **Watchlist flows** — no unit or E2E tests. A regression here (Session 68's star-not-rendering bug) would ship silently. Proposed: `features/watchlist/__tests__/useMyWatchlist.test.ts` + E2E flow "owner stars a player on Players page, sees it on Add/Drop, survives reload."
2. ✅ **Position eligibility filter** — ~~the CM/MI/specific-position filter bug fixed this session had no test guarding it~~ Closed 2026-05-18: 5 tests in `features/roster/RosterGrid.test.tsx` cover all 3 filter branches (pitcher/no-posList/eligible-set) including the grandfathered-slot guard.
3. **Commissioner roster tool** — no tests of the new Add/Drop Search in CommissionerRosterTool.
4. **Home dashboard** — basic component tests now exist, but My Team Today live-stat freshness and historical weekly-insight tabs still need deeper tests.
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

## Latest Focused Verification

Recent roster/dashboard documentation session baseline:

- `npx vitest run src/pages/__tests__/Home.test.tsx src/features/transactions/components/RosterMovesTab/__tests__/AddDropPanel.test.tsx` — 21 passing
- `npx vitest run src/pages/__tests__/Home.test.tsx src/features/transactions/__tests__/ActivityPage.test.tsx src/features/transactions/components/RosterMovesTab/__tests__/AddDropPanel.test.tsx src/features/trades/__tests__/TradesPage.test.tsx` — 50 passing
- `cd client && npx tsc --noEmit` — passing
- Browser smoke on Home at desktop and mobile: no horizontal overflow, expected right-column order, League Activity fantasy-team names, Board quick link present

## Workflow — slash commands

Four reusable commands codify the cadence:

- **`/test-new <feature>`** — after finishing a feature, generates unit + (maybe) integration + (maybe) E2E tests, runs them, and updates this catalog. Prompt in `.claude/commands/test-new.md`. Enforces the pyramid (unit first, E2E only when the flow costs real money if broken).
- **`/test-run`** — runs tsc + unit/integration in ~10s. **`/test-run e2e`** also runs the Playwright suite. Prompt in `.claude/commands/test-run.md`.
- **`/test-audit`** — decision-support: scans the "Beyond the basics" list below and recommends the single highest-leverage next investment. Doesn't install anything. Prompt in `.claude/commands/test-audit.md`.
- **`/doc [context]`** — after feature + tests are green, updates every project doc atomically (CLAUDE.md, FEEDBACK.md, README, relevant `docs/*`, TODO, changelogs if any). Prompt in `.claude/commands/doc.md`.

All four stop on the first failure rather than masking errors.

## Recommended per-feature cadence

```
1. Build the feature                              (code)
2. /test-new <feature>                            (write + run unit/integration/E2E)
3. /doc <feature>                                 (update all docs in sync)
4. pre-commit: tsc + npm run test (auto-run)      (keeps main green)
5. git commit                                     (conventional message)
6. pre-push: /test-run e2e                        (before user pushes)
7. git push
```

Step 4 is a saved preference — every commit runs tsc and the unit/integration suite before it lands. Step 6 is manual today; a pre-push hook is on the follow-up list (see `/test-audit`).

## Beyond the basics — things to add when the suite grows

The pyramid (unit / integration / E2E) is the baseline. These are worth considering as the codebase matures — not all at once, but in rough priority:

1. **Pre-commit enforcement** — a Claude Code `PreToolUse` hook on `git commit` that runs tsc + unit tests and blocks on failure. Planned for Session 70. Git-level (Husky) hook is a backup that catches commits made outside Claude Code.
2. **Coverage reporting** — Vitest has `--coverage` built in; `npm run test:coverage` exists in client. No reporting surface yet. Low priority until you want to see it.
3. **Mutation testing** (Stryker) — flips one operator in a function and checks whether any test fails. Catches tests that pass trivially. Worth running once per quarter on core business logic (standings, auction, trades) to find weak tests.
4. **Contract testing between client and server** — **pilot shipped Session 69.** One schema in `shared/api/playerSeasonStats.ts` covers `/api/player-season-stats`. Removing the `id` field from normalization is now a compile error — the exact Session 69 bug. See `docs/CONTRACT_TESTING.md` for the pattern + how to extend. **1 of 234 endpoints covered.** Next candidates (priority order): `/api/watchlist`, `/api/teams/:id`, `/api/leagues/:id`, `/api/transactions/claim`, `/api/seasons/current`.
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

# Current Product Status

Last updated: 2026-07-10

## Planning Sources

Two planning artifacts exist, with distinct roles (do not create additional `TODO.md` / `todo-tasks.json` files):

- **`server/data/planning.json`** — backs the **in-app** views: the Admin todo list (`server/src/features/admin/routes/todos.ts`) and the Roadmap page (`client/src/pages/Roadmap.tsx`). Edit via those surfaces; preserve IDs/ordering.
- **`ROADMAP.md`** — the human-readable narrative roadmap (phase descriptions, effort, status). Maintained alongside session docs; currently the more actively updated of the two.

> Known overlap: these two can drift from each other. Consolidating to a single source is a tracked cleanup; until then, treat `planning.json` as authoritative for the *in-app* todo/roadmap UI and `ROADMAP.md` as the prose narrative.

---

## Active Period

**Period 5** (Jul 5 – Aug 1, 2026) is live — rolled over from Period 4 on 2026-07-06, with all 8 teams' Period 5 add/drop moves backdated to the 07-05 period start (late-rollover boundary fix; see FEEDBACK 2026-07-06). Recurring OnRoto/FanGraphs stat audits through 07-09 reconcile: raw counting stats match cell-for-cell; the few small rate residuals are ADR-013 ownership-window attribution on mid-season-dropped players, not data errors (verified four-way against MLB.com statsapi + Baseball Reference). Audit runbook: `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`.

---

## Shipped This Week (2026-06-22)

### Scoring Settings (Phase 3 — Partial)
**Commit:** 859e1bc (feature), 23dd133 (test plan), 0317433 (local setup docs)

- **ScoringSettings component** (453 lines) — Two-tab commissioner UI for configuring league scoring rules (points-per-stat) and roster slot limits
- **Scoring Engine service** (476 lines) — Pure functions for NFL/NBA scoring: `calculateNFLPoints`, `calculateNBACategories`, `compareNBACategories`, `calculateStandings`, `getDefaultScoringRules`
- **API endpoints** (394 lines) — GET/PATCH `/api/leagues/:id/scoring-settings` and `/api/leagues/:id/roster-config`
- **Database schema** — ScoringSettings, ScoringRule, RosterConfig Prisma models + migration (20260620000000_phase3_scoring_engine)
- **Test plan** — 20 unit tests (pure functions), 11 integration tests (API contracts), 7 component tests (UI behavior). Deferred execution pending local Supabase migration fix.
- **Solution documentation** — `docs/solutions/integration-issues/untyped-fetch-wrapper-api-contracts.md` captures TypeScript error resolution + prevention strategies for API boundary typing

**Test suite status (2026-06-29):**
- Backend: 1339 passing (97 files, main `test` job), 11 skipped, 1 todo
- Draft integration: 4 passing (separate `db-integration` CI job, real Postgres)
- Frontend: 897 passing (74 files)
- Total: 2240 passing tests (excludes MCP suites which track separately)
- TypeScript: clean (both client and server; server modulo known local-only zod false-negatives)

---

## Current Focus Areas

### Roster Hub (shipped, in maintenance)
The Yahoo-style roster hub at `/teams/:code` is the primary roster management entry point. Flows: Add/Drop (`/manage/claim`), Place on IL (`/manage/il-stash`), Activate from IL (`/manage/il-activate`), **Release from IL** (`/manage/il-release`, PR #381 — drops IL player without activating first). Pending: 3-way atomic claim (Add + IL stash + Drop, planned in `docs/superpowers/plans/2026-06-07-three-way-atomic-claim.md`).

### Standings Accuracy
Stats attribution uses ownership-window logic (`computeWithDailyStats` for periods with mid-period transactions, `computeWithPeriodStats` for boundary-aligned periods). PR #374 adds the `hasMidPeriodPickup` guard that routes automatically. An audit comparing FBST vs OnRoto/FanGraphs for Period 3 is documented at `docs/reports/onroto-audit-2026-06-08.md` and viewable at `/admin/reports`.

Key finding: DMK is over-credited by +16.5 pts and DLC is under-credited by -12.0 pts in FBST Period 3 vs FanGraphs, driven by W and K category differences between MLB Stats API (our source) and FanGraphs' own database. Attribution logic is confirmed correct; the divergence is data-source-level.

### Open PR Queue (as of June 8, 2026)
- **#381** Drop from IL feature (client-only, needs #382 merged first)
- **#382** Server fix: `rosterVersion` missing from `getTeamRosterHub` response
- **#383** Admin reports viewer + OnRoto audit document
- **#376** Ghost-roster double-count test fix (CI running)
- **#374** Mid-period pickup routing fix (CI running after test update)
- **#373** Dedup RosterItem type (CI retriggered — was a flake)

### Wire List (shipped v1.1, in maintenance)
Two-list waiver model (independent Add + Drop ranks) shipped 2026-05-06. Commissioner UI at `/commissioner/:leagueId/wire-list`, owner UI at `/teams/:code/wire-list`. All 21 P1/P2 review findings closed via 14 PRs in session 2026-05-07/08.

---

## Scoring Model Reference

OGBA uses **period-by-period roto accumulated** scoring:
- 7 periods, each scored as an independent 10-category roto contest (1–8 pts per category, 8 teams)
- Max per period = 80 pts; season totals accumulate across periods
- Categories: R, HR, RBI, SB, AVG (hitting) + W, SV, ERA, WHIP, K (pitching)
- This is **not** YTD roto — OnRoto displays YTD stats, FBST computes period-scoped stats. Divergence is expected and documented (ADR-013, `docs/reports/onroto-audit-2026-06-08.md`)

---

## Deferred

- **3-way atomic claim** (Add + IL stash + Drop): plan written at `docs/superpowers/plans/2026-06-07-three-way-atomic-claim.md`, not yet implemented
- **SEO and blog expansion**: on hold while roster management and standings accuracy are stabilized
- **Stripe and growth work**: roadmap items, not displacing in-season correctness work
- **OnRoto period snapshots**: user contacted OnRoto 2026-06-03 for period-end roster snapshots; IL-slot fix attempted and reverted; waiting on snapshots before re-investigating

---

## Verification Baseline (2026-06-29 latest)

- Server tests: 1339 passing (main job), 11 skipped, 1 todo (97 test files); + 4 draft integration (db-integration job)
- Client tests: 897 passing (74 test files)
- MCP fbst-app: 83 passing
- MCP mlb-data: 50 passing
- TypeScript: `cd client && npx tsc --noEmit` clean; server local tsc shows phantom zod errors for `shared/` (known false-positive — CI is the authority)
- **Total test count:** 2240 tests passing (1339 backend main + 4 draft integration + 897 frontend, excluding the 133 MCP tests tracked separately)

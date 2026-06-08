# Current Product Status

Last updated: 2026-06-08

## Planning Source of Truth

`server/data/planning.json` is the unified source for both micro todos and macro roadmap. Do not create separate `TODO.md`, `todo-tasks.json`, or `ROADMAP.md`. Active todo list and roadmap render from this file in the Admin and Roadmap views.

---

## Active Period

**Period 4** (Jun 7 – Jul 4, 2026) is live. All 8 OGBA teams completed roster overhauls on June 7 (72 transactions recorded, all matching OnRoto/FanGraphs). Logan Henderson (The Show) is on IL as of June 7 by commissioner action.

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

## Verification Baseline (last clean run)

- Server tests: ~1195 passing, 7 skipped, 1 todo
- Client tests: ~874 passing (71 test files)
- MCP fbst-app: 53 passing
- TypeScript: `cd client && npx tsc --noEmit` clean; server local tsc shows phantom zod errors for `shared/` (known false-positive — CI is the authority)

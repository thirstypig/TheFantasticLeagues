---
title: "feat: Test Season Setup and Commissioner Period Editing"
type: feat
status: active
date: 2026-03-31
---

# Test Season Setup and Commissioner Period Editing

## Enhancement Summary

**Deepened on:** 2026-03-31
**Review agents used:** Architecture Strategist, Spec Flow Analyzer, Code Simplicity Reviewer

### Key Improvements from Deepening
1. **Simplified period editing**: Replaced inline click-to-edit with simple edit form (cuts ~100 lines of complexity)
2. **Dropped bulk period generator**: YAGNI — commissioner adds periods manually (under 1 minute for 12 periods)
3. **Added period date validation**: endDate > startDate, ISO format regex, overlap detection
4. **Identified cron job risk**: `syncAllActivePeriods()` has no league filter — keep test periods in "pending" to avoid API waste
5. **Clarified add/drop mechanism**: Uses commissioner roster tools (`assignPlayer`/`releasePlayer`), not waiver system

### New Considerations Discovered
- Other league members will see the test league in their nav dropdown — name it clearly "[TEST] OGBA Test 2026"
- `copyLeagueData()` silently continues on team copy failures — check team count after copy
- Period dates need ISO format validation (Zod schema currently accepts any string)

---

## Overview

Create an isolated test season (separate league) to validate trades, waiver wire adds/drops, and other in-season features without touching the live 2026 OGBA season. Also add the missing period date/name editing UI to the Commissioner Seasons tab.

## Problem Statement

1. **No safe environment to test in-season features.** Trades, waivers, and add/drops affect real roster data. We need an isolated sandbox to verify these flows work correctly before the live season hits IN_SEASON status.

2. **Commissioner can't edit period dates or names.** The server `PATCH /api/periods/:id` endpoint supports updating `name`, `startDate`, `endDate`, and `status`, but the SeasonManager UI only exposes a status dropdown. Commissioners need to set actual dates for scoring periods.

## Proposed Solution

### Part 1: Commissioner Period Editing UI

Add period name and date editing to `SeasonManager.tsx` via a simple edit form (not inline click-to-edit — per simplicity review). The PATCH endpoint already exists.

**Current state:**
- `SeasonManager.tsx:501 lines` — periods shown in a list with status dropdown and delete button
- `PATCH /api/periods/:id` — accepts `{ name?, startDate?, endDate?, status? }` (Zod validated)
- `client/src/features/seasons/api.ts` — `updatePeriod(id, data)` client function exists

**What to add:**
- [x] "Edit" button per period row that expands an inline form with name (text), startDate (date input), endDate (date input)
- [x] Save/Cancel buttons on the edit form
- [x] Only editable when period status is `"pending"` (active/completed periods are locked)
- [x] "Add Period" form expanded to include name + startDate + endDate (already had dates)

**What NOT to build (per simplicity review):**
- ~~Inline click-to-edit~~ — too much state management for a rarely-used form. Simple expand/collapse form is sufficient.
- ~~Bulk period generator~~ — commissioner can add 12 periods manually in under a minute. Build only if requested.

**Server-side improvement (from spec flow analysis):**
- [x] Add date validation to `periods/routes.ts` Zod schemas:
  - ISO format: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
  - endDate > startDate validation in both POST and PATCH handlers
  - Overlap detection deferred (low priority for MVP)

**Files to modify:**
- `client/src/features/commissioner/components/SeasonManager.tsx` — add edit form with date inputs
- `server/src/features/periods/routes.ts` — add date format + ordering validation to Zod schemas

### Part 2: Test Season Creation

Use the existing "create season from copy" mechanism. This creates a **new League** — fully isolated from League 20.

**Approach: Separate League (confirmed by architecture review)**

The architecture review verified all runtime code paths are properly scoped by `leagueId`:
- Season guard, trades, waivers, auction, standings, periods — all filter by leagueId
- No hidden coupling between leagues
- `copyLeagueData()` is production-grade (handles Ohtani two-way edge case)

**Steps to create the test season:**

1. **Create test league** via Commissioner or Admin panel:
   - [ ] Name: "[TEST] OGBA Test 2026" (prefix with [TEST] so members know it's not real)
   - [ ] Year: 2026
   - [ ] Copy from: League 20 (copies teams, rosters, rules, memberships)
   - [ ] Verify all 10 teams copied (check count — `copyLeagueData` silently skips failures)
   - [ ] This auto-creates a Season in SETUP status

2. **Configure periods** (using the new period editing UI):
   - [ ] Create 2-3 short test periods (1-3 days each)
   - [ ] Set dates to current/recent dates for immediate testing
   - [ ] **Keep periods in "pending" status** until actively testing (see cron job risk below)

3. **Transition through lifecycle:**
   - [ ] SETUP → DRAFT (locks rules, applies budget adjustments)
   - [ ] DRAFT → IN_SEASON (validates periods exist)
   - [ ] This unlocks trade/waiver endpoints for the test league

4. **Test in-season features:**
   - [ ] Propose and process a trade between two teams
   - [ ] Submit and process waiver claims (FAAB bidding)
   - [ ] Use commissioner roster tools for direct add/drop (`assignPlayer`/`releasePlayer`)
   - [ ] Verify roster entries update correctly (acquiredAt, releasedAt, source)
   - [ ] Verify period standings compute correctly with traded players
   - [ ] Verify budget tracking (waiver FAAB deductions)
   - [ ] Run `/audit-data` after each trade to verify no ghost roster entries

5. **Cleanup:**
   - [ ] Mark all test periods as "completed"
   - [ ] Mark test season COMPLETED (stops cron from syncing it)

**No schema changes required.**

## Technical Considerations

### Season Guard Isolation
- `requireSeasonStatus` middleware resolves `leagueId` from the request body/params
- Test league operations will use the test league's `leagueId`, not League 20
- The live season is never affected

### Cron Job Risk (from architecture review)
- **`syncAllActivePeriods()`** at 13:00 UTC queries ALL active periods across ALL leagues with no league filter
- If test league has periods with `status: "active"`, they will be synced daily, consuming MLB API calls
- **Mitigation**: Keep test periods in `"pending"` status until actively testing. Mark them `"completed"` when done.
- **Future fix** (optional): Add `team: { leagueId: period.leagueId }` filter to `mlbStatsSyncService.ts:25-34`

### `getCurrentSeason()` Behavior
- Returns first non-COMPLETED season per league (ordered by year desc)
- Each league has its own independent season — no collision
- The `LeagueContext` on the client switches between leagues via the nav dropdown

### Roster Copy Considerations
- `copyLeagueData()` copies rosters with `source: "prior_season"`
- Two-way players (Ohtani) will appear on both teams (by design)
- Budget values carry over from the source league's team records
- Shared Franchise entity — both leagues under same franchise (fine for testing)

### Add/Drop Mechanism (clarified by spec flow analysis)
- **Trades**: Standard propose → accept → process flow via `/api/trades`
- **Waivers**: Submit claim with bid → commissioner processes via `/api/waivers/process/:leagueId`
- **Direct add/drop**: Commissioner uses roster tools (`CommissionerRosterTool` component) which calls `assignPlayer`/`releasePlayer`
- **Note**: Waiver priority by standings won't work until at least one period is completed with stats

### League Visibility (from spec flow analysis)
- Other league members WILL see the test league in their nav dropdown
- Naming it "[TEST] OGBA Test 2026" is the primary mitigation
- No `isTest` flag exists on the League model — not needed for a one-off test

### Known Gotchas (from institutional learnings)
- **Trade ghost data**: Run `/audit-data` after processing trades to verify no ghost roster entries
- **Date-aware stats**: `computeTeamStatsFromDb` filters by `leagueId` — no cross-league contamination
- **Year constants**: No hardcoded year logic affects this — test season uses same year in different league
- **Period date validation**: Currently accepts any string — add ISO format regex before allowing commissioner editing

## Acceptance Criteria

### Period Editing
- [ ] Commissioner can edit period name via expand/collapse form
- [ ] Commissioner can edit period startDate and endDate via date inputs
- [ ] Editing is disabled for active/completed periods
- [ ] Date validation: endDate must be after startDate, ISO format enforced
- [ ] Changes persist via existing PATCH endpoint
- [ ] "Add Period" form includes name + dates

### Test Season
- [ ] Test league created via copy from League 20 with "[TEST]" prefix
- [ ] All 10 teams verified copied
- [ ] Test league appears in nav league switcher
- [ ] Season transitions work: SETUP → DRAFT → IN_SEASON
- [ ] Trade proposal + processing works in test league
- [ ] Waiver claim submission + processing works in test league
- [ ] Commissioner add/drop via roster tools works in test league
- [ ] Period standings compute correctly for test league
- [ ] Live League 20 data is completely unaffected
- [ ] `/audit-data` passes after trade processing

## Dependencies & Risks

- **Low risk**: Period editing is a UI-only change + minor Zod schema improvement
- **Low risk**: Test season uses existing create-from-copy flow — battle-tested code
- **Medium risk**: First real test of trade/waiver flows since auction. May uncover bugs in processing logic that need fixing before live IN_SEASON
- **Low risk**: Cron job syncing test periods — mitigated by keeping periods in "pending"
- **No migrations**: No schema changes needed
- **No new dependencies**: All infrastructure exists

## Sources & References

- **Existing test season plan**: `docs/plans/2026-03-31-feat-season-stats-insights-test-season-plan.md` (Phase 4)
- **Season service**: `server/src/features/seasons/services/seasonService.ts` (104 lines)
- **Period CRUD**: `server/src/features/periods/routes.ts` (155 lines, full CRUD)
- **Commissioner service**: `server/src/features/commissioner/services/CommissionerService.ts` (createLeague + copyLeagueData)
- **Season manager UI**: `client/src/features/commissioner/components/SeasonManager.tsx` (501 lines)
- **Learnings**: `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — run /audit-data after trades
- **Learnings**: `docs/solutions/logic-errors/hardcoded-season-year-constants.md` — no hardcoded years
- **Architecture review**: Confirmed separate-league approach is sound, identified `syncAllActivePeriods` cross-league risk
- **Spec flow analysis**: Identified 8 user flows, date validation gaps, add/drop mechanism clarification
- **Simplicity review**: Simplified period editing UI, dropped bulk generator (YAGNI)

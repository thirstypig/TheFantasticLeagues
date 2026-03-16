# FBST — Technical Debt & Feature Roadmap

Tracked items from tech debt audit (2026-03-16) and feature planning.
Items are grouped by category and prioritized within each section.

---

## Feature: Season-Aware Feature Gating

Commissioner tabs and owner-facing features should be enabled/disabled based on the current season's status. When a season is COMPLETED (e.g., 2025), features like Auction and Keepers should be grayed out. The UI should show breadcrumb-style guidance showing what's available now and what's next.

### Season Lifecycle & Feature Availability Matrix

| Feature | SETUP | DRAFT | IN_SEASON | COMPLETED | No Season |
|---------|-------|-------|-----------|-----------|-----------|
| **Rules Editor** | Edit | Locked (view only) | Locked | Locked | N/A |
| **Team Management** | Full access | Full access | Full access | View only | N/A |
| **Member Management** | Full access | Full access | Full access | View only | N/A |
| **Period Setup** | Add/edit/delete | Add/edit/delete | Status changes only | View only | N/A |
| **Auction** | Disabled | Full access | Disabled | Disabled | Disabled |
| **Keepers** | Disabled | Disabled | Disabled | Disabled* | Disabled |
| **Trades** | Disabled | Disabled | Full access | Disabled | Disabled |
| **Waivers** | Disabled | Disabled | Full access | Disabled | Disabled |
| **Roster Mgmt** | Manual only | Via auction | Add/Drop | View only | Disabled |
| **Create Season** | Available | Available | Available | Available | Available |

*Keepers: enabled only when preparing NEXT season (i.e., a new season exists in SETUP while prior is COMPLETED).

### Implementation Plan

- [x] **TD-F01**: Add `seasonStatus` to LeagueContext (fetch current season status alongside league data)
- [x] **TD-F02**: Create `useSeasonGating()` hook that returns `{ canAuction, canTrade, canWaiver, canEditRules, canEditRosters, canKeepers, isReadOnly }` based on season status
- [x] **TD-F03**: Commissioner tab gating — disable/gray out tabs based on season status with tooltip explaining why (e.g., "Auction is only available during DRAFT phase")
- [x] **TD-F04**: Breadcrumb status bar on Commissioner page — show current phase + next action needed
- [x] **TD-F05**: Owner-facing feature gating — hide Auction nav item when not in DRAFT phase
- [x] **TD-F06**: Server-side guards — `requireSeasonStatus` middleware on auction nominate/bid (DRAFT), trade propose (IN_SEASON), waiver submit (IN_SEASON). 10 tests.

---

## Tech Debt: Test Coverage

### Server (8 modules with zero tests)

- [x] **TD-T01**: `archive/routes.ts` — 38 tests (GET seasons/standings/periods/stats, PUT team, PATCH stat, POST sync/recalculate, AI endpoints, archive-current)
- [x] **TD-T02**: `admin/routes.ts` — 19 tests (league CRUD, members, import-rosters, reset-rosters, delete, team-codes, sync-mlb, audit-log)
- [x] **TD-T03**: `roster/routes.ts` + `rosterImport-routes.ts` — 14 tests (add-player, delete, get roster, ownership checks, admin bypass, CSV import, template)
- [x] **TD-T04**: `keeper-prep/routes.ts` — 8 tests (populate, status, roster, save, lock/unlock)
- [x] **TD-T05**: `players/routes.ts` — 13 tests (list/filter/detail, fielding, season-stats, period-stats, auction-values)
- [x] **TD-T06**: `periods/routes.ts` — 10 tests (list, create, update, delete with auth checks)
- [x] **TD-T07**: `transactions/routes.ts` — 8 tests (list/filter/paginate, claim by playerId/mlbId, drop, errors)
- [x] **TD-T08**: `franchises/routes.ts` — 6 tests (list, detail, update settings)

### Client (10 modules with zero tests)

- [x] **TD-T09**: `auction/` — 10 tests (AuctionValues page: rendering, tabs, search, sorting, modal)
- [ ] **TD-T10**: `trades/pages/TradesPage.tsx` — complex multi-team trade UI
- [x] **TD-T11**: `teams/` — 17 tests (Teams page: 8 tests; Team page: 9 tests)
- [ ] **TD-T12**: `archive/pages/ArchivePage.tsx` — heavy data display + import
- [ ] **TD-T13**: Remaining modules (keeper-prep, leagues, periods, roster, transactions, waivers) — lower priority

---

## Tech Debt: Code Quality

### Oversized Route Files (extract to services)

- [x] **TD-Q01**: `archive/routes.ts` (992→~800 LOC) — extracted `autoMatchPlayersForYear` + `calculateCumulativePeriodResults` into `archiveStatsService.ts`
- [x] **TD-Q02**: `commissioner/routes.ts` (877→779 LOC) — extracted `endAuction` + `executeTrade` into `CommissionerService.ts`
- [ ] **TD-Q03**: `auction/routes.ts` (844 LOC) — deferred: real-time stateful system with in-memory state + timers; 72 tests pass; extraction risk outweighs benefit

### Type Safety

- [x] **TD-Q04**: `playerDisplay.ts` functions typed — `isPitcher` accepts union type, `normalizePosition` typed, `getMlbTeamAbbr` accepts `Record<string, unknown>`
- [x] **TD-Q05**: `TradesPage.tsx` `LeagueTradeCard` — `trade: any` → `trade: TradeProposal` (type already existed)
- [x] **TD-Q06**: `archiveImportService.ts` — typed output interfaces (StandardizedPlayerRow, StandingsRowObj, PlayerKnowledge, FuzzyEntry), replaced `any` accumulators, typed CSV records as `Record<string, string>`, fixed `catch (err: any)` → `unknown`
- [x] **TD-Q07**: Audited `: any` annotations — fixed 8 high-priority files (commissioner routes, teamService, mlbTeamCache, index.ts, Payouts, Teams, Profile, players/api). ~60 fixable → ~40 remaining (mostly justified: Prisma JSON, MLB API, XLSX parsing)

### Duplicate Code

- [x] **TD-Q08**: Consolidated `playerDisplay.ts` → `sportConfig.ts`. Moved `normalizePosition` + `getMlbTeamAbbr`, deleted dead code (`getGrandSlams`, `getShutouts`), `playerDisplay.ts` is now a thin re-export layer
- [x] **TD-Q09**: Duplicate period APIs — removed orphaned `getPeriods`, `savePeriod`, `deletePeriod` from `leagues/api.ts` (seasons/api.ts is canonical)

### API Barrel Exports

- [x] **TD-Q10**: `client/src/features/waivers/api.ts` re-exported in `client/src/api/index.ts`
- [x] **TD-Q11**: `client/src/features/seasons/api.ts` re-exported in `client/src/api/index.ts`

---

## Tech Debt: Maintenance

### Scripts Cleanup

- [x] **TD-M01**: Deleted 29 completed one-off scripts from `server/src/scripts/` (67→39 files). Removed year-specific imports (2020-2025), permission fix scripts, duplicate period imports.
- [ ] **TD-M02**: Consolidate import logic into parameterized functions instead of per-year scripts

### Console Logging

- [x] **TD-M03**: Migrated 8 production files from `console.*` to structured `logger` — data/, archive services, supabase.ts. Scripts (67 files) left as-is (one-off tools)

### Open TODOs in Code

- [ ] **TD-M04**: `archive/pages/ArchivePage.tsx:347` — "TODO: Optimize backend to return matrix" (currently fetches each period separately)
- [x] **TD-M05**: `trades/pages/TradesPage.tsx:345` — `trade: any` TODO resolved (typed as `TradeProposal`)

---

## Tech Debt: Infrastructure

- [x] **TD-I01**: Pre-existing TypeScript error in client (`adminDeleteLeague` type mismatch) — already resolved
- [x] **TD-I02**: Route handler error handling — audited all 17 feature modules, all async handlers wrapped with `asyncHandler()`. Sync-only handlers (template download, static data) correctly omit it
- [x] **TD-I03**: Zero circular deps — extracted auction types to `types.ts` (was routes↔services cycle), verified with madge

---

## Completed (from prior sessions)

- [x] `001` Hardcoded DB credentials — fixed Session 8
- [x] `002` Archive + roster import missing auth — fixed Session 8
- [x] `003` Auction ownership checks — fixed Session 8
- [x] `004` Roster ownership checks — fixed Session 8
- [x] `005` Type standings service — fixed Session 9
- [x] `006` Cache standings computation — fixed Session 9
- [x] `007` Auth migration (raw fetch → fetchJsonApi) — fixed Session 9
- [x] `008` Test files testing copied logic — fixed Session 9
- [x] `009` Document cross-feature deps — fixed Session 9
- [x] `010` Waivers info disclosure — fixed Session 8
- [x] `011` AppShell cleanup — fixed Session 10
- [x] `012` RulesEditor derive grouped — fixed Session 10
- [x] `013` Commissioner design tokens — fixed Session 10
- [x] `014` parseIntParam move — fixed Session 10
- [x] Duplicate season creation forms — fixed Session 18 (PR #33)
- [x] Duplicate period management (Controls + Season tabs) — fixed Session 18 (PR #33)
- [x] Controls tab renamed to Auction — fixed Session 18 (PR #33)
- [x] LeagueContext stale ID validation — fixed Session 18 (PR #33)

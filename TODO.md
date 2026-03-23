# FBST — Technical Debt & Feature Roadmap

Tracked items from tech debt audits (Sessions 7-26) and 6-agent code review (Session 27).
Items grouped by priority. P1 = fix before live auction (Mar 22), P2 = fix soon, P3 = when convenient.

---

## P1 — Critical (fix before Sunday auction)

### Auction Reliability

- [x] **CR-01**: Await `AuctionLot.update` in `finishCurrentLot` — currently fire-and-forget, lot stays "active" in DB if update fails while roster entry is already created. Data integrity risk for bid-history endpoint.
  - File: `server/src/features/auction/routes.ts:391-394`
  - Fix: `await` the Prisma call or wrap roster+lot in a transaction
  - Effort: Small

- [x] **CR-02**: `AuctionDraftLog` re-fetches bid history on every log event — useEffect depends on `log.length` but only WIN events add new data. Causes 3-5x unnecessary API calls during live auction, multiplied by concurrent viewers.
  - File: `client/src/features/auction/components/AuctionDraftLog.tsx:57`
  - Fix: Derive `winCount` from log, use `[leagueId, winCount]` as dependency
  - Effort: Small

- [x] **CR-03**: `checkPositionLimit` re-queries DB on every bid — data already exists in `state.teams[].pitcherCount/hitterCount` and `state.config.pitcherCount/batterCount`. ~690 unnecessary queries per full auction.
  - File: `server/src/features/auction/routes.ts:259-288`
  - Fix: Use in-memory state instead of Prisma query; also skip redundant `loadLeagueConfig` call
  - Effort: Small

---

## P2 — Important (fix soon)

### Security

- [x] **CR-04**: `player-season-stats` defaults `leagueId: 1` without membership check — any authenticated user can view any league's roster composition and auction prices.
  - File: `server/src/features/players/routes.ts:478`
  - Fix: Require `leagueId` param (400 if missing) and add `requireLeagueMember`, or strip roster fields for non-members
  - Effort: Small

- [x] **CR-05**: `persistState` swallows errors with `.catch(() => {})` — silent auction state loss if DB connection drops. Server restart would lose auction progress with no warning.
  - File: `server/src/features/auction/routes.ts:135`
  - Fix: Change to `.catch((err) => logger.error({ error: String(err), leagueId }, "Failed to persist auction state"))`
  - Effort: Small

### Code Duplication

- [x] **CR-06**: `positionToSlots()` duplicated in `auction/routes.ts` (server) and `PlayerPoolTab.tsx` (client) — identical logic. Should live in `sportConfig.ts` on both sides.
  - Files: `server/src/features/auction/routes.ts:233-244`, `client/src/features/auction/components/PlayerPoolTab.tsx:32-43`
  - Fix: Add to `server/src/lib/sportConfig.ts` and `client/src/lib/sportConfig.ts` (or `baseballUtils.ts`), import from there
  - Effort: Small

- [x] **CR-07**: `NL_TEAMS`/`AL_TEAMS` redefined locally in `PlayerPoolTab.tsx` instead of importing from `sportConfig.ts`. Local version also has extra `"AZ"` alias not in canonical set.
  - File: `client/src/features/auction/components/PlayerPoolTab.tsx:48-49`
  - Fix: Import from `client/src/lib/sportConfig.ts`, add `"AZ"` to canonical set if needed
  - Effort: Small

- [x] **CR-08**: `PITCHER_CODES` vs `PITCHER_POS` naming inconsistency — same set under different names. Canonical `sportConfig.ts` also missing `"TWP"` (two-way player).
  - Files: `PlayerPoolTab.tsx:45` (`PITCHER_POS`), `auction/routes.ts:246` (`PITCHER_CODES`), `sportConfig.ts` (both sides)
  - Fix: Add `"TWP"` to canonical `PITCHER_CODES`, import everywhere, remove local copies
  - Effort: Small

### Type Safety

- [x] **CR-09**: `AuctionLogEvent` redeclared in `AuctionDraftLog.tsx` with `type: string` instead of importing the union type (`'NOMINATION' | 'BID' | 'WIN' | ...`) from `types.ts`.
  - File: `client/src/features/auction/components/AuctionDraftLog.tsx:28-36`
  - Fix: Import from auction types (already available on client side via `useAuctionState.ts`)
  - Effort: Small

- [x] **CR-10**: `@ts-expect-error` for dynamic stat key access in `PlayerPoolTab.tsx` — should use a `StatKey` union type for `sortKey` state.
  - File: `client/src/features/auction/components/PlayerPoolTab.tsx:117-121`
  - Fix: Define `type StatKey = 'name' | 'R' | 'HR' | 'RBI' | 'SB' | 'AVG' | 'W' | 'SV' | 'K' | 'ERA' | 'WHIP'`, type `sortKey` and `getStat` with it
  - Effort: Small

---

## P3 — Nice-to-Have (when convenient)

### Dead Code & Cleanup

- [x] **CR-11**: Unused imports in `PlayerPoolTab.tsx` — `ThemedTable`, `ThemedThead`, `ThemedTh`, `ThemedTr`, `ThemedTd` (line 3) and `PITCHER_POS` constant (line 45). Remove.
  - Effort: Trivial

- [x] **CR-12**: Double `useLeague()` call in `AuctionDraftLog.tsx` (lines 44 & 59) — merge into single destructure.
  - Effort: Trivial

- [x] **CR-13**: Dead ternary `colCount = viewGroup === 'hitters' ? 9 : 9` — always 9. Inline or simplify.
  - File: `client/src/features/auction/components/PlayerPoolTab.tsx:192`
  - Effort: Trivial

- [x] **CR-14**: Missing `useMemo` on `teamMap` and `completedLots` in `AuctionDraftLog.tsx` — recomputed on every render (tab switch, expand/collapse, WebSocket updates).
  - File: `client/src/features/auction/components/AuctionDraftLog.tsx:61,64`
  - Effort: Small

### Architecture

- [x] **CR-15**: Stats fetching logic (~140 LOC) inline in `players/routes.ts` — violates feature-module pattern. Should extract to `players/services/statsService.ts`.
  - File: `server/src/features/players/routes.ts:25-140`
  - Effort: Medium

- [x] **CR-16**: Raw `<table>` instead of ThemedTable in `AuctionDraftLog.tsx` and `PlayerPoolTab.tsx` — added `compact` variant to ThemedTable via React context, migrated both files.
  - Effort: Medium

### Player Data

- [ ] **TD-F01**: Expand player sync to include minor league prospects and top rookies — currently `syncAllPlayers` only syncs MLB 40-man rosters. Need to include top prospects (e.g., Konner Griffin) so they appear in the auction player pool for nomination. MLB Stats API has minor league roster data. Consider syncing "futures" or "top prospects" lists per team.
  - Files: `server/src/features/players/services/mlbSyncService.ts`, MCP `get-team-roster` tool
  - Effort: Medium

- [ ] **TD-F02**: Refresh position eligibility from fielding stats — Player `posList`/`posPrimary` fields are stale from initial sync and don't reflect games played at each position. Rule: 20+ games played at a position qualifies the player for that slot. Example: Alex Burleson has 75 GP at OF but DB only shows "1B", so OF isn't offered in the position dropdown.
  - Fix: During stats sync (`syncAllPlayers` or a new fielding sync), fetch fielding stats from MLB API (`hydrate=stats(group=[fielding],type=[season])`), compute games played per position, and update `Player.posList` with all positions where GP >= 20.
  - The position dropdown in `TeamListTab.tsx` already uses `positionToSlots()` to derive eligible roster slots (MI, CI, etc.) — it just needs correct source data.
  - Files: `server/src/features/players/services/mlbSyncService.ts`, `server/src/features/players/routes.ts` (fielding endpoint already exists), `prisma/schema.prisma` (Player.posList)
  - Effort: Medium

### Existing Open Items

- [ ] **TD-Q03**: `auction/routes.ts` (874 LOC) — extraction deferred; real-time stateful system with in-memory state + timers; 72+ tests pass. Revisit after auction season.

- [x] **RD-01**: Lazy-load heavy modules — `xlsx` (2.3MB) and `@google/generative-ai` (1.2MB) loaded eagerly
- [x] **RD-02**: Prisma singleton enforcement — 8 scripts converted to import from `db/prisma.ts`
- [x] **RD-03**: npm audit in CI — `.github/workflows/ci.yml` blocks on critical vulnerabilities
- [x] **RD-04**: Shared component extraction — moved `PlayerDetailModal` and `StatsTables` to `client/src/components/shared/`

---

## Auction Feature Ideas (backlog)

Future auction enhancements, roughly ordered by impact.

### High Impact
- [x] **AUC-01**: Nominator sets opening bid — inline $input with Go button in PlayerPoolTab (default $1). Enter to confirm, Escape to cancel. Auto-nominations from queue still use $1. *(Session 30)*
- [x] **AUC-02**: Watchlist / Favorites — star icon on every player row (amber when starred), "★" filter button, persisted per league in localStorage. New hook: `useWatchlist.ts`. *(Session 30)*
- [x] **AUC-03**: Chat / Trash Talk — WebSocket CHAT messages broadcast to room, rate limited (5 msgs/10s, 500 char max), ephemeral (in-memory). New component: `ChatTab.tsx`. *(Session 30)*
- [x] **AUC-04**: Sound Effects / Notifications — Web Audio API oscillator tones (zero deps), 5 sounds (ding, alert, sweep, arpeggio, tick), mute toggle persisted in localStorage. New hook: `useAuctionSounds.ts`. *(Session 30)*

### Medium Impact
- [x] **AUC-05**: Value Over Replacement in Player Pool — "Val" column showing $dollar_value, surplus (value - current bid) with green/red color coding during active bidding. Sortable. *(Session 30)*
- [x] **AUC-06**: Spending Pace Tracker — league summary bar (total drafted, spent, avg price), per-team budget progress bars (green/amber/red), hot/cold indicators (Flame/Snowflake when avg differs >25% from league avg). *(Session 30)*
- [x] **AUC-07**: Position Needs Matrix — compact grid in Teams tab showing filled/limit per position per team. Green = has players, Red = full. *(Session 31)*
- [x] **AUC-08**: Nomination Timer Countdown — visible 30s countdown during nominating phase, pulses red at <10s. *(Session 31)*
- [x] **AUC-09**: "Going Once, Going Twice, SOLD!" Visual — "Going once" at 5s (amber), "Going twice" at 3s (red), "SOLD!" at 1s (bounce). Red glow border on nominee card. *(Session 31)*

### Nice-to-Have
- [x] **AUC-10**: Pre-Draft Rankings Import — CSV upload or paste in Settings tab, private "My Rank" column in Player Pool, sortable. localStorage per league. *(Session 32)*
- [x] **AUC-11**: Post-Auction Trade Block — toggle players as "available for trade" on AuctionComplete page, visible to all teams on Team page. DB-backed via `tradeBlockPlayerIds` on Team model. 8 new tests. *(Session 32)*
- [x] **AUC-12**: Keeper Cost Preview — shows "Keeper next year: $bid+5" when you're the high bidder. *(Session 31)*

---

## Completed (all sessions)

<details>
<summary>Click to expand completed items (47 items across Sessions 5-26)</summary>

### Session 27 Code Review — Findings addressed inline above

### Feature: Season-Aware Feature Gating (Sessions 18-20)
- [x] TD-F01: Add `seasonStatus` to LeagueContext
- [x] TD-F02: `useSeasonGating()` hook
- [x] TD-F03: Commissioner tab gating
- [x] TD-F04: Breadcrumb status bar
- [x] TD-F05: Owner-facing feature gating
- [x] TD-F06: Server-side `requireSeasonStatus` middleware (10 tests)

### Test Coverage (Sessions 19-24)
- [x] TD-T01: archive/routes — 38 tests
- [x] TD-T02: admin/routes — 19 tests
- [x] TD-T03: roster/routes — 14 tests
- [x] TD-T04: keeper-prep/routes — 8 tests
- [x] TD-T05: players/routes — 13 tests
- [x] TD-T06: periods/routes — 10 tests
- [x] TD-T07: transactions/routes — 8 tests
- [x] TD-T08: franchises/routes — 6 tests
- [x] TD-T09: auction (client) — 10 tests
- [x] TD-T10: trades (client) — 23 tests
- [x] TD-T11: teams (client) — 17 tests
- [x] TD-T12: archive (client) — 16 tests
- [x] TD-T13: remaining modules (client) — 36 tests

### Code Quality (Sessions 9-21)
- [x] TD-Q01: archive/routes extraction
- [x] TD-Q02: commissioner/routes extraction
- [x] TD-Q04–Q07: Type safety improvements
- [x] TD-Q08: playerDisplay → sportConfig consolidation
- [x] TD-Q09: Duplicate period APIs removed
- [x] TD-Q10–Q11: API barrel exports

### Maintenance (Sessions 15-16)
- [x] TD-M01: Deleted 29 one-off scripts
- [x] TD-M02: Consolidated 15 scripts into 6
- [x] TD-M03: console.* → logger migration
- [x] TD-M04: Archive matrix N+1 optimization
- [x] TD-M05: trade: any → TradeProposal

### Infrastructure (Sessions 5-10)
- [x] TD-I01: TypeScript build error
- [x] TD-I02: asyncHandler audit
- [x] TD-I03: Zero circular deps
- [x] 001–004, 010: Security fixes (auth, ownership, credentials)
- [x] 005–009: Code quality (typing, caching, auth migration, test fixes, cross-feature docs)
- [x] 011–014: Cleanup (AppShell, RulesEditor, design tokens, parseIntParam)
- [x] Duplicate season/period forms — Session 18
- [x] Controls tab → Auction — Session 18
- [x] LeagueContext stale ID — Session 18

</details>

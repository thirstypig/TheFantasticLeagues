---
title: "feat: Session 37 — End Auction, Periods, AI Retrospective, Sidebar Nav, Table Design, Module Isolation"
type: feat
status: active
date: 2026-03-22
deepened: 2026-03-22
---

# Session 37 Mega-Plan

## Enhancement Summary

**Deepened on:** 2026-03-22
**Research agents used:** Sidebar Nav Best Practices, Table Design for Data Apps, WebSocket State Refresh, Fantasy Auction Retrospective, Learnings Researcher
**Sections enhanced:** 5 of 7 (Phases 1C, 2A, 3A, 4A-C received deep research)

### Key Improvements from Research
1. **WebSocket matrix fix** — HTTP PATCH + WS broadcast hybrid confirmed as correct pattern; add `refreshTeams` WS message type
2. **Sidebar** — Collapsible sections with persisted state, `aria-current="page"`, disable-not-hide for season-gated items, mobile bottom tab bar
3. **Tables** — Split filter/sort useMemo, sticky first column on mobile, `SortableHeader` component, zebra striping via existing `--lg-table-row-alt` token
4. **Retrospective** — Existing endpoint has rich data; add roster balance score, price inflation index, spending-as-percentage metrics; AI trade suggestions
5. **Past learnings** — 3 critical docs apply: sticky header overflow blockers, API_BASE routing, touch target 44px minimum

---

## Phase 1: Auction Lifecycle Completion

### 1A. Add "End Auction" Endpoint

**Problem:** The auction only ends automatically when all rosters are full (`advanceQueue` returns false → `status = 'completed'`). There is no manual way for a commissioner to end the auction early (e.g., if remaining spots will be filled via free agency). The only alternative is `/reset` which **deletes everything**.

**Proposed Solution:** Add `POST /api/auction/complete` — commissioner/admin action that:
- Sets `state.status = 'completed'`
- Clears all timers (nomination + auto-finish)
- Persists final state
- Broadcasts to all WebSocket clients
- Writes audit log entry

**Files to modify:**
- `server/src/features/auction/routes.ts` — new `/complete` endpoint after existing `/reset`
- `client/src/features/auction/components/AuctionSettings.tsx` — add "End Auction" button (commissioner only)

**Acceptance Criteria:**
- [ ] `POST /api/auction/complete` sets auction status to `completed`
- [ ] Requires `requireAuth` + commissioner/admin check
- [ ] Clears nomination and auto-finish timers
- [ ] Broadcasts completed state via WebSocket
- [ ] Audit log records `AUCTION_COMPLETE` action
- [ ] UI shows "End Auction" button in commissioner settings panel
- [ ] Confirmation dialog before ending ("Are you sure? This cannot be undone.")
- [ ] Test: endpoint returns success, state.status === 'completed'

### Research Insights

**State machine safety:** The endpoint should validate that the auction is in a valid state for completion (nominating, bidding, or paused — NOT already completed or not_started). If mid-bid, auto-finish the current lot first before completing.

**Edge case:** If a nomination timer is running and the commissioner ends the auction, any in-progress nomination should be canceled (not awarded). Document this behavior clearly in the confirmation dialog.

---

### 1B. Create 2026 Periods

**Problem:** Season transition DRAFT → IN_SEASON requires periods to exist. The `transitionStatus` service validates `periods.length > 0`. No periods exist for 2026 yet.

**Proposed Solution:** Use the Commissioner page's Season Manager to create periods, or the existing API:
- `POST /api/periods` — create a period (`{ name, startDate, endDate, leagueId, seasonId, status }`)
- `PATCH /api/periods/:id` — update a period
- `DELETE /api/periods/:id` — delete a period

**Period Structure (typical 2026 season):**

| Period | Start | End | Duration |
|--------|-------|-----|----------|
| Period 1 | 2026-03-25 | 2026-05-04 | ~6 weeks |
| Period 2 | 2026-05-05 | 2026-06-15 | ~6 weeks |
| Period 3 | 2026-06-16 | 2026-07-13 | ~4 weeks (All-Star break) |
| Period 4 | 2026-07-14 | 2026-08-23 | ~6 weeks |
| Period 5 | 2026-08-24 | 2026-09-27 | ~5 weeks |

**Acceptance Criteria:**
- [ ] 5 periods created for 2026 season with correct date ranges
- [ ] All periods linked to correct seasonId and leagueId
- [ ] Commissioner can edit period dates from the UI
- [ ] Season can transition from DRAFT → IN_SEASON after periods exist
- [ ] Verify `useSeasonGating()` reflects IN_SEASON state

---

### 1C. AI Auction Retrospective

**Problem:** The auction retrospective endpoint and AI analysis service already exist but haven't been used.

**Existing Infrastructure:**
- `GET /api/auction/retrospective?leagueId=N` — returns league stats, bargains/overpays, position spending, contested lots, team efficiency
- `GET /api/auction/draft-grades?leagueId=N` — Gemini AI-powered team grades with caching
- `server/src/services/aiAnalysisService.ts` — AI-powered analysis
- Client: `DraftReport.tsx`, `BidHistoryChart.tsx`, `AuctionComplete.tsx`, `AIAnalysisTab.tsx`
- 11 tests in `retrospective.test.ts`

**Proposed Solution:** End the auction (1A), then call the retrospective endpoint and present results.

**Acceptance Criteria:**
- [ ] Call `GET /api/auction/retrospective?leagueId=1` and verify it returns data
- [ ] Review: league averages, biggest bargains, biggest overpays
- [ ] Review: position spending breakdown (P vs hitters)
- [ ] Review: team efficiency scores
- [ ] If AI draft grades available, run and review
- [ ] Share results with league

### Research Insights (Auction Retrospective)

**Additional metrics to consider (Phase 2 enhancements):**

| Metric | Description | Priority |
|--------|-------------|----------|
| **Roster Balance Score** | Rate each team's positional coverage: all slots filled with quality starters? 0-100 scale. | High |
| **Price Inflation Index** | Compare actual league prices to PlayerValue projections. Was the league hot or cold overall? | High |
| **Spending-as-Percentage** | Each team's spend per position as % of total budget. More comparable than raw dollars. | High |
| **Bidding Aggression Score** | Per team: nominations won / total nominations, avg bid increment. | Medium |
| **End-Game Efficiency** | Last 25% of lots: teams that found bargains when others were depleted. | Medium |
| **Stars-and-Scrubs Index** | Standard deviation of player prices per team. High = stars-and-scrubs, low = balanced. | Low |

**Visualization ideas:**
- Spending distribution histogram (pure CSS bars, matching BidHistoryChart approach)
- Position spending stacked bars per team
- Spending pace line chart (convert existing Q1-Q4 cards)

**AI enhancements (future):**
- Trade suggestions based on roster gaps + surplus data
- Roster strength assessment with hitting/pitching depth scores
- Season outlook with projected category finishes

---

## Phase 2: Auction UX Fix

### 2A. Teams Tab Position Save + Matrix Refresh

**Problem:** In TeamListTab, changing a player's position via the dropdown calls `handlePositionSwap()` which:
1. Optimistically updates local `detailedRoster` state
2. PATCHes `/api/teams/:teamId/roster/:rosterId` (saves to DB)
3. Refreshes `detailedRoster` from `/api/teams/:teamId/summary`

But the **position matrix at the top of the page** is driven by `state.teams[].positionCounts` from the auction WebSocket state, NOT from `detailedRoster`. So the DB save works but the matrix doesn't update.

**Proposed Solution (Option A — WebSocket refresh):** After successful PATCH, send a `refreshTeams` message via the WebSocket. Server calls `refreshTeams(state)` and broadcasts updated state to all clients.

**Files to modify:**
- `client/src/features/auction/components/TeamListTab.tsx:100-117` — add WS message after PATCH success
- `server/src/features/auction/routes.ts` — handle `refreshTeams` WS message type
- `client/src/features/auction/hooks/useAuctionState.ts` — expose `sendMessage()` or `requestRefresh()` method

**Acceptance Criteria:**
- [ ] Position dropdown change saves to DB (already works)
- [ ] Position matrix updates immediately after save
- [ ] Other connected clients see the matrix update
- [ ] Error state reverts both the dropdown and any optimistic matrix update
- [ ] Test: change position, verify matrix count changes

### Research Insights (WebSocket State Sync)

**Confirmed pattern:** HTTP PATCH + WS broadcast is the correct architecture. This is what Sleeper, ESPN, and Yahoo use for draft systems. Do NOT move mutations to pure WebSocket — you'd lose Express middleware (auth, validation, audit logging).

**Implementation approach:**

```typescript
// Server: handle refreshTeams WS message
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'refreshTeams') {
    const state = auctionStates.get(leagueId);
    if (state) {
      refreshTeams(state).then(() => broadcastState(leagueId, state));
    }
  }
});

// Client: after successful PATCH in handlePositionSwap
await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, { method: 'PATCH', ... });
wsRef.current?.send(JSON.stringify({ type: 'refreshTeams' }));
```

**Past learning (critical):** From `docs/solutions/runtime-errors/auction-production-outage-api-routing-player-ids.md` — always use `${API_BASE}` for PATCH calls, never hardcoded `/api/`. The existing `handlePositionSwap` already does this correctly.

**Edge case:** If the WS connection is dropped, the PATCH still saves to DB (correct). The matrix will catch up on next WS reconnect (which triggers `fetchState()`).

---

## Phase 3: Sidebar Navigation Condensing

### 3A. Current State

The sidebar has **4 sections, 16 nav items**:

| Section | Items | Visibility |
|---------|-------|------------|
| **League** | Home, Season, Players, Auction, Activity | All users |
| **Reference** | About, Guide, Rules, Archive, Payouts | All users |
| **Manage** | Commissioner, Admin | Role-gated |
| **Resources** | Roadmap, Changelog, Under the Hood, Docs, Status | Admin-only |

### 3B. Proposed Redesign

**Recommended Structure (from research: Linear, Notion, ESPN, Yahoo patterns):**

```
── Primary (no header, always visible) ──
  Home
  Season
  Players
  Auction (disabled-not-hidden outside DRAFT)
  Activity

── League Info (collapsed by default) ──
  ▶ Rules
  ▶ Payouts
  ▶ Archive

── Manage (role-gated, collapsed) ──
  ▶ Commissioner
  ▶ Admin

── Dev (admin only, collapsed) ──
  ▶ Changelog / Roadmap / Tech / Docs / Status
```

**Key changes:**
- Remove "About" and "Guide" from sidebar → move to Help (?) icon or footer
- Collapse secondary sections by default with persisted state in localStorage
- **Disable** season-irrelevant items (greyed out, tooltip showing "Available during DRAFT") rather than hiding — prevents layout shift
- Primary section has no header — just the top items

**Files to modify:**
- `client/src/components/AppShell.tsx` — NAV_SECTIONS, collapsible groups, `useSeasonGating()` integration

**Acceptance Criteria:**
- [ ] Primary nav items always visible (5 items)
- [ ] Secondary sections collapsed by default with toggle
- [ ] Collapsed state persisted in localStorage
- [ ] Season-gated items disabled (not hidden) with tooltip
- [ ] Mobile hamburger menu still works
- [ ] Touch targets ≥ 44px

### Research Insights (Sidebar Navigation)

**Priority implementation order (from research):**

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Replace native `title` with Radix Tooltip in collapsed mode | Small | High |
| 2 | Add `aria-current="page"` to active links | Trivial | Medium |
| 3 | Add `aria-expanded` + `aria-controls` to mobile trigger | Trivial | Medium |
| 4 | Add Escape key handler for mobile drawer | Small | Medium |
| 5 | Add focus management on mobile drawer open/close | Small | Medium |
| 6 | Use `useSeasonGating()` to disable (not hide) phase-irrelevant items | Medium | Medium |
| 7 | Make section headers collapsible with persisted state | Medium | Medium |
| 8 | Reduce `SIDEBAR_COLLAPSED` from 80 to 64px | Trivial | Small |
| 9 | Add keyboard shortcut (Cmd+B) for sidebar toggle | Small | Medium |

**Collapsible section animation pattern (CSS Grid, no JS measurement):**

```css
.nav-section-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms ease-out;
}
.nav-section-content[data-open="true"] {
  grid-template-rows: 1fr;
}
.nav-section-content > div {
  overflow: hidden;
}
```

**Mobile bottom tab bar (future enhancement):**
Research shows bottom tab bars outperform hamburger menus for 4-5 primary items (Redbooth saw 65% increase in DAU). Consider adding a mobile bottom tab bar for Home, Season, Players, Activity, + "More" drawer. This is a separate feature worth planning independently.

**Past learning:** From `docs/solutions/ui-bugs/ios-viewport-height-and-touch-target-sizing.md` — use `100svh` for stable layout on iOS Safari, ensure touch targets ≥ 44px (`min-h-11` or `p-3`).

---

## Phase 4: Table Design Evaluation + Refresh

### 4A. Current Table Inventory

| Page | Component | Table Type | Sticky | Density | Notes |
|------|-----------|-----------|--------|---------|-------|
| Players (Hitters) | ThemedTable | Full stats | Yes | Comfortable (46px rows) | 10+ stat columns |
| Players (Pitchers) | ThemedTable | Full stats | Yes | Comfortable | Same pattern |
| Season/Standings | StatsTables | Category matrix | No | Comfortable | Shared component |
| Auction (Draft Log) | ThemedTable | Bid history | Yes | Compact | Search + filter |
| Auction (Player Pool) | ThemedTable | Available players | Yes | Comfortable | Search + filter |
| Auction (Teams) | TeamListTab | Position matrix + roster | No | Mixed | Expandable rows |
| Teams (Roster) | TeamRosterManager | Drag-and-drop | No | Comfortable | dnd-kit based |
| Archive | StatsTables | Historical data | No | Comfortable | Multiple tabs |
| Periods | StatsTables | Period standings | No | Comfortable | Toggle periods |
| Trades | Custom table | Trade proposals | No | Comfortable | Action buttons |
| Commissioner | Various | Settings/roster | No | Mixed | Mixed layouts |

### 4B. Recommended Design Direction: Option B (Information Density Refresh)

Based on research, Option B provides the best ROI — tighter rows for stat-heavy tables while keeping the existing ThemedTable system.

### 4C. Implementation Plan

**Concrete changes:**

| Change | Files | Impact |
|--------|-------|--------|
| Add density prop to TableCell (`compact`/`default`/`comfortable`) | `table.tsx` | Enables per-table density |
| Standardize stat tables to `default` density (36px rows, 13px font) | Players.tsx, StatsTables.tsx | More data per screen |
| Add `SortableHeader` component | New shared component | Replaces inline sort logic repeated 10+ times |
| Add sticky first column for mobile | Players.tsx, StatsTables.tsx | Player names stay visible on horizontal scroll |
| Apply zebra striping via `--lg-table-row-alt` | `table.tsx` or `index.css` | Better horizontal eye-tracking in dense tables |
| Split filter/sort into separate useMemo calls | Players.tsx | Sort changes don't re-run filter logic |
| Add `--lg-positive` / `--lg-negative` semantic tokens | `index.css` | Mode-aware value colors |
| Debounce search with `useDeferredValue` | Players.tsx | Smoother typing in search box |

**Density tiers:**

| Tier | Row Height | Font | Padding | Use Case |
|------|-----------|------|---------|----------|
| `compact` | 28-32px | 12px | `px-1.5 py-1` | Auction panels, embedded tables |
| `default` | 36-40px | 13px | `px-3 py-1.5` | Players, standings, stats |
| `comfortable` | 44-48px | 15px | `px-3 py-3` | Summary tables, team overview |

**Acceptance Criteria:**
- [ ] All tables audited: consistent use of ThemedTable
- [ ] Stat-heavy tables use `default` density (36px rows)
- [ ] Summary tables keep `comfortable` density
- [ ] Sticky first column on Players page for mobile
- [ ] Zebra striping applied to dense stat tables
- [ ] SortableHeader component replaces inline sort logic
- [ ] Dark mode and light mode verified
- [ ] Sticky headers still work after changes
- [ ] Performance: separate filter/sort memos in Players.tsx

### Research Insights (Table Design)

**Critical finding — `tabular-nums`:** Already applied in `table.tsx` (line 117-118). Never remove this. All numeric stat columns should also be right-aligned for instant visual comparison.

**Sticky first column pattern (dual-axis sticky):**

```css
thead th:first-child, tbody td:first-child {
  position: sticky; left: 0; z-index: 5;
  background: var(--lg-table-header-sticky-bg);
}
thead th:first-child { z-index: 15; } /* corner cell above both axes */
```

**Past learning (critical):** From `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md`:
- `position: sticky` fails when ANY ancestor creates a scroll context (`overflow: auto/hidden`)
- shadcn's Table wrapper has `overflow-auto` that traps sticky elements
- ThemedTable's `bare` mode fixes this by removing the wrapper
- Never use `backdrop-blur` on sticky headers — use opaque `--lg-table-header-sticky-bg`

**Known bug to fix:** `ThemedTable` applies `className` to the outer wrapper div instead of the inner `<table>` when `bare=false`. Custom table widths/classes go to wrong element.

**Performance — avoid re-rendering on sort:**

```typescript
// Current: single useMemo re-runs filter AND sort on sort change
const filteredPlayers = useMemo(() => filter().sort(), [filters, sortKey]);

// Better: separate memos
const filtered = useMemo(() => filter(), [filters]);
const sorted = useMemo(() => [...filtered].sort(sortFn), [filtered, sortKey, sortDesc]);
```

---

## Phase 5: Feature Module Isolation Check

### 5A. Verification Checklist

For each of the 18 feature modules, verify:
- [ ] Has `index.ts` with proper re-exports
- [ ] Router uses named export (`export const fooRouter = router`)
- [ ] No circular imports (A imports B imports A)
- [ ] Cross-feature imports documented in CLAUDE.md
- [ ] Tests co-located in `__tests__/` directory
- [ ] No leaked implementation details (internal services exported unnecessarily)

### 5B. Known Cross-Feature Dependencies (from CLAUDE.md)

**Server (15 cross-imports):**
- leagues → keeper-prep, commissioner
- admin → commissioner
- commissioner → auction, trades
- auth → commissioner
- standings → players
- transactions → players
- seasons → commissioner
- auction → seasons

**Client (13 cross-imports):**
- commissioner → keeper-prep, leagues, seasons, roster, trades
- keeper-prep → leagues
- transactions → roster
- trades → teams
- auction → shared components
- archive → players, teams, admin, shared
- periods → seasons, shared

**Verification approach:**
```bash
grep -rn "from.*features/" server/src/features/ --include="*.ts" | grep -v __tests__ | grep -v node_modules
```

**Acceptance Criteria:**
- [ ] No circular dependencies detected
- [ ] All cross-feature imports documented in CLAUDE.md
- [ ] Each module has index.ts with clean exports
- [ ] No undocumented cross-feature imports found

---

## Execution Order

| Order | Phase | Est. Effort | Dependencies |
|-------|-------|-------------|--------------|
| 1 | 1A: End Auction endpoint | Small | None |
| 2 | 1B: Create periods | Small | None |
| 3 | 1C: AI Retrospective | Small | 1A (auction must be completed) |
| 4 | 2A: Teams tab matrix fix | Medium | None |
| 5 | 3A: Sidebar condensing | Medium | None |
| 6 | 4A-C: Table design refresh | Medium | User confirms Option B |
| 7 | 5A: Module isolation check | Small | None |

Phases 1A, 1B, 2A, and 5A can run in parallel. Phase 1C depends on 1A. Phases 3A and 4A-C are independent.

---

## Sources

### Internal References
- `server/src/features/auction/routes.ts:473-479` — current auto-complete logic
- `server/src/features/auction/routes.ts:1037-1039` — retrospective endpoint
- `server/src/features/seasons/services/seasonService.ts:7-11` — season transitions
- `prisma/schema.prisma:367-382` — Period model
- `client/src/components/AppShell.tsx:114-156` — current NAV_SECTIONS
- `client/src/components/ui/ThemedTable.tsx` — table component system
- `client/src/components/ui/table.tsx` — base table primitives
- `client/src/features/auction/components/TeamListTab.tsx:88-117` — handlePositionSwap
- `client/src/features/auction/components/DraftReport.tsx` — retrospective UI
- `client/src/features/auction/components/AuctionComplete.tsx` — post-draft views

### Past Learnings (docs/solutions/)
- `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md` — sticky header blockers
- `docs/solutions/ui-bugs/ios-viewport-height-and-touch-target-sizing.md` — 100svh, 44px touch targets
- `docs/solutions/runtime-errors/auction-production-outage-api-routing-player-ids.md` — API_BASE routing
- `docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md` — position slot derivation
- `docs/solutions/deployment/hardcoded-api-paths-cloudflare-cache-bypass.md` — pre-deploy audit

### External Research
- Sidebar: Linear, Notion, Vercel, ESPN Fantasy, Yahoo Fantasy patterns; WCAG 2.2 SC 2.5.8; Nielsen Norman Group progressive disclosure
- Tables: FanGraphs, Baseball Reference, ESPN density patterns; shadcn/ui data tables; CSS-Tricks sticky patterns; A List Apart typography
- WebSocket: Ably best practices; Sleeper/ESPN/Yahoo draft architecture; Express + ws hybrid patterns
- Retrospective: FantasyPros Draft Analyzer; ESPN Draft Report Card; Yahoo Assistant GM; RotoBot AI

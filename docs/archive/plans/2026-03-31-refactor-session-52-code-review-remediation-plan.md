---
title: "refactor: Session 52 Code Review Remediation"
type: refactor
status: active
date: 2026-03-31
---

# Session 52 Code Review Remediation

## Overview

Address all P1 and P2 findings from the 6-agent code review of commits `a78fd05..955baf2`. Work is organized into 3 phases: quick fixes (data correctness + security), type safety improvements, and component/service decomposition.

## Problem Statement

The Session 52 commits (Weekly Digest tabs, real-time stats, trade ghost fix) introduced 1 data correctness bug and accumulated 7 P2 issues across security, type safety, and architecture. The two largest files in the project — `Home.tsx` (1,348 lines) and `mlb-feed/routes.ts` (1,196 lines) — have grown past maintainability thresholds.

## Proposed Solution

Three phases, ordered by risk and dependency:

1. **Phase 1 — Quick Fixes** (P1 + trivial P2): One-line fixes with zero refactoring risk
2. **Phase 2 — Type Safety** (P2): Extract types, remove `as any` casts
3. **Phase 3 — Decomposition** (P2): Extract sub-components and services

Each phase is independently shippable and testable.

---

## Phase 1: Quick Fixes (Effort: Small, ~15 min)

### 1A. Add `releasedAt: null` to `/my-players-today` query — P1

**File:** `server/src/features/mlb-feed/routes.ts:835`

The `/my-players-today` endpoint omits `releasedAt: null`, returning ghost players (dropped/traded) alongside active roster. Every other roster query in the file (lines 261, 361, 550, 671, 972) correctly filters.

```typescript
// Before (line 835)
where: {
  teamId: team.id,
  player: { mlbId: { not: null } },
},

// After
where: {
  teamId: team.id,
  releasedAt: null,
  player: { mlbId: { not: null } },
},
```

- [x] Add `releasedAt: null` to the where clause
- [ ] Verify in browser — `/my-players-today` should only show active roster

### 1B. Add `requireAuth` to `/scores` and `/transactions` — P2

**File:** `server/src/features/mlb-feed/routes.ts:91,147`

Only 2 of 12 endpoints in this file lack auth. Both are GET endpoints that proxy public MLB data but act as open proxies without auth.

```typescript
// Line 91: add requireAuth
router.get("/scores", requireAuth, asyncHandler(async (req, res) => {

// Line 147: add requireAuth
router.get("/transactions", requireAuth, asyncHandler(async (req, res) => {
```

- [x] Add `requireAuth` middleware to both endpoints
- [ ] Verify Home page still loads scores when logged in

### 1C. Add `weekKey` format validation — P2

**File:** `server/src/features/mlb-feed/routes.ts:945`

Follows the existing `DATE_REGEX` pattern (line 62). Add a `WEEK_KEY_REGEX` constant and validate before use.

```typescript
const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

// In the route handler (line 945):
const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
const requestedWeekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : null;
```

- [x] Add `WEEK_KEY_REGEX` constant near `DATE_REGEX`
- [x] Validate `weekKey` param before use
- [x] Invalid format silently falls back to current week (no 400 error needed)

### 1D. Remove `null as any` in weeks endpoint — P3

**File:** `server/src/features/mlb-feed/routes.ts:933`

```typescript
// Before
weeks.push({ weekKey: currentWeekKey, generatedAt: null as any, label: weekKeyLabel(currentWeekKey) });

// After — type the array explicitly
const weeks: { weekKey: string; generatedAt: string | null; label: string }[] = rows.map(r => ({
  weekKey: r.weekKey,
  generatedAt: r.createdAt.toISOString(),
  label: weekKeyLabel(r.weekKey),
}));
if (!weeks.some(w => w.weekKey === currentWeekKey)) {
  weeks.push({ weekKey: currentWeekKey, generatedAt: null, label: weekKeyLabel(currentWeekKey) });
}
```

- [x] Type the `weeks` array explicitly so `null` is allowed without `as any`

---

## Phase 2: Type Safety (Effort: Medium, ~30 min)

### 2A. Type the `digest` state in Home.tsx — P2

**File:** `client/src/pages/Home.tsx:257`

The Zod schema in `aiAnalysisService.ts:248-276` defines the digest shape. Extract a client-side `DigestResponse` type. The old format (overview + teamGrades) needs optional fields for backward compat.

**New file:** `client/src/pages/home/types.ts`

```typescript
// New digest format (powerRankings-based)
export interface DigestResponse {
  // Content
  weekInOneSentence?: string;
  powerRankings?: { rank: number; teamName: string; movement: string; commentary: string }[];
  hotTeam?: { name: string; reason: string };
  coldTeam?: { name: string; reason: string };
  statOfTheWeek?: string;
  categoryMovers?: { category: string; team: string; direction: string; detail: string }[];
  proposedTrade?: {
    style: string; title: string; description: string;
    teamA: string; teamAGives: string; teamB: string; teamBGives: string; reasoning: string;
  };
  boldPrediction?: string;

  // Old format (backward compat)
  overview?: string;
  teamGrades?: { team: string; grade: string; analysis: string }[];

  // Metadata (added by API response)
  generatedAt?: string;
  weekKey?: string;
  isCurrentWeek?: boolean;
  voteResults?: { yes: number; no: number; myVote: string | null };
}
```

- [x] Create `client/src/pages/home/types.ts` with `DigestResponse`
- [x] Update Home.tsx: `useState<DigestResponse | null>(null)`
- [x] Remove the `eslint-disable` comment on line 256
- [x] Fix resulting type errors in JSX (replace `(pr: any)` with proper types)

### 2B. Import `TeamStatRow` to remove `as any` double-cast — P2

**File:** `server/src/features/mlb-feed/routes.ts:988-1084`

Replace the inline `StandingsContext` type with imports from `standingsService.ts`.

```typescript
// Before (inline type + as any casts)
type StandingsContext = { ... };
standingsCtx = { standings, categoryRanks, teamStats: teamStats as StandingsContext["teamStats"] };
computeCategoryRows(standingsCtx.teamStats as any, cfg.key, cfg.lowerIsBetter);

// After (import real types)
import type { TeamStatRow, StandingsRow } from "../standings/services/standingsService.js";

interface StandingsContext {
  standings: StandingsRow[];
  categoryRanks: Record<number, Record<string, { value: number; rank: number }>>;
  teamStats: TeamStatRow[];
}
// No more `as any` needed — types align
```

- [x] Import `TeamStatRow`, `StandingsRow` from standings service
- [x] Replace inline type with one using imported types
- [x] Remove `as any` casts at lines 1012 and 1084
- [x] Verify `npx tsc --noEmit` passes

---

## Phase 3: Decomposition (Effort: Large, ~2 hours)

### 3A. Extract `digestService.ts` from mlb-feed/routes.ts — P2

**File to create:** `server/src/features/mlb-feed/services/digestService.ts`

Follow the `standingsService.ts` pattern (exported functions, not a class). Move the digest context-building logic out of route handlers.

**What moves:**
- Helper types: `DigestData`, `LeagueRulesPartial`
- Constants: `tradeStyles`
- Helper functions: `ordinal()`, `extractVotes()`
- Context-building logic: standings computation, narrative hints, team data preparation (lines 964-1100)

**Exported functions:**
```typescript
// digestService.ts
export async function buildDigestContext(leagueId: number, weekKey: string): Promise<DigestContext>
export function extractVoteResults(data: unknown, userId: number): VoteResults
```

**Route handler becomes thin:**
```typescript
// routes.ts (after extraction)
router.get("/league-digest", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  // ~20 lines: validate, check persisted, call buildDigestContext, call AI, persist, respond
}));
```

- [x] Create `server/src/features/mlb-feed/services/` directory
- [x] Create `digestService.ts` with `buildDigestContext` and `extractVoteResults`
- [x] Move types: `DigestData`, `LeagueRulesPartial`, `tradeStyles`, `ordinal`
- [x] Thin the 3 digest route handlers to validation + delegation
- [x] Run `npm run test:server` — verify 484 passing (no digest tests to break)
- [ ] Verify digest loads in browser

### 3B. Extract Home.tsx sub-components — P2

**Directory to create:** `client/src/pages/home/`

Follow the Auction page pattern: parent orchestrates layout, sub-components own their own state and data fetching.

**Components to extract:**

| Component | Lines | State Hooks | Data Fetches |
|-----------|-------|-------------|--------------|
| `DigestSection.tsx` | ~270 | digest, digestLoading, digestExpanded, digestWeeks, selectedWeekKey, currentWeekKey, voting | league-digest/weeks, league-digest, vote |
| `RealTimeStatsSection.tsx` | ~130 | rosterStats, rosterStatsLoading | roster-stats-today (+ auto-refresh) |
| `NewsFeedsGrid.tsx` | ~280 | rumors, reddit, yahoo + loading/filter states | trade-rumors, reddit-baseball, yahoo-sports |
| `YouTubeSection.tsx` | ~70 | playerVideos, videosLoading, activeVideo, ytPage | player-videos |
| `ScoresStrip.tsx` | ~50 | games, loadingScores, date | scores (+ auto-refresh) |

**Home.tsx after extraction (~200 lines):**
- Header, invite code banner, roster alerts
- Layout: `<ScoresStrip>`, `<RealTimeStatsSection>`, `<DigestSection>`, `<NewsFeedsGrid>`, `<YouTubeSection>`
- Shared state: `dash`, `hasTeam`, `leagueRoster` (passed as props where needed)

**Shared utilities to extract:**
- `timeAgo(dateOrTimestamp)` — currently duplicated 3x in Home.tsx → move to `client/src/api/base.ts`

- [ ] Create `client/src/pages/home/` directory
- [ ] Create `types.ts` (DigestResponse — from Phase 2A)
- [ ] Extract `DigestSection.tsx` with its own state + week tab logic
- [ ] Extract `RealTimeStatsSection.tsx` with auto-refresh interval
- [ ] Extract `NewsFeedsGrid.tsx` with filter state
- [ ] Extract `YouTubeSection.tsx` with pagination + modal
- [ ] Extract `ScoresStrip.tsx` with date navigator + auto-refresh
- [ ] Extract `timeAgo()` utility to `client/src/api/base.ts`
- [ ] Update Home.tsx to import and compose sub-components
- [ ] Verify `npx tsc --noEmit` passes (client)
- [ ] Browser verify all Home page sections render correctly

### 3C. Stabilize auto-refresh intervals — P2

**Files:** `client/src/pages/home/ScoresStrip.tsx`, `RealTimeStatsSection.tsx` (after extraction)

Replace state-dependent `useEffect` intervals with ref-based pattern to prevent teardown cycles.

```typescript
// Pattern: stable interval that reads from ref
const fetchRef = useRef(() => {});
fetchRef.current = () => { /* fetch logic */ };

useEffect(() => {
  if (!hasLive) return;
  const id = setInterval(() => fetchRef.current(), 60_000);
  return () => clearInterval(id);
}, [hasLive]); // stable dependency, not the data array
```

- [ ] Refactor scores auto-refresh to use ref-based interval
- [ ] Refactor roster stats auto-refresh to use ref-based interval
- [ ] Verify live game refresh still works in browser

---

## Acceptance Criteria

- [ ] No ghost players in `/my-players-today` (P1 fix verified)
- [ ] All 12 mlb-feed endpoints require authentication
- [ ] `weekKey` param validated with regex
- [ ] Zero `as any` casts in digest rendering JSX
- [ ] Zero `as any` casts in standings context building
- [ ] `Home.tsx` reduced from 1,348 to ~200 lines
- [ ] `mlb-feed/routes.ts` digest handlers reduced from ~300 to ~60 lines
- [ ] `npm run test` passes (484+ server, 187 client)
- [ ] `npx tsc --noEmit` clean for both client and server
- [ ] Browser smoke test: Home page, digest tabs, scores, real-time stats all work

## Dependencies & Risks

- **Phase 1 has zero risk** — one-line additions with no refactoring
- **Phase 2 is low risk** — type changes only, no runtime behavior change
- **Phase 3 is moderate risk** — component extraction could introduce prop-drilling bugs or break state sharing. Mitigated by browser verification after each extraction.
- **No database migrations required**
- **No new dependencies required**

## Sources

- **Code review findings:** 6-agent review (TypeScript, Security, Performance, Architecture, Simplicity, Learnings)
- **Existing patterns:** `standingsService.ts` (exported functions), `Auction.tsx` (17 sub-components), `CommissionerService.ts` (class pattern, not recommended)
- **Institutional learnings:** `docs/plans/2026-03-23-refactor-session-37-code-review-p2-cleanup-plan.md` — prior decomposition patterns
- **Solution docs:** `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — confirms roster filter pattern

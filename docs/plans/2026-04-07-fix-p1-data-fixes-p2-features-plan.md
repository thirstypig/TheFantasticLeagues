---
title: "fix: P1 data fixes + P2 features (Ohtani, AI grading, insights, minors, audit)"
type: fix
status: completed
date: 2026-04-07
---

# P1 Data Fixes + P2 Features

6 items: 4 data/display fixes (P1) and 2 new features (P2). Scoped from Session 58 QA.

## Enhancement Summary

**Deepened on:** 2026-04-07
**Sections enhanced:** 6 (all items)
**Research agents used:** Architecture Strategist, Performance Oracle, Data Integrity Guardian, Pattern Recognition Specialist, TypeScript Reviewer, Frontend Races Reviewer, Security Sentinel, Code Simplicity Reviewer, Learnings Researcher, Best Practices Researcher

### Key Improvements from Deepening
1. **P1-3: Do NOT re-populate `TWO_WAY_PLAYERS` map** — use a new `POSITION_OVERRIDES` map instead. Re-populating the multi-purpose map would reactivate 6+ disabled code paths (standings two-way gating, stat expansion, stat splitting)
2. **P1-2: Use `computeStandingsFromStats` from standingsService** — do not reimplement ranking logic inline. Compute grades deterministically, let the LLM explain within a constrained range
3. **P1-4: Drop the cron job (YAGNI)** — manual batch is sufficient for an 8-team league. Extract generation logic from route handler into a service function instead of self-HTTP calls
4. **P2-5: Extract shared `RosterAlertAccordion` component** — avoid duplicating 40+ lines of accordion JSX across two pages
5. **Bonus bug found: Stale insights across teams** — Team.tsx shows Team A's AI grade on Team B's page due to missing state reset on team change

### New Risks Discovered
- Re-populating `TWO_WAY_PLAYERS` reactivates `expandTwoWayPlayers()`, `splitTwoWayStats()`, and standings two-way gating — would break Ohtani stats
- `buildPosList()` would set hitter Ohtani's `posList` to "DH,P" if the multi-purpose map is used
- Dedup promise resolving `null` sends 200 OK with null body to users
- Existing AiInsight rows with bad grades from `totalScore: 0` are never invalidated
- Team names interpolated into LLM prompts without sanitization (prompt injection risk)

---

## P1-1: DLC W=6 vs Standings Showing 5

**Problem:** Demolition Lumber Co. should have 6 wins but standings show 5.

**Investigation Steps:**
1. Query `PlayerStatsPeriod` for all DLC pitchers in active period — sum W values
2. Compare against `TeamStatsPeriod.W` for DLC
3. Check which computation path is active (`computeWithDailyStats` vs `computeWithPeriodStats`)
4. Check `mirrorTwoWayPitcherStats` ran for this period (pitcher id=3191 should have copied W from real Ohtani)
5. If player sum is 6 but team snapshot is 5, re-run `syncAllActivePeriods()` to refresh
6. Check for ghost roster entries per learnings doc (trade-reversal-ghost-roster-double-counting.md)

**Files:**
- `server/src/features/standings/services/standingsService.ts:467-472` — stat attribution logic
- `server/src/features/players/services/mlbStatsSyncService.ts:109-159` — mirrorTwoWayPitcherStats

### Research Insights

**From learnings (trade-reversal-ghost-roster-double-counting.md):** Ghost `TRADE_IN` entries with `releasedAt` set can still match period overlap queries, causing double-counting. Build a map of each player's current active team and skip entries where the player is active elsewhere. The `/audit-data` script just confirmed no ghost entries exist, so this is unlikely but worth checking.

**From architecture review:** Both computation paths (`computeWithDailyStats` at line 467 and `computeWithPeriodStats` at line 566) use `TWO_WAY_PLAYERS.has()` — since the map is empty, `isTwoWay` is always `false`, meaning `countHitting` and `countPitching` are both `true` for every player. This is correct for the two-record architecture (each record only has its own stats).

---

## P1-2: DLC F Grade Despite 1st Place

**Problem:** AI weekly insight gives DLC an F grade while they're 1st in standings.

**Root Causes (two bugs + one design issue):**

1. **`totalScore: 0` for ALL teams** at `teams/routes.ts:171-175` — the AI receives randomized standings positions
2. **Grading instruction doesn't anchor to standings** — the LLM picks the grade from scratch
3. **Existing insights with wrong grades are never invalidated**

**Fix (three parts):**

### Part A: Fix standings data — reuse `computeStandingsFromStats` (NOT inline computation)

**From architecture + pattern reviews:** The `computeStandingsFromStats` function at `standingsService.ts:170` already handles tie-splitting via `rankPoints()` with averaged points. Reimplementing inline would skip tie handling and violate DRY. This cross-feature dependency follows existing patterns (7 other modules already import cross-feature services).

```typescript
// server/src/features/teams/routes.ts — replace lines 146-175
import { computeStandingsFromStats, TeamStatRow } from '../../features/standings/services/standingsService.js';

// Adapt Prisma TeamStatsSeason to TeamStatRow shape
const teamStatRows: TeamStatRow[] = allTeamStats.map(ts => ({
  team: { id: ts.team.id, name: ts.team.name, code: ts.team.code ?? "" },
  R: Number(ts.R), HR: Number(ts.HR), RBI: Number(ts.RBI), SB: Number(ts.SB),
  AVG: Number(ts.AVG), W: Number(ts.W), S: Number(ts.S), K: Number(ts.K),
  ERA: Number(ts.ERA), WHIP: Number(ts.WHIP),
}));
const standingsRows = computeStandingsFromStats(teamStatRows);
standings = standingsRows.map(s => ({
  teamName: s.teamName, totalScore: s.points, rank: s.rank,
}));
```

**Note (TypeScript reviewer):** `TeamStatRow` has an index signature `[key: string]: number | { id: number; name: string; code: string }`. Check `S` vs `SV` field mapping — the Prisma model uses `S` for saves in `TeamStatsSeason`.

**Document new cross-feature dependency in CLAUDE.md:**
`teams/routes.ts` imports `standings/services/standingsService`

### Part B: Compute grades deterministically, let LLM explain within range

**From best practices research:** "Compute First, Explain Second" — never let the LLM pick the grade from scratch. Compute a deterministic grade from standings rank, then give the LLM an allowed range (±1 notch) based on weekly trajectory.

```typescript
function computeGradeFromRank(rank: number, totalTeams: number): { grade: string; floor: string; ceiling: string } {
  const percentile = 1 - (rank - 1) / (totalTeams - 1);
  if (percentile >= 0.85) return { grade: 'A', floor: 'A-', ceiling: 'A+' };
  if (percentile >= 0.70) return { grade: 'B+', floor: 'B', ceiling: 'A-' };
  if (percentile >= 0.50) return { grade: 'B', floor: 'B-', ceiling: 'B+' };
  if (percentile >= 0.30) return { grade: 'C+', floor: 'C', ceiling: 'B-' };
  if (percentile >= 0.15) return { grade: 'C', floor: 'D', ceiling: 'C+' };
  return { grade: 'D', floor: 'F', ceiling: 'C-' };
}
```

Update prompt at `aiAnalysisService.ts:~1168`:
```
GRADING RULES — YOUR GRADE MUST FALL WITHIN THE GIVEN RANGE:
Team: ${team.name}, Rank #${rank}/${totalTeams}, ${totalScore} roto pts.
ALLOWED GRADE RANGE: ${floor} to ${ceiling}. Default: ${grade}.
Adjust within range based on weekly trajectory (hot streak = ceiling, cold = floor).
You MUST NOT assign a grade outside the allowed range.
```

**Post-generation validation:** Check returned grade falls within allowed range; clamp if not:
```typescript
const GRADE_ORDER = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
// If grade is outside range, fall back to deterministic default
```

### Part C: Invalidate existing bad insights + regenerate

**From data integrity review:** Existing `AiInsight` rows contain grades derived from randomized standings. The unique constraint prevents regeneration without deletion. After deploying Part A, delete existing weekly insights for league 20, then regenerate via batch endpoint.

```sql
DELETE FROM "AiInsight" WHERE "leagueId" = 20 AND "type" = 'weekly';
```

### Additional hardening (from best practices + security reviews)

- **Gate LLM call on data sufficiency:** If zero players have stats, return a canned "no data" response instead of calling the LLM
- **Sanitize team names before prompt embedding:** Strip `<>{}[]` and limit to 100 chars to mitigate prompt injection
- **Add data-count metadata to prompt:** `"Hitters with stats: X/Y, Pitchers with stats: X/Y"`

**Files:**
- `server/src/features/teams/routes.ts:146-175` — replace with `computeStandingsFromStats` call
- `server/src/services/aiAnalysisService.ts:~1144-1180` — update prompt with grade anchoring
- `server/src/features/teams/routes.ts:98-101` — handle null dedup promise (return 503, not 200 with null body)

---

## P1-3: Ohtani Displaying "TWP" Instead of Assigned Position

**Problem:** On DLC roster, Ohtani shows `posPrimary: "TWP"` instead of `assignedPosition: "DH"`.

### CRITICAL: Do NOT re-populate `TWO_WAY_PLAYERS` map

**From pattern recognition review:** The `TWO_WAY_PLAYERS` map was intentionally emptied when Ohtani was split into two records. It is consumed in **6+ distinct locations** across 4 service files:

- `standingsService.ts:467,566` — gates whether hitting/pitching stats are split
- `dataService.ts:338` — gates CSV stat expansion
- `statsService.ts:261,292` — gates `expandTwoWayPlayers()` and `splitTwoWayStats()`
- `mlbSyncService.ts:82,395` — gates `buildPosList()` and position eligibility

Re-populating the map would **reactivate ALL of this gated logic**, breaking the two-record architecture. The `expandTwoWayPlayers()` function would start duplicating Ohtani again. The standings service would start splitting his stats (which are already separated by record). `buildPosList()` would set hitter Ohtani's `posList` to "DH,P".

### Fix: Create a separate `POSITION_OVERRIDES` map

At `server/src/lib/sports/baseball.ts`, add a new narrow-purpose map consulted ONLY by `resolvePosition()`:

```typescript
/**
 * Position overrides for the daily sync. Maps MLB ID → display position.
 * Separate from TWO_WAY_PLAYERS (which gates stat expansion/splitting and must remain empty
 * for the two-record Ohtani architecture). This map ONLY affects resolvePosition().
 */
export const POSITION_OVERRIDES: ReadonlyMap<number, string> = new Map([
  [660271, "DH"],  // Ohtani hitter — MLB API returns "TWP", we want "DH"
]);
```

Update `resolvePosition()` at `mlbSyncService.ts:28-33`:
```typescript
function resolvePosition(mlbId: number, posAbbr: string): string {
  // Check two-way players first (for future use)
  const twoWay = TWO_WAY_PLAYERS.get(mlbId);
  if (twoWay && (posAbbr === "TWP" || posAbbr === "Y")) {
    return twoWay.hitterPos;
  }
  // Check position overrides (e.g., Ohtani hitter → DH)
  const override = POSITION_OVERRIDES.get(mlbId);
  if (override && (posAbbr === "TWP" || posAbbr === "Y")) {
    return override;
  }
  return posAbbr;
}
```

### DB fix: not needed (simplicity review)

**From code simplicity review:** After deploying the `POSITION_OVERRIDES` map, the next daily sync at 12:00 UTC will write `posPrimary = "DH"` automatically. No manual SQL needed. If you want immediate effect, trigger `POST /api/admin/sync-mlb` after deploy.

### Display path audit

Verify all position display paths use `assignedPosition || posPrimary`:
- `client/src/features/teams/pages/Team.tsx:209-229` — roster table
- `client/src/lib/playerDisplay.ts` — displayPos helper (already maps "TWP" → "DH/P" as fallback)
- `client/src/components/shared/PlayerDetailModal.tsx` — does NOT use `displayPos`, passes through raw API position — add to audit scope

**Files:**
- `server/src/lib/sports/baseball.ts` — add `POSITION_OVERRIDES` map (NOT to `TWO_WAY_PLAYERS`)
- `server/src/features/players/services/mlbSyncService.ts:28-33` — update `resolvePosition()`
- `client/src/lib/playerDisplay.ts` — verify displayPos fallback
- `client/src/components/shared/PlayerDetailModal.tsx` — add assignedPosition precedence

---

## P1-4: Weekly Insights Gaps (Devil Dawgs Has 0)

**Problem:** Some teams have 0-1 weekly insights. Insights are on-demand only.

### Part A: Add `weekOverride` support to `generate-all` endpoint

**From data integrity review:** The current `generate-all` endpoint at `teams/routes.ts:533` hardcodes `getWeekKey()` and does NOT pass `weekOverride` to the internal fetch URL at line 550. The plan's backfill commands won't work without this fix.

**From TypeScript reviewer:** Use Zod for query validation, not bare `as string` casts:
```typescript
const generateAllSchema = z.object({
  leagueId: z.coerce.number().int().positive(),
  weekOverride: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
});
```

Also validate week range (year within ±1 of current, week 1-53) to prevent DoS via arbitrary week generation.

Forward `weekOverride` to internal fetch URL:
```typescript
const url = `...?leagueId=${leagueId}&teamId=${team.id}${weekOverride ? `&weekOverride=${weekOverride}` : ""}`;
```

### Part B: Backfill missing weeks

After Part A is deployed, run batch endpoint for each missing week:
```bash
curl -X POST ".../generate-all?leagueId=20&weekOverride=2026-W13"
curl -X POST ".../generate-all?leagueId=20&weekOverride=2026-W14"
curl -X POST ".../generate-all?leagueId=20"  # current week
```

**Caveat:** Backfilled insights will use current period data, not historical. This is acceptable for an 8-team league. Consider adding `backfilled: true` to the `AiInsight.data` JSON so the UI could show a disclaimer.

### Part C: Drop the cron job (YAGNI)

**From simplicity review:** For a single 8-team league, running `curl -X POST .../generate-all?leagueId=20` once a week (~16 seconds) is sufficient. A cron job adds complexity (auth problem, timing collision with AAA sync, "which leagues are active?" logic) with no real benefit until there are multiple active leagues.

**From security review:** The cron would need auth to call the admin endpoint. The self-HTTP pattern (`localhost:PORT`) is fragile and requires forwarding tokens. The right fix is to extract generation logic into a service function — but that's refactoring scope, not needed now.

### Bonus fix: Stale insights across teams

**From frontend races review (HIGH priority):** When navigating from Team A to Team B, `aiInsights` state persists from Team A. At `Team.tsx:267`:
```typescript
if (!dbTeamId || !leagueId || aiInsights || aiLoading) return;
```
The `aiInsights` guard is truthy from the previous team, so the `useEffect` bails out. **The user sees Team A's grade on Team B's page.**

Fix: Reset AI state when team changes:
```typescript
useEffect(() => {
  setAiInsights(null);
  setAiError(null);
  setInsightHistory([]);
  setHistoryLoaded(false);
  setSelectedWeekKey(null);
}, [dbTeamId]);
```

### Bonus fix: Null dedup promise

**From frontend races review:** If AI generation fails, the dedup promise resolves to `null`. The awaiting request at line 99-101 sends `res.json(null)` — a 200 with null body. Fix:
```typescript
if (existing) {
  const result = await existing;
  if (!result) return res.status(503).json({ error: "Weekly insights temporarily unavailable" });
  return res.json(result);
}
```

**Files:**
- `server/src/features/teams/routes.ts:516-567` — add weekOverride forwarding + Zod validation
- `server/src/features/teams/routes.ts:98-101` — handle null dedup promise
- `client/src/features/teams/pages/Team.tsx:267` — reset AI state on team change

---

## P2-5: Minors Report

**Problem:** Players in minors (e.g., Dylan Crews) contribute 0 AB but aren't flagged.

### Server: Expand minors detection

**From pattern review:** Use precise matching `status.includes("Optioned")` instead of `status.includes("Option")` — the broader match would catch "Optional" and future statuses.

At `mlb-feed/routes.ts:385`:
```typescript
isMinors: status.includes("Minor") || status.includes("Optioned") || status === "Reassigned"
```

### Client: Extract shared component (NOT duplicate JSX)

**From simplicity review:** The IL Report accordion is ~40 lines of JSX. Copying it for Minors on two pages = 80+ lines of near-identical markup. Extract a shared component:

```tsx
// client/src/components/shared/RosterAlertAccordion.tsx
interface RosterAlertAccordionProps {
  players: RosterStatusPlayer[];
  colorScheme: "red" | "amber";
  label: string;
  maxDisplay?: number;
}
```

Use for both IL (red) and Minors (amber) on both Home.tsx and Team.tsx.

### Client: Team page needs roster-status fetch

**From pattern + TypeScript reviews:** Team.tsx lacks the roster-status API call. Extract a shared hook:

```typescript
// client/src/hooks/useRosterStatus.ts
interface RosterStatusPlayer {
  playerName: string;
  mlbId: number | null;
  mlbTeam: string;
  position: string;
  mlbStatus: string;
  isInjured: boolean;
  isMinors: boolean;
  ilPlacedDate: string | null;
  ilDays: number | null;
  ilInjury: string | null;
  ilEligibleReturn: string | null;
  ilReplacement: string | null;
}

export function useRosterStatus(leagueId: number | null, teamId?: number): {
  ilPlayers: RosterStatusPlayer[];
  minorsPlayers: RosterStatusPlayer[];
  loading: boolean;
}
```

**From frontend races review:** Use the `let ok = true` cancellation pattern in the hook to prevent state updates on unmounted components.

### From learnings (service-worker-blocking-external-resources.md)

Before deploying: verify the service worker doesn't intercept MLB API calls for player headshot images used in the accordion. The SW must skip non-same-origin requests.

**Files:**
- `server/src/features/mlb-feed/routes.ts:385` — expand isMinors detection
- `client/src/components/shared/RosterAlertAccordion.tsx` — new shared component
- `client/src/hooks/useRosterStatus.ts` — new shared hook
- `client/src/pages/Home.tsx` — refactor IL to use shared component, add Minors section
- `client/src/features/teams/pages/Team.tsx` — use shared hook + shared component

---

## P2-6: Automated `/audit-data` Enhancement

**Current Script:** `scripts/audit-league.cjs` (6 checks, all passing)

### Additional checks (from simplicity review: keep 3, simplify 1, drop 1)

1. **ERA/WHIP math validation (KEEP):** `ERA = (ER * 9) / IP` within ±0.02. **Critical from pattern review:** Must use `parseIP()` logic for baseball IP encoding (`.1` = 1/3 inning, `.2` = 2/3 inning, not literal decimals). Without conversion, every pitcher with partial innings triggers a false positive.

2. **IP format validation (KEEP):** Flag stored IP values where `(IP % 1)` is not approximately 0, 0.33, or 0.67.

3. **Position display audit (SIMPLIFY):** One-liner assertion that zero active roster entries have `player.posPrimary = "TWP"` without `assignedPosition` set. After P1-3 ships and daily sync runs, this should always pass.

4. **AI grade vs standings correlation (DROP):** This validates LLM output quality, which is inherently fuzzy. The deterministic grade clamping in P1-2 Part B makes this check redundant.

5. **Period coverage (KEEP):** Count `PlayerStatsPeriod` rows per team per period; flag any team with zero.

### From pattern review: `S` vs `SV` naming

The DB uses `S` for saves in `TeamStatsPeriod` but `SV` in `PlayerStatsPeriod`. The audit must compare `ps.pSV !== ts.S` (already correct in existing check 5). New ERA/WHIP checks should use the correct field name per table.

**Files:**
- `scripts/audit-league.cjs` — add checks 1, 2, 3, 5

---

## Acceptance Criteria

### P1 (Must complete)
- [x] DLC wins match between player stats sum and standings display
- [x] AI standings data has real roto points via `computeStandingsFromStats` (not `totalScore: 0`)
- [x] AI grades computed deterministically from standings with LLM explaining within range
- [ ] Existing bad insights deleted and regenerated with correct data (manual step after deploy)
- [x] Ohtani shows "DH" on DLC and "P" on Skunk Dogs (no "TWP" anywhere) — after next sync
- [x] `POSITION_OVERRIDES` map prevents daily sync from writing "TWP" back
- [ ] All 8 teams have weekly insights for weeks W13, W14, W15 (manual backfill after deploy)
- [x] Team page resets AI state on team change (no stale cross-team grades)
- [x] Null dedup promise returns 503, not 200 with null body

### P2 (Should complete)
- [x] Minors Report accordion on Home page and Team page (amber styling)
- [x] Minors detection includes "Optioned" status
- [x] Shared `RosterAlertAccordion` component used for both IL and Minors
- [x] Shared `useRosterStatus` hook with proper TypeScript interface
- [x] `/audit-data` script checks ERA/WHIP math (with `parseIP`), IP format, position display, period coverage

---

## Implementation Order

1. **P1-1** — Investigate DLC wins: query data, diagnose (~10 min)
2. **P1-3** — Fix Ohtani "TWP": add `POSITION_OVERRIDES` map, update `resolvePosition`, audit display paths (~20 min)
3. **P1-2** — Fix AI grading: import `computeStandingsFromStats`, deterministic grades, invalidate bad insights (~25 min)
4. **P1-4** — Fix insights: add weekOverride, backfill, fix stale-team bug + null dedup (~25 min)
5. **P2-6** — Enhance audit script: ERA/WHIP, IP format, period coverage (~20 min)
6. **P2-5** — Minors Report: expand detection, shared component + hook, wire into both pages (~45 min)

**Total estimated scope:** ~2.5 hours of focused work.

---

## Sources

### Institutional Learnings
- `docs/solutions/logic-errors/silent-null-causes-llm-hallucination.md` — LLMs always hallucinate on empty data; gate calls on data sufficiency
- `docs/solutions/logic-errors/ohtani-two-way-player-split-architecture.md` — two-record split; `TWO_WAY_PLAYERS` emptied intentionally
- `docs/solutions/logic-errors/ohtani-derived-id-api-resolution.md` — 3-layer ID resolution for derived mlbId
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — ghost entries from reversed trades
- `docs/solutions/runtime-errors/service-worker-blocking-external-resources.md` — SW must skip external requests

### Research Findings
- **Architecture:** Inline standings computation violates DRY; reuse `computeStandingsFromStats` with tie handling
- **Pattern:** `TWO_WAY_PLAYERS` map consumed in 6+ locations; re-populating breaks stat expansion/splitting
- **Performance:** Standings computation is O(80) operations — negligible vs LLM call latency; no caching needed
- **Security:** Team names interpolated into prompts without sanitization; self-HTTP call pattern fragile for cron
- **Frontend races:** Stale AI insights across team navigation; missing `ok` cancellation flag on fetches
- **Simplicity:** Cron job is YAGNI for 8-team league; audit check 4 redundant with deterministic grading
- **Best practices:** "Compute First, Explain Second" for AI grading; Gemini `responseSchema` for structured output; retry with error feedback for JSON parsing

### Key File References
- `server/src/features/teams/routes.ts:171-175` — `totalScore: 0` bug
- `server/src/features/standings/services/standingsService.ts:170` — `computeStandingsFromStats`
- `server/src/lib/sports/baseball.ts:122-124` — `TWO_WAY_PLAYERS` (must stay empty)
- `server/src/features/players/services/mlbSyncService.ts:28-33` — `resolvePosition`
- `server/src/services/aiAnalysisService.ts:~1144-1180` — AI prompt template
- `client/src/features/teams/pages/Team.tsx:267` — stale insights guard

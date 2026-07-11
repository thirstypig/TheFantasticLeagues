---
title: Waiver Priority UI Displayed Season Standings While Server Processed by Period
category: logic-errors
component: waivers
date: 2026-04-12
session: 62
tags:
  - waivers
  - standings
  - ui-server-mismatch
  - source-of-truth
  - activity-page
  - period-vs-season
related_commits:
  - 18111c0
severity: high
---

# Waiver Priority UI ≠ Server Processing

The `/activity` Waivers tab showed one priority order; the waiver processor applied a different one. A classic **display-vs-processing mismatch** — two pieces of code computing "the same thing" from different inputs.

## Symptom

On the Waivers tab of the Activity page:

- UI displayed team order ranked by **season cumulative roto points** (`getSeasonStandings()` → `totalPoints`).
- Caption read: `"Based on current season standings"`.
- But when the commissioner clicked **Process Waivers**, the server used the **most-recent-completed period's standings** (or fell back to the active period).

Users could look at the displayed priority list and predict who'd win a tied waiver claim — and be wrong, because the server was using different numbers.

## Root Cause

The server's waiver processing logic in `server/src/features/waivers/routes.ts:212-278` was already correct. It selects the most-recently-completed period's roto standings via `computeTeamStatsFromDb(leagueId, lastPeriod.id)` + `computeStandingsFromStats()`, falling back to aggregated period stats when no period has completed.

The client's Waivers tab in `TransactionsPage.tsx` computed priority from `getSeasonStandings()` (cumulative season roto across all periods) and its caption read "Based on current season standings." **These are two different computations** — season cumulative points diverge from single-period roto points whenever team performance varies week-to-week.

This wasn't a bug in either half; it was a bug at the boundary. Both halves were internally consistent, but they didn't agree with each other.

## Working Solution

**1. New server endpoint** — `server/src/features/standings/routes.ts:44-83`. Replicates the waiver processing selection logic and returns the `source` so the UI can be transparent:

```ts
router.get("/waiver-priority", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  let period = await prisma.period.findFirst({
    where: { leagueId, status: "completed" },
    orderBy: { endDate: "desc" },
  });
  let source: "completed" | "active" = "completed";
  if (!period) {
    period = await prisma.period.findFirst({
      where: { leagueId, status: "active" },
      orderBy: { endDate: "desc" },
    });
    source = "active";
  }
  if (!period) return res.json({ periodId: null, periodName: null, source: "none", data: [] });

  const teamStats = await computeTeamStatsFromDb(leagueId, period.id);
  const standings = computeStandingsFromStats(teamStats);
  const data = standings.map(s => ({ teamId: s.teamId, teamName: s.teamName, points: s.points }));
  res.json({ periodId: period.id, periodName: period.name, source, data });
}));
```

**2. New client API function** — `client/src/features/standings/api.ts`:

```ts
export type WaiverPriorityStandings = {
  periodId: number | null;
  periodName: string | null;
  source: "completed" | "active" | "none";
  data: { teamId: number; teamName: string; teamCode: string; points: number }[];
};

export async function getWaiverPriorityStandings(leagueId: number): Promise<WaiverPriorityStandings> {
  return fetchJsonApi<WaiverPriorityStandings>(`${API_BASE}/waiver-priority?leagueId=${leagueId}`);
}
```

**3. UI memo update** — `TransactionsPage.tsx`. Prefers period data, falls back to season only when unavailable:

```tsx
const sortedWaiverOrder = React.useMemo(() => {
  const periodMap = new Map((waiverPriority?.data || []).map(s => [s.teamId, s]));
  const seasonMap = new Map(standings.map(s => [s.teamId, s]));
  const teamsWithPoints = teams.map(t => {
    const p = periodMap.get(t.id);
    const s = seasonMap.get(t.id);
    // Use period points if available, otherwise fall back to season
    const totalPoints = p?.points ?? s?.totalPoints ?? 0;
    return { ...t, totalPoints, standingRank: 0 };
  });
  teamsWithPoints.sort((a, b) => a.totalPoints - b.totalPoints);
  // ...
}, [teams, standings, waiverPriority]);
```

**4. Caption update** — shows which period drives priority:

```tsx
{waiverPriority?.source === "completed" && waiverPriority.periodName
  ? `Based on ${waiverPriority.periodName} standings (most recent completed)`
  : waiverPriority?.source === "active" && waiverPriority.periodName
  ? `Based on ${waiverPriority.periodName} standings (current period — no period completed yet)`
  : "Based on current season standings"}
```

## Verification

- Browser-tested at `/activity` Waivers tab
- API returned `{ periodId: 35, periodName: "Period 1", source: "active", data: [...] }`
- Team order re-sorted using period-based points, producing a different ordering than the previous season-cumulative ordering — now matching the server's waiver processing output

## Prevention Strategies

### 1. Single source of truth endpoint pattern
When UI displays "what will happen at action time," the server must expose an endpoint that returns exactly the data the action handler will consume. **Anti-pattern:** UI fetching raw standings + sorting in React — any client transformation of "what will happen" data is a drift risk.

### 2. Colocate computation in a shared server function
Extract a single function (e.g. `getWaiverPriority(leagueId)`) that both the display route and the processing route call. If two routes must agree on an ordering, they must call the same function — not re-implement the logic.

### 3. Return "basis" alongside the data
The priority endpoint returns what it used: `{ source: "active", periodName: "Period 1" }`. UI renders a visible label. This makes divergence detectable by eyeball during browser testing.

### 4. Code review checklist for preview UIs
Whenever a PR adds UI showing priority, preview, projection, or "what will happen":
- [ ] Is there a server endpoint returning exactly this?
- [ ] Does the action handler call the same function?
- [ ] Is the basis/source labeled in the UI?
- [ ] Is there an integration test asserting UI data == processing order?

### 5. Add to CLAUDE.md conventions
> Any UI that displays a server-computed preview of an action outcome MUST consume a server endpoint backed by the same function the action handler uses. No client-side re-derivation.

## Test Recommendations

**Integration test (highest value):**
```ts
// server/src/__tests__/integration/waiver-priority-consistency.test.ts
it("priority endpoint matches processing order", async () => {
  const displayed = await request(app)
    .get(`/api/waiver-priority?leagueId=${leagueId}`)
    .expect(200);
  const processed = await simulateWaiverProcessing(leagueId);
  expect(displayed.body.data.map(t => t.teamId))
    .toEqual(processed.priorityOrder);
});
```

**Unit test on the shared service:**
```ts
it("getWaiverPriority uses most-recent-completed-period standings", async () => {
  const result = await getWaiverPriority(leagueId);
  expect(result.basis).toBe("most-recent-completed-period");
  expect(result.periodId).toBe(latestCompletedPeriod.id);
});
```

**Browser smoke test:** Load `/activity` Waivers tab → record displayed priority order → trigger Process Waivers on a tied-claims test league → assert winners align with displayed order.

## Anti-Pattern Greps

```bash
# Client computing its own priority/preview order
rg -n "sort.*(?:priority|rank|standings)" client/src/features/waivers client/src/features/transactions
rg -n "getSeasonStandings|totalPoints|\\.sort\\(" client/src/ | rg -i "priorit|preview|will|next"

# Duplicate ranking logic across server features
rg -n "sort.*rank|\\.rank\\s*=" server/src/features/waivers server/src/features/standings
```

Flag any hit: the ranking must happen once, server-side, in a shared service.

## Related Documentation

- `docs/solutions/logic-errors/waiver-priority-league-and-sort-fix.md` — Direct precedent. Same `getSeasonStandings()` function, same waiver context. Documented the silent `leagueId=1` default anti-pattern. This current bug is the deeper "wrong aggregation window" layer.
- `docs/solutions/logic-errors/ai-grading-zero-data-random-standings.md` — AI grading used empty `TeamStatsSeason`; similar "wrong data source" class.
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — Display/processing mismatch on roster state after trade reversal.
- `docs/solutions/logic-errors/silent-null-causes-llm-hallucination.md` — Silent data degradation pattern analog.
- `docs/archive/plans/2026-04-01-feat-trading-block-and-waiver-position-fix-plan.md` — Planning doc for the prior waiver priority fix.

## Related Call Sites (Audit Candidates)

UI call sites of `getSeasonStandings()` that may have the same season-vs-period divergence:

- `client/src/features/transactions/pages/ActivityPage.tsx:78` — waiver tab, confirmed affected pattern
- `client/src/features/transactions/pages/TransactionsPage.tsx:42` — no `leagueId` passed (silent default to 1)
- `client/src/features/periods/pages/Season.tsx:182` — season cumulative display (intentional here)
- `client/src/features/periods/pages/Payouts.tsx:28` — payout calculations based on season cumulative (intentional)

Server counterpart: `server/src/data/seasonStandings.ts:45` (no-arg) vs `server/src/features/players/services/dataService.ts:351`.

## Prior Precedent

- **Session 59** (`project_session59_decisions.md`): AI insights switched from season cumulative to `TeamStatsPeriod` as primary source — same principle. The server already adopted this for waiver processing; UI lagged behind.
- **Session 58** (`feedback_validate_data_not_rows.md`): `TeamStatsSeason` all-zeros bug — taught that season-cumulative tables can be stale or empty; period-based computation is the reliable source.
- **Session 59** (`feedback_cache_keys_all_dimensions.md`): Dimensional correctness (weekKey) — same family as period-vs-season correctness.

## Cross-References

- Commit: `18111c0` (waiver priority standings source alignment, Session 62)
- Memory: `feedback_validate_data_not_rows.md`, `project_session59_decisions.md`, `feedback_auction_is_source_of_truth.md`, `feedback_cache_keys_all_dimensions.md`
- CLAUDE.md AI Analysis section: established the period-as-primary convention that UI waiver display now conforms to

---
title: "Free-Agent Stats Attribution and IEEE 754 AVG Rounding Fixes"
problem_type:
  - logic-errors
component: "Period standings computation and batting average formatting"
symptoms:
  - "Dropped/released players' full period stats credited to the last team that held them after becoming free agents"
  - "Los Doyers showed W=15 (correct ~12) and K=194 (correct ~152) due to phantom stat attribution"
  - "fmt3Avg(19, 80) returned .237 instead of correct .238 (Hunter Goodman precedent)"
affected_code:
  - "server/src/features/standings/services/standingsService.ts"
  - "client/src/api/base.ts"
  - "client/src/lib/sports/baseball.ts"
tags:
  - standings
  - stats-attribution
  - free-agent
  - ieee-754
  - floating-point
  - batting-average
  - rounding
  - period-stats
severity: high
date_solved: "2026-05-15"
---

# Free-Agent Stats Attribution and IEEE 754 AVG Rounding Fixes

Two correlated correctness bugs fixed in commit `3af5793`. Both produce wrong numbers silently — no crash, no error log — which made them easy to miss without a reference comparison (FanGraphs OnRoto was the audit tool that surfaced them).

## Why It Looked Like Rosters Were Reverting

The roster and activity log were **never wrong**. The 6 dropped players had correct `releasedAt` timestamps in the `Roster` table and correct `TransactionEvent` records for the drops. What broke was the standings computation: it was pulling those dropped players' stats back into the totals, making the standings *look* as if those players were still on the team.

The illusion of "roster reversion" arises because standings are the most visible output — when standings show a team with a dropped player's stats included, it reads like that player is still on the roster. But the data layer (Roster + TransactionEvent) was always consistent. The bug lived entirely in the computation layer: a one-character logic error in the attribution guard that let free-agent stats fall through.

**Key invariant**: Roster state and activity log are the source of truth. Standings are derived. When standings diverge from what the activity log says happened, investigate the computation path — not the roster records.

---

## Bug 1: Free-Agent Stats Attribution in Period Standings

### Symptom

After a mid-period audit comparing OGBA standings against FanGraphs OnRoto, Los Doyers showed W≈15 (should be ~12) and K≈194 (should be ~152). The delta traced to 6 players the team dropped on 2026-04-28 with effective date 2026-04-19 — those players had been free agents since period start, but their full-period `PlayerStatsPeriod` stats were being credited to Los Doyers.

### Root Cause

`computeWithPeriodStats` in `standingsService.ts` builds `activePlayerTeam: Map<playerId, teamId>` from roster entries where `releasedAt === null`. Free agents have no entry, so `Map.get(playerId)` returns `undefined` for them.

The attribution guard was:

```typescript
const currentTeam = activePlayerTeam.get(roster.playerId);
if (currentTeam !== undefined && currentTeam !== t.id) continue;
```

Truth table:

| Scenario | `currentTeam` | `!== undefined` | `!== t.id` | Combined result | Action | Correct? |
|---|---|---|---|---|---|---|
| Free agent (no active roster entry) | `undefined` | `false` | — (short-circuits) | `false` | Does NOT skip | **Wrong** |
| Player on a different team | other ID | `true` | `true` | `true` | Skips | Correct |
| Player on this team | `t.id` | `true` | `false` | `false` | Does NOT skip | Correct |

The `&&` short-circuit means: when `currentTeam === undefined`, the entire expression evaluates to `false`, so stats fall through and are credited to whichever team the outer loop is currently processing. A free agent accumulates stats for every team in the league — and whichever team last had a matching roster entry (via the `releasedAt >= period.startDate` gte filter) would receive that player's full-period totals.

### Fix

```typescript
// BEFORE (buggy):
const currentTeam = activePlayerTeam.get(roster.playerId);
if (currentTeam !== undefined && currentTeam !== t.id) continue;

// AFTER (fixed):
const currentTeam = activePlayerTeam.get(roster.playerId);
if (currentTeam !== t.id) continue;
```

Removing the `!== undefined` prefix collapses the condition to a single strict equality check. `undefined !== t.id` is always `true` (a team ID is never `undefined`), so free agents unconditionally hit `continue`. The invariant is now correctly enforced: only players where `activePlayerTeam.get(playerId) === t.id` receive credit.

### Design Rule

`computeWithPeriodStats` uses cumulative period stats — it cannot prorate by roster date. The design intent is:

- **Active holder** (`releasedAt === null`): receives 100% of the player's period stats
- **Former holder** (released mid-period or at period start): receives 0%
- **Free agent** (no active holder anywhere): receives 0% from every team

This matches FanGraphs OnRoto, which computes period standings from active rosters only.

---

## Bug 2: IEEE 754 AVG Rounding in fmt3Avg

### Symptom

`fmt3Avg(19, 80)` returned `".237"` instead of `".238"`. Hunter Goodman went 19-for-80 in the period; his displayed average was one digit low. The correct value is .238 (19/80 = 0.2375, rounds up).

### Root Cause

The original implementation:

```typescript
export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (h / ab).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}
```

IEEE 754 double-precision binary float cannot represent most decimal fractions exactly. `19 / 80` is mathematically `0.2375`, but its binary representation is `0.23749999999999998889776975374...` — infinitesimally below the decimal midpoint.

`toFixed(3)` applies JavaScript's round-half-up rule to the binary value it actually holds: since `0.23749...` is below `0.2375`, it rounds down to `0.237` instead of up to `0.238`.

This affects any hit/AB combination where the true decimal result is an exact half-unit in the thousandths place (x.xx5000...) — the binary representation will almost always fall just below it.

### Fix

```typescript
// BEFORE (buggy):
export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (h / ab).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

// AFTER (fixed):
export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (Math.round(h * 1000 / ab) / 1000).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}
```

Step-by-step for `fmt3Avg(19, 80)`:

1. `19 * 1000` = `19000` (exact integer)
2. `19000 / 80` = `237.5` (IEEE 754 represents this exactly — it's a power-of-2 denominator multiple)
3. `Math.round(237.5)` = `238` (round-half-up, integer, no representation error)
4. `238 / 1000` = `0.238` (representable without sub-midpoint drift)
5. `(0.238).toFixed(3)` = `"0.238"` ✓

The same fix was applied to both `client/src/api/base.ts` and `client/src/lib/sports/baseball.ts` (canonical location referenced by `formatFn: "fmtRate"` in the stat config).

---

## Prevention

### Bug 1: Map.get() returning undefined as an exclusion signal

**Code smell**: `map.get(x) !== undefined && map.get(x) !== y`

This pattern conflates "key not in map" with "key in map pointing elsewhere." When map absence is meaningful (as with free agents), the combined condition silently includes absent keys. Always use `map.has(key)` as a separate explicit check, or restructure so the map's `undefined` return is the exclusion signal rather than requiring it to not equal both `undefined` and a value.

**Test that would have caught this**:

```typescript
it("does NOT credit stats to a free agent (player absent from activePlayerTeam map)", () => {
  // Set up: player is on no team's active roster
  mockRosterFindMany.mockResolvedValue([
    { teamId: 145, playerId: 10, releasedAt: PERIOD_START, ... }
    // no releasedAt=null entry → free agent
  ]);
  const result = await computeTeamStatsFromDb(20, 36);
  expect(result.find(r => r.team.code === "RGS").R).toBe(0);
});
```

### Bug 2: toFixed() on division results

**Code smell**: `(a / b).toFixed(N)` where `a` and `b` are runtime integer counts

`toFixed(N)` applies IEEE 754 binary float rounding, which is unreliable for values produced by division. The safe pattern is `Math.round(value * 10^N) / 10^N` before calling `toFixed`.

**Note**: `Number((a/b).toFixed(N))` does NOT fix this — it re-parses the already-wrong string.

**Test cases**:

```typescript
it("rounds correctly for IEEE 754 edge cases (19/80 = .2375 → .238 not .237)", () => {
  expect(fmt3Avg(19, 80)).toBe(".238");
  expect(fmt3Avg(24, 83)).toBe(".289");
});
```

---

## FanGraphs Audit Cadence

FanGraphs OnRoto is the authoritative external reference for OGBA period standings. Use it to verify standings correctness at any point during the scoring period. The audit should be team-by-team, stat-by-stat — not just a top-line check — because bugs like the free-agent attribution issue manifest as inflated totals on a single team, not as an overall league discrepancy.

### How to Navigate FanGraphs OnRoto

1. Go to FanGraphs → Fantasy → MyRoto (requires OGBA login)
2. Select the current scoring period
3. Each team row shows period stats for **active roster players only**
4. The "Reserved" section shows IL-stashed players (`dis` status) — their stats are NOT included in the team's period totals

### Audit Process: Team by Team

For each of the 8 OGBA teams, compare FanGraphs period totals against the FBST standings row:

**Hitting categories**: R, HR, RBI, SB, AVG (and OPS, OPS+, WAR if tracked)
**Pitching categories**: W, SV, K, ERA, WHIP (and QS, HLD, IP if tracked)

| Step | Action |
|---|---|
| 1 | Pull FBST standings: `GET /api/standings/period?leagueId=20&periodId=<N>` |
| 2 | Open FanGraphs team page for the same team |
| 3 | Compare each stat — flag any delta > 2 for counting stats (R/HR/RBI/SB/W/K/SV), any delta > 0.010 for rate stats (AVG/ERA/WHIP) |
| 4 | For any flagged delta, cross-reference the team's active roster in FBST vs FanGraphs |
| 5 | If FBST total is higher than FanGraphs: suspect a dropped player's stats are bleeding through (this bug's pattern) |
| 6 | If FBST total is lower: suspect a player is missing from FBST roster sync or `PlayerStatsPeriod` hasn't populated yet |

### Audit Script Pattern

The `audit-fangraphs.mjs` script (repo root, not committed to git — temp audit tool) demonstrates the query pattern. For a repeatable audit, the key query logic is:

```sql
-- Active roster for a team this period
SELECT p.mlbId, p.playerName, p.posPrimary, psp.*
FROM "Roster" r
JOIN "Player" p ON r."playerId" = p.id
JOIN "PlayerStatsPeriod" psp ON psp."playerId" = p.id AND psp."periodId" = <periodId>
WHERE r."teamId" = <teamId>
  AND r."releasedAt" IS NULL   -- active only — this is what FanGraphs shows
ORDER BY p."posPrimary";
```

Compare that output player-by-player against FanGraphs before summing to team totals. This catches both attribution errors (wrong player credited) and sync gaps (player missing from `PlayerStatsPeriod`).

### Red Flags by Category

| Symptom | Likely cause |
|---|---|
| W or K inflated on one team vs FanGraphs | Dropped pitcher's stats credited (this bug) |
| AVG one digit off (e.g. .237 vs .238) | IEEE 754 rounding in `fmt3Avg` |
| All stats slightly low on one team | `computeWithDailyStats` path chosen; doubleheader collapse dropping stats |
| Stats missing entirely for a player | `PlayerStatsPeriod` sync gap; check sync cron ran at 13:00 UTC |
| Same player's stats appear in two teams | Double-count from ghost roster row (see trade-reversal doc) |

### FanGraphs Timing Note

FanGraphs period totals can lag by 12–24 hours during the first few days of a period (incomplete stat ingestion). Always confirm you're comparing the same date range and that both sides have ingested the same game dates before treating a small delta as a bug. The MLB box score API (`statsapi.mlb.com`) is the ground truth for per-game verification.

---

## Related

- [`standings-boundary-and-il-slot-historical-lookup.md`](standings-boundary-and-il-slot-historical-lookup.md) — sibling fix: `gt`→`gte` boundary for `releasedAt` filtering; also touches `computeWithPeriodStats`
- [`standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md`](standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md) — earlier bug: wrong compute path selected; same `computeWithPeriodStats` function
- [`trade-reversal-ghost-roster-double-counting.md`](trade-reversal-ghost-roster-double-counting.md) — uses the same `activePlayerTeam` Map pattern; the prior fix built the Map but left the attribution guard with the `!== undefined` hole documented here
- [`period-roster-historical-il-display-and-gte-boundary.md`](period-roster-historical-il-display-and-gte-boundary.md) — independent occurrence of the same `gt`/`gte` boundary bug in the period-roster display route

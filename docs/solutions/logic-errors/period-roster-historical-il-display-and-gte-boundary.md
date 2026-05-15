---
title: "Period-roster endpoint: releasedAt boundary fix and historical IL position correction"
date: 2026-05-14
category: logic-errors
tags:
  - prisma
  - date-boundary
  - il-status
  - period-roster
  - mobile
  - typescript
  - off-by-one
  - roster-query
symptoms:
  - "Player released exactly at period start date missing from period roster entirely"
  - "IL_STASH'd player shows as IL in all historical periods, not just the one where they were actually on IL"
  - "IL players appear in Hitters and Pitchers tabs in mobile period mode"
  - "IL player stats counted in team totals for historical periods"
  - "Mookie Betts Period 1 stats (7 R, 2 HR, 7 RBI) excluded from LDY totals after IL_STASH at Period 2 start"
components:
  - server/src/features/teams/routes.ts
  - client/src/mobile/pages/MobileTeam.tsx
  - server/src/features/standings/services/standingsService.ts
severity: high
---

# Period-roster endpoint: releasedAt boundary fix and historical IL position correction

Three bugs caused the mobile team page to show incorrect rosters and stat totals when viewing historical periods. A player IL-stashed in Period 2 appeared as "IL" in Period 1 (when they were active), and IL players were not excluded from the Hitters/Pitchers tabs or totals in period mode.

## Root Cause

### Bug 1 — `gt` instead of `gte` on `releasedAt` in `GET /api/teams/:id/period-roster`

The period-roster endpoint in `teams/routes.ts` filtered released players with `releasedAt: { gt: period.startDate }` (strict greater-than). A player released at exactly midnight UTC on period start was present at the period's opening moment but was silently excluded from the result.

```ts
// Before (wrong — drops players released at boundary):
OR: [
  { releasedAt: null },
  { releasedAt: { gt: period.startDate } },
],
```

This is the identical `gt`/`gte` bug that also existed in `standingsService.ts`'s `computeTeamStatsFromDb`. Each call site must be audited independently — fixing one does not fix the other.

### Bug 2 — `Roster.assignedPosition` is a mutable current-state column

The period-roster endpoint returned `r.assignedPosition` directly. When a player is IL-stashed, the DB column updates to `"IL"` permanently. Historical period views then read `"IL"` for that player in every period — including periods before the IL move occurred.

`standingsService.ts` already solved this with `buildIlWindows` + `wasOnIlAtPeriodStart` helpers, but those functions were private (no `export`). The period-roster route duplicated the anti-pattern because it couldn't reuse the fix.

### Bug 3 — MobileTeam period mode `list` did not exclude IL players

`MobileTeam.tsx` computes the visible roster rows in a `useMemo` called `list`. In period mode the filters were:

```ts
if (tab === "Hitters") return sorted.filter((r) => !r.isPitcher);
if (tab === "Pitchers") return sorted.filter((r) => r.isPitcher);
```

No IL exclusion. The `totals` memo sums over `list`, so IL players' stats were included in team totals for every historical period.

The IL tab itself is intentionally hidden in period mode (`if (periodMode !== "season") return ["Hitters", "Pitchers"]` at line 399) because you cannot stash/activate in a historical view — but the Hitters/Pitchers content filters were never updated to match.

## Solution

### Fix 1 — `routes.ts`: change `gt` to `gte`

```ts
// After (correct — players released at exactly startDate were present at period start):
OR: [
  { releasedAt: null },
  { releasedAt: { gte: period.startDate } },
],
```

### Fix 2 — Export IL helpers from `standingsService.ts` and apply in `routes.ts`

**Step 1 — Add `export` to the two helpers:**

```ts
// server/src/features/standings/services/standingsService.ts
export type IlWindow = { start: Date; end: Date | null };
export function buildIlWindows(...): Map<number, IlWindow[]> { ... }
export function wasOnIlAtPeriodStart(playerId, periodStart, ilWindowsByPlayer): boolean { ... }
```

**Step 2 — Fetch IL events in parallel with period stats, override `assignedPosition`:**

```ts
// server/src/features/teams/routes.ts
import { buildIlWindows, wasOnIlAtPeriodStart } from "../standings/services/standingsService.js";

// After fetching rosters:
const playerIds = rosters.map(r => r.playerId);

const [periodStats, ilEvents] = await Promise.all([
  prisma.playerStatsPeriod.findMany({
    where: { periodId, playerId: { in: playerIds } },
  }),
  prisma.transactionEvent.findMany({
    where: {
      playerId: { in: playerIds },
      transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
      effDate: { not: null },
    },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  }),
]);

const ilWindowsByPlayer = buildIlWindows(ilEvents);

const result = rosters.map(r => {
  let assignedPosition = r.assignedPosition;
  if (
    assignedPosition === "IL" &&
    !wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer)
  ) {
    // Player was not on IL at period start — restore natural position
    assignedPosition = r.player.posPrimary;
  }
  return { ...r, assignedPosition, /* other mapped fields */ };
});
```

### Fix 3 — `MobileTeam.tsx`: exclude IL players from period mode tabs

```ts
// Before (wrong — IL players leak into both tabs):
if (tab === "Hitters") return sorted.filter((r) => !r.isPitcher);
if (tab === "Pitchers") return sorted.filter((r) => r.isPitcher);

// After (correct):
if (tab === "Hitters") return sorted.filter((r) => !r.isPitcher && r.assignedPosition !== "IL");
if (tab === "Pitchers") return sorted.filter((r) => r.isPitcher && r.assignedPosition !== "IL");
```

No separate fix for totals is needed — `totals` sums over `list`, so removing IL from `list` removes them from totals automatically.

### Data corrections applied atomically

Three roster records had incorrect IL dates or incorrect release events in prod Supabase:

| Player | Team | Problem | Correction |
|--------|------|---------|------------|
| Andrew Vaughn | DLC | IL_STASH dated 2026-05-03 instead of Period 2 start | Changed `effDate` to 2026-04-19T00:00:00.000Z |
| Daniel Palencia | RGS | Incorrectly released (releasedAt set); should have been IL_STASH'd | Restored active Roster row; IL_STASH event at 2026-04-19 |
| Quinn Priester | The Show | Incorrectly released; should have been IL_STASH'd | Restored active Roster row; IL_STASH event at 2026-04-19 |

Applied in a single Prisma transaction.

## Prevention

### Every period-scoped roster query needs `gte` on the start boundary

Any query filtering roster history by `releasedAt` at a period boundary must use `gte: period.startDate`, not `gt`. Auction drafts, keeper releases, and waiver claims are frequently stamped at exact midnight UTC. Two places had this bug independently — each call site must be audited when the pattern is introduced or copied.

Checklist when writing a period-scoped roster query:
- `acquiredAt: { lt: period.endDate }` — player joined before the period ended
- `releasedAt: { gte: period.startDate }` (NOT `gt`) — player was not released before the period opened

### `Roster.assignedPosition` is not safe to use in historical contexts

`assignedPosition` reflects the current UI-visible slot. Any historical (period-scoped) view that reads it will silently show wrong positions for players who moved into or out of IL after the period ended. The rule:

- **Current-state view** (Cumulative mode, live roster): `assignedPosition` is correct.
- **Historical view** (any Period): use `buildIlWindows` + `wasOnIlAtPeriodStart` from `standingsService.ts` to reconstruct position at the period's opening moment.

This pattern is documented more fully in `standings-boundary-and-il-slot-historical-lookup.md`. Any new period-scoped route that includes `assignedPosition` in the response shape is a candidate for this bug.

### Client-side period mode filters must be consistent with cumulative mode filters

When a client component has two rendering paths (e.g., `periodMode !== "season"` vs `hub` data in cumulative mode), every filtering rule applied in cumulative mode must be consciously applied — or consciously omitted with documentation — in period mode. Silently missing a filter (like the IL exclusion here) is a common drift point. Review the full filter set whenever adding a new mode.

## Tests

- `server/src/features/standings/__tests__/standingsService.IL.test.ts` — covers `buildIlWindows` + `wasOnIlAtPeriodStart` (stash at/before period start, mid-period stash included, multiple stints, activate restores stats)
- `server/src/features/standings/__tests__/standingsService.releaseAt.test.ts` — covers the `gte` boundary: released at period start credits releasing team, released before period gets nothing, mid-period trade goes to new owner

## Related

- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — The direct sibling: same `gt`/`gte` bug and same static-snapshot IL anti-pattern, but in `standingsService.ts`. Both docs should be read together when auditing any period-scoped roster query.
- `docs/solutions/logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — Covers the `PlayerStatsPeriod` vs `playerStatsDaily` routing decision; also discusses the `releasedAt` boundary from a different angle.
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — Documents the same `acquiredAt < endDate AND releasedAt >= startDate` query shape in `computeWithPeriodStats`; the `activePlayerTeam` guard there is the attribution complement of the IL-window fix here.
- `docs/solutions/logic-errors/period-date-timezone-shift.md` — Adjacent boundary bug: period `startDate`/`endDate` can be off by one day if read in local time. Verify period dates are UTC-correct before debugging boundary predicates.

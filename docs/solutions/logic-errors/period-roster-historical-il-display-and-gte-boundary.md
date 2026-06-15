---
title: "Period-roster endpoint: releasedAt boundary history and historical IL position correction"
date: 2026-06-12
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
  - "Ghost players appear in a period's roster — players who owned zero days of that period"
  - "IL_STASH'd player shows as IL in all historical periods, not just the one where they were actually on IL"
  - "IL players appear in Hitters and Pitchers tabs in mobile period mode"
  - "IL player stats counted in team totals for historical periods"
components:
  - server/src/features/teams/routes.ts
  - server/src/lib/rosterWindow.ts
  - client/src/mobile/pages/MobileTeam.tsx
severity: high
---

# Period-roster endpoint: releasedAt boundary history and historical IL position correction

## Canonical boundary (as of PR #400, 2026-06-12)

The `GET /api/teams/:id/period-roster` endpoint uses a **half-open ownership window**:

```
acquiredAt <= period.endDate   (inclusive — acquired on the last day still counts)
releasedAt >  period.startDate (exclusive — released at the period's first instant
                                means zero days owned; player belongs in the PRIOR period)
```

This is encapsulated in `periodOverlapFilter(period)` from `server/src/lib/rosterWindow.ts`.
Do not inline the boundary logic — use `periodOverlapFilter` directly in `findMany` queries.

---

## The boundary bug history (and why the direction changed)

### 2026-05-14 — `gt → gte` was added (commit `1020296`) — THIS WAS WRONG

A developer noticed that players released at exactly midnight UTC on `period.startDate` were
**vanishing entirely** from every period's view. The diagnosis was:

> "A player released at exactly `period.startDate` was present at the period's opening moment — `gte` is correct."

The fix changed `releasedAt: { gt: startDate }` to `releasedAt: { gte: startDate }`.

**This was the wrong fix.** The diagnosis was correct about the symptom but wrong about the cause:

- A wire-list drop sets `releasedAt = period.startDate` (midnight UTC). The player owned **zero days**
  of the new period — they scored nothing for it, and the new owner's first game is the period's first day.
- The player belongs in the **prior** period's view, where `releasedAt > p3.startDate` is satisfied
  (they were active during P3).
- The `gte` change made boundary-dropped players appear in **both** the prior period AND the new period
  simultaneously — the ghost-row bug.
- The real cause of the "vanishing entirely" symptom was a different boundary: `acquiredAt: { lt: endDate }`
  dropped players acquired on the period's last day (final-day pickups). That was the correct bug to fix.

Desktop `Team.tsx` added a client-side compensation filter to hide the ghosts; mobile `MobileTeam.tsx`
and legacy `TeamLegacy.tsx` rendered the raw API payload, showing ghost rows (e.g. DLC P4 showed
Brady House and Andrew Vaughn at 3B and CM, 2026-06-11).

### 2026-06-12 — PR #400 corrected both boundaries

```diff
- acquiredAt: { lt:  period.endDate },   // dropped final-day acquisitions
+ acquiredAt: { lte: period.endDate },   // inclusive fix (the actual vanishing bug)

- releasedAt: { gte: period.startDate }, // ghost-row bug — showed in both periods
+ releasedAt: { gt:  period.startDate }, // correct: half-open window
```

Server-side deduplication was also added for players with multiple stints (drop-and-reacquire)
in the same period (prefer active row; otherwise last-acquired stint wins via `acquiredAt: asc` order).

The client-side compensation filter in `Team.tsx` was deleted — server is now the single source of
truth for all three consumers (desktop, mobile, legacy).

---

## Rule: do NOT use `overlapsPeriod` semantics here

`rosterWindow.ts` exports two different period predicates:

| Function | `releasedAt` boundary | Use case |
|---|---|---|
| `overlapsPeriod` | `>= startDate` (inclusive) | standingsService stat attribution — "did this entry exist at any point in the period?" |
| `periodOverlapFilter` | `> startDate` (exclusive) | period-roster display — "did this player own >= 1 day of the period?" |

The distinction matters for players released exactly at midnight UTC (wire-list drops).
`overlapsPeriod` counts them in both periods; `periodOverlapFilter` assigns them only to the prior period.

---

## Bug 2 — `Roster.assignedPosition` is a mutable current-state column

The period-roster endpoint returns `r.assignedPosition` directly. When a player is IL-stashed,
the DB column updates to `"IL"` permanently. Historical period views then read `"IL"` for that
player in every period — including periods before the IL move occurred.

**Fix:** `buildIlWindows` + `wasOnIlAtPeriodStart` from `lib/ilWindows.ts` reconstruct the
player's IL state at `period.startDate`. If they were not on IL at period start, override
`assignedPosition` with `player.posPrimary` before returning the response.

```ts
// routes.ts — historical IL override
let assignedPosition = r.assignedPosition;
if (assignedPosition === "IL" && !wasOnIlAtPeriodStart(r.playerId, period.startDate, ilWindowsByPlayer)) {
  assignedPosition = r.player.posPrimary || "BN";
}
```

**Rule:** `Roster.assignedPosition` is NOT safe in historical contexts.
Any period-scoped route that reads `assignedPosition` is a candidate for this bug.

---

## Bug 3 — MobileTeam period mode tabs did not exclude IL players (fixed 2026-05-14)

`MobileTeam.tsx` computes the visible roster rows in a `useMemo` called `list`. In period mode
the IL tab is intentionally hidden — but the Hitters/Pitchers filters were not updated to match,
so IL players' stats were included in team totals.

**Fix:**
```ts
// After (correct):
if (tab === "Hitters") return sorted.filter((r) => !r.isPitcher && r.assignedPosition !== "IL");
if (tab === "Pitchers") return sorted.filter((r) => r.isPitcher && r.assignedPosition !== "IL");
```

---

## Prevention checklist

When writing or modifying a period-scoped roster query:

- [ ] Use `periodOverlapFilter(period)` from `lib/rosterWindow.ts` — do NOT inline the boundary logic
- [ ] If showing `assignedPosition`, check `wasOnIlAtPeriodStart` first
- [ ] Any new client tab/view in period mode must explicitly decide whether to include or exclude IL players

## Related

- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — Same boundary shape in standingsService (uses `overlapsPeriod`, inclusive)
- `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md` — Same "current-state predicate misapplied to historical context" pattern
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — Multi-stint deduplication precedent

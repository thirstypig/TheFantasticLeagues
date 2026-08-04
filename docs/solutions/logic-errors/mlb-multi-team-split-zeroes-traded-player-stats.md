---
title: "A player traded between MLB teams had his whole period stored as zeros — and the reconciler reported it clean"
slug: mlb-multi-team-split-zeroes-traded-player-stats
category: logic-errors
created: 2026-08-03
component: mlbStatsSyncService, standings, fangraphs-audit
problem_type: data-loss / external-api-shape
symptom: "One team's season totals sit below FanGraphs by 11 R / 3 HR / 9 RBI / 2 SB. The period MLB reconcile reports 219 players checked, 0 mismatches. Every unit test passes."
root_cause: "MLB statsapi returns one split per team plus an aggregate row. parsePlayerStats took splits[0], which for a player traded mid-window is only his FIRST team's partial line. Curtis Mead's first split was Boston: 1 game, all zeros."
related_modules: players, standings, periods, fangraphs-audit
prs: []
tags: data-sync, scoring, database, testing
---

# A traded player's period stored as zeros — and the reconciler said it was fine

## Symptom

Demolition Lumber Co. sat **11 R / 3 HR / 9 RBI / 2 SB** below FanGraphs on
season totals. Seven other teams reconciled cell-for-cell (8 mismatches out of 80).

Everything that should have caught it said the data was fine:

- `reconcilePeriodStats(39)` → **219 players checked, 0 mismatches, 0 fetch errors**
- `syncPeriodStats(39)` → **218 synced, 0 skipped, 0 errors**
- the full server test suite → green

## Root cause

**Curtis Mead** (`mlbId 678554`) was traded **Boston → Washington during Period 5**.

MLB's `byDateRange` endpoint returns **one split per team, plus an aggregate row**:

```
[0] team=Boston Red Sox        sport.id=1   G=1    R=0   HR=0   <- first split
[1] team=Washington Nationals  sport.id=1   G=14   R=11  HR=3
[2] team=(none)                sport.id=0   G=15   R=11  HR=3   <- the aggregate
```

`parsePlayerStats` did:

```typescript
const split = statGroup.splits?.[0]?.stat;   // Boston. One game. All zeros.
```

So FBST stored Mead's **entire Period 5** as zeros. MLB's game log shows he played
**15 games** and produced R=11 HR=3 RBI=9 SB=2 — exactly the team-level gap.

## The fix

Select the aggregate row, identified by `sport.id === 0` (`code: "All"`):

```typescript
function selectTotalSplit(splits: any[] | undefined): any | undefined {
  if (!splits || splits.length === 0) return undefined;
  const aggregate = splits.find((s) => s?.sport?.id === 0);
  return aggregate ?? splits[0];
}
```

### Two obvious alternatives that are both wrong

Both look correct and both corrupt data. Tests pin them.

| Tempting fix | Why it breaks |
|---|---|
| **Sum the splits** | A *single-team* player still gets two splits — his team, and the aggregate, **both tagged with that team**. Acuña would go from 5 runs to 10. |
| **Take the split with no `team` field** | The aggregate row **carries `team`** when the player only played for one club. Acuña's aggregate says "Atlanta Braves". |

`sport.id` is the only field that reliably separates a per-team split from the total.

`parsePlayerStats` is the single chokepoint for both `syncDailyStats` and
`fetchFreshPeriodStats`, so one change corrects daily and period writes together.

## Verification

| Check | Before | After |
|---|---|---|
| `reconcilePeriodStats(39)` mismatches | **0** (wrong) | 6 → re-synced → **0** (right) |
| Mead's stored Period 5 | `AB 1, H 0, R 0, HR 0, RBI 0, SB 0` | `AB 52, H 19, R 11, HR 3, RBI 9, SB 2` |
| MLB statsapi truth | — | `AB 52, H 19, R 11, HR 3, RBI 9, SB 2` |
| FanGraphs 80-cell diff | 8 mismatches | **3** (all pitching, unrelated) |

**Standings moved.** Demolition 66.0 → 68.0 roto points; RGing Sluggers 45.0 → 44.0;
Diamond Kings 37.0 → 36.0. This is a money league — a silent stat drop is a silent
payout error.

## The second bug: the reconciler is blind by construction

This is the more important finding.

`reconcilePeriodStats` shares `fetchFreshPeriodStats` with the syncer **on purpose**.
ADR-014 states the reconciler "must compare against EXACTLY what the syncer would
write (single source of fetch/parse semantics)."

That guarantees the two agree. It also guarantees the reconciler **cannot detect any
bug in the shared fetch/parse layer** — it re-read `splits[0]`, got the same zeros,
and reported agreement. It was not broken; it was comparing the pipeline against itself.

The proof is exact: with the parse bug present the reconcile reported **0 mismatches**;
with it fixed, the same call on the same stored data reported **6**, all Mead.

**A reconciler that shares its fetch path with the thing it audits is a consistency
check, not an audit.** To detect fetch-layer bugs it needs an independent path — the
`gameLog` endpoint reaches the same numbers by a different route and would have caught
this on day one.

## Prevention

1. **Never index `[0]` into an external API's array without knowing what orders it.**
   If the API can return more than one element, decide explicitly which one you want
   and assert on the field that identifies it.
2. **Give an auditor an independent path to the truth.** Sharing code with the audited
   system buys consistency at the cost of blindness. Both are defensible — but know
   which one you bought.
3. **Zero is a suspicious value for a rostered player.** A roster row with a full
   period of zeros deserves a flag, not silence. This bug produced a plausible-looking
   record, not a missing one, which is why nothing surfaced it.
4. **The lowest-trust source can still be the only one that's right.** FanGraphs sits
   at the bottom of the trust hierarchy (`MLB > PSP > PSD > FG`) and was the *only*
   layer that caught this. Trust ordering says who wins a disagreement — not who is
   allowed to raise one.

## Cross-references

- [`il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`](../integration-issues/il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md) — the same divergence, with two earlier explanations that were both wrong.
- [`onroto-fangraphs-audit-runbook.md`](../integration-issues/onroto-fangraphs-audit-runbook.md) — the audit that surfaced it.
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — a prior silent-drop in the same sync path.

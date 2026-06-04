---
status: complete
priority: p3
issue_id: "240"
tags: [stats-sync, mlb-api, audit, standings, hitters]
dependencies: ["239"]
---

# Hitter MLB-API sweep — completed

## Method

Ran `server/audit-hitters-vs-mlb-api.mjs` against all 73 unique hitters on
league-20 active rosters for Period 3 (2026-05-17 → today). Compared MLB
statsapi `gameLog` per-game to `PlayerStatsDaily`.

## Findings

| Bucket | Count | Verdict |
|---|---|---|
| Per-stat mismatches on common dates | 14 | **Not bugs.** All occurred on 5/23 — a heavy doubleheader day. MLB returns 2 splits per DH; FBST aggregates by date. The audit script naively compared each MLB split to the single FBST row → reported "mismatches." When you sum the 2 MLB games per player, they match FBST exactly. |
| Missing date rows with all-zero counters | 9 | **No fantasy impact.** Pinch runners / HBP-only / walks-only appearances where every fantasy-scoring counter (AB/H/R/HR/RBI/SB) is zero. Don't affect standings. |
| **TJ Rumfield 6/1 RBI=1** | 1 | **Real bug** — same `hasStats` filter issue as Matt Gage (todo #239). Sacrifice fly with 0 AB. Caught going-forward by PR #362; backfilled historically via `server/audit-backfill-rumfield-6-1.mjs`. |

## Resolution

- Backfilled TJ Rumfield 5/19 sac-fly RBI via prisma create.
- Re-ran `audit-period-3-stats.mjs` → Diamond Kings now reads RBI=87,
  matching FanGraphs exactly.
- The going-forward fix already landed in PR #362.

## Net effect on standings

Post-#239 + #240 backfills, Period 3 FBST stats reconcile to FG exactly
on the deltas we could isolate:
- DLC ERA 3.93 → 4.03 ✓
- DK RBI 86 → 87 ✓

Remaining residual deltas (Skunk Dogs AVG +.0015, RGing AVG +.0017, Devil
Dawgs AVG −.0018, Devil Dawgs RBI −1) are most likely FG-side
discrepancies (consistent with the FG-over-counts-ER pattern surfaced for
DK and RGS in todo #239's investigation). Confirming requires Periods 1+2
per-team views from FG — see todo #241.

## Resources

- Audit script: `server/audit-hitters-vs-mlb-api.mjs`
- Backfill: `server/audit-backfill-rumfield-6-1.mjs`
- Verification: `server/audit-period-3-stats.mjs`

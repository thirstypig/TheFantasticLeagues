---
title: "Position players' mop-up pitching counted toward team ERA/WHIP (attribution by 'not two-way' instead of by role)"
category: logic-errors
problem_type: attribution_role_mismatch
component: "server/src/features/standings/services/standingsService.ts, server/src/lib/sports/baseball.ts"
tags:
  - standings
  - stat-attribution
  - pitching
  - era
  - whip
  - position-player-pitching
  - two-way
  - posPrimary
  - onroto
  - fangraphs
  - roto-scoring
  - OGBA
  - live-scoring
  - shared-helper
---

## Symptom

The 2026-07-03 FanGraphs audit showed 6/8 OGBA teams matching OnRoto exactly, but **two teams
were off on pitching *rate* stats only** (all counting stats — R/HR/RBI/SB/W/SV/K — matched to
the unit):

- **Los Doyers:** ERA `4.15` vs OnRoto `4.13`; WHIP `1.223` vs `1.222`.
- **RGing Sluggers:** WHIP `1.256` vs `1.253`.

The gaps were tiny (≤0.02 ERA), stable across consecutive daily audits (not sync lag), and only on
these two teams. OnRoto is OGBA's **official scoring system**, so a stable mismatch there is a real
scoring difference, not cosmetic.

## Root cause

FBST counted a **position player's mop-up pitching** toward team pitching totals; OnRoto does not.

Two catchers/DHs each threw a blowout inning as position players (MLB records these in the player's
*pitching* game log):

- **Carson Kelly** (posPrimary `C`, Los Doyers): 1.0 IP, 2 ER, 2 BB+H, **0 K, 0 W**.
- **Adrian Del Castillo** (posPrimary `DH`, RGing): 1.7 IP, 1 ER, 4 BB+H, **0 K, 0 W**.

Because those innings had **K=0 / W=0**, the *counting* categories were unaffected — only ERA and
WHIP (which have IP in the denominator) moved. That's why the fingerprint was "rate-only, few teams,
stable."

The attribution logic decided pitching credit by the wrong predicate:

```ts
const isTwoWay = mlbId ? TWO_WAY_PLAYERS.has(mlbId) : false;
const assignedAsP = PITCHER_CODES.has((assignedPosition ?? posPrimary).toUpperCase());
const countPitching = !isTwoWay || assignedAsP;   // ← BUG: true for EVERY non-two-way player
```

For any non-two-way player `!isTwoWay` is `true`, so `countPitching` is always `true` — a catcher's
pitching counted. The predicate answered "is this player *not* an Ohtani-style two-way?" when the
real question is "is this player a *pitcher*?" This same block was **duplicated in 3 places** (two
`standingsService.ts` compute paths + `fangraphs-audit.ts`), a latent drift hazard.

## Fix (PR #412, todo #306)

A single shared helper attributes stats by **role** (`posPrimary`), not by roster slot and not by
"not two-way". Two-way players (Ohtani) remain the one case that follows the assigned slot.

```ts
// server/src/lib/sports/baseball.ts
export function playerStatRoles(args: {
  posPrimary: string | null | undefined;
  assignedPosition: string | null | undefined;
  isTwoWay: boolean;
}): { countHitting: boolean; countPitching: boolean } {
  const primaryIsP = PITCHER_CODES_SET.has((args.posPrimary ?? "").toUpperCase());
  const assignedIsP = PITCHER_CODES_SET.has((args.assignedPosition ?? args.posPrimary ?? "").toUpperCase());
  if (args.isTwoWay) return { countHitting: !assignedIsP, countPitching: assignedIsP };
  return { countHitting: !primaryIsP, countPitching: primaryIsP };
}
```

Key choice: **key on `posPrimary` (role), not `assignedPosition` (slot)** — otherwise a benched
pitcher (`assignedPosition="BN"`) would silently lose his stats. All 3 callsites route through the
helper, so standings and the audit can never diverge again.

**Verified against prod:** Los Doyers now matches OnRoto exactly (4.13 / 1.222); RGing WHIP exact;
the other 6 teams and every hitting/counting stat unchanged. (RGing's remaining 0.01 ERA is a
*separate*, genuinely FG-stale value — see the audit doc — and is correctly not chased.)

## Prevention

- **Attribute stats by role, not by exclusion.** "Not two-way" ≠ "is a pitcher." A player's stats
  count in the category matching their role; position players don't pitch for your fantasy team even
  when MLB records an inning for them.
- **Role = `posPrimary`, not the roster slot.** Slots (BN/IL/positional) are for lineup validity;
  they must not gate whether an owned player's stats count (that's ownership-window's job).
- **One shared helper for hitting/pitching attribution.** Duplicated attribution logic across
  standings + audit is how these silently drift; `playerStatRoles` is the single source of truth.
- **Diagnostic fingerprint:** a **rate-only** delta (ERA/WHIP but not the counting stats), on a
  **few** teams, **stable** across days, points at a per-player *role/attribution* difference — not a
  data-freshness or rounding issue. Confirm by diffing OnRoto's per-pitcher breakdown against MLB.
- **The right OnRoto view:** the **Full Report PDF** (`/baseball/OGBA/report.pdf`, via *Print
  Reports*) lists each team's per-pitcher ER/IP *including released players* — the standings-level
  breakdown. `display_team_stats.pl` is *current-roster only* and cannot supply it.
- **Tests:** `playerStatRoles` unit tests (position player / pitcher / benched pitcher / two-way both
  slots / null) + the `accumulatePeriodStats` regression that now asserts a position player's
  pitching is *excluded*.

## Related
- [`../integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md`](../integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md) — the audit that found this; the full two-part decomposition (this bug + a separate FG-stale ER) and the PDF technique.
- [`onroto-vs-fbst-stat-attribution-semantics.md`](onroto-vs-fbst-stat-attribution-semantics.md) — the ownership-window vs current-roster model (a *different* attribution axis; this bug is about role, that one is about time).
- [`current-state-field-used-as-historical-predicate.md`](current-state-field-used-as-historical-predicate.md) — sibling class: using the wrong field to gate stat credit.

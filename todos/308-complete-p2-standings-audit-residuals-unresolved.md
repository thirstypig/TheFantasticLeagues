---
priority: p2
issue_id: 308
tags: [audit, standings, onroto, reconciliation, roster]
dependencies: []
---

## Problem Statement
The 2026-08-30 audit established that **FBST's stored data is correct** — all six closed periods
PASS against MLB statsapi (1,269 player-period checks, 0 mismatches). Every FanGraphs residual is
therefore an *attribution* difference, not bad data.

The dominant cause is identified and its arithmetic is exact: **roster moves recorded in FBST later
than they happened in OnRoto**. A drop entered with `effDate = today` still satisfies the window
predicate (`releasedAt > period.startDate`), so FBST credits the team a full extra period.

- The Show's entire residual, all 7 categories = Peralta (W1 K20) + Hicks (R8 HR3 RBI12) +
  García (R12 HR5 RBI12) — each exactly that player's Period 6 line.
- Devil Dawgs = Erik Miller (W1 K18), 100%.
- RGing Sluggers = Heliot Ramos (R1 RBI1 SB1), 100%.

**Three things remain genuinely unresolved:**
1. **Confirmation.** The mechanism is inferred from FBST-side dates. It needs OnRoto's transaction
   log showing the REAL drop dates for Peralta, Hicks, García, and Erik Miller.
2. **Los Doyers `W2 K3`.** Pallante + Wrobleski explain W1 K24 of the W3 K27 residual. The rest is
   unexplained.
3. **Demolition's NEGATIVE pitching residual (W−2 SV−4 K−4).** Negative means OnRoto credits
   someone FBST does not — a different mechanism entirely, and unidentified. Its hitting side
   (R+7 HR+2 RBI+12) is close to but NOT exactly Nathaniel Lowe's P6 line.

### 2026-08-31 — a THIRD mechanism, confirmed: the audit double-counts mid-period trades

`isInPeriodWindow` (`lib/audit/fbstTotals.ts:32`) is binary per period — a stint that overlaps the
period at all earns the player's WHOLE period line. It has no intra-period clamping, and its
`counted` dedup is keyed `teamId:playerId`, so it never dedups ACROSS teams. A player traded
mid-period is therefore credited in full to **both** teams.

Confirmed on Trade 22 (2026-08-30, Diamond Kings ↔ Dodger Dawgs). Teoscar Hernández and Braxton
Ashcraft were released by Diamond Kings at `2026-08-30T15:41:33Z` and acquired by Dodger Dawgs at
the same instant. Period 7 starts `2026-08-30T00:00:00Z`, so `releasedAt <= startDate` is false and
BOTH stints pass the predicate. Diamond Kings' entire new residual — `R+2 HR+1 RBI+2 W+1 K+3` — is
exactly Teoscar (R2 HR1 RBI2) + Ashcraft (W1 K3)'s Period 7 lines.

**This is the instrument, not production.** `computeTeamStatsFromDb` windows mid-period moves through
daily stats via `clampToPeriod` (ADR-013 / todo #286), so production attributes correctly. Fixing it
means giving the audit accumulator the same clamping, not patching the dedup.

**Do not adopt the naive rule.** "Dropped today ⇒ over-credited" is FALSIFIED: Skunk Dogs made 6
same-day moves including drops carrying real Period 6 stats and reconciles exactly. The mechanism
requires the FBST drop to be late *relative to OnRoto*, not merely recorded today.

## Proposed Solutions
Pull OnRoto's transaction log (Playwright — per-team and historical pages are Cloudflare-gated to
curl) and diff its move dates against `TransactionEvent.effDate`. That confirms or kills cause (1)
and likely explains (2). Demolition (3) needs its own pass — start from which players OnRoto has on
its Period 6 roster that FBST does not.

If confirmed, the durable fix is process, not code: backdate late-recorded moves to the real date
(see `period_rollover_and_roster_backdate` memory), or add a commissioner-facing warning when a
move is entered with an effDate in a period that has already closed.

## Acceptance Criteria
- OnRoto transaction log compared against FBST `effDate` for the four named players; cause (1)
  confirmed or falsified in writing.
- Los Doyers' residual fully attributed, or documented as unexplained with what was ruled out.
- Demolition's negative pitching residual explained.
- Any explanation is tested against the teams that did NOT diverge before being recorded as a cause.
- Runbook Results log updated.
- `git mv` this todo from pending → complete.

## Resources
- `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md` (2026-08-30 row)
- `docs/reports/standings-audit-period-6-2026-08-31.md`
- Memory: `fangraphs_vs_tfl_audit_findings`

### 2026-08-31 — the investigative half is CLOSED; only the instrument fix remains

**All three "genuinely unresolved" items in the Problem Statement above are resolved.** They were
answered by the per-team OnRoto diff on 2026-08-31 and recorded in the
`fangraphs_vs_tfl_audit_findings` memory, but never written back here:

1. **Confirmation of late-recorded drops** — confirmed via the per-team OnRoto pages (Playwright;
   they are Cloudflare-gated to curl).
2. **Los Doyers `W2 K3`** — **Foster Griffin** (W3 K23, exactly his P6 line, dropped in FBST 08-30)
   plus **Paul Sewald** (K4). Note the earlier attribution in this file (Pallante + Wrobleski) was
   **WRONG** — both match OnRoto exactly.
3. **Demolition's negative pitching residual** — **Jacob Webb**, who is on OnRoto's roster with no
   FBST roster row at all (a missing ADD: −W2 −SV4 −K9), partly offset by **Emmet Sheehan** (+K4).

statsapi and Baseball Reference agree cell-for-cell on Sheehan, Webb and Sewald, so **no residual
is a stat-data error — every one is roster state.** Sewald's K+4 is the lone unproven case (W and
SV match exactly, only K differs — the FG-stale signature, unprovable because FG has no per-period
slice).

**What actually remains is the third mechanism: the audit double-counts mid-period trades.**
`isInPeriodWindow` is binary per period and `counted` is keyed `teamId:playerId`, so it never
dedups ACROSS teams — a player traded mid-period is credited in FULL to both. Production
`computeTeamStatsFromDb` clamps such moves through daily stats (ADR-013 / todo #286), so standings
are right; only the instrument over-counts.

**Scope note for whoever picks this up:** the fix means giving the accumulator the same clamping,
which requires plumbing `PlayerStatsDaily` into a function that today sees only
`PlayerStatsPeriod`. **Unlike todo #307, this WILL move audit numbers.** Ship it with a before/after
prod differential across every closed period so the movement is inspected, not discovered.

### 2026-08-31 (later) — CLOSED. Instrument fixed and verified against prod.

- **The accumulator now clamps mid-period moves through daily stats**, mirroring `standingsService`'s
  hybrid (todo #286 / ADR-013) rather than inventing a third rule. `findMidPeriodPlayers` is the
  single shared definition — `findCoverageGaps` consumes it too, so a player counted from dailies is
  no longer reported missing for lacking a PSP row. `clampToPeriod` is reused from `lib/rosterWindow`,
  not copied.
- **Four tests, three watched failing first**: `expected 6 to be 2` (whole line to one team),
  `expected 5 to be +0` (dropper kept the trade day), `expected 100 to be 7` (PSP instead of clamped
  dailies). The fourth — a boundary-aligned player staying on PSP — passed throughout, confirming the
  doubleheader-safe path is untouched.
- **Before/after prod differential across all 6 closed periods: NO MOVEMENT.** Explained, not assumed:
  the only closed-period mid-period players are Carson Spiers and Chase Dollander (PSP all zeros,
  zero daily rows — they contribute nothing either way) and Aaron Ashby, whose three stints are all
  Diamond Kings and contiguous, so clamping yields the whole period regardless. **Trade 22 sits in
  Period 7, which is still ACTIVE** and therefore outside the completed-only season leg (#435) — the
  fix lands before that period closes, which is the point.
- **Verified clamping loses nothing:** Ashby's 7 daily rows reconstruct his PSP exactly
  (W1 K9 IP9.333 ER3 BB_H13; IP differs by 2e-15, float noise).

**Surfaced but NOT fixed — needs a decision.** Chase Dollander has a `Roster` row with
`acquiredAt 2026-06-03` and `releasedAt 2026-05-17` — **released before acquired**. It is harmless
today (he has no stats in the window) but it is nonsense data that every window predicate has to
survive. Worth its own todo: either a DB-level check constraint or a repair, plus how it got written.

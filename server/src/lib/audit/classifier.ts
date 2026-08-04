// server/src/lib/audit/classifier.ts
import { emptyStatLine, type ExplainedDelta, type ClassifyResult, type StatLine } from "./types.js";

const STAT_KEYS = Object.keys(emptyStatLine()) as (keyof StatLine)[];

/**
 * THERE IS DELIBERATELY NO CANDIDATE PRODUCER IN THIS MODULE.
 *
 * `classifyTeamDelta` accepts `candidates` so that a *validated* divergence
 * cause has somewhere to land. Today every caller passes `[]`, which means
 * `residual` is the raw FBST-minus-FG difference. That is the honest default:
 * with no proven mechanism, every delta is unexplained.
 *
 * One producer was written and then deleted — `buildIlCandidates`, on the
 * theory that FBST drops the stats of a player who was IL-slotted at period
 * start while OnRoto counts them all season. It was FALSIFIED on 2026-08-03:
 * six teams (Chourio, Ramos, Palencia, Priester, Diaz, Lindor) hold exactly
 * that shape of IL window with real accumulated stats and reconcile with
 * FanGraphs cell-for-cell. The one team that did diverge turned out to be a
 * data bug — a mid-period MLB trade stored as zeros (`splits[0]`, fixed in
 * PR #429) — not an attribution rule at all. Symptom while it was live:
 * `explained` and `residual` printed as identical columns, because
 * subtracting a phantom divergence manufactures the very gap it claims to
 * explain.
 *
 * THE BAR FOR ADDING A PRODUCER HERE: the proposed mechanism must be tested
 * against the teams that do NOT diverge, and must correctly predict that they
 * don't. An explanation that only fits the failing case is curve-fitting —
 * it was the trap both times. See
 * `docs/solutions/integration-issues/il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`.
 */

/**
 * residual = (FBST + explained) - FG, per category.
 *
 * Residual is reported raw — never clamped, never floored at zero. An
 * over-large "explained" flips the sign and stays visible, which is the
 * signal that a candidate is wrong.
 */
export function classifyTeamDelta(args: {
  teamName: string;
  fbstTotals: StatLine;
  fgTotals: StatLine;
  candidates: ExplainedDelta[];
}): ClassifyResult {
  const { teamName, fbstTotals, fgTotals, candidates } = args;

  const explained: Partial<StatLine> = {};
  for (const c of candidates) {
    for (const [k, v] of Object.entries(c.expected) as [keyof StatLine, number][]) {
      explained[k] = (explained[k] ?? 0) + v;
    }
  }

  const residual: Partial<StatLine> = {};
  for (const k of STAT_KEYS) {
    // Always set the key, even when the delta closes to zero — a category
    // that fully reconciles must read as an explicit 0, not be omitted and
    // read as "unknown".
    residual[k] = fbstTotals[k] + (explained[k] ?? 0) - fgTotals[k];
  }

  return { teamName, explained, residual, causes: candidates };
}

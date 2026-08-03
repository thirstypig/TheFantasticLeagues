// server/src/lib/audit/classifier.ts
import { emptyStatLine, type ExplainedDelta, type ClassifyResult, type StatLine } from "./types.js";

const STAT_KEYS = Object.keys(emptyStatLine()) as (keyof StatLine)[];

/**
 * Build expected IL divergences from the transaction log.
 *
 * Deliberately takes NO FanGraphs input: candidates must be derivable from
 * FBST's own data alone, so the classifier can never be tuned to fit an
 * observed gap. (See PR #402 — the measuring instrument was the bug.)
 *
 * Mirrors wasOnIlAtPeriodStart: FBST excludes a player who was IL-slotted at
 * the START of the period, regardless of when he came back.
 */
export function buildIlCandidates(args: {
  teamName: string;
  ilWindows: { playerId: number; playerName: string; start: Date; end: Date | null }[];
  period: { id: number; startDate: Date; endDate: Date };
  pspByPlayer: Map<number, StatLine>;
}): ExplainedDelta[] {
  const { ilWindows, period, pspByPlayer } = args;
  const out: ExplainedDelta[] = [];

  for (const w of ilWindows) {
    const startedOnOrBefore = w.start.getTime() <= period.startDate.getTime();
    const stillOpenAtStart = w.end === null || w.end.getTime() > period.startDate.getTime();
    if (!startedOnOrBefore || !stillOpenAtStart) continue;

    const psp = pspByPlayer.get(w.playerId);
    if (!psp) continue; // no stats to be excluded — nothing to explain

    const expected: Partial<StatLine> = {};
    for (const k of STAT_KEYS) if (psp[k]) expected[k] = psp[k];

    out.push({
      playerId: w.playerId,
      playerName: w.playerName,
      cause: "il_exclusion",
      expected,
      evidence:
        `IL window ${w.start.toISOString().slice(0, 10)}..` +
        `${w.end ? w.end.toISOString().slice(0, 10) : "open"} covers start of ` +
        `period ${period.id} (${period.startDate.toISOString().slice(0, 10)}); ` +
        `FBST excludes, OnRoto counts YTD`,
    });
  }
  return out;
}

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

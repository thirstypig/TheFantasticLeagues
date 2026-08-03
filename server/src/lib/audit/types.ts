// server/src/lib/audit/types.ts

/** Raw counting stats for one player or one team, over one window. */
export interface StatLine {
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number;
}

export const COUNTING_CATS = ["R", "HR", "RBI", "SB", "W", "SV", "K"] as const;
export const RATE_CATS = ["AVG", "ERA", "WHIP"] as const;
export type CatKey = (typeof COUNTING_CATS)[number] | (typeof RATE_CATS)[number];

/** Why FBST and FanGraphs legitimately disagree about a player. */
export type DivergenceCause =
  | "il_exclusion"
  | "partial_ownership"
  | "two_way_synthetic"
  | "roster_mismatch"
  | "fg_coverage_lag";

/**
 * One expected divergence, derived from FBST's own data BEFORE the observed
 * FG gap is read. `evidence` must cite the source rows (transaction ids, dates).
 */
export interface ExplainedDelta {
  playerId: number;
  playerName: string;
  cause: DivergenceCause;
  expected: Partial<StatLine>;
  evidence: string;
}

export interface ClassifyResult {
  teamName: string;
  explained: Partial<StatLine>;
  residual: Partial<StatLine>;
  causes: ExplainedDelta[];
}

export function emptyStatLine(): StatLine {
  return { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };
}

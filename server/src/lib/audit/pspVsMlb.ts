/**
 * Independent player-stat check: FBST's stored PlayerStatsPeriod row vs the
 * sum of the player's MLB statsapi game log over the period.
 *
 * Independent of the syncer on purpose. The syncer and the nightly reconciler
 * both read `byDateRange` totals; this sums the per-game log
 * (`/people/{id}/stats?stats=gameLog`) instead, so a fault in the shared fetch
 * path can't agree with itself. It replaced a one-off sweep that matched all
 * seven 2026 periods (2026-11-19).
 */

/** One game from `stats=gameLog`. Only the fields we read. */
export interface GameLogSplit {
  date: string; // YYYY-MM-DD
  team?: { id?: number };
  stat: Record<string, unknown>;
}

/** The ten OGBA categories' raw inputs. Innings are carried as outs so equality is exact. */
export interface ScoredLine {
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; outs: number; ER: number; BB_H: number;
}
export const SCORED_KEYS = ["AB", "H", "R", "HR", "RBI", "SB", "W", "SV", "K", "outs", "ER", "BB_H"] as const;

export const zeroScored = (): ScoredLine => ({ AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, outs: 0, ER: 0, BB_H: 0 });

/** MLB writes innings as "6.1" = 6⅓. Returns outs (19). */
export function ipToOuts(ip: unknown): number {
  const [whole, frac = "0"] = String(ip ?? "0").split(".");
  return Number(whole) * 3 + Number(frac);
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/**
 * Which half of a player's stats a row holds. Ohtani is two Player records:
 * the real id keeps hitting, the synthetic id (real + 1,000,000) keeps
 * pitching. A real id only drops pitching when its synthetic twin is present.
 */
export type StatRole = "both" | "hitting" | "pitching";
export const TWO_WAY_OFFSET = 1_000_000;
export function roleFor(mlbId: number, mlbIdsInPeriod: ReadonlySet<number>): StatRole {
  if (mlbId >= TWO_WAY_OFFSET) return "pitching";
  return mlbIdsInPeriod.has(mlbId + TWO_WAY_OFFSET) ? "hitting" : "both";
}

/**
 * Sum one player's game log over [start, end] (inclusive dates). When
 * `countedTeamIds` is set (NL-only / AL-only leagues), games for any other MLB
 * team are skipped — a player traded to the other league stops counting.
 */
export function sumGameLogs(
  logs: { hitting: GameLogSplit[]; pitching: GameLogSplit[] },
  window: { start: string; end: string },
  countedTeamIds: ReadonlySet<number> | null,
  role: StatRole,
): ScoredLine {
  const s = zeroScored();
  const counts = (g: GameLogSplit) =>
    g.date >= window.start && g.date <= window.end && (!countedTeamIds || countedTeamIds.has(g.team?.id ?? -1));
  if (role !== "pitching") {
    for (const g of logs.hitting) {
      if (!counts(g)) continue;
      const t = g.stat;
      s.AB += n(t.atBats); s.H += n(t.hits); s.R += n(t.runs);
      s.HR += n(t.homeRuns); s.RBI += n(t.rbi); s.SB += n(t.stolenBases);
    }
  }
  if (role !== "hitting") {
    for (const g of logs.pitching) {
      if (!counts(g)) continue;
      const t = g.stat;
      s.W += n(t.wins); s.SV += n(t.saves); s.K += n(t.strikeOuts);
      s.outs += ipToOuts(t.inningsPitched); s.ER += n(t.earnedRuns);
      s.BB_H += n(t.baseOnBalls) + n(t.hits);
    }
  }
  return s;
}

/** A stored PlayerStatsPeriod row as a ScoredLine. IP is stored as true thirds (6.333…). */
export function pspToScored(psp: {
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number;
}): ScoredLine {
  return {
    AB: psp.AB, H: psp.H, R: psp.R, HR: psp.HR, RBI: psp.RBI, SB: psp.SB,
    W: psp.W, SV: psp.SV, K: psp.K, outs: Math.round(psp.IP * 3), ER: psp.ER, BB_H: psp.BB_H,
  };
}

export interface StatDiff { stat: (typeof SCORED_KEYS)[number]; fbst: number; mlb: number }

/** Every category where FBST and MLB disagree; empty when they match. */
export function diffScored(fbst: ScoredLine, mlb: ScoredLine): StatDiff[] {
  return SCORED_KEYS.filter((k) => fbst[k] !== mlb[k]).map((stat) => ({ stat, fbst: fbst[stat], mlb: mlb[stat] }));
}

/** Format a diff list as "HR 12≠13, IP 20.1≠21.0" (innings shown in MLB notation). */
export function formatDiffs(diffs: StatDiff[]): string {
  const show = (stat: StatDiff["stat"], v: number) => (stat === "outs" ? `${Math.floor(v / 3)}.${v % 3}` : String(v));
  return diffs.map((d) => `${d.stat === "outs" ? "IP" : d.stat} ${show(d.stat, d.fbst)}≠${show(d.stat, d.mlb)}`).join(", ");
}

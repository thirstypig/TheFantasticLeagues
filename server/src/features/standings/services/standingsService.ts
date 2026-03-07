
import { normCode } from "../../../lib/utils.js";
import type { PeriodStatRow } from "../../../types/stats.js";

// --- Types ---

/** CSV player row extended with team/period fields used by aggregation */
export type CsvPlayerRow = PeriodStatRow & {
  team_code?: string;
  team_name?: string;
  ER?: number | string;
  IP?: number | string;
  BB_H?: number | string;
  ogba_team_code?: string;
};

/** Team-level aggregated stat row — output of aggregation, input to ranking */
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  W: number;
  S: number;
  ERA: number;
  WHIP: number;
  K: number;
  [key: string]: number | { id: number; name: string; code: string };
}

/** A single category ranking row */
export interface CategoryRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  value: number;
  rank: number;
  points: number;
}

/** Final standings row */
export interface StandingsRow {
  teamId: number;
  teamName: string;
  points: number;
  rank: number;
  delta: number;
}

/** Season standings data (per-team with period breakdowns) */
export interface SeasonStandingsRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  periodPoints: number[];
  totalPoints: number;
}

/** Standings-related record with team info (for buildTeamNameMap input) */
interface StandingsRecord {
  teamCode?: string;
  code?: string;
  team?: string;
  teamName?: string;
  name?: string;
}

/** Season stat row (for buildTeamNameMap input) */
interface SeasonStatInput {
  ogba_team_code?: string;
}

export function buildTeamNameMap(
  seasonStandings: StandingsRecord[] | { rows?: StandingsRecord[] } | null,
  seasonStats: SeasonStatInput[]
): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. From seasonStandings
  const rows: StandingsRecord[] = Array.isArray(seasonStandings)
    ? seasonStandings
    : seasonStandings?.rows || [];
  for (const r of rows) {
    const code = normCode(r.teamCode || r.code || r.team || "");
    const name = r.teamName || r.name || r.team || "";
    if (code && name) map[code] = name;
  }

  // 2. From seasonStats
  for (const s of seasonStats) {
    const code = normCode(s.ogba_team_code);
    if (code && !map[code]) map[code] = code;
  }

  return map;
}

export const CATEGORY_CONFIG = [
  { key: "R", label: "Runs", lowerIsBetter: false, group: "H" },
  { key: "HR", label: "Home Runs", lowerIsBetter: false, group: "H" },
  { key: "RBI", label: "RBI", lowerIsBetter: false, group: "H" },
  { key: "SB", label: "Stolen Bases", lowerIsBetter: false, group: "H" },
  { key: "AVG", label: "Average", lowerIsBetter: false, group: "H" },
  { key: "W", label: "Wins", lowerIsBetter: false, group: "P" },
  { key: "SV", label: "Saves", lowerIsBetter: false, group: "P" },
  { key: "ERA", label: "ERA", lowerIsBetter: true, group: "P" },
  { key: "WHIP", label: "WHIP", lowerIsBetter: true, group: "P" },
  { key: "K", label: "Strikeouts", lowerIsBetter: false, group: "P" },
] as const;

export type CategoryKey = (typeof CATEGORY_CONFIG)[number]["key"];

// Map config keys to DB column names where they differ
const KEY_TO_DB_FIELD: Partial<Record<CategoryKey, string>> = {
  SV: "S",
};

export function computeCategoryRows(
  stats: TeamStatRow[],
  key: CategoryKey,
  lowerIsBetter: boolean
): CategoryRow[] {
  const dbField = KEY_TO_DB_FIELD[key] || key;
  const rows = stats.map((s) => ({
    teamId: s.team.id,
    teamName: s.team.name,
    teamCode: s.team.code || s.team.name.substring(0, 3).toUpperCase(),
    value: Number(s[dbField]),
  }));

  const n = rows.length;
  if (n === 0) return [];

  // Use rankPoints for proper tie handling
  const teamsForRank = rows.map((r) => ({
    teamCode: String(r.teamId), // use teamId as key
    value: r.value,
  }));
  const { pointsByTeam, rankByTeam } = rankPoints(
    teamsForRank,
    !lowerIsBetter,
    n
  );

  // Sort for display order
  rows.sort((a, b) => {
    if (lowerIsBetter) {
      return a.value - b.value;
    } else {
      return b.value - a.value;
    }
  });

  return rows.map((row) => ({
    ...row,
    rank: rankByTeam[String(row.teamId)] ?? 0,
    points: pointsByTeam[String(row.teamId)] ?? 0,
  }));
}

export function computeStandingsFromStats(stats: TeamStatRow[]): StandingsRow[] {
  if (stats.length === 0) {
    return [];
  }

  const teamMap = new Map<
    number,
    {
      teamId: number;
      teamName: string;
      points: number;
    }
  >();

  for (const row of stats) {
    teamMap.set(row.team.id, {
      teamId: row.team.id,
      teamName: row.team.name,
      points: 0,
    });
  }

  // For each category, rank and add points
  for (const cfg of CATEGORY_CONFIG) {
    const rows = computeCategoryRows(stats, cfg.key, cfg.lowerIsBetter);
    for (const r of rows) {
      const team = teamMap.get(r.teamId);
      if (!team) continue;
      team.points += r.points;
    }
  }

  const standings = Array.from(teamMap.values());
  standings.sort((a, b) => b.points - a.points);

  return standings.map((s, idx) => ({
    teamId: s.teamId,
    teamName: s.teamName,
    points: s.points,
    rank: idx + 1,
    delta: 0, // later we can compute movement vs previous snapshot
  }));
}

/**
 * Aggregate player-level CSV rows into team-level stats for a given period.
 * Returns objects shaped like DB TeamStatsPeriod rows with { team: { id, name, code } }
 * so they can be passed directly to computeCategoryRows.
 */
export function aggregatePeriodStatsFromCsv(
  periodStats: CsvPlayerRow[],
  periodKey: string
): TeamStatRow[] {
  // Filter rows for the requested period (CSV uses "P1", "P2", etc.)
  const periodRows = periodStats.filter(
    (r) => String(r.period_id ?? "").trim().toUpperCase() === periodKey.toUpperCase()
  );

  // Group by team_code
  const teamMap = new Map<
    string,
    {
      teamCode: string;
      teamName: string;
      R: number;
      HR: number;
      RBI: number;
      SB: number;
      H: number;
      AB: number;
      W: number;
      S: number; // DB uses "S" for saves
      K: number;
      ER: number;
      IP: number;
      BB_H: number;
    }
  >();

  for (const r of periodRows) {
    const code = String(r.team_code ?? "").trim().toUpperCase();
    if (!code) continue;

    if (!teamMap.has(code)) {
      teamMap.set(code, {
        teamCode: code,
        teamName: String(r.team_name ?? code).trim(),
        R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0,
        W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0,
      });
    }

    const team = teamMap.get(code)!;
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

    team.R += n(r.R);
    team.HR += n(r.HR);
    team.RBI += n(r.RBI);
    team.SB += n(r.SB);
    team.H += n(r.H);
    team.AB += n(r.AB);
    team.W += n(r.W);
    team.S += n(r.SV); // CSV uses SV, DB uses S
    team.K += n(r.K);
    team.ER += n(r.ER);
    team.IP += n(r.IP);
    team.BB_H += n(r.BB_H);
  }

  // Compute rate stats (AVG, ERA, WHIP) from components
  const result: TeamStatRow[] = [];
  let idx = 0;
  for (const team of teamMap.values()) {
    const AVG = team.AB > 0 ? team.H / team.AB : 0;
    const ERA = team.IP > 0 ? (team.ER / team.IP) * 9 : 0;
    const WHIP = team.IP > 0 ? team.BB_H / team.IP : 0;

    result.push({
      team: {
        id: idx + 1, // synthetic ID — used only for ranking
        name: team.teamName,
        code: team.teamCode,
      },
      R: team.R,
      HR: team.HR,
      RBI: team.RBI,
      SB: team.SB,
      AVG,
      W: team.W,
      S: team.S, // computeCategoryRows maps SV → "S"
      ERA,
      WHIP,
      K: team.K,
    });
    idx++;
  }

  return result;
}

/**
 * Aggregate player-level CSV rows across ALL periods into team-level season totals.
 * Same shape as aggregatePeriodStatsFromCsv output.
 */
export function aggregateSeasonStatsFromCsv(periodStats: CsvPlayerRow[]): TeamStatRow[] {
  return aggregatePeriodStatsFromCsv(
    periodStats.map((r) => ({ ...r, period_id: "ALL" })),
    "ALL"
  );
}

export function rankPoints(
  teams: Array<{ teamCode: string; value: number }>,
  higherIsBetter: boolean,
  totalTeams: number
): { pointsByTeam: Record<string, number>; rankByTeam: Record<string, number> } {
  const sorted = [...teams].sort((a, b) => {
    if (a.value === b.value) return 0;
    return higherIsBetter ? b.value - a.value : a.value - b.value;
  });

  const pointsByTeam: Record<string, number> = {};
  const rankByTeam: Record<string, number> = {};

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;

    const rankStart = i + 1;

    // Average points across tied ranks
    const tiedCount = j - i + 1;
    let pointSum = 0;
    for (let k = 0; k < tiedCount; k++) {
      pointSum += totalTeams - (i + k + 1) + 1;
    }
    const avgPoints = pointSum / tiedCount;

    for (let k = i; k <= j; k++) {
      pointsByTeam[sorted[k].teamCode] = avgPoints;
      rankByTeam[sorted[k].teamCode] = rankStart;
    }

    i = j + 1;
  }

  return { pointsByTeam, rankByTeam };
}

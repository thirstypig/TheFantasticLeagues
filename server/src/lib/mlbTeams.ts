// server/src/lib/mlbTeams.ts
// MLB team abbreviation → league mapping for stats_source filtering

import { prisma } from "../db/prisma.js";
import { getLeagueRules } from "./leagueRuleCache.js";

const NL_TEAMS = new Set([
  "ARI", "AZ", "ATL", "CHC", "CIN", "COL", "LAD", "MIA", "MIL",
  "NYM", "PHI", "PIT", "SD", "SF", "STL", "WSH",
]);

const AL_TEAMS = new Set([
  "BAL", "BOS", "CLE", "DET", "HOU", "KC", "LAA", "MIN",
  "NYY", "ATH", "OAK", "SEA", "TB", "TEX", "TOR", "CWS",
]);

export type MlbLeague = "NL" | "AL";

/**
 * MLB team id → league, as statsapi reports it (`/teams?sportId=1`, league 104 = NL,
 * 103 = AL; verified 2026-11-11). byDateRange splits carry the team id but no league,
 * so scoring needs this table to tell an NL line from an AL one.
 */
const LEAGUE_BY_MLB_TEAM_ID: Record<number, MlbLeague> = {
  109: "NL", 112: "NL", 113: "NL", 115: "NL", 119: "NL", 120: "NL", 121: "NL", 134: "NL",
  135: "NL", 137: "NL", 138: "NL", 143: "NL", 144: "NL", 146: "NL", 158: "NL",
  108: "AL", 110: "AL", 111: "AL", 114: "AL", 116: "AL", 117: "AL", 118: "AL", 133: "AL",
  136: "AL", 139: "AL", 140: "AL", 141: "AL", 142: "AL", 145: "AL", 147: "AL",
};

/** The league of an MLB team id, or null when the id is unknown. */
export function mlbLeagueOfTeamId(teamId: number | null | undefined): MlbLeague | null {
  return teamId == null ? null : LEAGUE_BY_MLB_TEAM_ID[teamId] ?? null;
}

/**
 * Which MLB league's stats count for a fantasy league: "NL" for an NL-only league,
 * "AL" for AL-only, null when everything counts. Reads the league's
 * `overview.stats_source` rule (the Rules screen's "NL players only"), the same
 * setting that already scopes the player pool. A missing rule counts everything.
 * Stats a player earns on a team in the other league do not count (OnRoto's rule,
 * adopted for OGBA 2026-11-11).
 *
 * Not `League.rules.leagueType`: `rules` is the LeagueRule relation, and the
 * create-league form's `leagueType` is never stored.
 */
export async function getLeagueScoringLeague(leagueId: number): Promise<MlbLeague | null> {
  const source = await getLeagueStatsSource(leagueId);
  return source === "NL" || source === "AL" ? source : null;
}

/** Returns the set of team abbreviations for a stats_source, or null if no filtering needed. */
export function getTeamsForSource(source: string): Set<string> | null {
  if (source === "NL") return NL_TEAMS;
  if (source === "AL") return AL_TEAMS;
  return null; // MLB or Other — no filter
}

/** Looks up the league's stats_source rule, defaults to "ALL". */
export async function getLeagueStatsSource(leagueId: number): Promise<string> {
  const rules = await getLeagueRules(prisma, leagueId);
  return rules.overview?.stats_source ?? "ALL";
}

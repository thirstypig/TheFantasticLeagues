// server/src/lib/mlbTeams.ts
// MLB team abbreviation → league mapping for stats_source filtering

import { prisma } from "../db/prisma.js";

const NL_TEAMS = new Set([
  "ARI", "AZ", "ATL", "CHC", "CIN", "COL", "LAD", "MIA", "MIL",
  "NYM", "PHI", "PIT", "SD", "SF", "STL", "WSH",
]);

const AL_TEAMS = new Set([
  "BAL", "BOS", "CLE", "DET", "HOU", "KC", "LAA", "MIN",
  "NYY", "ATH", "OAK", "SEA", "TB", "TEX", "TOR", "CWS",
]);

/** Returns the set of team abbreviations for a stats_source, or null if no filtering needed. */
export function getTeamsForSource(source: string): Set<string> | null {
  if (source === "NL") return NL_TEAMS;
  if (source === "AL") return AL_TEAMS;
  return null; // MLB or Other — no filter
}

/** Looks up the league's stats_source rule, defaults to "ALL". */
export async function getLeagueStatsSource(leagueId: number): Promise<string> {
  const rule = await prisma.leagueRule.findFirst({
    where: { leagueId, key: "stats_source" },
    select: { value: true },
  });
  return rule?.value ?? "ALL";
}

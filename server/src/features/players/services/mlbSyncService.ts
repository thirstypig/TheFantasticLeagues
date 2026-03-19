import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { chunk } from "../../../lib/utils.js";
import { TWO_WAY_PLAYERS } from "../../../lib/sportConfig.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  league?: { id: number; name: string };
  division?: { id: number; name: string };
}

interface MlbRosterPerson {
  person: { id: number; fullName: string };
  position: { abbreviation: string; type: string };
  jerseyNumber?: string;
}

/**
 * Resolve position for a player. Two-way players (e.g. Ohtani) get their
 * hitter position from TWO_WAY_PLAYERS instead of the MLB API's "TWP".
 */
function resolvePosition(mlbId: number, posAbbr: string): string {
  const twoWay = TWO_WAY_PLAYERS.get(mlbId);
  if (twoWay && (posAbbr === "TWP" || posAbbr === "Y")) {
    return twoWay.hitterPos;
  }
  return posAbbr;
}

/**
 * Fetch all NL teams from MLB Stats API.
 */
export async function fetchNLTeams(season: number): Promise<MlbTeam[]> {
  const url = `${MLB_BASE}/teams?sportId=1&season=${season}`;
  const data = await mlbGetJson(url);
  const teams: MlbTeam[] = data.teams || [];

  // NL league ID is 104
  return teams.filter(
    (t) => t.league?.id === 104 || t.league?.name === "National League"
  );
}

/**
 * Fetch a single team's 40-man roster from MLB Stats API.
 */
async function fetchTeamRoster(
  teamId: number,
  season: number
): Promise<MlbRosterPerson[]> {
  const url = `${MLB_BASE}/teams/${teamId}/roster?rosterType=40Man&season=${season}`;
  const data = await mlbGetJson(url);
  return data.roster || [];
}

/**
 * Sync all NL rosters into the Player table.
 * Upserts by mlbId — creates new players, updates existing ones.
 */
export async function syncNLPlayers(season: number): Promise<{
  created: number;
  updated: number;
  teams: number;
}> {
  const nlTeams = await fetchNLTeams(season);
  logger.info({ count: nlTeams.length, season }, "Fetched NL teams");

  let created = 0;
  let updated = 0;

  for (const team of nlTeams) {
    const abbr = team.abbreviation;

    let roster: MlbRosterPerson[];
    try {
      roster = await fetchTeamRoster(team.id, season);
    } catch (err) {
      logger.error(
        { teamId: team.id, team: abbr, error: String(err) },
        "Failed to fetch roster"
      );
      continue;
    }

    logger.info(
      { team: abbr, playerCount: roster.length },
      "Processing team roster"
    );

    for (const entry of roster) {
      const mlbId = entry.person.id;
      const name = entry.person.fullName;
      const rawPos = entry.position.abbreviation || "UT";
      const posAbbr = resolvePosition(mlbId, rawPos);

      const existing = await prisma.player.findFirst({
        where: { mlbId },
      });

      if (existing) {
        await prisma.player.update({
          where: { id: existing.id },
          data: {
            name,
            mlbTeam: abbr,
            posPrimary: posAbbr,
          },
        });
        updated++;
      } else {
        await prisma.player.create({
          data: {
            mlbId,
            name,
            mlbTeam: abbr,
            posPrimary: posAbbr,
            posList: posAbbr,
          },
        });
        created++;
      }
    }

    // Small delay between teams to be polite to MLB API
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info(
    { created, updated, teams: nlTeams.length },
    "NL player sync complete"
  );

  return { created, updated, teams: nlTeams.length };
}

/**
 * Fetch all MLB teams from MLB Stats API (all 30 teams).
 */
export async function fetchAllTeams(season: number): Promise<MlbTeam[]> {
  const url = `${MLB_BASE}/teams?sportId=1&season=${season}`;
  const data = await mlbGetJson(url);
  return data.teams || [];
}

/**
 * Sync all 30 MLB team rosters into the Player table.
 * Upserts by mlbId — creates new players, updates existing ones.
 * Detects team changes and returns them.
 */
export async function syncAllPlayers(season: number): Promise<{
  created: number;
  updated: number;
  teams: number;
  teamChanges: Array<{ playerId: number; name: string; from: string; to: string }>;
}> {
  const allTeams = await fetchAllTeams(season);
  logger.info({ count: allTeams.length, season }, "Fetched all MLB teams");

  let created = 0;
  let updated = 0;
  const teamChanges: Array<{ playerId: number; name: string; from: string; to: string }> = [];

  for (const team of allTeams) {
    const abbr = team.abbreviation;

    let roster: MlbRosterPerson[];
    try {
      roster = await fetchTeamRoster(team.id, season);
    } catch (err) {
      logger.error(
        { teamId: team.id, team: abbr, error: String(err) },
        "Failed to fetch roster"
      );
      continue;
    }

    logger.info(
      { team: abbr, playerCount: roster.length },
      "Processing team roster"
    );

    for (const entry of roster) {
      const mlbId = entry.person.id;
      const name = entry.person.fullName;
      const rawPos = entry.position.abbreviation || "UT";
      const posAbbr = resolvePosition(mlbId, rawPos);

      const existing = await prisma.player.findFirst({
        where: { mlbId },
      });

      if (existing) {
        // Detect team change
        if (existing.mlbTeam && existing.mlbTeam !== abbr) {
          teamChanges.push({
            playerId: existing.id,
            name,
            from: existing.mlbTeam,
            to: abbr,
          });
          logger.info(
            { playerId: existing.id, name, from: existing.mlbTeam, to: abbr },
            "Player team change detected"
          );
        }

        await prisma.player.update({
          where: { id: existing.id },
          data: {
            name,
            mlbTeam: abbr,
            posPrimary: posAbbr,
          },
        });
        updated++;
      } else {
        await prisma.player.create({
          data: {
            mlbId,
            name,
            mlbTeam: abbr,
            posPrimary: posAbbr,
            posList: posAbbr,
          },
        });
        created++;
      }
    }

    // Small delay between teams to be polite to MLB API
    await new Promise((r) => setTimeout(r, 200));
  }

  if (teamChanges.length > 0) {
    logger.info(
      { count: teamChanges.length, changes: teamChanges.slice(0, 10) },
      "Team changes detected during sync"
    );
  }

  logger.info(
    { created, updated, teams: allTeams.length, teamChanges: teamChanges.length },
    "All-team player sync complete"
  );

  return { created, updated, teams: allTeams.length, teamChanges };
}

/**
 * Fetch season stats for a batch of player IDs using the MLB people endpoint.
 * Returns raw player data with hydrated stats.
 */
export async function fetchPlayerStats(
  mlbIds: number[],
  season: number
): Promise<any[]> {
  const batches = chunk(mlbIds.map(String), 50);
  const allPlayers: any[] = [];

  for (const batch of batches) {
    const url = `${MLB_BASE}/people?personIds=${batch.join(",")}&hydrate=currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`;
    const data = await mlbGetJson(url);
    allPlayers.push(...(data.people || []));
    await new Promise((r) => setTimeout(r, 100));
  }

  return allPlayers;
}

import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { chunk } from "../../../lib/utils.js";
import { TWO_WAY_PLAYERS, POSITION_OVERRIDES } from "../../../lib/sportConfig.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

interface MlbTeam {
  id: number;
  name: string;
  abbreviation: string;
  league?: { id: number; name: string };
  division?: { id: number; name: string };
  parentOrgId?: number;
}

interface MlbRosterPerson {
  person: { id: number; fullName: string };
  position: { abbreviation: string; type: string };
  jerseyNumber?: string;
}

/**
 * Resolve position for a player. Two-way players (e.g. Ohtani) get their
 * hitter position from TWO_WAY_PLAYERS or POSITION_OVERRIDES instead of
 * the MLB API's "TWP".
 */
function resolvePosition(mlbId: number, posAbbr: string): string {
  const twoWay = TWO_WAY_PLAYERS.get(mlbId);
  if (twoWay && (posAbbr === "TWP" || posAbbr === "Y")) {
    return twoWay.hitterPos;
  }
  // Check position overrides (e.g., Ohtani hitter → DH)
  const override = POSITION_OVERRIDES.get(mlbId);
  if (override && (posAbbr === "TWP" || posAbbr === "Y")) {
    return override;
  }
  return posAbbr;
}

/** MLB person from the people?personIds= endpoint */
interface MlbPerson {
  id: number;
  fullName: string;
  primaryPosition?: { abbreviation: string; type: string };
  currentTeam?: { id: number; abbreviation?: string };
  stats?: Array<{
    group?: { displayName: string };
    type?: { displayName: string };
    splits?: Array<{
      stat: Record<string, number | string>;
      team?: { abbreviation?: string };
      position?: { abbreviation?: string };
    }>;
  }>;
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
 * Pre-load all existing players into a lookup map by mlbId.
 * Eliminates N+1 queries during roster sync.
 */
async function buildPlayerLookup(): Promise<Map<number, { id: number; mlbTeam: string | null; posPrimary: string | null; posList: string | null }>> {
  const players = await prisma.player.findMany({
    where: { mlbId: { not: null } },
    select: { id: true, mlbId: true, mlbTeam: true, posPrimary: true, posList: true },
  });
  const map = new Map<number, { id: number; mlbTeam: string | null; posPrimary: string | null; posList: string | null }>();
  for (const p of players) {
    if (p.mlbId) map.set(p.mlbId, { id: p.id, mlbTeam: p.mlbTeam, posPrimary: p.posPrimary, posList: p.posList });
  }
  return map;
}

/**
 * Build posList for a player, adding P for two-way players.
 */
function buildPosList(mlbId: number, posAbbr: string): string {
  const twoWay = TWO_WAY_PLAYERS.get(mlbId);
  return twoWay ? `${posAbbr},P` : posAbbr;
}

/**
 * Guard: only overwrite posList if it hasn't been enriched by syncPositionEligibility.
 * Returns true if posList should be updated (it's empty, matches old primary, or matches new position).
 */
function shouldOverwritePosList(
  existing: { posList: string | null; posPrimary: string | null },
  newPos: string,
): boolean {
  const current = existing.posList || "";
  return !current || current === existing.posPrimary || current === newPos;
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

  const playerLookup = await buildPlayerLookup();
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
      const posList = buildPosList(mlbId, posAbbr);

      const existing = playerLookup.get(mlbId);

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

        // Preserve enriched posList from syncPositionEligibility
        await prisma.player.update({
          where: { id: existing.id },
          data: { name, mlbTeam: abbr, posPrimary: posAbbr, ...(shouldOverwritePosList(existing, posAbbr) ? { posList } : {}) },
        });
        existing.mlbTeam = abbr; // Update lookup for subsequent teams
        updated++;
      } else {
        const created_ = await prisma.player.create({
          data: { mlbId, name, mlbTeam: abbr, posPrimary: posAbbr, posList },
        });
        playerLookup.set(mlbId, { id: created_.id, mlbTeam: abbr, posPrimary: posAbbr, posList });
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
 * Batch-fetch player data from the MLB people endpoint with a configurable hydrate param.
 * Chunks mlbIds into batches of 50 with 100ms delay between requests.
 *
 * Optional `ttlSeconds` overrides the cache TTL at `mlbGetJson` — useful for
 * immutable data like prior-season stats which can safely cache for days.
 */
async function fetchPlayerBatch(
  mlbIds: number[],
  hydrateParam: string,
  ttlSeconds?: number
): Promise<MlbPerson[]> {
  const batches = chunk(mlbIds.map(String), 50);
  const allPlayers: MlbPerson[] = [];

  for (const batch of batches) {
    const url = `${MLB_BASE}/people?personIds=${batch.join(",")}&hydrate=${hydrateParam}`;
    const data = await mlbGetJson<{ people?: MlbPerson[] }>(url, ttlSeconds);
    allPlayers.push(...(data.people || []));
    await new Promise((r) => setTimeout(r, 100));
  }

  return allPlayers;
}

/**
 * Fetch season stats for a batch of player IDs.
 * Returns raw player data with hydrated hitting/pitching stats.
 */
export async function fetchPlayerStats(
  mlbIds: number[],
  season: number,
  ttlSeconds?: number
): Promise<MlbPerson[]> {
  return fetchPlayerBatch(
    mlbIds,
    `currentTeam,stats(group=[hitting,pitching],type=[season],season=${season})`,
    ttlSeconds,
  );
}

/**
 * Fetch fielding stats for a batch of player IDs.
 * Returns raw player data with hydrated fielding stats.
 */
export async function fetchPlayerFieldingStats(
  mlbIds: number[],
  season: number,
  ttlSeconds?: number
): Promise<MlbPerson[]> {
  return fetchPlayerBatch(
    mlbIds,
    `stats(group=[fielding],type=[season],season=${season})`,
    ttlSeconds,
  );
}

/**
 * Normalize position abbreviation: SP/RP → P for roster slot consistency.
 */
function normalizePos(pos: string): string {
  const p = pos.trim().toUpperCase();
  if (p === "SP" || p === "RP") return "P";
  return p;
}

/**
 * Extract games-per-position from MLB API fielding stats response for one player.
 * Aggregates across teams (traded players have separate splits per team).
 */
function extractFieldingPositions(player: MlbPerson): Map<string, number> {
  const posMap = new Map<string, number>();

  const statsGroups = player.stats ?? [];
  for (const group of statsGroups) {
    if (group.group?.displayName !== "fielding") continue;
    for (const split of group.splits ?? []) {
      const pos: string | undefined = split.position?.abbreviation;
      const games = Number(split.stat?.games ?? split.stat?.gamesPlayed ?? 0);
      if (pos && games > 0) {
        posMap.set(pos, (posMap.get(pos) ?? 0) + games);
      }
    }
  }

  return posMap;
}

/**
 * OGBA Rule 2 threshold: a player qualifies at a position if they played at
 * least this many games there in the prior season. Additive with Rule 1
 * (current-season ≥ gpThreshold) and Rule 3 (rookies → primary only).
 *
 * Not parameterized per-league (YAGNI) — if a second league adopts a
 * different threshold, promote to LeagueRule at that point.
 */
const PRIOR_YEAR_GP_THRESHOLD = 20;

/**
 * Sync position eligibility for all players in the database.
 * Fetches fielding stats from MLB API for the current season and prior
 * season, and updates Player.posList based on a games-played threshold.
 *
 * Rules applied, additively:
 *   1. Current season ≥ gpThreshold games at a position → eligible.
 *   2. Prior season ≥ PRIOR_YEAR_GP_THRESHOLD games at a position → eligible.
 *      Skipped for two-way players to prevent prior-year hitter positions
 *      bleeding into a pitcher row (and vice versa).
 *   3. Rookies / minors (no fielding data either season) → primary position
 *      only, via the eligible set's primary-always-included floor.
 *
 * Prior-season fetch is fail-closed: if it throws, the fallback is skipped
 * for this tick, the existing posList is preserved, and the next cron tick
 * self-heals. Prior-season data uses a 30-day cache TTL since it's
 * immutable after the season closes.
 *
 * @param season - MLB season year
 * @param gpThreshold - Minimum games played in current season to qualify (default 20)
 * @returns Summary of updates
 */
export async function syncPositionEligibility(
  season: number,
  gpThreshold: number = 20
): Promise<{
  updated: number;
  unchanged: number;
  total: number;
  errors: number;
}> {
  // Fetch all players with MLB IDs
  const players = await prisma.player.findMany({
    where: { mlbId: { not: null } },
    select: { id: true, mlbId: true, posPrimary: true, posList: true },
  });

  logger.info(
    { total: players.length, season, gpThreshold },
    "Starting position eligibility sync"
  );

  const mlbIds = players
    .map((p) => p.mlbId!)
    .filter((id) => id > 0);

  // Batch fetch current-season fielding stats from MLB API
  const mlbPlayers = await fetchPlayerFieldingStats(mlbIds, season);

  // Build lookup: mlbId → fielding positions map
  const fieldingByMlbId = new Map<number, Map<string, number>>();
  for (const mp of mlbPlayers) {
    fieldingByMlbId.set(mp.id, extractFieldingPositions(mp));
  }

  // Rule 2: fetch prior-season fielding for the 20-GP fallback.
  // Defense in depth: filter out derived IDs (≥ 1M, e.g. Ohtani's synthetic
  // pitcher row 1660271) which the MLB API doesn't recognize — see
  // docs/solutions/logic-errors/ohtani-derived-id-api-resolution.md.
  // Fail-closed on error: undefined map → fallback is skipped this tick.
  let priorFieldingByMlbId: Map<number, Map<string, number>> | undefined;
  try {
    const priorMlbIds = mlbIds.filter((id) => id < 1_000_000);
    const priorMlbPlayers = await fetchPlayerFieldingStats(
      priorMlbIds,
      season - 1,
      30 * 86400, // 30-day TTL — prior-season fielding is immutable once year closes
    );
    priorFieldingByMlbId = new Map();
    for (const mp of priorMlbPlayers) {
      priorFieldingByMlbId.set(mp.id, extractFieldingPositions(mp));
    }
  } catch (err) {
    logger.warn(
      { error: String(err), season: season - 1 },
      "Prior-season fielding fetch failed; Rule 2 fallback skipped this tick",
    );
    priorFieldingByMlbId = undefined;
  }

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const player of players) {
    try {
      // Narrow mlbId once at top of loop — removes four ! assertions below.
      const { mlbId } = player;
      if (mlbId == null) { unchanged++; continue; }

      const fielding = fieldingByMlbId.get(mlbId);
      const priorFielding = priorFieldingByMlbId?.get(mlbId);
      const isTwoWay = TWO_WAY_PLAYERS.has(mlbId);

      // Skip players with no fielding data in either season (unless two-way).
      // Rule 2 widens this check from current-only to current-or-prior so a
      // player with only prior-year data still gets the fallback merge.
      const hasCurrent = fielding && fielding.size > 0;
      const hasPrior = priorFielding && priorFielding.size > 0;
      if (!hasCurrent && !hasPrior && !isTwoWay) {
        unchanged++;
        continue;
      }

      // Build eligible positions: primary position always included,
      // plus any position with GP >= threshold
      const eligible = new Set<string>();
      eligible.add(normalizePos(player.posPrimary));

      if (fielding) {
        for (const [pos, games] of fielding) {
          if (games >= gpThreshold) {
            eligible.add(normalizePos(pos));
          }
        }
      }

      // Rule 2: merge prior-year positions at ≥ PRIOR_YEAR_GP_THRESHOLD,
      // additively alongside current season. Set union is idempotent so a
      // position already added from Rule 1 stays added.
      //
      // Guarded behind !isTwoWay: for Ohtani-style players, current fielding
      // is pitcher-group-only (line 353 group filter), so without this guard
      // a prior-year hitter position like OF would merge into the pitcher
      // row. See docs/solutions/logic-errors/ohtani-two-way-player-split-architecture.md.
      if (!isTwoWay && priorFielding) {
        for (const [pos, games] of priorFielding) {
          if (games >= PRIOR_YEAR_GP_THRESHOLD) {
            eligible.add(normalizePos(pos));
          }
        }
      }

      // Two-way players always qualify for P (pitching stats aren't in fielding group)
      if (isTwoWay) {
        eligible.add("P");
      }

      // Sort: primary first, then alphabetically
      const primary = normalizePos(player.posPrimary);
      const sorted = [primary, ...[...eligible].filter((p) => p !== primary).sort()];
      const newPosList = sorted.join(",");

      if (newPosList === player.posList) {
        unchanged++;
        continue;
      }

      await prisma.player.update({
        where: { id: player.id },
        data: { posList: newPosList },
      });

      if (newPosList !== player.posPrimary) {
        logger.debug(
          { playerId: player.id, mlbId, old: player.posList, new: newPosList },
          "Position eligibility updated"
        );
      }

      updated++;
    } catch (err) {
      logger.error(
        { playerId: player.id, mlbId: player.mlbId, error: String(err) },
        "Failed to update position eligibility"
      );
      errors++;
    }
  }

  logger.info(
    { updated, unchanged, total: players.length, errors, season, gpThreshold },
    "Position eligibility sync complete"
  );

  return { updated, unchanged, total: players.length, errors };
}

/**
 * Fetch all Triple-A teams from MLB Stats API.
 * Each AAA team has a parentOrgId linking it to its MLB parent.
 */
export async function fetchAAATeams(season: number): Promise<MlbTeam[]> {
  const url = `${MLB_BASE}/teams?sportId=11&season=${season}`;
  const data = await mlbGetJson(url);
  return data.teams || [];
}

/**
 * Sync AAA (Triple-A) rosters into the Player table.
 * Creates new players for minor leaguers not already in the DB.
 * Tags each player with their MLB parent org abbreviation.
 *
 * @param season - MLB season year
 * @returns Summary of sync results
 */
export async function syncAAARosters(season: number): Promise<{
  created: number;
  updated: number;
  skipped: number;
  aaaTeams: number;
}> {
  // Step 1: Fetch all MLB teams to build ID → abbreviation map
  const mlbTeams = await fetchAllTeams(season);
  const mlbAbbrById = new Map<number, string>();
  for (const t of mlbTeams) {
    mlbAbbrById.set(t.id, t.abbreviation);
  }

  // Step 2: Fetch all AAA teams
  const aaaTeams = await fetchAAATeams(season);
  logger.info({ count: aaaTeams.length, season }, "Fetched AAA teams");

  const playerLookup = await buildPlayerLookup();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const team of aaaTeams) {
    // Map AAA team to MLB parent org abbreviation
    const parentAbbr = team.parentOrgId
      ? mlbAbbrById.get(team.parentOrgId) ?? "FA"
      : "FA";

    let roster: MlbRosterPerson[];
    try {
      const url = `${MLB_BASE}/teams/${team.id}/roster?rosterType=fullRoster&season=${season}`;
      const data = await mlbGetJson(url);
      roster = data.roster || [];
    } catch (err) {
      logger.error(
        { teamId: team.id, team: team.name, error: String(err) },
        "Failed to fetch AAA roster"
      );
      continue;
    }

    logger.info(
      { team: team.name, parentOrg: parentAbbr, playerCount: roster.length },
      "Processing AAA roster"
    );

    for (const entry of roster) {
      const mlbId = entry.person.id;
      const name = entry.person.fullName;
      const rawPos = entry.position.abbreviation || "UT";
      const posAbbr = resolvePosition(mlbId, rawPos);

      const existing = playerLookup.get(mlbId);

      if (existing) {
        // Only update if the player doesn't already have an MLB team set
        // (don't overwrite 40-man roster data with AAA data)
        if (!existing.mlbTeam || existing.mlbTeam === "FA") {
          await prisma.player.update({
            where: { id: existing.id },
            data: { name, mlbTeam: parentAbbr },  // Don't overwrite posPrimary — may have enriched position from 40-man
          });
          existing.mlbTeam = parentAbbr;
          updated++;
        } else {
          skipped++;
        }
      } else {
        const created_ = await prisma.player.create({
          data: { mlbId, name, mlbTeam: parentAbbr, posPrimary: posAbbr, posList: posAbbr },
        });
        playerLookup.set(mlbId, { id: created_.id, mlbTeam: parentAbbr, posPrimary: posAbbr, posList: posAbbr });
        created++;
      }
    }

    // Rate limit: delay between teams
    await new Promise((r) => setTimeout(r, 200));
  }

  logger.info(
    { created, updated, skipped, aaaTeams: aaaTeams.length, season },
    "AAA roster sync complete"
  );

  return { created, updated, skipped, aaaTeams: aaaTeams.length };
}

/**
 * Enrich stale players — those with null/empty mlbTeam or posPrimary.
 * Uses the MLB people?personIds= batch endpoint to fill in current team and position.
 * Preserves enriched posList from syncPositionEligibility (same guard as syncAllPlayers).
 */
// MlbPerson merged into MlbPerson (lines 42-57) — same interface, MlbPerson is the superset

export async function enrichStalePlayers(_season: number): Promise<{
  enriched: number;
  notFound: number;
  skipped: number;
  errors: number;
}> {
  const stalePlayers = await prisma.player.findMany({
    where: {
      mlbId: { not: null },
      OR: [
        { mlbTeam: null },
        { mlbTeam: "" },
        { posPrimary: "" },
      ],
    },
    select: { id: true, mlbId: true, name: true, mlbTeam: true, posPrimary: true, posList: true },
  });

  if (stalePlayers.length === 0) {
    logger.info({}, "No stale players to enrich");
    return { enriched: 0, notFound: 0, skipped: 0, errors: 0 };
  }

  logger.info({ count: stalePlayers.length }, "Enriching stale players");

  // Batch lookup via MLB people endpoint
  const mlbIds = stalePlayers.filter(p => p.mlbId).map(p => p.mlbId!);
  const batches = chunk(mlbIds.map(String), 50);
  const mlbDataMap = new Map<number, MlbPerson>();

  for (const batch of batches) {
    try {
      const url = `${MLB_BASE}/people?personIds=${batch.join(",")}&hydrate=currentTeam`;
      const data = await mlbGetJson<{ people?: MlbPerson[] }>(url, 86400);
      for (const p of data.people || []) {
        mlbDataMap.set(p.id, p);
      }
    } catch (err) {
      logger.warn({ error: String(err), batchSize: batch.length }, "Batch enrichment fetch failed");
    }
    await new Promise(r => setTimeout(r, 200));
  }

  let enriched = 0, notFound = 0, skipped = 0, errors = 0;

  for (const player of stalePlayers) {
    const info = mlbDataMap.get(player.mlbId!);
    if (!info) { notFound++; continue; }

    const rawPos = info.primaryPosition?.abbreviation ?? "";
    const posAbbr = resolvePosition(player.mlbId!, rawPos);
    const teamAbbr = info.currentTeam?.abbreviation ?? "FA";

    // Check if there's actually something to update
    const needsTeam = !player.mlbTeam || player.mlbTeam === "" || player.mlbTeam === "FA";
    const needsPos = !player.posPrimary || player.posPrimary === "";
    if (!needsTeam && !needsPos) { skipped++; continue; }

    try {
      const updates: Record<string, string> = {};
      if (needsTeam && teamAbbr) updates.mlbTeam = teamAbbr;
      if (needsPos && posAbbr) {
        updates.posPrimary = posAbbr;
        if (shouldOverwritePosList(player, posAbbr)) {
          updates.posList = buildPosList(player.mlbId!, posAbbr);
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.player.update({ where: { id: player.id }, data: updates });
        logger.info({ playerId: player.id, name: player.name, updates }, "Enriched stale player");
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.warn({ error: String(err), playerId: player.id, name: player.name }, "Failed to enrich player");
      errors++;
    }
  }

  logger.info({ enriched, notFound, skipped, errors }, "Stale player enrichment complete");
  return { enriched, notFound, skipped, errors };
}

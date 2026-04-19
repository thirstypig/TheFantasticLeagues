// server/src/features/players/routes.ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { prisma } from "../../db/prisma.js";
import { getLeagueStatsSource, getTeamsForSource } from "../../lib/mlbTeams.js";
import { mlbGetJson } from "../../lib/mlbApi.js";
import { logger } from "../../lib/logger.js";
import { OHTANI_MLB_ID, OHTANI_PITCHER_MLB_ID } from "../../lib/sportConfig.js";
import { DataService } from "./services/dataService.js";
import {
  getLastSeasonStats,
  getCurrentSeasonStats,
  loadPlayerValues,
  normalizeName,
  expandTwoWayPlayers,
  splitTwoWayStats,
  isFillerPlayer,
  type SeasonStatEntry,
  type PlayerValueEntry,
} from "./services/statsService.js";

const router = Router();

/**
 * GET /players
 * Optional query params:
 *   - availability: "all" | "available" | "owned"
 *   - type: "all" | "hitters" | "pitchers"
 *   - leagueId: number (required for availability filtering)
 */
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const availability = String(req.query.availability ?? "all") as
    | "all"
    | "available"
    | "owned";
  const type = String(req.query.type ?? "all") as
    | "all"
    | "hitters"
    | "pitchers";
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;

  // Get real players from DB (exclude filler/test players at query level)
  const allPlayers = await prisma.player.findMany({
    where: {
      OR: [
        { mlbId: null },
        { mlbId: { lt: 900000 } },
      ],
      NOT: { name: { startsWith: "Filler Hitter" } },
    },
    select: {
      id: true, mlbId: true, name: true,
      posPrimary: true, posList: true, mlbTeam: true,
    },
  });

  // Get active rosters for the league (for availability + team assignment)
  const rosters = leagueId
    ? await prisma.roster.findMany({
        where: { team: { leagueId }, releasedAt: null },
        include: { team: true },
      })
    : [];

  const rosteredPlayerIds = new Set(rosters.map((r) => r.playerId));
  const rosterMap = new Map<number, { teamCode: string; teamName: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      teamName: r.team.name,
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = leagueId
    ? getTeamsForSource(await getLeagueStatsSource(leagueId))
    : null;

  let players = allPlayers
    .filter((p) => {
      if (isFillerPlayer(p)) return false;
      if (!allowedTeams) return true;
      const team = p.mlbTeam ?? "";
      return !team || team === "FA" || allowedTeams.has(team) || rosterMap.has(p.id);
    })
    .map((p) => {
      const roster = rosterMap.get(p.id);
      const isPitcher = (p.posPrimary ?? "").toUpperCase() === "P";
      return {
        _dbId: p.id,
        mlb_id: String(p.mlbId ?? p.id),
        player_name: p.name,
        ogba_team_code: roster?.teamCode ?? "",
        ogba_team_name: roster?.teamName ?? "",
        positions: p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        mlb_team: p.mlbTeam ?? "",
        mlbTeam: p.mlbTeam ?? "",
        fantasy_value: roster?.price,
      };
    });

  // Expand two-way players (e.g. Ohtani → DH hitter row + P pitcher row)
  players = expandTwoWayPlayers(players);

  // availability filter
  if (availability === "available") {
    players = players.filter((p) => !p.ogba_team_code);
  } else if (availability === "owned") {
    players = players.filter((p) => !!p.ogba_team_code);
  }

  // hitter/pitcher filter
  if (type === "hitters") {
    players = players.filter((p) => !p.is_pitcher);
  } else if (type === "pitchers") {
    players = players.filter((p) => p.is_pitcher);
  }

  res.json({ players });
}));

/**
 * GET /players/news/transactions
 * Returns recent MLB-wide transactions (last 7 days).
 * Filtered to MLB-level only. Cached for 15 minutes.
 * NOTE: Must be defined before /:mlbId to avoid param capture.
 */
router.get("/news/transactions", requireAuth, asyncHandler(async (_req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const startDate = sevenDaysAgo.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${startDate}&endDate=${endDate}`;
    const data = await mlbGetJson(url, 900); // 15 min cache

    const transactions = (data?.transactions ?? [])
      .filter((t: any) => {
        // Filter to MLB-level transactions only (exclude minor league)
        const player = t.player;
        if (!player) return false;
        // If the transaction involves a to/from team at the major league level
        const toLeague = t.toTeam?.league?.id;
        const fromLeague = t.fromTeam?.league?.id;
        // MLB American League = 103, National League = 104
        return toLeague === 103 || toLeague === 104 || fromLeague === 103 || fromLeague === 104;
      })
      .map((t: any) => ({
        date: t.date ?? null,
        typeDesc: t.typeDesc ?? t.typeCode ?? "",
        description: t.description ?? "",
        playerName: t.player?.fullName ?? t.player?.lastName ?? "",
        playerMlbId: t.player?.id ?? null,
      }));

    res.json({ transactions });
  } catch (err) {
    logger.error({ error: String(err) }, "Failed to fetch MLB transactions");
    res.status(502).json({ error: "Unable to fetch MLB transactions" });
  }
}));

/**
 * GET /players/:mlbId
 */
router.get("/:mlbId", requireAuth, asyncHandler(async (req, res) => {
  const mlbId = Number(req.params.mlbId);
  if (!Number.isFinite(mlbId)) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }

  const player = await prisma.player.findFirst({
    where: { mlbId },
    select: {
      id: true, mlbId: true, name: true,
      posPrimary: true, posList: true, mlbTeam: true,
    },
  });

  if (!player) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json({
    player: {
      mlb_id: player.mlbId ?? String(player.id),
      player_name: player.name,
      positions: player.posList || player.posPrimary || "",
      is_pitcher: (player.posPrimary ?? "").toUpperCase() === "P",
      mlb_team: player.mlbTeam ?? "",
      mlbTeam: player.mlbTeam ?? "",
    },
  });
}));

/**
 * GET /players/:mlbId/fielding
 * Fetches fielding stats from the MLB Stats API for a specific player.
 * Returns games played at each position for the given season.
 * Query params:
 *   - season: number (defaults to current year)
 */
router.get("/:mlbId/fielding", requireAuth, asyncHandler(async (req, res) => {
  const rawMlbId = Number(req.params.mlbId);
  if (!Number.isFinite(rawMlbId) || rawMlbId <= 0) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }
  // Resolve derived Ohtani pitcher ID → real MLB ID
  const mlbId = rawMlbId === OHTANI_PITCHER_MLB_ID ? OHTANI_MLB_ID : rawMlbId;

  const season = req.query.season ? Number(req.query.season) : new Date().getFullYear();
  if (!Number.isFinite(season) || season < 2000 || season > 2100) {
    return res.status(400).json({ error: "Invalid season" });
  }

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=season&group=fielding&season=${season}`;
    const data = await mlbGetJson(url);

    const splits = data?.stats?.[0]?.splits ?? [];

    // Aggregate by position — traded players have separate rows per team
    const posMap = new Map<string, number>();
    for (const split of splits) {
      const pos = split.stat?.position?.abbreviation ?? split.position?.abbreviation;
      const games = Number(split.stat?.games ?? split.stat?.gamesPlayed ?? 0);
      if (pos && games > 0) {
        posMap.set(pos, (posMap.get(pos) ?? 0) + games);
      }
    }

    const positions = Array.from(posMap.entries())
      .map(([position, games]) => ({ position, games }))
      .sort((a, b) => b.games - a.games);

    res.json({ mlbId, season, positions });
  } catch (err) {
    logger.error({ mlbId, season, error: String(err) }, "Failed to fetch fielding stats");
    res.status(502).json({ error: "Unable to fetch fielding stats" });
  }
}));

/**
 * GET /players/:mlbId/news
 * Returns recent MLB transactions for a specific player (last 30 days).
 * Cached for 30 minutes via mlbGetJson.
 */
router.get("/:mlbId/news", requireAuth, asyncHandler(async (req, res) => {
  const rawMlbId = Number(req.params.mlbId);
  if (!Number.isFinite(rawMlbId) || rawMlbId <= 0) {
    return res.status(400).json({ error: "Invalid MLB ID" });
  }
  // Resolve derived Ohtani pitcher ID → real MLB ID
  const mlbId = rawMlbId === OHTANI_PITCHER_MLB_ID ? OHTANI_MLB_ID : rawMlbId;

  try {
    // Fetch last 2 years of transactions to ensure we find at least 3
    const now = new Date();
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const startDate = twoYearsAgo.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const url = `https://statsapi.mlb.com/api/v1/transactions?startDate=${startDate}&endDate=${endDate}&playerId=${mlbId}`;
    const data = await mlbGetJson(url, 1800); // 30 min cache

    const transactions = (data?.transactions ?? [])
      .map((t: any) => ({
        date: t.date ?? null,
        typeDesc: t.typeDesc ?? t.typeCode ?? "",
        description: t.description ?? "",
      }))
      .sort((a: any, b: any) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 3);

    res.json({ mlbId, transactions });
  } catch (err) {
    logger.error({ mlbId, error: String(err) }, "Failed to fetch player transactions");
    res.status(502).json({ error: "Unable to fetch player transactions" });
  }
}));

// --- Player data endpoints (now served from DB) ---

const dataRouter = Router();

/** GET /api/player-season-stats?leagueId=N */
dataRouter.get("/player-season-stats", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId || !Number.isFinite(leagueId) || leagueId <= 0) {
    return res.status(400).json({ error: "Missing or invalid leagueId" });
  }

  // Get real players from DB (exclude filler/test players at query level)
  const allPlayers = await prisma.player.findMany({
    where: {
      OR: [
        { mlbId: null },
        { mlbId: { lt: 900000 } },
      ],
      NOT: { name: { startsWith: "Filler Hitter" } },
    },
    select: { id: true, mlbId: true, name: true, posPrimary: true, posList: true, mlbTeam: true },
  });

  // Get active rosters for this league
  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId }, releasedAt: null },
    include: { team: true },
  });

  const rosterMap = new Map<number, { teamCode: string; teamName: string; price: number }>();
  for (const r of rosters) {
    rosterMap.set(r.playerId, {
      teamCode: r.team.code ?? r.team.name.substring(0, 3).toUpperCase(),
      teamName: r.team.name,
      price: Number(r.price),
    });
  }

  // Filter by league stats_source (NL/AL/MLB)
  const allowedTeams = getTeamsForSource(await getLeagueStatsSource(leagueId));

  // Load player values from 2026 CSV (name → dollar value + position)
  const valuesMap = loadPlayerValues();
  // Load current season (2026) stats — live MLB API data with 2-hour cache
  const lastSeasonMap = await getCurrentSeasonStats();

  const stats = allPlayers
    .filter((p) => {
      if (isFillerPlayer(p)) return false;
      if (!allowedTeams) return true;
      const team = p.mlbTeam ?? "";
      return !team || team === "FA" || allowedTeams.has(team) || rosterMap.has(p.id);
    })
    .map((p) => {
      const mlbId = String(p.mlbId ?? p.id);
      const roster = rosterMap.get(p.id);
      const isPitcher = (p.posPrimary ?? "").toUpperCase() === "P";
      const mlbTeam = p.mlbTeam ?? "";
      const nameKey = p.name.toLowerCase();
      const pv = valuesMap.get(nameKey) ?? valuesMap.get(normalizeName(p.name));
      const ss = lastSeasonMap.get(mlbId);

      return {
        id: p.id,                  // Prisma Player.id — needed for watchlist API
        mlb_id: mlbId,
        player_name: p.name,
        mlb_full_name: p.name,
        ogba_team_code: roster?.teamCode ?? "",
        ogba_team_name: roster?.teamName ?? "",
        positions: pv?.pos || p.posList || p.posPrimary || "",
        is_pitcher: isPitcher,
        G: ss?.G ?? 0,
        AB: ss?.AB ?? 0, H: ss?.H ?? 0, R: ss?.R ?? 0, HR: ss?.HR ?? 0,
        RBI: ss?.RBI ?? 0, SB: ss?.SB ?? 0, AVG: ss?.AVG ?? 0, GS_HR: ss?.GS_HR ?? 0,
        W: ss?.W ?? 0, SV: ss?.SV ?? 0, K: ss?.K ?? 0,
        IP: ss?.IP ?? 0, ER: ss?.ER ?? 0, BB_H: ss?.BB_H ?? 0, ERA: ss?.ERA ?? 0, WHIP: ss?.WHIP ?? 0, SHO: ss?.SHO ?? 0,
        mlb_team: mlbTeam,
        mlbTeam: mlbTeam,
        fantasy_value: roster?.price,
        dollar_value: pv?.value ?? 0,
        value: pv?.value ?? 0,
      };
    });

  // Expand two-way players (e.g. Ohtani → DH hitter row + P pitcher row)
  // then zero out cross-role stats (pitcher rows lose hitting, hitter rows lose pitching)
  const expandedStats = splitTwoWayStats(expandTwoWayPlayers(stats), valuesMap);

  res.json({ stats: expandedStats });
}));

/** GET /api/player-period-stats?leagueId=N — player stats for the active period */
dataRouter.get("/player-period-stats", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : null;
  if (!leagueId || !Number.isFinite(leagueId)) return res.json({ stats: [], periods: [] });

  // Find active periods for this league
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });

  if (periods.length === 0) return res.json({ stats: [], periods });

  // Get stats for the most recent active period
  const activePeriod = periods.find(p => p.status === "active") ?? periods[periods.length - 1];

  const periodStats = await prisma.playerStatsPeriod.findMany({
    where: { periodId: activePeriod.id },
    include: { player: { select: { id: true, mlbId: true, name: true, posPrimary: true, mlbTeam: true } } },
  });

  // Get rosters for the league to know which players are on which teams
  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId }, releasedAt: null },
    select: { playerId: true, team: { select: { code: true, name: true } } },
  });
  const rosterMap = new Map(rosters.map(r => [r.playerId, { teamCode: r.team.code ?? "", teamName: r.team.name }]));

  const stats = periodStats.map(ps => {
    const roster = rosterMap.get(ps.playerId);
    const isPitcher = (ps.player.posPrimary ?? "").toUpperCase() === "P";
    const AVG = ps.AB > 0 ? ps.H / ps.AB : 0;
    const ERA = ps.IP > 0 ? (ps.ER / ps.IP) * 9 : 0;
    const WHIP = ps.IP > 0 ? ps.BB_H / ps.IP : 0;

    return {
      mlb_id: String(ps.player.mlbId ?? ps.playerId),
      player_name: ps.player.name,
      ogba_team_code: roster?.teamCode ?? "",
      ogba_team_name: roster?.teamName ?? "",
      positions: ps.player.posPrimary ?? "",
      is_pitcher: isPitcher,
      AB: ps.AB, H: ps.H, R: ps.R, HR: ps.HR, RBI: ps.RBI, SB: ps.SB, AVG, GS_HR: ps.GS_HR, G: ps.G,
      W: ps.W, SV: ps.SV, K: ps.K, IP: ps.IP, ERA, WHIP, SHO: ps.SHO,
      mlb_team: ps.player.mlbTeam ?? "",
      periodId: activePeriod.id,
      periodName: activePeriod.name,
    };
  });

  res.json({ stats, periods, activePeriodId: activePeriod.id });
}));

/** GET /api/auction-values?leagueId=N */
dataRouter.get("/auction-values", requireAuth, (_req, res) => {
  const ds = DataService.getInstance();
  const values = ds.getAuctionValues();
  res.json({ values });
});

export const playersRouter = router;
export const playerDataRouter = dataRouter;
export default playersRouter;

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../lib/mlbApi.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// ─── Types ───

interface GameScore {
  gamePk: number;
  status: string;
  detailedState: string;
  startTime: string;
  away: { id: number; name: string; abbr: string; score: number; wins: number; losses: number };
  home: { id: number; name: string; abbr: string; score: number; wins: number; losses: number };
  inning?: number;
  inningState?: string;
}

interface MlbTransaction {
  id: number;
  playerName: string;
  playerMlbId: number;
  teamName: string;
  teamAbbr: string;
  fromTeamName?: string;
  fromTeamAbbr?: string;
  type: string;
  typeCode: string;
  description: string;
  date: string;
}

interface MyPlayerToday {
  playerName: string;
  mlbId: number;
  mlbTeam: string;
  gameTime: string;
  opponent: string;
  homeAway: "home" | "away";
}

// ─── Helpers ───

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// NL/AL team sets for transaction filtering
const NL_TEAMS = new Set([
  "ARI", "AZ", "ATL", "CHC", "CIN", "COL", "LAD", "MIA", "MIL",
  "NYM", "PHI", "PIT", "SD", "SF", "STL", "WSH",
]);

const AL_TEAMS = new Set([
  "BAL", "BOS", "CLE", "DET", "HOU", "KC", "LAA", "MIN",
  "NYY", "ATH", "OAK", "SEA", "TB", "TEX", "TOR", "CWS",
]);

// ─── GET /scores ───

router.get(
  "/scores",
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || todayDateStr();
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const url = `https://statsapi.mlb.com/api/v1/schedule?date=${date}&sportId=1&hydrate=linescore`;
    const [data, teamsMap] = await Promise.all([
      mlbGetJson(url, 60),
      fetchMlbTeamsMap(),
    ]);

    const games: GameScore[] = [];
    for (const dateEntry of data.dates || []) {
      for (const g of dateEntry.games || []) {
        const away = g.teams?.away;
        const home = g.teams?.home;
        const ls = g.linescore;
        const awayId = away?.team?.id ?? 0;
        const homeId = home?.team?.id ?? 0;

        games.push({
          gamePk: g.gamePk,
          status: g.status?.abstractGameState ?? "Unknown",
          detailedState: g.status?.detailedState ?? "Unknown",
          startTime: g.gameDate ?? "",
          away: {
            id: awayId,
            name: away?.team?.name ?? "",
            abbr: teamsMap[awayId] ?? "",
            score: away?.score ?? 0,
            wins: away?.leagueRecord?.wins ?? 0,
            losses: away?.leagueRecord?.losses ?? 0,
          },
          home: {
            id: homeId,
            name: home?.team?.name ?? "",
            abbr: teamsMap[homeId] ?? "",
            score: home?.score ?? 0,
            wins: home?.leagueRecord?.wins ?? 0,
            losses: home?.leagueRecord?.losses ?? 0,
          },
          ...(ls?.currentInning != null ? { inning: ls.currentInning } : {}),
          ...(ls?.inningState ? { inningState: ls.inningState } : {}),
        });
      }
    }

    return res.json({ date, games });
  })
);

// ─── GET /transactions ───

router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || todayDateStr();
    if (!DATE_REGEX.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const filter = ((req.query.filter as string) || "ALL").toUpperCase();
    if (!["ALL", "NL", "AL"].includes(filter)) {
      return res.status(400).json({ error: "Invalid filter. Use ALL, NL, or AL." });
    }

    const url = `https://statsapi.mlb.com/api/v1/transactions?date=${date}`;
    const data = await mlbGetJson(url, 1800);

    // Build abbreviation lookup from team IDs
    const teamsMap = await fetchMlbTeamsMap();

    const filterSet = filter === "NL" ? NL_TEAMS : filter === "AL" ? AL_TEAMS : null;

    const transactions: MlbTransaction[] = [];
    for (const t of data.transactions || []) {
      const toTeamId = t.toTeam?.id;
      const fromTeamId = t.fromTeam?.id;
      const toTeamAbbr = toTeamId ? (teamsMap[toTeamId] ?? "") : "";
      const fromTeamAbbr = fromTeamId ? (teamsMap[fromTeamId] ?? "") : "";

      // Filter by league if requested
      if (filterSet) {
        const matchesTo = toTeamAbbr && filterSet.has(toTeamAbbr);
        const matchesFrom = fromTeamAbbr && filterSet.has(fromTeamAbbr);
        if (!matchesTo && !matchesFrom) continue;
      }

      // Skip transactions without a player
      if (!t.person?.id || !t.person?.fullName) continue;

      transactions.push({
        id: t.id,
        playerName: t.person.fullName,
        playerMlbId: t.person.id,
        teamName: t.toTeam?.name ?? "",
        teamAbbr: toTeamAbbr,
        ...(t.fromTeam ? { fromTeamName: t.fromTeam.name ?? "", fromTeamAbbr } : {}),
        type: t.typeDesc ?? "",
        typeCode: t.typeCode ?? "",
        description: t.description ?? "",
        date: t.date ?? date,
      });
    }

    return res.json({ date, filter, transactions });
  })
);

// ─── GET /my-players-today ───

router.get(
  "/my-players-today",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.query.leagueId);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "Invalid leagueId" });
    }

    const userId = req.user!.id;

    // Find the user's team in this league
    const team = await prisma.team.findFirst({
      where: {
        leagueId,
        OR: [
          { ownerUserId: userId },
          { ownerships: { some: { userId } } },
        ],
      },
      select: { id: true },
    });

    if (!team) {
      return res.json({ players: [] });
    }

    // Get active roster players with mlbId
    const rosterEntries = await prisma.roster.findMany({
      where: {
        teamId: team.id,
        player: { mlbId: { not: null } },
      },
      select: {
        player: {
          select: { id: true, name: true, mlbId: true, mlbTeam: true },
        },
      },
    });

    if (rosterEntries.length === 0) {
      return res.json({ players: [] });
    }

    // Get today's schedule (reuses cached data from scores endpoint)
    const today = todayDateStr();
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1&hydrate=linescore`;
    const scheduleData = await mlbGetJson(scheduleUrl, 60);

    // Build a map: team abbreviation -> game info
    const teamsMap = await fetchMlbTeamsMap();
    const teamGameMap = new Map<string, { gameTime: string; opponent: string; homeAway: "home" | "away" }>();

    for (const dateEntry of scheduleData.dates || []) {
      for (const g of dateEntry.games || []) {
        const awayTeam = g.teams?.away?.team;
        const homeTeam = g.teams?.home?.team;
        const awayAbbr = awayTeam?.abbreviation ?? (awayTeam?.id ? teamsMap[awayTeam.id] : "") ?? "";
        const homeAbbr = homeTeam?.abbreviation ?? (homeTeam?.id ? teamsMap[homeTeam.id] : "") ?? "";
        const gameTime = g.gameDate ?? "";

        if (awayAbbr) {
          teamGameMap.set(awayAbbr, { gameTime, opponent: homeAbbr, homeAway: "away" });
        }
        if (homeAbbr) {
          teamGameMap.set(homeAbbr, { gameTime, opponent: awayAbbr, homeAway: "home" });
        }
      }
    }

    // Cross-reference roster with schedule
    const players: MyPlayerToday[] = [];
    for (const entry of rosterEntries) {
      const p = entry.player;
      if (!p.mlbTeam) continue;

      const game = teamGameMap.get(p.mlbTeam);
      if (!game) continue;

      players.push({
        playerName: p.name,
        mlbId: p.mlbId!,
        mlbTeam: p.mlbTeam,
        gameTime: game.gameTime,
        opponent: game.opponent,
        homeAway: game.homeAway,
      });
    }

    // Sort by game time
    players.sort((a, b) => a.gameTime.localeCompare(b.gameTime));

    return res.json({ players });
  })
);

export const mlbFeedRouter = router;

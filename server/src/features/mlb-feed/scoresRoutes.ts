/**
 * Scores + schedule + per-player game-day routes — extracted from mlb-feed/routes.ts (#147).
 * Handles: /scores, /transactions, /roster-stats-today, /my-players-today
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../lib/mlbApi.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { POS_ORDER, isPitcher as isPitcherPos } from "../../lib/sportConfig.js";
import { mlbGameDayDate } from "../../lib/utils.js";
import {
  getPlayerTodayLine,
  deriveGameStatus,
  buildGameStateDesc,
  type GameStatus,
  type PlayerStatLine,
} from "./services/gameLogService.js";

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
  posPrimary?: string;
  gameTime: string;
  opponent: string;
  homeAway: "home" | "away";
  /** PRE / LIVE / FINAL — derived from MLB schedule for the player's team. */
  gameStatus?: GameStatus;
  /** Short human-readable game state ("TOP 5", "FINAL", "7:30 PM ET"). */
  gameStateDesc?: string;
  /** Today's actual stat line — undefined if the player did not appear (DNP)
   *  or if the game has not started yet. */
  line?: PlayerStatLine;
}

// ─── Helpers ───

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
  requireAuth,
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || mlbGameDayDate();
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
  requireAuth,
  asyncHandler(async (req, res) => {
    const date = (req.query.date as string) || mlbGameDayDate();
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

// ─── GET /roster-stats-today — Full roster with today's real-time game stats ───

router.get("/roster-stats-today", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;
  const requestedDate = typeof req.query.date === "string" ? req.query.date : "";
  const today = DATE_REGEX.test(requestedDate) ? requestedDate : mlbGameDayDate();

  // Find user's team
  const team = await prisma.team.findFirst({
    where: { leagueId, OR: [{ ownerUserId: userId }, { ownerships: { some: { userId } } }] },
    select: { id: true, name: true },
  });
  if (!team) return res.json({ date: today, teamName: "", players: [] });

  // Get active roster with player info
  const rosterEntries = await prisma.roster.findMany({
    where: { teamId: team.id, releasedAt: null },
    include: { player: { select: { id: true, name: true, mlbId: true, mlbTeam: true, posPrimary: true } } },
    orderBy: { acquiredAt: "asc" },
  });

  // Get today's schedule
  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1`;
  const scheduleData = await mlbGetJson(scheduleUrl, 120); // 2-min cache for live data

  // Build player stats from live game feeds (not schedule boxscore hydration)
  const playerStatsMap = new Map<number, { hitting?: any; pitching?: any; gameStatus: string; opponent: string; homeAway: string }>();
  const teamsMap = await fetchMlbTeamsMap();

  // Build schedule map for all games (matchups, game times)
  const teamScheduleMap = new Map<string, { opponent: string; homeAway: string; gameTime: string; gameStatus: string }>();
  const liveGamePks: { gamePk: number; awayAbbr: string; homeAbbr: string; detailedState: string }[] = [];

  for (const dateEntry of scheduleData.dates || []) {
    for (const game of dateEntry.games || []) {
      const status = game.status?.abstractGameState || "Preview";
      const detailedState = game.status?.detailedState || status;
      const awayTeam = game.teams?.away?.team;
      const homeTeam = game.teams?.home?.team;
      const awayAbbr = awayTeam?.abbreviation ?? (awayTeam?.id ? teamsMap[awayTeam.id] : "") ?? "";
      const homeAbbr = homeTeam?.abbreviation ?? (homeTeam?.id ? teamsMap[homeTeam.id] : "") ?? "";
      const gameTime = game.gameDate ?? "";

      if (awayAbbr) teamScheduleMap.set(awayAbbr, { opponent: homeAbbr, homeAway: "away", gameTime, gameStatus: detailedState });
      if (homeAbbr) teamScheduleMap.set(homeAbbr, { opponent: awayAbbr, homeAway: "home", gameTime, gameStatus: detailedState });

      // Collect Live/Final games for boxscore fetching
      if (status === "Live" || status === "Final") {
        liveGamePks.push({ gamePk: game.gamePk, awayAbbr, homeAbbr, detailedState });
      }
    }
  }

  // Fetch live feeds for Live/Final games to get actual player boxscore stats
  // Only fetch games where our roster players might be playing
  const rosterTeams = new Set(rosterEntries.map(r => r.player.mlbTeam).filter(Boolean));
  const relevantGames = liveGamePks.filter(g => rosterTeams.has(g.awayAbbr) || rosterTeams.has(g.homeAbbr));

  for (const game of relevantGames) {
    try {
      const liveFeed = await mlbGetJson(`https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`, 120);
      const boxscore = liveFeed.liveData?.boxscore;
      if (!boxscore) continue;

      for (const side of ["away", "home"] as const) {
        const teamPlayers = boxscore.teams?.[side]?.players;
        if (!teamPlayers) continue;
        const oppAbbr = side === "away" ? game.homeAbbr : game.awayAbbr;

        for (const [_key, player] of Object.entries(teamPlayers) as [string, any][]) {
          const mlbId = player.person?.id;
          if (!mlbId) continue;

          const hitting = player.stats?.batting;
          const pitching = player.stats?.pitching;

          playerStatsMap.set(mlbId, {
            hitting: hitting && (hitting.atBats > 0 || hitting.runs > 0 || hitting.walks > 0) ? {
              AB: hitting.atBats || 0,
              H: hitting.hits || 0,
              R: hitting.runs || 0,
              HR: hitting.homeRuns || 0,
              RBI: hitting.rbi || 0,
              SB: hitting.stolenBases || 0,
              BB: hitting.baseOnBalls || 0,
              K: hitting.strikeOuts || 0,
            } : undefined,
            pitching: pitching && pitching.inningsPitched && pitching.inningsPitched !== "0.0" ? {
              IP: pitching.inningsPitched || "0.0",
              H: pitching.hits || 0,
              R: pitching.runs || 0,
              ER: pitching.earnedRuns || 0,
              K: pitching.strikeOuts || 0,
              BB: pitching.baseOnBalls || 0,
              W: pitching.wins || 0,
              L: pitching.losses || 0,
              SV: pitching.saves || 0,
            } : undefined,
            gameStatus: game.detailedState,
            opponent: oppAbbr,
            homeAway: side,
          });
        }
      }
    } catch (err) {
      logger.warn({ error: String(err), gamePk: game.gamePk }, "Failed to fetch live feed for boxscore");
    }
  }

  // Fetch highlight thumbnails for roster players from game content API
  const playerThumbnails = new Map<number, string>();
  const uniqueGamePks = [...new Set(relevantGames.map(g => g.gamePk))];

  await Promise.allSettled(
    uniqueGamePks.slice(0, 6).map(async (gamePk) => {
      try {
        const content = await mlbGetJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`, 300);
        const items = content?.highlights?.highlights?.items || [];
        for (const item of items) {
          const playerKws = (item.keywordsAll || []).filter((k: any) => k.type === "player_id");
          if (playerKws.length === 0) continue;
          const mlbId = Number(playerKws[0].value);
          if (!mlbId || playerThumbnails.has(mlbId)) continue;
          const cuts = item.image?.cuts || [];
          const cut = Array.isArray(cuts)
            ? (cuts.find((c: any) => c.width === 640) || cuts.find((c: any) => c.width === 720) || cuts[cuts.length - 1])
            : null;
          if (cut?.src) playerThumbnails.set(mlbId, cut.src);
        }
      } catch { /* skip — thumbnails are optional */ }
    })
  );

  // Build response
  const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
  const players = rosterEntries.map(r => {
    const p = r.player;
    const isPitcher = PITCHER_POS.has((p.posPrimary ?? "").toUpperCase());
    const stats = p.mlbId ? playerStatsMap.get(p.mlbId) : undefined;
    const schedule = p.mlbTeam ? teamScheduleMap.get(p.mlbTeam) : undefined;

    return {
      playerName: p.name,
      mlbId: p.mlbId,
      mlbTeam: p.mlbTeam || "",
      position: r.assignedPosition || p.posPrimary || "",
      isPitcher,
      gameToday: !!schedule,
      gameStatus: stats?.gameStatus || schedule?.gameStatus || "",
      opponent: stats?.opponent || schedule?.opponent || "",
      homeAway: stats?.homeAway || schedule?.homeAway || "",
      gameTime: schedule?.gameTime || "",
      hitting: stats?.hitting || null,
      pitching: stats?.pitching || null,
      thumbnail: (p.mlbId ? playerThumbnails.get(p.mlbId) : null) || null,
    };
  });

  // Sort: players with stats first, then by position (POS_ORDER imported from sportConfig)
  players.sort((a, b) => {
    // Hitters first, pitchers second
    if (a.isPitcher !== b.isPitcher) return a.isPitcher ? 1 : -1;
    // Within group, by position order
    const ia = (POS_ORDER as readonly string[]).indexOf(a.position);
    const ib = (POS_ORDER as readonly string[]).indexOf(b.position);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  res.json({ date: today, teamName: team.name, players });
}));

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

    // Get active roster players with mlbId. We also pull posPrimary so we
    // know which players are pitchers — used for the gameStatus="FINAL"-but-
    // no-line DNP rendering on the client (a pitcher's "DNP" copy differs).
    const rosterEntries = await prisma.roster.findMany({
      where: {
        teamId: team.id,
        releasedAt: null,
        player: { mlbId: { not: null } },
      },
      select: {
        player: {
          select: { id: true, name: true, mlbId: true, mlbTeam: true, posPrimary: true },
        },
      },
    });

    if (rosterEntries.length === 0) {
      return res.json({ players: [] });
    }

    // Get today's schedule (reuses cached data from scores endpoint).
    // We hydrate the linescore so we can build "TOP 5" / "BOT 9" descriptors.
    const requestedDate = typeof req.query.date === "string" ? req.query.date : "";
    const today = DATE_REGEX.test(requestedDate) ? requestedDate : mlbGameDayDate();
    const season = Number(today.slice(0, 4));
    const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1&hydrate=linescore`;
    const scheduleData = await mlbGetJson(scheduleUrl, 60);

    // Build a map: team abbreviation -> rich game info (status + linescore).
    const teamsMap = await fetchMlbTeamsMap();
    interface TeamGameInfo {
      gameTime: string;
      opponent: string;
      homeAway: "home" | "away";
      gameStatus: GameStatus;
      gameStateDesc: string;
    }
    const teamGameMap = new Map<string, TeamGameInfo>();

    for (const dateEntry of scheduleData.dates || []) {
      for (const g of dateEntry.games || []) {
        const awayTeam = g.teams?.away?.team;
        const homeTeam = g.teams?.home?.team;
        const awayAbbr = awayTeam?.abbreviation ?? (awayTeam?.id ? teamsMap[awayTeam.id] : "") ?? "";
        const homeAbbr = homeTeam?.abbreviation ?? (homeTeam?.id ? teamsMap[homeTeam.id] : "") ?? "";
        const gameTime: string = g.gameDate ?? "";
        const gameStatus = deriveGameStatus(g.status?.abstractGameState);
        const ls = g.linescore;
        const gameStateDesc = buildGameStateDesc({
          gameStatus,
          detailedState: g.status?.detailedState,
          inningHalf: ls?.inningState,
          inning: ls?.currentInning,
          scheduledTimeShort: gameTime,
        });
        const info: TeamGameInfo = { gameTime, opponent: "", homeAway: "away", gameStatus, gameStateDesc };
        if (awayAbbr) teamGameMap.set(awayAbbr, { ...info, opponent: homeAbbr, homeAway: "away" });
        if (homeAbbr) teamGameMap.set(homeAbbr, { ...info, opponent: awayAbbr, homeAway: "home" });
      }
    }

    // First pass — assemble per-player base records (no stat lines yet).
    interface BaseRecord {
      base: MyPlayerToday;
      mlbId: number;
      gameStatus: GameStatus;
      gameStateDesc: string;
    }
    const baseRecords: BaseRecord[] = [];
    for (const entry of rosterEntries) {
      const p = entry.player;
      if (!p.mlbTeam || !p.mlbId) continue;
      const game = teamGameMap.get(p.mlbTeam);
      if (!game) continue;
      baseRecords.push({
        mlbId: p.mlbId,
        gameStatus: game.gameStatus,
        gameStateDesc: game.gameStateDesc,
        base: {
          playerName: p.name,
          mlbId: p.mlbId,
          mlbTeam: p.mlbTeam,
          posPrimary: p.posPrimary || undefined,
          gameTime: game.gameTime,
          opponent: game.opponent,
          homeAway: game.homeAway,
          gameStatus: game.gameStatus,
          gameStateDesc: game.gameStateDesc,
        },
      });
    }

    // Second pass — parallel per-player gameLog lookups. Promise.allSettled
    // keeps a single failure from blanking the whole panel; we log warnings
    // and degrade gracefully (the player simply renders without `line`).
    const lookups = await Promise.allSettled(
      baseRecords.map((r) =>
        getPlayerTodayLine({
          mlbId: r.mlbId,
          season,
          dateStr: today,
          gameStatus: r.gameStatus,
          gameStateDesc: r.gameStateDesc,
        }),
      ),
    );

    const players: MyPlayerToday[] = baseRecords.map((rec, i) => {
      const result = lookups[i];
      if (result.status === "fulfilled") {
        const { line } = result.value;
        // For pitchers we only surface the pitching line (and vice versa) —
        // a position player who happened to be charted in the pitching block
        // (rare blowout-relief case) shouldn't suddenly look like a starter.
        const filtered = filterLineByRole(line, rec.base.posPrimary);
        return filtered ? { ...rec.base, line: filtered } : rec.base;
      }
      // Degrade — log and emit the base record without a line.
      logger.warn(
        { mlbId: rec.mlbId, error: String((result as PromiseRejectedResult).reason) },
        "my-players-today: gameLog lookup failed",
      );
      return rec.base;
    });

    // Sort by game time so users see early games first.
    players.sort((a, b) => a.gameTime.localeCompare(b.gameTime));

    return res.json({ date: today, players });
  })
);

/** Keep only the role-appropriate line. A pitcher gets `pitching`; everyone
 *  else gets `hitting`. We never strip both — if MLB only filed one block,
 *  we surface what we have. */
function filterLineByRole(
  line: PlayerStatLine | undefined,
  posPrimary: string | undefined,
): PlayerStatLine | undefined {
  if (!line) return undefined;
  const pitcher = isPitcherPos(posPrimary || "");
  if (pitcher) {
    if (line.pitching) return { pitching: line.pitching };
    // Pitcher with no pitching block but a hitting block (interleague NL
    // pitcher hitting, or data quirk) — we suppress; a pitcher's stat-line
    // chip should show pitching only.
    return undefined;
  }
  if (line.hitting) return { hitting: line.hitting };
  return undefined;
}

export const scoresRouter = router;

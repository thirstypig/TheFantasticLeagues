import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
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

// ─── Weekly League Digest ────────────────────────────────────────────────────

import { getWeekKey } from "../../lib/utils.js";

const tradeStyles = ["conservative", "outrageous", "fun"] as const;

// GET /api/mlb/league-digest?leagueId=N
router.get("/league-digest", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const weekKey = getWeekKey();

  // Check DB for persisted digest
  const persisted = await prisma.aiInsight.findFirst({
    where: { type: "league_digest", leagueId, weekKey },
  });
  if (persisted) {
    const data = persisted.data as any;
    const voteData = extractVotes(data, req.user!.id);
    return res.json({ ...data, generatedAt: persisted.createdAt.toISOString(), weekKey, votes: undefined, voteResults: voteData });
  }

  // Build context from league data
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { name: true, season: true, rules: true },
  });
  if (!league) return res.status(404).json({ error: "League not found" });

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true } } },
        orderBy: { price: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Recent transactions (last 14 days) per team
  const recentRosters = await prisma.roster.findMany({
    where: {
      teamId: { in: teams.map(t => t.id) },
      acquiredAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      source: { not: "import" },
    },
    include: { player: { select: { name: true } }, team: { select: { name: true } } },
    orderBy: { acquiredAt: "desc" },
  });
  const movesByTeam = new Map<number, string[]>();
  for (const r of recentRosters) {
    const moves = movesByTeam.get(r.teamId) || [];
    moves.push(`${r.source}: ${r.player.name}`);
    movesByTeam.set(r.teamId, moves);
  }

  // Determine trade style rotation based on week number
  const weekNum = parseInt(weekKey.split("-W")[1]) || 0;
  const tradeStyle = tradeStyles[weekNum % 3];

  const teamData = teams.map(t => ({
    id: t.id,
    name: t.name,
    budget: t.budget,
    rosterHighlights: t.rosters.slice(0, 8).map(r => `${r.player.name} (${r.player.posPrimary}, $${r.price})`).join(", "),
    recentMoves: (movesByTeam.get(t.id) || []).slice(0, 5).join("; "),
  }));

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.generateLeagueDigest({
    leagueName: league.name,
    season: league.season,
    leagueType: (league.rules as any)?.leagueType ?? "NL",
    teams: teamData,
    tradeStyle,
    weekNumber: weekNum,
  });

  if (!result.success) {
    logger.warn({ error: result.error, leagueId }, "League digest generation failed");
    return res.status(503).json({ error: "League digest is temporarily unavailable" });
  }

  // Persist (use teamId=0 for league-wide insights)
  await prisma.aiInsight.create({
    data: {
      type: "league_digest",
      leagueId,
      teamId: teams[0]?.id ?? 0, // Use first team as anchor (league-wide)
      weekKey,
      data: result.result as any,
    },
  }).catch(err => {
    if (!(err as any)?.code?.includes("P2002")) {
      logger.error({ error: String(err) }, "Failed to persist league digest");
    }
  });

  res.json({ ...result.result, generatedAt: new Date().toISOString(), weekKey, voteResults: { yes: 0, no: 0, myVote: null } });
}));

// POST /api/mlb/league-digest/vote — Vote on the Trade of the Week
const voteSchema = z.object({
  leagueId: z.number().int().positive(),
  vote: z.enum(["yes", "no"]),
});

router.post("/league-digest/vote", requireAuth, validateBody(voteSchema), asyncHandler(async (req, res) => {
  const { leagueId, vote } = req.body;
  const userId = req.user!.id;

  const weekKey = getWeekKey();
  const insight = await prisma.aiInsight.findFirst({
    where: { type: "league_digest", leagueId, weekKey },
  });
  if (!insight) return res.status(404).json({ error: "No digest found for this week" });

  // Update votes in the data JSON
  const data = insight.data as any;
  const votes: Record<string, string> = data.votes || {};
  votes[String(userId)] = vote;

  await prisma.aiInsight.update({
    where: { id: insight.id },
    data: { data: { ...data, votes } },
  });

  const yesCount = Object.values(votes).filter(v => v === "yes").length;
  const noCount = Object.values(votes).filter(v => v === "no").length;

  res.json({ yes: yesCount, no: noCount, myVote: vote });
}));

// Helper: extract vote counts from digest data for a specific user
function extractVotes(data: any, userId: number): { yes: number; no: number; myVote: string | null } {
  const votes: Record<string, string> = data?.votes || {};
  const yesCount = Object.values(votes).filter(v => v === "yes").length;
  const noCount = Object.values(votes).filter(v => v === "no").length;
  const myVote = votes[String(userId)] || null;
  return { yes: yesCount, no: noCount, myVote };
}

export const mlbFeedRouter = router;

/**
 * Digest + Headlines routes — extracted from mlb-feed/routes.ts to reduce god module.
 * Handles: /league-digest, /league-digest/weeks, /league-digest/vote, /league-headlines
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { mlbGetJson, fetchMlbTeamsMap } from "../../lib/mlbApi.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";
import { getWeekKey, weekKeyLabel } from "../../lib/utils.js";
import { buildDigestContext, extractVoteResults, isDigestReady, type DigestData } from "./services/digestService.js";

const router = Router();

const WEEK_KEY_REGEX = /^\d{4}-W\d{2}$/;

function todayDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// GET /api/mlb/league-digest/weeks?leagueId=N — list all persisted digest weeks
router.get("/league-digest/weeks", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const rows = await prisma.aiInsight.findMany({
    where: { type: "league_digest", leagueId },
    select: { weekKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const currentWeekKey = getWeekKey();
  const weeks: { weekKey: string; generatedAt: string | null; label: string }[] = rows.map(r => ({
    weekKey: r.weekKey,
    generatedAt: r.createdAt.toISOString(),
    label: weekKeyLabel(r.weekKey),
  }));

  if (!weeks.some(w => w.weekKey === currentWeekKey)) {
    weeks.push({ weekKey: currentWeekKey, generatedAt: null, label: weekKeyLabel(currentWeekKey) });
  }

  res.json({ weeks, currentWeekKey });
}));

// GET /api/mlb/league-digest?leagueId=N[&weekKey=YYYY-WNN]
router.get("/league-digest", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Missing leagueId" });

  const currentWeekKey = getWeekKey();
  const raw = typeof req.query.weekKey === "string" ? req.query.weekKey : null;
  const requestedWeekKey = raw && WEEK_KEY_REGEX.test(raw) ? raw : null;
  const weekKey = requestedWeekKey || currentWeekKey;
  const isCurrentWeek = weekKey === currentWeekKey;

  // Check DB for persisted digest
  const persisted = await prisma.aiInsight.findFirst({
    where: { type: "league_digest", leagueId, weekKey },
  });
  if (persisted) {
    const data = (persisted.data ?? {}) as DigestData & Record<string, unknown>;
    const voteData = extractVoteResults(data, req.user!.id);
    return res.json({ ...data, generatedAt: persisted.createdAt.toISOString(), weekKey, isCurrentWeek, votes: undefined, voteResults: voteData });
  }

  // For past weeks, never auto-generate — return 404
  if (!isCurrentWeek) {
    return res.status(404).json({ error: "No digest found for this week" });
  }

  // Don't generate new digest until Sunday games are complete (Monday 3 AM PT)
  if (!isDigestReady()) {
    const prevWeekKey = getWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const prevDigest = await prisma.aiInsight.findFirst({
      where: { type: "league_digest", leagueId, weekKey: prevWeekKey },
    });
    if (prevDigest) {
      const data = (prevDigest.data ?? {}) as DigestData & Record<string, unknown>;
      const voteData = extractVoteResults(data, req.user!.id);
      return res.json({ ...data, generatedAt: prevDigest.createdAt.toISOString(), weekKey: prevWeekKey, isCurrentWeek: false, votes: undefined, voteResults: voteData });
    }
    return res.status(404).json({ error: "Digest not available yet — Sunday games still in progress" });
  }

  // Build context using digest service
  const digestCtx = await buildDigestContext(leagueId, weekKey);
  if (!digestCtx) return res.status(404).json({ error: "League not found" });

  // Generate digest via AI
  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.generateLeagueDigest(digestCtx);

  if (!result.success) {
    logger.warn({ error: result.error, leagueId }, "League digest generation failed");
    return res.status(503).json({ error: "League digest is temporarily unavailable" });
  }

  // Persist digest
  const firstTeamId = (await prisma.team.findFirst({ where: { leagueId }, select: { id: true } }))?.id ?? 0;
  await prisma.aiInsight.create({
    data: {
      type: "league_digest",
      leagueId,
      teamId: firstTeamId,
      weekKey,
      data: result.result as any,
    },
  }).catch(err => {
    if (!(err as any)?.code?.includes("P2002")) {
      logger.error({ error: String(err) }, "Failed to persist league digest");
    }
  });

  res.json({ ...result.result, generatedAt: new Date().toISOString(), weekKey, isCurrentWeek: true, voteResults: { yes: 0, no: 0, myVote: null } });
}));

// POST /api/mlb/league-digest/vote — Vote on the Trade of the Week
const voteSchema = z.object({
  leagueId: z.number().int().positive(),
  vote: z.enum(["yes", "no"]),
});

router.post("/league-digest/vote", requireAuth, validateBody(voteSchema), requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const { leagueId, vote } = req.body;
  const userId = req.user!.id;
  const weekKey = getWeekKey();

  const votes = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: number; data: unknown }[]>`
      SELECT id, data FROM "AiInsight"
      WHERE type = 'league_digest' AND "leagueId" = ${leagueId} AND "weekKey" = ${weekKey}
      FOR UPDATE
      LIMIT 1
    `;
    if (!rows.length) return null;

    const insightId = rows[0].id;
    const data = (rows[0].data ?? {}) as DigestData;
    const updatedVotes: Record<string, string> = { ...(data.votes || {}), [String(userId)]: vote };

    await tx.aiInsight.update({
      where: { id: insightId },
      data: { data: { ...data, votes: updatedVotes } as any },
    });
    return updatedVotes;
  });

  if (!votes) return res.status(404).json({ error: "No digest found for this week" });

  const yesCount = Object.values(votes).filter(v => v === "yes").length;
  const noCount = Object.values(votes).filter(v => v === "no").length;

  res.json({ yes: yesCount, no: noCount, myVote: vote });
}));

// ─── GET /league-headlines — Top performer from each fantasy team with highlight thumbnails ───

router.get("/league-headlines", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const today = todayDateStr();

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      name: true,
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { id: true, name: true, mlbId: true, mlbTeam: true, posPrimary: true } } },
      },
    },
  });

  const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?date=${today}&sportId=1`;
  const scheduleData = await mlbGetJson(scheduleUrl, 120);
  const teamsMap = await fetchMlbTeamsMap();

  const teamScheduleMap = new Map<string, { opponent: string; homeAway: string; gamePk: number }>();
  const liveGamePks: { gamePk: number; awayAbbr: string; homeAbbr: string; detailedState: string }[] = [];

  for (const dateEntry of scheduleData.dates || []) {
    for (const game of dateEntry.games || []) {
      const status = game.status?.abstractGameState || "Preview";
      const detailedState = game.status?.detailedState || status;
      const awayAbbr = game.teams?.away?.team?.abbreviation ?? (game.teams?.away?.team?.id ? teamsMap[game.teams.away.team.id] : "") ?? "";
      const homeAbbr = game.teams?.home?.team?.abbreviation ?? (game.teams?.home?.team?.id ? teamsMap[game.teams.home.team.id] : "") ?? "";

      if (awayAbbr) teamScheduleMap.set(awayAbbr, { opponent: homeAbbr, homeAway: "away", gamePk: game.gamePk });
      if (homeAbbr) teamScheduleMap.set(homeAbbr, { opponent: awayAbbr, homeAway: "home", gamePk: game.gamePk });

      if (status === "Live" || status === "Final") {
        liveGamePks.push({ gamePk: game.gamePk, awayAbbr, homeAbbr, detailedState });
      }
    }
  }

  const allRosterTeams = new Set<string>();
  for (const team of teams) {
    for (const r of team.rosters) {
      if (r.player.mlbTeam) allRosterTeams.add(r.player.mlbTeam);
    }
  }

  const playerStatsMap = new Map<number, { hitting?: any; pitching?: any; opponent: string; detailedState: string }>();
  const relevantGames = liveGamePks.filter(g => allRosterTeams.has(g.awayAbbr) || allRosterTeams.has(g.homeAbbr));

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
              AB: hitting.atBats || 0, H: hitting.hits || 0, R: hitting.runs || 0,
              HR: hitting.homeRuns || 0, RBI: hitting.rbi || 0, SB: hitting.stolenBases || 0,
            } : undefined,
            pitching: pitching && pitching.inningsPitched && pitching.inningsPitched !== "0.0" ? {
              IP: pitching.inningsPitched || "0.0", H: pitching.hits || 0, ER: pitching.earnedRuns || 0,
              K: pitching.strikeOuts || 0, W: pitching.wins || 0, L: pitching.losses || 0, SV: pitching.saves || 0,
            } : undefined,
            opponent: oppAbbr,
            detailedState: game.detailedState,
          });
        }
      }
    } catch (err) {
      logger.warn({ error: String(err), gamePk: game.gamePk }, "Failed to fetch live feed for league headlines");
    }
  }

  const playerThumbnails = new Map<number, string>();
  const uniqueGamePks = [...new Set(relevantGames.map(g => g.gamePk))];

  const contentResults = await Promise.allSettled(
    uniqueGamePks.slice(0, 8).map(async (gamePk) => {
      const content = await mlbGetJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/content`, 300);
      const items = content?.highlights?.highlights?.items || [];
      for (const item of items) {
        const playerKws = (item.keywordsAll || []).filter((k: any) => k.type === "player_id");
        if (playerKws.length === 0) continue;
        const mlbId = Number(playerKws[0].value);
        if (!mlbId || playerThumbnails.has(mlbId)) continue;
        const cuts = item.image?.cuts || [];
        const cut = (Array.isArray(cuts)
          ? cuts.find((c: any) => c.width === 640) || cuts.find((c: any) => c.width === 720) || cuts[cuts.length - 1]
          : null);
        if (cut?.src) playerThumbnails.set(mlbId, cut.src);
      }
    })
  );

  const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
  const headlines: any[] = [];

  for (const team of teams) {
    let best: any = null;
    let bestScore = -1;

    for (const r of team.rosters) {
      const p = r.player;
      const isPitcher = PITCHER_POS.has((p.posPrimary ?? "").toUpperCase());
      const stats = p.mlbId ? playerStatsMap.get(p.mlbId) : undefined;
      if (!stats || (!stats.hitting && !stats.pitching)) continue;

      const h = stats.hitting || {};
      const pt = stats.pitching || {};
      const hitScore = (h.HR || 0) * 4 + (h.RBI || 0) * 2 + (h.R || 0) * 2 + (h.SB || 0) * 3 + (h.H || 0);
      const pitchScore = (pt.W || 0) * 5 + (pt.SV || 0) * 5 + (pt.K || 0) + (parseFloat(pt.IP || "0") >= 5 && (pt.ER || 0) <= 2 ? 5 : 0);
      const score = hitScore + pitchScore;

      if (score > bestScore) {
        bestScore = score;
        const schedule = p.mlbTeam ? teamScheduleMap.get(p.mlbTeam) : undefined;
        best = {
          teamName: team.name,
          teamId: team.id,
          playerName: p.name,
          mlbId: p.mlbId,
          mlbTeam: p.mlbTeam || "",
          position: r.assignedPosition || p.posPrimary || "",
          isPitcher,
          opponent: stats.opponent || "",
          gameStatus: stats.detailedState || "",
          hitting: stats.hitting || null,
          pitching: stats.pitching || null,
          thumbnail: (p.mlbId ? playerThumbnails.get(p.mlbId) : null) || null,
          score,
        };
      }
    }

    if (best) headlines.push(best);
  }

  headlines.sort((a, b) => b.score - a.score);

  res.json({ date: today, headlines });
}));

export const digestRouter = router;

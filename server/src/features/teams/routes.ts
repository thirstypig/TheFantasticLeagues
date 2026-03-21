// server/src/routes/teams.ts
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { TeamService } from "./services/teamService.js";
import { requireAuth, requireTeamOwner, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

const rosterUpdateSchema = z.object({
  assignedPosition: z.string().max(5).nullable(),
});

const router = Router();
const teamService = new TeamService();

// GET /api/teams - list teams scoped to user's leagues (or filtered by leagueId)
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;

  const where: Prisma.TeamWhereInput = {};
  if (leagueId) {
    // If leagueId provided, verify membership (admins bypass)
    if (!req.user!.isAdmin) {
      const m = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      });
      if (!m) return res.status(403).json({ error: "Not a member of this league" });
    }
    where.leagueId = leagueId;
  } else if (!req.user!.isAdmin) {
    // No leagueId: scope to user's leagues only
    const memberships = await prisma.leagueMembership.findMany({
      where: { userId: req.user!.id },
      select: { leagueId: true },
    });
    where.leagueId = { in: memberships.map(m => m.leagueId) };
  }

  const teams = await prisma.team.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      owner: true,
      ownerUserId: true,
      budget: true,
      leagueId: true,
      ownerships: { select: { userId: true } },
    },
  });
  res.json({ teams });
}));

// ─── AI Weekly Insights (MUST be before /:id routes to avoid param matching) ──

const insightsCache = new Map<string, { data: any; expiresAt: number }>();
const INSIGHTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// GET /api/teams/ai-insights?leagueId=X&teamId=Y
router.get("/ai-insights", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Missing leagueId or teamId" });
  }

  const cacheKey = `${leagueId}:${teamId}`;
  const cached = insightsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.leagueId !== leagueId) {
    return res.status(404).json({ error: "Team not found" });
  }

  const roster = await prisma.roster.findMany({
    where: { teamId, releasedAt: null },
    include: { player: { select: { name: true, posPrimary: true } } },
  });

  const allTeams = await prisma.team.findMany({
    where: { leagueId },
    include: { season: true },
    orderBy: { name: "asc" },
  });

  const standings = allTeams
    .map((t) => ({
      teamName: t.name,
      totalScore: t.season
        ? (t.season.R + t.season.HR + t.season.RBI + t.season.SB + t.season.W + t.season.S + t.season.K)
        : 0,
      rank: 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  const recentTx = await prisma.roster.findMany({
    where: {
      teamId,
      acquiredAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    include: { player: { select: { name: true } } },
    orderBy: { acquiredAt: "desc" },
    take: 10,
  });

  const transactions = recentTx.map(tx => ({
    type: tx.source,
    playerName: tx.player.name,
    date: tx.acquiredAt.toISOString().split('T')[0],
  }));

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.generateWeeklyInsights(
    { id: team.id, name: team.name, budget: team.budget },
    roster.map(r => ({
      playerName: r.player.name,
      position: r.player.posPrimary,
      price: r.price,
    })),
    standings,
    transactions,
  );

  if (!result.success) {
    logger.warn({ error: result.error, leagueId, teamId }, "Weekly insights failed");
    return res.status(503).json({ error: "Weekly insights are temporarily unavailable" });
  }

  insightsCache.set(cacheKey, { data: result.result, expiresAt: Date.now() + INSIGHTS_CACHE_TTL });
  res.json(result.result);
}));

// GET /api/teams/:id/summary
router.get("/:id/summary", requireAuth, asyncHandler(async (req, res) => {
  const teamId = Number(req.params.id);
  if (Number.isNaN(teamId)) {
    return res.status(400).json({ error: "Invalid team id" });
  }

  // Verify user is a member of the team's league (admins bypass)
  if (!req.user!.isAdmin) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { leagueId: true },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user!.id } },
    });
    if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  }

  try {
    const summary = await teamService.getTeamSummary(teamId);
    res.json(summary);
  } catch (e) {
    if ((e as Error).message === "Team not found") {
      return res.status(404).json({ error: "Team not found" });
    }
    throw e;
  }
}));

// PATCH /api/teams/:teamId/roster/:rosterId
// Update roster details (e.g. assigned position)
router.patch("/:teamId/roster/:rosterId", requireAuth, requireTeamOwner("teamId"), validateBody(rosterUpdateSchema), asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  const rosterId = Number(req.params.rosterId);

  if (Number.isNaN(teamId) || Number.isNaN(rosterId)) {
    return res.status(400).json({ error: "Invalid IDs" });
  }

  // Verify Roster belongs to Team
  const rosterItem = await prisma.roster.findUnique({
    where: { id: rosterId },
    include: { team: true }
  });

  if (!rosterItem || rosterItem.teamId !== teamId) {
    return res.status(404).json({ error: "Roster item not found for this team" });
  }

  const { assignedPosition } = req.body;

  const updated = await prisma.roster.update({
    where: { id: rosterId },
    data: { assignedPosition },
  });

  res.json({ roster: updated });
}));

// ─── Trade Block ────────────────────────────────────────────────────────────

const tradeBlockSchema = z.object({
  playerIds: z.array(z.number().int().positive()).max(30),
});

// NOTE: league-level route registered first to avoid `:teamId` param capturing "trade-block"
// GET /api/teams/trade-block/league?leagueId=X — returns all trade block data for a league
router.get("/trade-block/league", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!Number.isFinite(leagueId)) {
    return res.status(400).json({ error: "Invalid leagueId" });
  }

  // Verify caller is a league member (admins bypass)
  if (!req.user!.isAdmin) {
    const m = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
    });
    if (!m) return res.status(403).json({ error: "Not a member of this league" });
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, tradeBlockPlayerIds: true },
  });

  const tradeBlocks: Record<number, number[]> = {};
  for (const team of teams) {
    const ids = Array.isArray(team.tradeBlockPlayerIds)
      ? (team.tradeBlockPlayerIds as number[])
      : [];
    if (ids.length > 0) {
      tradeBlocks[team.id] = ids;
    }
  }

  res.json({ tradeBlocks });
}));

// GET /api/teams/:teamId/trade-block — returns playerIds on the trade block
router.get("/:teamId/trade-block", requireAuth, asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { tradeBlockPlayerIds: true, leagueId: true },
  });
  if (!team) return res.status(404).json({ error: "Team not found" });

  // Verify caller is a league member (admins bypass)
  if (!req.user!.isAdmin) {
    const m = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user!.id } },
    });
    if (!m) return res.status(403).json({ error: "Not a member of this league" });
  }

  const playerIds = Array.isArray(team.tradeBlockPlayerIds)
    ? (team.tradeBlockPlayerIds as number[])
    : [];

  res.json({ playerIds });
}));

// POST /api/teams/:teamId/trade-block — save trade block selections (team owner only)
router.post("/:teamId/trade-block", requireAuth, validateBody(tradeBlockSchema), requireTeamOwner("teamId"), asyncHandler(async (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Invalid teamId" });
  }

  const { playerIds } = req.body as { playerIds: number[] };

  // Validate that all playerIds are actually on this team's active roster
  const activeRoster = await prisma.roster.findMany({
    where: { teamId, releasedAt: null },
    select: { playerId: true },
  });
  const rosterPlayerIds = new Set(activeRoster.map(r => r.playerId));
  const validPlayerIds = playerIds.filter(id => rosterPlayerIds.has(id));

  await prisma.team.update({
    where: { id: teamId },
    data: { tradeBlockPlayerIds: validPlayerIds },
  });

  logger.info({ teamId, count: validPlayerIds.length }, "Trade block updated");
  res.json({ playerIds: validPlayerIds });
}));

export const teamsRouter = router;
export default teamsRouter;

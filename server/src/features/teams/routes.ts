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
import { computeStandingsFromStats, type TeamStatRow } from "../standings/services/standingsService.js";

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
const INSIGHTS_CACHE_MAX = 100;
const insightsInFlight = new Map<string, Promise<any>>(); // dedup concurrent requests
import { getWeekKey } from "../../lib/utils.js";

// GET /api/teams/ai-insights?leagueId=X&teamId=Y
router.get("/ai-insights", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Missing leagueId or teamId" });
  }

  // Allow admin to backfill a specific week (e.g., ?weekOverride=2026-W13 for Opening Day)
  const weekOverride = req.query.weekOverride as string | undefined;
  const weekKey = weekOverride && /^\d{4}-W\d{2}$/.test(weekOverride) && (req.user as any)?.isAdmin
    ? weekOverride
    : getWeekKey();
  const persisted = await prisma.aiInsight.findUnique({
    where: { type_leagueId_teamId_weekKey: { type: "weekly", leagueId, teamId, weekKey } },
  });
  if (persisted) {
    return res.json({ ...(persisted.data as any), generatedAt: persisted.createdAt.toISOString(), weekKey: persisted.weekKey });
  }

  // Check in-memory cache (for sub-hour re-requests)
  const cacheKey = `${leagueId}:${teamId}:${weekKey}`;
  const cached = insightsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached.data);
  }

  // Dedup concurrent requests
  const inflightKey = `${leagueId}:${teamId}:${weekKey}`;
  const existing = insightsInFlight.get(inflightKey);
  if (existing) {
    const result = await existing;
    if (!result) return res.status(503).json({ error: "Weekly insights temporarily unavailable" });
    return res.json(result);
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.leagueId !== leagueId) {
    return res.status(404).json({ error: "Team not found" });
  }

  const roster = await prisma.roster.findMany({
    where: { teamId, releasedAt: null },
    include: { player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } } },
  });

  // Fetch individual player stats for the active period (so AI has real data)
  const activePeriod = await prisma.period.findFirst({
    where: { leagueId, status: "active" },
    orderBy: { startDate: "desc" },
  });
  let playerStatsMap = new Map<number, any>();
  if (activePeriod) {
    const playerIds = roster.map(r => r.player.id);
    const periodStats = await prisma.playerStatsPeriod.findMany({
      where: { periodId: activePeriod.id, playerId: { in: playerIds } },
    });
    playerStatsMap = new Map(periodStats.map(s => [s.playerId, s]));
  }

  // Load projected auction values (cached singleton)
  const { lookupAuctionValue } = await import("../../lib/auctionValues.js");

  // Get the active period's team stats (more reliable than TeamStatsSeason which may be stale)
  const insightPeriod = await prisma.period.findFirst({
    where: { leagueId, status: "active" },
    orderBy: { id: "desc" },
  });

  // Try TeamStatsPeriod first (has real data), fall back to TeamStatsSeason
  let allTeamStats: { teamId: number; team: { id: number; name: string }; R: number; HR: number; RBI: number; SB: number; AVG: number; W: number; S: number; K: number; ERA: number; WHIP: number }[] = [];
  let hasActualStats = false;

  if (insightPeriod) {
    const periodStats = await prisma.teamStatsPeriod.findMany({
      where: { periodId: insightPeriod.id },
      include: { team: { select: { id: true, name: true } } },
    });
    if (periodStats.length > 0 && periodStats.some(ps => ps.R > 0 || ps.W > 0)) {
      allTeamStats = periodStats;
      hasActualStats = true;
    }
  }

  if (!hasActualStats) {
    const seasonStats = await prisma.teamStatsSeason.findMany({
      where: { team: { leagueId } },
      include: { team: { select: { id: true, name: true } } },
    });
    if (seasonStats.length > 0 && seasonStats.some(ss => ss.R > 0 || ss.W > 0)) {
      allTeamStats = seasonStats;
      hasActualStats = true;
    }
  }

  // Build category rankings if we have actual stats
  let categoryRankings: { category: string; rank: number; value: number }[] | null = null;
  let standings: { teamName: string; rank: number; totalScore: number }[];
  const teamSeasonStats = allTeamStats.find(ts => ts.teamId === teamId) ?? null;

  if (hasActualStats) {

    // Adapt Prisma rows to TeamStatRow for the standings service
    const teamStatRows: TeamStatRow[] = allTeamStats.map(ts => ({
      team: { id: ts.team.id, name: ts.team.name, code: (ts.team as any).code ?? "" },
      R: Number(ts.R), HR: Number(ts.HR), RBI: Number(ts.RBI), SB: Number(ts.SB),
      AVG: Number(ts.AVG), W: Number(ts.W), S: Number(ts.S), K: Number(ts.K),
      ERA: Number(ts.ERA), WHIP: Number(ts.WHIP),
    }));

    // Compute real roto standings with proper tie-handling
    const standingsRows = computeStandingsFromStats(teamStatRows);
    standings = standingsRows.map(s => ({
      teamName: s.teamName, totalScore: s.points, rank: s.rank,
    }));

    // Category rankings (derive from standings rows)
    if (allTeamStats.length > 0) {
      const cats = [
        { key: "R", field: "R", asc: false },
        { key: "HR", field: "HR", asc: false },
        { key: "RBI", field: "RBI", asc: false },
        { key: "SB", field: "SB", asc: false },
        { key: "AVG", field: "AVG", asc: false },
        { key: "W", field: "W", asc: false },
        { key: "SV", field: "S", asc: false },
        { key: "K", field: "K", asc: false },
        { key: "ERA", field: "ERA", asc: true },
        { key: "WHIP", field: "WHIP", asc: true },
      ];
      categoryRankings = cats.map(cat => {
        const sorted = [...allTeamStats].sort((a, b) => {
          const aVal = (a as any)[cat.field] ?? 0;
          const bVal = (b as any)[cat.field] ?? 0;
          return cat.asc ? aVal - bVal : bVal - aVal;
        });
        const rank = sorted.findIndex(s => s.teamId === teamId) + 1;
        const value = (teamSeasonStats as any)[cat.field] ?? 0;
        return { category: cat.key, rank, value: Math.round(value * 1000) / 1000 };
      });
    }
  } else {
    const allTeams = await prisma.team.findMany({ where: { leagueId }, select: { name: true } });
    standings = allTeams.map((t, i) => ({ teamName: t.name, rank: i + 1, totalScore: 0 }));
  }

  // Recent transactions
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

  // League type
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { rules: true } });
  const leagueType = (league?.rules as any)?.leagueType ?? "NL";

  const generatePromise = (async () => {
    const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
    return aiAnalysisService.generateWeeklyInsights({
      team: { id: team.id, name: team.name, budget: team.budget },
      roster: roster.map(r => {
        const ps = playerStatsMap.get(r.player.id);
        const isPitcher = ["P", "SP", "RP", "CL"].includes(r.player.posPrimary.toUpperCase());
        return {
          playerName: r.player.name,
          position: r.player.posPrimary,
          mlbTeam: r.player.mlbTeam || "",
          price: r.price,
          projectedValue: lookupAuctionValue(r.player.name)?.value ?? null,
          projectedStats: lookupAuctionValue(r.player.name)?.stats ?? null,
          // Actual period stats (so AI doesn't hallucinate)
          periodStats: ps ? (isPitcher
            ? { W: ps.W, SV: ps.SV, K: ps.K, IP: ps.IP, ER: ps.ER, BB_H: ps.BB_H }
            : { AB: ps.AB, H: ps.H, R: ps.R, HR: ps.HR, RBI: ps.RBI, SB: ps.SB }
          ) : null,
        };
      }),
      standings,
      categoryRankings,
      recentTransactions: transactions,
      leagueType,
      hasActualStats,
    });
  })();
  insightsInFlight.set(inflightKey, generatePromise.then(r => r.success ? r.result : null));

  try {
    const result = await generatePromise;

    if (!result.success) {
      logger.warn({ error: result.error, leagueId, teamId }, "Weekly insights failed");
      return res.status(503).json({ error: "Weekly insights are temporarily unavailable" });
    }

    // Persist to DB for the week
    await prisma.aiInsight.create({
      data: { type: "weekly", leagueId, teamId, weekKey, data: result.result as any },
    }).catch(err => {
      // Unique constraint violation = already created by concurrent request, safe to ignore
      if (!(err as any)?.code?.includes("P2002")) {
        logger.error({ error: String(err) }, "Failed to persist weekly insight");
      }
    });

    const enriched = { ...result.result, generatedAt: new Date().toISOString(), weekKey };
    // Evict expired + enforce max size
    if (insightsCache.size >= INSIGHTS_CACHE_MAX) {
      const now = Date.now();
      for (const [k, v] of insightsCache) { if (v.expiresAt < now) insightsCache.delete(k); }
      if (insightsCache.size >= INSIGHTS_CACHE_MAX) {
        const firstKey = insightsCache.keys().next().value;
        if (firstKey !== undefined) insightsCache.delete(firstKey);
      }
    }
    insightsCache.set(cacheKey, { data: enriched, expiresAt: Date.now() + INSIGHTS_CACHE_TTL });
    res.json(enriched);
  } finally {
    insightsInFlight.delete(inflightKey);
  }
}));

// GET /api/teams/ai-insights/history?leagueId=X&teamId=Y&limit=8
router.get("/ai-insights/history", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);
  const limit = Math.min(Number(req.query.limit) || 8, 20);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId)) {
    return res.status(400).json({ error: "Missing leagueId or teamId" });
  }

  const insights = await prisma.aiInsight.findMany({
    where: { type: "weekly", leagueId, teamId },
    orderBy: { weekKey: "desc" },
    take: limit,
  });

  const insightDataSchema = z.object({
    insights: z.array(z.object({ category: z.string(), title: z.string(), detail: z.string(), priority: z.string().optional() })),
    overallGrade: z.string(),
    mode: z.string().optional(),
  }).passthrough();

  const weeks = insights.map(row => {
    const parsed = insightDataSchema.safeParse(row.data);
    const data = parsed.success ? parsed.data : { insights: [], overallGrade: "?" };
    return { weekKey: row.weekKey, generatedAt: row.createdAt.toISOString(), ...data };
  });

  res.json({ weeks });
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

// GET /api/teams/:id/period-roster?periodId=X
// Returns all roster entries that overlapped with the given period (including traded/dropped players)
router.get("/:id/period-roster", requireAuth, asyncHandler(async (req, res) => {
  const teamId = Number(req.params.id);
  const periodId = Number(req.query.periodId);
  if (Number.isNaN(teamId) || Number.isNaN(periodId)) {
    return res.status(400).json({ error: "Invalid team or period id" });
  }

  // Verify league membership (admins bypass)
  if (!req.user!.isAdmin) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
    if (!team) return res.status(404).json({ error: "Team not found" });
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user!.id } },
    });
    if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) return res.status(404).json({ error: "Period not found" });

  // All roster entries that overlapped with this period
  const rosters = await prisma.roster.findMany({
    where: {
      teamId,
      acquiredAt: { lt: period.endDate },
      OR: [
        { releasedAt: null },
        { releasedAt: { gt: period.startDate } },
      ],
    },
    include: { player: true },
    orderBy: { acquiredAt: "asc" },
  });

  // Fetch period stats for these players
  const playerIds = rosters.map(r => r.playerId);
  const periodStats = await prisma.playerStatsPeriod.findMany({
    where: { periodId, playerId: { in: playerIds } },
  });
  const statsMap = new Map(periodStats.map(s => [s.playerId, s]));

  const result = rosters.map(r => ({
    id: r.id,
    playerId: r.playerId,
    mlbId: r.player.mlbId,
    name: r.player.name,
    posPrimary: r.player.posPrimary,
    posList: r.player.posList,
    mlbTeam: r.player.mlbTeam,
    acquiredAt: r.acquiredAt,
    releasedAt: r.releasedAt,
    source: r.source,
    price: r.price,
    assignedPosition: r.assignedPosition,
    isActive: r.releasedAt === null,
    periodStats: statsMap.get(r.playerId) ?? null,
  }));

  res.json({ period: { id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate }, roster: result });
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

// POST /api/teams/ai-insights/generate-all?leagueId=X
// Admin endpoint: batch-generate weekly insights for ALL teams in a league
router.post("/ai-insights/generate-all", requireAuth, asyncHandler(async (req, res) => {
  if (!(req.user as any)?.isAdmin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const leagueId = Number(req.query.leagueId || req.body?.leagueId);
  if (!Number.isFinite(leagueId)) {
    return res.status(400).json({ error: "Missing leagueId" });
  }

  // Optional weekOverride (admin-only, validated format: YYYY-WNN)
  const weekOverrideRaw = req.query.weekOverride as string | undefined;
  const weekOverride = weekOverrideRaw && /^\d{4}-W\d{2}$/.test(weekOverrideRaw) ? weekOverrideRaw : undefined;
  if (weekOverrideRaw && !weekOverride) {
    return res.status(400).json({ error: "Invalid weekOverride format (expected YYYY-WNN)" });
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true },
  });

  const weekKey = weekOverride || getWeekKey();
  const results: { teamId: number; teamName: string; status: string }[] = [];

  for (const team of teams) {
    // Check if already generated this week
    const existing = await prisma.aiInsight.findUnique({
      where: { type_leagueId_teamId_weekKey: { type: "weekly", leagueId, teamId: team.id, weekKey } },
    });

    if (existing) {
      results.push({ teamId: team.id, teamName: team.name, status: "already_exists" });
      continue;
    }

    // Trigger generation by calling the same endpoint internally
    try {
      // Use a direct fetch to the insights endpoint to reuse the existing generation logic
      const url = `http://localhost:${process.env.PORT || 4010}/api/teams/ai-insights?leagueId=${leagueId}&teamId=${team.id}${weekOverride ? `&weekOverride=${weekOverride}` : ""}`;
      const token = req.headers.authorization;
      const resp = await fetch(url, { headers: { Authorization: token || "" } });
      if (resp.ok) {
        results.push({ teamId: team.id, teamName: team.name, status: "generated" });
      } else {
        results.push({ teamId: team.id, teamName: team.name, status: `error_${resp.status}` });
      }
    } catch (err: unknown) {
      results.push({ teamId: team.id, teamName: team.name, status: "error" });
    }

    // Rate limit: 2 seconds between AI calls to avoid overwhelming the LLM
    await new Promise(r => setTimeout(r, 2000));
  }

  res.json({ weekKey, results });
}));

export const teamsRouter = router;
export default teamsRouter;


import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireTeamOwner, requireCommissionerOrAdmin, isTeamOwner, getOwnedTeamIds } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { assertPlayerAvailable } from "../../lib/rosterGuard.js";

export const waiverClaimSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive().optional(),
  bidAmount: z.number().int().nonnegative(),
  priority: z.number().int().positive().optional(),
});

const router = Router();

// GET /api/waivers - List pending claims scoped to user's teams (admins see all)
// Query param: teamId (optional)
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const where: Prisma.WaiverClaimWhereInput = { status: "PENDING" };

  if (req.user!.isAdmin) {
    // Admins can see all, optionally filtered by teamId
    if (teamId) where.teamId = teamId;
  } else if (teamId) {
    // Non-admin with teamId: verify ownership first
    const owns = await isTeamOwner(teamId, req.user!.id);
    if (!owns) return res.status(403).json({ error: "You do not own this team" });
    where.teamId = teamId;
  } else {
    // No teamId: scope to user's own teams only
    const teamIds = await getOwnedTeamIds(req.user!.id);
    where.teamId = { in: teamIds };
  }

  const claims = await prisma.waiverClaim.findMany({
    where,
    include: { player: true, dropPlayer: true },
    orderBy: [{ bidAmount: "desc" }, { priority: "asc" }],
  });

  res.json({ claims });
}));

// POST /api/waivers - Submit a claim
router.post("/", requireAuth, validateBody(waiverClaimSchema), requireSeasonStatus(["IN_SEASON"], "body.teamId"), requireTeamOwner("teamId"), asyncHandler(async (req, res) => {
  const { teamId, playerId, dropPlayerId, bidAmount, priority } = req.body;

  const claim = await prisma.waiverClaim.create({
    data: {
      teamId,
      playerId,
      dropPlayerId,
      bidAmount,
      priority: priority || 1,
      status: "PENDING",
    },
    include: { player: true },
  });

  res.json(claim);
}));

// DELETE /api/waivers/:id - Cancel claim (soft-cancel)
router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const claim = await prisma.waiverClaim.findUnique({
    where: { id },
    include: { team: { select: { leagueId: true } } },
  });
  if (!claim) return res.status(404).json({ error: "Claim not found" });

  // Only PENDING claims can be cancelled
  if (claim.status !== "PENDING") {
    return res.status(400).json({ error: "Only pending claims can be cancelled" });
  }

  // Verify ownership, commissioner of league, or admin
  if (!req.user!.isAdmin) {
    const owns = await isTeamOwner(claim.teamId, req.user!.id);
    if (!owns) {
      // Check if commissioner of the league
      const membership = await prisma.leagueMembership.findUnique({
        where: { leagueId_userId: { leagueId: claim.team.leagueId, userId: req.user!.id } },
      });
      if (membership?.role !== "COMMISSIONER") {
        return res.status(403).json({ error: "You do not own this team" });
      }
    }
  }

  // Soft-cancel instead of hard delete
  await prisma.waiverClaim.update({
    where: { id },
    data: { status: "CANCELLED", processedAt: new Date() },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "WAIVER_CANCEL",
    resourceType: "WaiverClaim",
    resourceId: String(id),
    metadata: { teamId: claim.teamId, playerId: claim.playerId, leagueId: claim.team.leagueId },
  });

  res.json({ success: true });
}));

// POST /api/waivers/process/:leagueId - Execute FAAB (Commissioner or Admin)
router.post("/process/:leagueId", requireAuth, requireCommissionerOrAdmin("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);

  // 1. Fetch pending claims for this league only, sorted by Bid DESC, Priority ASC
  const claims = await prisma.waiverClaim.findMany({
    where: { status: "PENDING", team: { leagueId } },
    include: { player: true, team: true },
    orderBy: [
      { bidAmount: "desc" },
      { priority: "asc" }
    ],
  });

  const logs: string[] = [];
  const processedPlayerIds = new Set<number>(); // Players added
  const teamDropMap = new Map<number, Set<number>>(); // teamId -> Set<droppedPlayerId>

  await prisma.$transaction(async (tx) => {
    for (const claim of claims) {
      // Check if player already taken in this batch
      if (processedPlayerIds.has(claim.playerId)) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "FAILED_OUTBID", processedAt: new Date() },
        });
        continue;
      }

      // Check budget
      const currentTeam = await tx.team.findUnique({ where: { id: claim.teamId } });
      if (!currentTeam || currentTeam.budget < claim.bidAmount) {
         await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "FAILED_INVALID", processedAt: new Date() },
        });
        logs.push(`Claim ${claim.id} failed: Insufficient budget.`);
        continue;
      }

      // Check drop player availability (if conditional)
      if (claim.dropPlayerId) {
        const teamDrops = teamDropMap.get(claim.teamId) || new Set();
        if (teamDrops.has(claim.dropPlayerId)) {
          await tx.waiverClaim.update({
            where: { id: claim.id },
            data: { status: "FAILED_INVALID", processedAt: new Date() },
          });
           logs.push(`Claim ${claim.id} failed: Drop player ${claim.dropPlayerId} already processed.`);
           continue;
        }
      }

      // Execute Success
      processedPlayerIds.add(claim.playerId);

      // Update Budget
      await tx.team.update({
        where: { id: claim.teamId },
        data: { budget: { decrement: claim.bidAmount } },
      });

      // Guard: ensure player isn't already on another team in this league
      await assertPlayerAvailable(tx, claim.playerId, claim.team.leagueId);

      // Add Player to Roster
      await tx.roster.create({
        data: {
          teamId: claim.teamId,
          playerId: claim.playerId,
          source: "WAIVER",
          price: claim.bidAmount,
          acquiredAt: new Date(),
        },
      });

      // Drop Player if needed
      if (claim.dropPlayerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: claim.teamId, playerId: claim.dropPlayerId, releasedAt: null },
        });
        if (rosterEntry) {
          await tx.roster.update({
            where: { id: rosterEntry.id },
            data: { releasedAt: new Date(), source: "WAIVER_DROP" },
          });

          if (!teamDropMap.has(claim.teamId)) teamDropMap.set(claim.teamId, new Set());
          teamDropMap.get(claim.teamId)!.add(claim.dropPlayerId);
        }
      }

      // Update Claim
      await tx.waiverClaim.update({
        where: { id: claim.id },
        data: { status: "SUCCESS", processedAt: new Date() },
      });

      logs.push(`Claim ${claim.id} SUCCESS: Team ${claim.teamId} gets Player ${claim.playerId} for $${claim.bidAmount}`);
    }
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "WAIVER_PROCESS",
    resourceType: "WaiverClaim",
    metadata: { claimCount: claims.length, successCount: logs.filter(l => l.includes("SUCCESS")).length },
  });

  res.json({ success: true, logs });
}));

// ─── AI Waiver Bid Advice ───────────────────────────────────────────────────

// Cache: keyed by leagueId:teamId:playerId
const waiverAdviceCache = new Map<string, { suggestedBid: number; confidence: string; reasoning: string }>();

// GET /api/waivers/ai-advice?leagueId=X&teamId=Y&playerId=Z
router.get("/ai-advice", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = Number(req.query.teamId);
  const playerId = Number(req.query.playerId);

  if (!Number.isFinite(leagueId) || !Number.isFinite(teamId) || !Number.isFinite(playerId)) {
    return res.status(400).json({ error: "Missing leagueId, teamId, or playerId" });
  }

  // Check cache
  const cacheKey = `${leagueId}:${teamId}:${playerId}`;
  const cached = waiverAdviceCache.get(cacheKey);
  if (cached) return res.json(cached);

  // Verify team ownership (or admin)
  if (!req.user!.isAdmin) {
    const owns = await isTeamOwner(teamId, req.user!.id);
    if (!owns) return res.status(403).json({ error: "You do not own this team" });
  }

  // Fetch team with roster
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.leagueId !== leagueId) {
    return res.status(404).json({ error: "Team not found" });
  }

  // Fetch the target player
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return res.status(404).json({ error: "Player not found" });

  // Fetch current roster
  const roster = await prisma.roster.findMany({
    where: { teamId, releasedAt: null },
    include: { player: { select: { name: true, posPrimary: true } } },
  });

  // Get league team count
  const teamCount = await prisma.team.count({ where: { leagueId } });

  // Fetch league season
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.adviseWaiverBid(
    {
      name: player.name,
      position: player.posPrimary,
      mlbTeam: player.mlbTeam ?? 'FA',
      statsSummary: `${player.posPrimary}, ${player.mlbTeam ?? 'FA'}`,
    },
    roster.map(r => ({
      playerName: r.player.name,
      position: r.player.posPrimary,
      price: r.price,
    })),
    team.budget,
    { teamCount, season: league?.season ?? new Date().getFullYear() },
  );

  if (!result.success) {
    logger.warn({ error: result.error, leagueId, teamId, playerId }, "Waiver advice failed");
    return res.status(503).json({ error: "Waiver advice is temporarily unavailable" });
  }

  waiverAdviceCache.set(cacheKey, result.result!);
  res.json(result.result);
}));

export const waiversRouter = router;
export default waiversRouter;

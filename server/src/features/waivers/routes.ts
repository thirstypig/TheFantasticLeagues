
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
import { assertPlayerAvailable, assertRosterLimit } from "../../lib/rosterGuard.js";
import { computeTeamStatsFromDb, computeStandingsFromStats } from "../standings/services/standingsService.js";
import { nextDayEffective } from "../../lib/utils.js";
import { sendWaiverResultEmail, notifyTeamOwners, getTeamOwnerEmails } from "../../lib/emailService.js";
import { sendPushToUser } from "../../lib/pushService.js";
import { postSystemChatMessage } from "../../lib/chatUtils.js";

/**
 * Auto-generate AI analysis after a waiver claim is processed.
 * Persists the analysis on the WaiverClaim record via proper AIAnalysisService method.
 */
async function generateWaiverAnalysis(claimId: number, leagueId: number): Promise<void> {
  const claim = await prisma.waiverClaim.findUnique({
    where: { id: claimId },
    include: {
      player: { select: { name: true, posPrimary: true, mlbTeam: true } },
      dropPlayer: { select: { name: true, posPrimary: true } },
      team: { select: { id: true, name: true, budget: true } },
    },
  });
  if (!claim || claim.status !== "SUCCESS") return;

  const roster = await prisma.roster.findMany({
    where: { teamId: claim.teamId, releasedAt: null },
    include: { player: { select: { name: true, posPrimary: true } } },
  });

  // Load projected value from auction values (with diacritics fallback)
  const { lookupAuctionValue } = await import("../../lib/auctionValues.js");
  const projectedValue = lookupAuctionValue(claim.player.name)?.value ?? null;

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { rules: true } });
  const leagueType = (league?.rules as any)?.leagueType ?? "NL";

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.analyzeWaiverClaim({
    teamName: claim.team.name,
    teamBudgetAfter: claim.team.budget,
    playerName: claim.player.name,
    playerPosition: claim.player.posPrimary,
    playerMlbTeam: claim.player.mlbTeam || "",
    bidAmount: claim.bidAmount,
    dropPlayerName: claim.dropPlayer?.name ?? null,
    dropPlayerPosition: claim.dropPlayer?.posPrimary ?? null,
    projectedValue,
    rosterSample: roster.slice(0, 15).map(r => `  ${r.player.name} (${r.player.posPrimary})`),
    leagueType,
  });

  if (result.success && result.result) {
    await prisma.waiverClaim.update({
      where: { id: claimId },
      data: { aiAnalysis: result.result as any },
    });
    logger.info({ claimId }, "Post-waiver AI analysis persisted");
  }
}

export const waiverClaimSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive().optional(),
  bidAmount: z.number().int().nonnegative(),
  priority: z.number().int().positive().optional(),
  // Conditional claim fields
  conditionType: z.enum(["ONLY_IF_UNAVAILABLE", "ONLY_IF_AVAILABLE", "PAIR_WITH"]).optional(),
  conditionPlayerId: z.number().int().positive().optional(),
  conditionNote: z.string().max(200).optional(),
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
    include: {
      player: true,
      dropPlayer: true,
      conditionPlayer: { select: { id: true, name: true, posPrimary: true } },
    },
    orderBy: [{ bidAmount: "desc" }, { priority: "asc" }],
  });

  res.json({ claims });
}));

// POST /api/waivers - Submit a claim
router.post("/", requireAuth, validateBody(waiverClaimSchema), requireSeasonStatus(["IN_SEASON"], "body.teamId"), requireTeamOwner("teamId"), asyncHandler(async (req, res) => {
  const { teamId, playerId, dropPlayerId, bidAmount, priority, conditionType, conditionPlayerId, conditionNote } = req.body;

  // Validate conditionPlayerId exists if provided
  if (conditionPlayerId) {
    const condPlayer = await prisma.player.findUnique({ where: { id: conditionPlayerId }, select: { id: true } });
    if (!condPlayer) {
      return res.status(400).json({ error: "Condition player not found" });
    }
  }

  // conditionType requires conditionPlayerId
  if (conditionType && !conditionPlayerId) {
    return res.status(400).json({ error: "conditionPlayerId is required when conditionType is set" });
  }

  const claim = await prisma.waiverClaim.create({
    data: {
      teamId,
      playerId,
      dropPlayerId,
      bidAmount,
      priority: priority || 1,
      status: "PENDING",
      conditionType: conditionType || null,
      conditionPlayerId: conditionPlayerId || null,
      conditionNote: conditionNote || null,
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

  // 1. Fetch pending claims for this league only
  const claims = await prisma.waiverClaim.findMany({
    where: { status: "PENDING", team: { leagueId } },
    include: { player: true, team: true },
  });

  // 2. Compute inverse-standings waiver priority (worst team = priority 1)
  // Use the most recently completed period's roto standings. Lowest points = first pick.
  // Fallback: if no completed period, use season-wide stats.
  const waiverRank = new Map<number, number>();

  // Check for commissioner-set overrides first
  const teamsWithOverrides = await prisma.team.findMany({
    where: { leagueId, waiverPriorityOverride: { not: null } },
    select: { id: true, waiverPriorityOverride: true },
  });
  const overrideMap = new Map(teamsWithOverrides.map(t => [t.id, t.waiverPriorityOverride!]));

  // Compute standings-based ranks from most recent completed period
  const lastPeriod = await prisma.period.findFirst({
    where: { season: { leagueId }, status: "completed" },
    orderBy: { endDate: "desc" },
  });

  if (lastPeriod) {
    // Use proper roto standings from the most recent completed period
    const teamStats = await computeTeamStatsFromDb(leagueId, lastPeriod.id);
    const standings = computeStandingsFromStats(teamStats);
    // Reverse: worst team (highest rank number / lowest points) gets priority 1
    const sorted = [...standings].sort((a, b) => a.points - b.points);
    sorted.forEach((s, idx) => {
      // Override takes precedence if set
      waiverRank.set(s.teamId, overrideMap.get(s.teamId) ?? (idx + 1));
    });
  } else {
    // Fallback: season-wide counting stats (Period 1 or no completed periods)
    const seasonStats = await prisma.teamStatsSeason.findMany({
      where: { team: { leagueId } },
      select: { teamId: true, R: true, HR: true, RBI: true, SB: true, W: true, S: true, K: true },
    });
    const strengthMap = new Map(seasonStats.map(s => [s.teamId, s.R + s.HR + s.RBI + s.SB + s.W + s.S + s.K]));
    const teamsByStrength = [...strengthMap.entries()].sort((a, b) => a[1] - b[1]);
    teamsByStrength.forEach(([teamId], idx) => {
      waiverRank.set(teamId, overrideMap.get(teamId) ?? (idx + 1));
    });
  }

  // Sort: bid DESC, then waiver priority ASC (inverse standings), then submission time ASC
  claims.sort((a, b) => {
    const bidDiff = b.bidAmount - a.bidAmount;
    if (bidDiff !== 0) return bidDiff;
    const rankA = waiverRank.get(a.teamId) ?? 99;
    const rankB = waiverRank.get(b.teamId) ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const logs: string[] = [];
  const processedPlayerIds = new Set<number>(); // Players added
  const processedResults = new Map<number, number>(); // playerId → winning teamId
  const teamDropMap = new Map<number, Set<number>>(); // teamId -> Set<droppedPlayerId>

  // Evaluate whether a conditional claim should proceed
  function evaluateCondition(claim: typeof claims[0]): boolean {
    if (!claim.conditionType || !claim.conditionPlayerId) return true; // no condition

    const conditionPlayerClaimed = processedResults.has(claim.conditionPlayerId);

    switch (claim.conditionType) {
      case "ONLY_IF_UNAVAILABLE":
        // Claim only if the condition player was already claimed by someone else
        return conditionPlayerClaimed;
      case "ONLY_IF_AVAILABLE":
        // Claim only if the condition player is still available (not yet claimed)
        return !conditionPlayerClaimed;
      case "PAIR_WITH":
        // PAIR_WITH: only proceed if the paired claim was won by the SAME team
        return processedResults.get(claim.conditionPlayerId) === claim.teamId;
      default:
        return true;
    }
  }

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

      // Evaluate conditional claim
      if (!evaluateCondition(claim)) {
        await tx.waiverClaim.update({
          where: { id: claim.id },
          data: { status: "FAILED_CONDITION", processedAt: new Date() },
        });
        logs.push(`Claim ${claim.id} FAILED_CONDITION: condition not met for player ${claim.conditionPlayerId}`);
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
      processedResults.set(claim.playerId, claim.teamId);

      // Update Budget
      await tx.team.update({
        where: { id: claim.teamId },
        data: { budget: { decrement: claim.bidAmount } },
      });

      // Guard: ensure player isn't already on another team in this league
      await assertPlayerAvailable(tx, claim.playerId, claim.team.leagueId);

      // Guard: ensure roster limit not exceeded
      await assertRosterLimit(tx, claim.teamId, !!claim.dropPlayerId);

      // Add Player to Roster (auto-assign position from primary)
      const addedPlayer = await tx.player.findUnique({ where: { id: claim.playerId }, select: { posPrimary: true } });
      const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
      const waiverPos = (addedPlayer?.posPrimary ?? "UT").toUpperCase();
      await tx.roster.create({
        data: {
          teamId: claim.teamId,
          playerId: claim.playerId,
          source: "WAIVER",
          price: claim.bidAmount,
          acquiredAt: nextDayEffective(),
          assignedPosition: PITCHER_POS.has(waiverPos) ? "P" : waiverPos,
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
            data: { releasedAt: nextDayEffective(), source: "WAIVER_DROP" },
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

    // Clear waiver priority overrides inside transaction (one-time use per run)
    if (teamsWithOverrides.length > 0) {
      await tx.team.updateMany({
        where: { leagueId, waiverPriorityOverride: { not: null } },
        data: { waiverPriorityOverride: null },
      });
    }
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "WAIVER_PROCESS",
    resourceType: "WaiverClaim",
    metadata: { claimCount: claims.length, successCount: logs.filter(l => l.includes("SUCCESS")).length },
  });

  // Fire-and-forget: generate AI analysis for each successful claim
  const successClaims = claims.filter(c => processedPlayerIds.has(c.playerId));
  for (const claim of successClaims) {
    generateWaiverAnalysis(claim.id, leagueId).catch(err =>
      logger.warn({ error: String(err), claimId: claim.id }, "Post-waiver AI analysis failed (non-blocking)")
    );
  }

  // Fire-and-forget: email waiver results to team owners
  const waiverLeague = await prisma.league.findUnique({ where: { id: leagueId }, select: { name: true } });
  const allProcessedClaims = await prisma.waiverClaim.findMany({
    where: { id: { in: claims.map(c => c.id) } },
    include: { player: { select: { name: true, posPrimary: true } } },
  });
  for (const claim of allProcessedClaims) {
    const isSuccess = claim.status === "SUCCESS";
    notifyTeamOwners([claim.teamId], req.user!.id, (owner) =>
      sendWaiverResultEmail({
        to: owner.email, recipientName: owner.name,
        playerName: claim.player?.name ?? "Unknown", position: claim.player?.posPrimary ?? "",
        success: isSuccess, bidAmount: Number(claim.bidAmount),
        leagueName: waiverLeague?.name ?? "", leagueId,
      }),
    ).catch(err => logger.warn({ err }, "Email notification failed"));

    // Push notification to team owners (fire-and-forget)
    getTeamOwnerEmails(claim.teamId).then(owners => {
      for (const owner of owners) {
        if (owner.userId === req.user!.id) continue;
        const pName = claim.player?.name ?? "a player";
        sendPushToUser(owner.userId, {
          title: isSuccess ? "Waiver Claim Won" : "Waiver Claim Failed",
          body: isSuccess
            ? `You won ${pName} for $${claim.bidAmount}!`
            : `Your bid of $${claim.bidAmount} for ${pName} was not successful`,
          tag: `waiver-${claim.id}`,
          url: `/activity?leagueId=${leagueId}`,
        }, "waiverResult").catch(err => logger.warn({ err }, "Push notification failed"));
      }
    }).catch(err => logger.warn({ err }, "Push owner lookup failed"));
  }

  // Fire-and-forget: post system messages to league chat for successful claims
  (async () => {
    try {
      for (const claim of successClaims) {
        const dropPlayer = claim.dropPlayerId
          ? await prisma.player.findUnique({ where: { id: claim.dropPlayerId }, select: { name: true } })
          : null;
        const addName = claim.player?.name ?? "Unknown";
        const teamName = claim.team?.name ?? "Unknown Team";
        const dropText = dropPlayer ? `, dropping ${dropPlayer.name}` : "";
        const text = `Waiver claim: ${teamName} adds ${addName} ($${claim.bidAmount})${dropText}`;
        await postSystemChatMessage(leagueId, req.user!.id, text, { activityType: "waiver", claimId: claim.id });
      }
    } catch (err) {
      logger.warn({ error: String(err), leagueId }, "Failed to post waiver chat messages");
    }
  })();

  res.json({ success: true, logs });
}));

// ─── AI Waiver Bid Advice ───────────────────────────────────────────────────

// Cache: keyed by leagueId:teamId:playerId
const waiverAdviceCache = new Map<string, { suggestedBid: number; confidence: string; reasoning: string }>();
const WAIVER_CACHE_MAX = 500;

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

  if (waiverAdviceCache.size >= WAIVER_CACHE_MAX) {
    const oldest = waiverAdviceCache.keys().next().value;
    if (oldest) waiverAdviceCache.delete(oldest);
  }
  waiverAdviceCache.set(cacheKey, result.result!);
  res.json(result.result);
}));

export const waiversRouter = router;
export default waiversRouter;

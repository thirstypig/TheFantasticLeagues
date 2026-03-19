// server/src/routes/transactions.ts
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { assertPlayerAvailable } from "../../lib/rosterGuard.js";

const dropSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
});

const claimSchema = z.object({
  leagueId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive().optional(),
  mlbId: z.union([z.number(), z.string()]).optional(),
  dropPlayerId: z.number().int().positive().optional(),
}).refine((d) => d.playerId || d.mlbId, { message: "playerId or mlbId required" });

const router = Router();

/**
 * GET /api/transactions
 * Requires leagueId query param + membership check
 */
router.get("/transactions", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  const teamId = req.query.teamId ? Number(req.query.teamId) : undefined;
  const skip = req.query.skip ? Number(req.query.skip) : 0;
  const take = req.query.take ? Number(req.query.take) : 50;

  const where: Prisma.TransactionEventWhereInput = { leagueId };
  if (teamId) where.teamId = teamId;

  const [total, transactions] = await Promise.all([
    prisma.transactionEvent.count({ where }),
    prisma.transactionEvent.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip,
      take,
      include: {
        team: { select: { name: true } },
        player: { select: { name: true } },
      },
    }),
  ]);

  return res.json({ transactions, total, skip, take });
}));

/**
 * POST /api/transactions/claim
 * Claims a player for a team. Commissioner-only per league rules.
 */
router.post("/transactions/claim", requireAuth, validateBody(claimSchema), asyncHandler(async (req, res) => {
  const { leagueId, teamId, dropPlayerId } = req.body;

  // Commissioner-only: verify user is commissioner of this league or site admin
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Add/Drop is commissioner-only" });
    }
  }
  let { playerId } = req.body;
  const { mlbId } = req.body;

  // 1. Resolve Player Identity (Lazy Create if needed)
  if (!playerId && mlbId) {
    const mlbIdNum = Number(mlbId);
    let player = await prisma.player.findFirst({ where: { mlbId: mlbIdNum }});

    if (!player) {
      return res.status(404).json({ error: `Player with MLB ID ${mlbId} not found in database.` });
    }
    playerId = player.id;
  }

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId or mlbId" });
  }

  // 2. Verify availability (active rosters only — releasedAt: null)
  const existingRoster = await prisma.roster.findFirst({
    where: { playerId, team: { leagueId }, releasedAt: null },
    include: { team: true }
  });

  if (existingRoster) {
    return res.status(400).json({ error: `Player is already on team: ${existingRoster.team.name}` });
  }

  // 3. Look up league season for transaction records
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  // 4. Perform Transaction (Atomic)
  await prisma.$transaction(async (tx) => {
    await assertPlayerAvailable(tx, playerId, leagueId);

    await tx.roster.create({
      data: { teamId, playerId, source: 'waiver_claim', acquiredAt: new Date() }
    });

    const player = await tx.player.findUnique({ where: { id: playerId } });
    const rowHash = `CLAIM-${crypto.randomUUID()}-${playerId}`;

    await tx.transactionEvent.create({
      data: {
        rowHash,
        leagueId,
        season,
        effDate: new Date(),
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Claimed ${player?.name}`,
        transactionType: 'ADD'
      }
    });

    if (dropPlayerId) {
      const dropRoster = await tx.roster.findFirst({
        where: { teamId, playerId: dropPlayerId }
      });

      if (dropRoster) {
        await tx.roster.delete({ where: { id: dropRoster.id } });

        const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
        await tx.transactionEvent.create({
          data: {
            rowHash: `DROP-${crypto.randomUUID()}-${dropPlayerId}`,
            leagueId,
            season,
            effDate: new Date(),
            submittedAt: new Date(),
            teamId,
            playerId: dropPlayerId,
            transactionRaw: `Dropped ${dropPlayer?.name}`,
            transactionType: 'DROP'
          }
        });
      }
    }
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_CLAIM",
    resourceType: "Transaction",
    metadata: { leagueId, teamId, playerId, dropPlayerId: dropPlayerId || null },
  });

  return res.json({ success: true, playerId });
}));

/**
 * POST /api/transactions/drop
 * Drops a player from a team roster. Commissioner-only.
 */
router.post("/transactions/drop", requireAuth, validateBody(dropSchema), asyncHandler(async (req, res) => {
  const { leagueId, teamId, playerId } = req.body;

  // Commissioner-only check
  if (!req.user!.isAdmin) {
    const membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId: req.user!.id } },
      select: { role: true },
    });
    if (!membership || membership.role !== "COMMISSIONER") {
      return res.status(403).json({ error: "Drop is commissioner-only" });
    }
  }

  // Verify player is on team roster
  const rosterEntry = await prisma.roster.findFirst({
    where: { teamId, playerId, releasedAt: null },
  });
  if (!rosterEntry) {
    return res.status(400).json({ error: "Player is not on this team's active roster" });
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { season: true } });
  const season = league?.season ?? new Date().getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.roster.delete({ where: { id: rosterEntry.id } });

    const player = await tx.player.findUnique({ where: { id: playerId } });
    await tx.transactionEvent.create({
      data: {
        rowHash: `DROP-${crypto.randomUUID()}-${playerId}`,
        leagueId,
        season,
        effDate: new Date(),
        submittedAt: new Date(),
        teamId,
        playerId,
        transactionRaw: `Dropped ${player?.name}`,
        transactionType: 'DROP'
      }
    });
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRANSACTION_DROP",
    resourceType: "Transaction",
    metadata: { leagueId, teamId, playerId },
  });

  return res.json({ success: true, playerId });
}));

export const transactionsRouter = router;
export default transactionsRouter;

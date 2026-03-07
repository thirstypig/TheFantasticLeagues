// server/src/routes/transactions.ts
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { DataService } from "../players/services/dataService.js";
import { requireAuth, requireTeamOwner, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";
import { writeAuditLog } from "../../lib/auditLog.js";

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
 * Claims a player for a team.
 */
router.post("/transactions/claim", requireAuth, validateBody(claimSchema), requireTeamOwner("teamId"), asyncHandler(async (req, res) => {
  const { leagueId, teamId, dropPlayerId } = req.body;
  let { playerId } = req.body;
  const { mlbId } = req.body;

  // 1. Resolve Player Identity (Lazy Create if needed)
  if (!playerId && mlbId) {
    const mlbIdNum = Number(mlbId);
    let player = await prisma.player.findFirst({ where: { mlbId: mlbIdNum }});

    if (!player) {
      const ds = DataService.getInstance();
      const seasonStats = ds.getSeasonStats();
      const playerRow = seasonStats.find(p => Number(p.mlb_id || p.mlbId) === mlbIdNum);

      if (playerRow) {
        const name = playerRow.player_name || playerRow.name || "Unknown";
        const positions = playerRow.positions || playerRow.pos || "UT";
        const posPrimary = positions.split(',')[0].trim();

        logger.info({ name, mlbId: mlbIdNum }, "Lazy creating player");
        player = await prisma.player.create({
          data: { mlbId: mlbIdNum, name, posPrimary, posList: positions }
        });
      } else {
        return res.status(404).json({ error: `Player with MLB ID ${mlbId} not found in database or stats.` });
      }
    }
    playerId = player.id;
  }

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId or mlbId" });
  }

  // 2. Verify availability
  const existingRoster = await prisma.roster.findFirst({
    where: { playerId, team: { leagueId } },
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

export const transactionsRouter = router;
export default transactionsRouter;

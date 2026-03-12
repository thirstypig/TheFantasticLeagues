
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireAdmin, requireTeamOwner, requireLeagueMember, isTeamOwner } from "../../middleware/auth.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { assertPlayerAvailable } from "../../lib/rosterGuard.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

async function isCommissionerOfLeague(userId: number, leagueId: number): Promise<boolean> {
  const m = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  return m?.role === "COMMISSIONER";
}

/**
 * Verify caller is admin, commissioner of the trade's league, or owns a counterparty team.
 * Returns an error response string if unauthorized, or null if authorized.
 */
async function assertCounterpartyAccess(
  user: { id: number; isAdmin: boolean },
  trade: { leagueId: number; proposerId: number; items: { recipientId: number }[] },
): Promise<string | null> {
  if (user.isAdmin) return null;

  const isCommish = await isCommissionerOfLeague(user.id, trade.leagueId);
  if (isCommish) return null;

  const counterpartyTeamIds = [...new Set(
    trade.items
      .map(i => i.recipientId)
      .filter(id => id !== trade.proposerId)
  )];
  const ownsCounterparty = await Promise.all(
    counterpartyTeamIds.map(tid => isTeamOwner(tid, user.id))
  );
  if (!ownsCounterparty.some(Boolean)) {
    return "You are not a counterparty to this trade";
  }
  return null;
}

export const tradeItemSchema = z.object({
  senderId: z.number().int().positive(),
  recipientId: z.number().int().positive(),
  assetType: z.enum(["PLAYER", "BUDGET", "PICK"]),
  playerId: z.number().int().positive().optional(),
  amount: z.number().nonnegative().optional(),
  pickRound: z.number().int().positive().optional(),
});

export const tradeProposalSchema = z.object({
  leagueId: z.number().int().positive(),
  proposerTeamId: z.number().int().positive(),
  items: z.array(tradeItemSchema).min(1),
});

const router = Router();

// POST /api/trades - Propose a new trade
router.post("/", requireAuth, validateBody(tradeProposalSchema), requireTeamOwner("proposerTeamId"), asyncHandler(async (req, res) => {
  const { leagueId, proposerTeamId, items } = req.body;

  // Verify proposerTeamId belongs to the specified league
  const proposerTeam = await prisma.team.findUnique({
    where: { id: proposerTeamId },
    select: { leagueId: true },
  });
  if (!proposerTeam || proposerTeam.leagueId !== leagueId) {
    return res.status(403).json({ error: "Team does not belong to this league" });
  }

  // Verify all involved teams belong to the same league
  const involvedTeamIds = [...new Set<number>(items.flatMap((i: any) => [i.senderId, i.recipientId]))];
  const teams = await prisma.team.findMany({
    where: { id: { in: involvedTeamIds } },
    select: { id: true, leagueId: true },
  });
  if (teams.length !== involvedTeamIds.length || teams.some(t => t.leagueId !== leagueId)) {
    return res.status(400).json({ error: "All teams must belong to the same league" });
  }

  const trade = await prisma.trade.create({
    data: {
      leagueId,
      proposerId: proposerTeamId,
      status: "PROPOSED",
      items: {
        create: items.map((item: any) => ({
          senderId: item.senderId,
          recipientId: item.recipientId,
          assetType: item.assetType,
          playerId: item.playerId,
          amount: item.amount,
          pickRound: item.pickRound,
        })),
      },
    },
    include: { items: true },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_PROPOSE",
    resourceType: "Trade",
    resourceId: trade.id,
    metadata: { leagueId, proposerTeamId, itemCount: trade.items.length },
  });

  res.json(trade);
}));

// GET /api/trades - List trades for a league
router.get("/", requireAuth, requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.query.leagueId);
  if (!leagueId) return res.status(400).json({ error: "Missing leagueId" });

  const trades = await prisma.trade.findMany({
    where: { leagueId },
    include: {
      items: { include: { player: true, sender: true, recipient: true } },
      proposer: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ trades });
}));

// POST /api/trades/:id/accept - Accept a trade
router.post("/:id/accept", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!trade) return res.status(404).json({ error: "Trade not found" });
  if (trade.status !== "PROPOSED") return res.status(400).json({ error: "Trade is not in PROPOSED status" });

  // Verify caller owns a counterparty team (not the proposer), or is commissioner/admin
  const acceptErr = await assertCounterpartyAccess(req.user!, trade);
  if (acceptErr) return res.status(403).json({ error: acceptErr });

  const updated = await prisma.trade.update({
    where: { id },
    data: { status: "ACCEPTED" },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_ACCEPT",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId },
  });

  res.json(updated);
}));

// POST /api/trades/:id/reject - Reject a trade
router.post("/:id/reject", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!trade) return res.status(404).json({ error: "Trade not found" });
  if (trade.status !== "PROPOSED") return res.status(400).json({ error: "Trade is not in PROPOSED status" });

  // Verify caller owns a counterparty team (not the proposer), or is commissioner/admin
  const rejectErr = await assertCounterpartyAccess(req.user!, trade);
  if (rejectErr) return res.status(403).json({ error: rejectErr });

  const updated = await prisma.trade.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_REJECT",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId },
  });

  res.json(updated);
}));

// POST /api/trades/:id/veto - Commissioner/Admin vetoes an accepted trade
router.post("/:id/veto", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return res.status(404).json({ error: "Trade not found" });
  if (trade.status !== "ACCEPTED" && trade.status !== "PROPOSED") {
    return res.status(400).json({ error: "Trade cannot be vetoed in its current status" });
  }

  if (!req.user!.isAdmin) {
    const isCommish = await isCommissionerOfLeague(req.user!.id, trade.leagueId);
    if (!isCommish) {
      return res.status(403).json({ error: "Only commissioner or admin can veto trades" });
    }
  }

  const updated = await prisma.trade.update({
    where: { id },
    data: { status: "VETOED" },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_VETO",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId },
  });

  res.json(updated);
}));

// POST /api/trades/:id/cancel - Proposer or Commissioner cancels a trade
router.post("/:id/cancel", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) return res.status(404).json({ error: "Trade not found" });
  if (trade.status !== "PROPOSED") {
    return res.status(400).json({ error: "Only proposed trades can be cancelled" });
  }

  // Allow proposer, commissioner, or admin
  if (!req.user!.isAdmin) {
    const isCommish = await isCommissionerOfLeague(req.user!.id, trade.leagueId);
    const isProposer = await isTeamOwner(trade.proposerId, req.user!.id);
    if (!isCommish && !isProposer) {
      return res.status(403).json({ error: "Only the proposer, commissioner, or admin can cancel" });
    }
  }

  const updated = await prisma.trade.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_CANCEL",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId },
  });

  res.json(updated);
}));

// POST /api/trades/:id/process - Execute (Commissioner/Admin)
router.post("/:id/process", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  // 1. Verify status is ACCEPTED
  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!trade || trade.status !== "ACCEPTED") {
    return res.status(400).json({ error: "Trade not found or not accepted" });
  }

  // 2. Verify caller is admin or commissioner of this league
  if (!req.user!.isAdmin) {
    const isCommish = await isCommissionerOfLeague(req.user!.id, trade.leagueId);
    if (!isCommish) {
      return res.status(403).json({ error: "Only commissioner or admin can process trades" });
    }
  }

  // 2. Transact
  await prisma.$transaction(async (tx) => {
    for (const item of trade.items) {
      if (item.assetType === "PLAYER" && item.playerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
        });

        if (rosterEntry) {
           await tx.roster.update({
             where: { id: rosterEntry.id },
             data: { releasedAt: new Date(), source: "TRADE_OUT" },
           });

           await assertPlayerAvailable(tx, item.playerId, trade.leagueId);

           await tx.roster.create({
             data: {
               teamId: item.recipientId,
               playerId: item.playerId,
               source: "TRADE_IN",
               acquiredAt: new Date(),
               price: rosterEntry.price,
               assignedPosition: null,
             },
           });
        }
      } else if (item.assetType === "BUDGET") {
        await tx.team.update({
          where: { id: item.senderId },
          data: { budget: { decrement: item.amount || 0 } },
        });
        await tx.team.update({
          where: { id: item.recipientId },
          data: { budget: { increment: item.amount || 0 } },
        });
      }
    }

    await tx.trade.update({
      where: { id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_PROCESS",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId, itemCount: trade.items.length },
  });

  res.json({ success: true });
}));

export const tradesRouter = router;
export default tradesRouter;

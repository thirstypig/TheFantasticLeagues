
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireAdmin, requireTeamOwner, requireLeagueMember, isTeamOwner } from "../../middleware/auth.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { assertPlayerAvailable, assertRosterLimit } from "../../lib/rosterGuard.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireSeasonStatus } from "../../middleware/seasonGuard.js";
import { logger } from "../../lib/logger.js";
import { nextDayEffective } from "../../lib/utils.js";
import { sendTradeProposedEmail, sendTradeProcessedEmail, sendTradeVetoedEmail, notifyTeamOwners } from "../../lib/emailService.js";
import { sendPushToTeamOwners, sendPushToLeague } from "../../lib/pushService.js";
import { postSystemChatMessage } from "../../lib/chatUtils.js";

/**
 * Auto-generate AI analysis after a trade is processed.
 * Persists the analysis on the Trade record for permanent display.
 */
async function generateTradeAnalysis(tradeId: number, leagueId: number): Promise<void> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      items: { include: { player: { select: { name: true, posPrimary: true } }, sender: { select: { id: true, name: true, budget: true } }, recipient: { select: { id: true, name: true, budget: true } } } },
    },
  });
  if (!trade) return;

  // Identify teams involved
  const teamIds = [...new Set([...trade.items.map(i => i.senderId), ...trade.items.map(i => i.recipientId)])];
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    include: {
      rosters: { where: { releasedAt: null }, include: { player: { select: { name: true, posPrimary: true } } } },
    },
  });

  const itemDescriptions = trade.items.map(item => {
    if (item.assetType === "BUDGET") {
      return `$${item.amount} FAAB from ${item.sender.name} to ${item.recipient.name}`;
    }
    return `${item.player?.name ?? "Unknown"} (${item.player?.posPrimary ?? "?"}) from ${item.sender.name} to ${item.recipient.name}`;
  });

  const teamSummaries = teams.map(t => ({
    name: t.name,
    budget: t.budget,
    rosterSize: t.rosters.length,
    roster: t.rosters.slice(0, 10).map(r => `${r.player.name} (${r.player.posPrimary})`).join(", "),
  }));

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.analyzeTrade(
    trade.items.map(item => ({
      playerId: item.playerId ?? undefined,
      playerName: item.player?.name ?? "FAAB",
      fromTeamId: item.senderId,
      toTeamId: item.recipientId,
      type: item.assetType === "BUDGET" ? "budget" as const : "player" as const,
      amount: item.amount ?? undefined,
    })),
    teams.map(t => ({
      id: t.id,
      name: t.name,
      budget: t.budget,
      roster: t.rosters.map(r => ({ playerName: r.player.name, position: r.player.posPrimary, price: r.price })),
    })),
    leagueId,
  );

  if (result.success && result.result) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { aiAnalysis: result.result as any },
    });
    logger.info({ tradeId }, "Post-trade AI analysis persisted");
  }
}

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

  // Check if user owns a counterparty team (not the proposer)
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

  // Prevent proposer from accepting/rejecting their own trade
  // (edge case: user owns both proposer team and a counterparty team)
  const ownsProposer = await isTeamOwner(trade.proposerId, user.id);
  if (ownsProposer) {
    return "Proposer cannot accept or reject their own trade";
  }

  return null;
}

export const tradeItemSchema = z.object({
  senderId: z.number().int().positive(),
  recipientId: z.number().int().positive(),
  assetType: z.enum(["PLAYER", "BUDGET", "PICK", "FUTURE_BUDGET", "WAIVER_PRIORITY"]),
  playerId: z.number().int().positive().optional(),
  amount: z.number().nonnegative().optional(),
  pickRound: z.number().int().positive().optional(),
  season: z.number().int().min(2020).max(2100).optional(),
}).refine((item) => {
  if (item.assetType === "PLAYER") return !!item.playerId;
  if (item.assetType === "BUDGET") return item.amount != null && item.amount > 0;
  if (item.assetType === "FUTURE_BUDGET") return item.amount != null && item.amount > 0 && !!item.season;
  if (item.assetType === "PICK") return !!item.pickRound;
  return true; // WAIVER_PRIORITY has no required fields
}, { message: "Missing required fields for asset type" });

export const tradeProposalSchema = z.object({
  leagueId: z.number().int().positive(),
  proposerTeamId: z.number().int().positive(),
  items: z.array(tradeItemSchema).min(1),
});

const router = Router();

// POST /api/trades - Propose a new trade
router.post("/", requireAuth, validateBody(tradeProposalSchema), requireSeasonStatus(["IN_SEASON"]), requireTeamOwner("proposerTeamId"), asyncHandler(async (req, res) => {
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
          season: item.season,
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

  // Fire-and-forget: notify counterparty team owners
  {
    const counterpartyIds: number[] = [...new Set<number>(items.map((i: any) => Number(i.recipientId)).filter((id: number) => id !== proposerTeamId))];
    const pTeam = await prisma.team.findUnique({ where: { id: proposerTeamId }, select: { name: true } });
    const lg = await prisma.league.findUnique({ where: { id: leagueId }, select: { name: true } });
    notifyTeamOwners(counterpartyIds, req.user!.id, (owner) =>
      sendTradeProposedEmail({
        to: owner.email, recipientName: owner.name,
        proposerTeamName: pTeam?.name ?? "A team",
        leagueName: lg?.name ?? "", playersSummary: `${trade.items.length} assets involved`,
        leagueId,
      }),
    ).catch(err => logger.warn({ err }, "Email notification failed"));

    // Push notifications (fire-and-forget)
    for (const cId of counterpartyIds) {
      sendPushToTeamOwners(cId, {
        title: "Trade Proposal",
        body: `${pTeam?.name ?? "A team"} has proposed a trade in ${lg?.name ?? "your league"}`,
        tag: `trade-${trade.id}`,
        url: `/activity?leagueId=${leagueId}`,
      }, "tradeProposal", req.user!.id).catch(err => logger.warn({ err }, "Push notification failed"));
    }
  }

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

  // Fire-and-forget: notify all trade parties of veto
  const vetoItems = await prisma.tradeItem.findMany({ where: { tradeId: id } });
  const vetoTeamIds = [...new Set(vetoItems.flatMap(i => [i.senderId, i.recipientId]))];
  const vetoLeague = await prisma.league.findUnique({ where: { id: trade.leagueId }, select: { name: true } });
  notifyTeamOwners(vetoTeamIds, req.user!.id, (owner) =>
    sendTradeVetoedEmail({
      to: owner.email, recipientName: owner.name,
      leagueName: vetoLeague?.name ?? "", leagueId: trade.leagueId,
    }),
  ).catch(err => logger.warn({ err }, "Email notification failed"));

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

  // 1. Pre-check: verify trade exists and is accepted (fast fail before transaction)
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

  // 3. Transact with SELECT FOR UPDATE to prevent double-processing race condition
  await prisma.$transaction(async (tx) => {
    // Re-check status under row lock to prevent concurrent processing
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM "Trade" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked[0] || locked[0].status !== "ACCEPTED") {
      throw new Error("Trade already processed or no longer accepted");
    }

    for (const item of trade.items) {
      if (item.assetType === "PLAYER" && item.playerId) {
        const rosterEntry = await tx.roster.findFirst({
          where: { teamId: item.senderId, playerId: item.playerId, releasedAt: null },
        });

        if (rosterEntry) {
           await tx.roster.update({
             where: { id: rosterEntry.id },
             data: { releasedAt: nextDayEffective(), source: "TRADE_OUT" },
           });

           await assertPlayerAvailable(tx, item.playerId, trade.leagueId);

           // Carry over assignedPosition from sender, or default to player's primary
           const tradedPlayer = await tx.player.findUnique({ where: { id: item.playerId }, select: { posPrimary: true } });
           const PITCHER_POS = new Set(["P", "SP", "RP", "CL"]);
           const tradePos = rosterEntry.assignedPosition
             || (PITCHER_POS.has((tradedPlayer?.posPrimary ?? "").toUpperCase()) ? "P" : (tradedPlayer?.posPrimary ?? "UT").toUpperCase());

           await tx.roster.create({
             data: {
               teamId: item.recipientId,
               playerId: item.playerId,
               source: "TRADE_IN",
               acquiredAt: nextDayEffective(),
               price: rosterEntry.price,
               assignedPosition: tradePos,
             },
           });
        }
      } else if (item.assetType === "BUDGET") {
        const budgetAmount = item.amount || 0;
        const senderTeam = await tx.team.findUnique({ where: { id: item.senderId }, select: { budget: true } });
        if (!senderTeam || senderTeam.budget < budgetAmount) {
          throw new Error(`Sender team has insufficient budget (has $${senderTeam?.budget ?? 0}, needs $${budgetAmount})`);
        }
        await tx.team.update({
          where: { id: item.senderId },
          data: { budget: { decrement: budgetAmount } },
        });
        await tx.team.update({
          where: { id: item.recipientId },
          data: { budget: { increment: item.amount || 0 } },
        });
      } else if (item.assetType === "FUTURE_BUDGET") {
        // Future draft dollars — stored in DB only. Applied when target season transitions to DRAFT.
        if (!item.season || !item.amount || item.amount <= 0) {
          throw new Error("FUTURE_BUDGET requires a valid season and positive amount");
        }
        logger.info({ tradeId: id, amount: item.amount, season: item.season }, "Future budget trade recorded");
      } else if (item.assetType === "WAIVER_PRIORITY") {
        // Swap waiver priority overrides between sender and recipient
        const senderTeam = await tx.team.findUnique({ where: { id: item.senderId }, select: { waiverPriorityOverride: true } });
        const recipientTeam = await tx.team.findUnique({ where: { id: item.recipientId }, select: { waiverPriorityOverride: true } });
        // Swap: sender gets recipient's priority, recipient gets sender's
        await tx.team.update({
          where: { id: item.senderId },
          data: { waiverPriorityOverride: recipientTeam?.waiverPriorityOverride ?? null },
        });
        await tx.team.update({
          where: { id: item.recipientId },
          data: { waiverPriorityOverride: senderTeam?.waiverPriorityOverride ?? null },
        });
      } else if (item.assetType === "PICK" && item.pickRound) {
        // Draft pick trade — recorded in DB. For auction leagues this is a placeholder.
        logger.info({ tradeId: id, round: item.pickRound, season: item.season }, "Draft pick trade recorded");
      }
    }

    // Verify roster limits for all teams involved after all moves
    const teamIds = new Set(trade.items.flatMap(i => [i.senderId, i.recipientId]));
    for (const tid of teamIds) {
      const count = await tx.roster.count({ where: { teamId: tid, releasedAt: null } });
      if (count > 23) {
        throw new Error(`Trade would leave team ${tid} with ${count} players (max 23)`);
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

  // Fire-and-forget: generate AI trade analysis
  generateTradeAnalysis(id, trade.leagueId).catch(err =>
    logger.warn({ error: String(err), tradeId: id }, "Post-trade AI analysis failed (non-blocking)")
  );

  // Fire-and-forget: notify all trade parties
  const tradeTeamIds = [...new Set(trade.items.flatMap((i: any) => [i.senderId, i.recipientId]))];
  const tradeLeague = await prisma.league.findUnique({ where: { id: trade.leagueId }, select: { name: true } });
  notifyTeamOwners(tradeTeamIds, req.user!.id, (owner) =>
    sendTradeProcessedEmail({
      to: owner.email, recipientName: owner.name,
      summary: `Trade #${id} executed — ${trade.items.length} assets moved`,
      leagueName: tradeLeague?.name ?? "", leagueId: trade.leagueId,
    }),
  ).catch(err => logger.warn({ err }, "Email notification failed"));

  // Push notification to entire league (fire-and-forget)
  sendPushToLeague(trade.leagueId, {
    title: "Trade Executed",
    body: `A trade with ${trade.items.length} assets has been processed in ${tradeLeague?.name ?? "your league"}`,
    tag: `trade-processed-${id}`,
    url: `/activity?leagueId=${trade.leagueId}`,
  }, "tradeResult", req.user!.id).catch(err => logger.warn({ err }, "Push notification failed"));

  // Fire-and-forget: post system message to league chat
  (async () => {
    try {
      const tradeItems = await prisma.trade.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              player: { select: { name: true } },
              sender: { select: { name: true } },
              recipient: { select: { name: true } },
            },
          },
        },
      });
      if (tradeItems) {
        const descriptions = tradeItems.items.map(item => {
          if (item.assetType === "BUDGET") return `$${item.amount} from ${item.sender.name} to ${item.recipient.name}`;
          return `${item.player?.name ?? "Unknown"} from ${item.sender.name} to ${item.recipient.name}`;
        });
        const text = `Trade executed: ${descriptions.join("; ")}`;
        await postSystemChatMessage(trade.leagueId, req.user!.id, text, { activityType: "trade", tradeId: id });
      }
    } catch (err) {
      logger.warn({ error: String(err), tradeId: id }, "Failed to post trade chat message");
    }
  })();

  res.json({ success: true });
}));

// POST /api/trades/analyze - AI-powered trade analysis
const tradeAnalyzeSchema = z.object({
  leagueId: z.number().int().positive(),
  items: z.array(z.object({
    playerId: z.number().int().positive().optional(),
    playerName: z.string().min(1).max(200),
    fromTeamId: z.number().int().positive(),
    toTeamId: z.number().int().positive(),
    type: z.enum(["player", "budget"]),
    amount: z.number().nonnegative().optional(),
  })).min(1),
});

// Cache: keyed by sorted trade item fingerprint
const tradeAnalysisCache = new Map<string, { fairness: string; winner: string; analysis: string; recommendation: string }>();
const TRADE_CACHE_MAX = 500;

router.post("/analyze", requireAuth, validateBody(tradeAnalyzeSchema), requireLeagueMember("leagueId"), asyncHandler(async (req, res) => {
  const { leagueId, items } = req.body;

  // Build cache key from trade items
  const cacheKey = `${leagueId}:${JSON.stringify(items.map((i: any) => `${i.fromTeamId}-${i.toTeamId}-${i.type}-${i.playerName}-${i.amount ?? 0}`).sort())}`;
  const cached = tradeAnalysisCache.get(cacheKey);
  if (cached) return res.json(cached);

  // Fetch involved teams with rosters (include source for keeper detection)
  const involvedTeamIds = [...new Set<number>(items.flatMap((i: any) => [i.fromTeamId, i.toTeamId]))];
  const teams = await prisma.team.findMany({
    where: { id: { in: involvedTeamIds }, leagueId },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true } } },
      },
    },
  });

  if (teams.length !== involvedTeamIds.length) {
    return res.status(400).json({ error: "All teams must belong to the same league" });
  }

  const teamData = teams.map(t => ({
    id: t.id,
    name: t.name,
    budget: t.budget,
    roster: t.rosters.map(r => ({
      playerName: r.player.name,
      position: r.player.posPrimary,
      price: r.price,
      isKeeper: r.source?.toLowerCase().includes("keeper") || r.source === "prior_season",
    })),
  }));

  const { aiAnalysisService } = await import("../../services/aiAnalysisService.js");
  const result = await aiAnalysisService.analyzeTrade(items, teamData, leagueId);

  if (!result.success) {
    return res.status(503).json({ error: "Trade analysis is temporarily unavailable" });
  }

  if (tradeAnalysisCache.size >= TRADE_CACHE_MAX) {
    const oldest = tradeAnalysisCache.keys().next().value;
    if (oldest) tradeAnalysisCache.delete(oldest);
  }
  tradeAnalysisCache.set(cacheKey, result.result!);
  res.json(result.result);
}));

// POST /api/trades/:id/reverse — Reverse a processed trade (commissioner only)
router.post("/:id/reverse", requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          player: { select: { id: true, name: true } },
          sender: { select: { id: true, name: true, leagueId: true, budget: true } },
          recipient: { select: { id: true, name: true, budget: true } },
        },
      },
    },
  });

  if (!trade) return res.status(404).json({ error: "Trade not found" });
  if (trade.status !== "PROCESSED") return res.status(400).json({ error: "Can only reverse PROCESSED trades" });

  // Verify commissioner/admin
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: trade.leagueId, userId: req.user!.id } },
  });
  if (!membership || (membership.role !== "COMMISSIONER" && !req.user!.isAdmin)) {
    return res.status(403).json({ error: "Commissioner access required" });
  }

  // Reverse each item in a transaction (swap sender/recipient)
  await prisma.$transaction(async (tx) => {
    for (const item of trade.items) {
      if (item.assetType === "PLAYER" && item.playerId) {
        // Release from recipient (who received the player)
        await tx.roster.updateMany({
          where: { teamId: item.recipientId, playerId: item.playerId, releasedAt: null },
          data: { releasedAt: nextDayEffective(), source: "TRADE_REVERSE" },
        });
        // Create new roster entry on original sender
        await tx.roster.create({
          data: {
            teamId: item.senderId,
            playerId: item.playerId,
            price: item.amount || 0,
            source: "TRADE_REVERSE",
            acquiredAt: nextDayEffective(),
          },
        });
      } else if (item.assetType === "BUDGET") {
        const amount = item.amount || 0;
        // Reverse: take from recipient, give to sender
        await tx.team.update({ where: { id: item.recipientId }, data: { budget: { decrement: amount } } });
        await tx.team.update({ where: { id: item.senderId }, data: { budget: { increment: amount } } });
      }
    }

    // Mark trade as reversed
    await tx.trade.update({
      where: { id },
      data: { status: "REVERSED" },
    });
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "TRADE_REVERSE",
    resourceType: "Trade",
    resourceId: id,
    metadata: { leagueId: trade.leagueId, itemCount: trade.items.length },
  });

  logger.info({ tradeId: id, leagueId: trade.leagueId }, "Trade reversed");
  res.json({ success: true, tradeId: id });
}));

export const tradesRouter = router;
export default tradesRouter;

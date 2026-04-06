import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

/* ── Zod schemas ─────────────────────────────────────────────── */

const createCardSchema = z.object({
  leagueId: z.number().int().positive(),
  column: z.enum(["commissioner", "banter"]),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  type: z.enum(["user", "system", "trade", "waiver", "stat_alert", "award", "poll"]).default("user"),
  metadata: z.any().optional(),
  periodId: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

const voteSchema = z.object({
  vote: z.enum(["up", "down"]),
});

const replySchema = z.object({
  body: z.string().min(1).max(1000),
});

/* ── Helpers ─────────────────────────────────────────────────── */

async function isCommissionerOrAdmin(userId: number, leagueId: number, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { role: true },
  });
  return membership?.role === "COMMISSIONER";
}

/* ── Router ──────────────────────────────────────────────────── */

const router = Router();

/**
 * GET /api/board
 * List board cards for a league.
 * Query: leagueId (required), column (optional), periodId (optional), limit, offset
 */
router.get(
  "/",
  requireAuth,
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.query.leagueId);
    if (!Number.isFinite(leagueId)) {
      return res.status(400).json({ error: "leagueId is required" });
    }

    const column = req.query.column as string | undefined;
    const periodId = req.query.periodId ? Number(req.query.periodId) : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    // For trade_block column, query TradingBlock table directly (auto-synced)
    const wantTradeBlock = !column || column === "trade_block";
    const wantBoardCards = !column || column !== "trade_block";

    let boardItems: any[] = [];
    let boardTotal = 0;

    if (wantBoardCards) {
      const where: any = {
        leagueId,
        deletedAt: null,
      };

      // Exclude trade_block from BoardCard queries — they come from TradingBlock table
      if (column) {
        where.column = column;
      } else {
        where.column = { not: "trade_block" };
      }
      if (periodId) where.periodId = periodId;

      // Filter out expired cards
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];

      const [cards, total] = await Promise.all([
        prisma.boardCard.findMany({
          where,
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            replies: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: limit,
          skip: offset,
        }),
        prisma.boardCard.count({ where }),
      ]);

      // Get current user's votes for these cards
      const cardIds = cards.map((c) => c.id);
      const userVotes = cardIds.length > 0
        ? await prisma.boardVote.findMany({
            where: { cardId: { in: cardIds }, userId: req.user!.id },
          })
        : [];
      const voteMap = new Map(userVotes.map((v) => [v.cardId, v.vote]));

      boardItems = cards.map((c) => ({
        ...c,
        myVote: voteMap.get(c.id) ?? null,
        replyCount: c.replies.length,
      }));
      boardTotal = total;
    }

    // Build trade_block cards from TradingBlock table
    let tradeBlockCards: any[] = [];
    if (wantTradeBlock) {
      const tradingBlockEntries = await prisma.tradingBlock.findMany({
        where: { team: { leagueId } },
        include: {
          player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true } },
          team: { select: { id: true, name: true, code: true, ownerUserId: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      tradeBlockCards = tradingBlockEntries.map((e) => ({
        id: -e.id, // negative ID to distinguish from real BoardCard IDs
        leagueId,
        userId: e.team.ownerUserId,
        column: "trade_block",
        title: e.player.name,
        body: e.askingFor || "",
        type: "trade_block",
        metadata: {
          playerId: e.player.id,
          mlbId: e.player.mlbId,
          posPrimary: e.player.posPrimary,
          mlbTeam: e.player.mlbTeam,
          teamName: e.team.name,
          teamCode: e.team.code,
        },
        pinned: false,
        periodId: null,
        expiresAt: null,
        thumbsUp: 0,
        thumbsDown: 0,
        createdAt: e.createdAt,
        deletedAt: null,
        user: null, // system-generated from trading block
        replies: [],
        myVote: null,
        replyCount: 0,
      }));
    }

    const items = [...boardItems, ...tradeBlockCards];
    const total = boardTotal + tradeBlockCards.length;

    return res.json({ items, total, limit, offset });
  }),
);

/**
 * POST /api/board
 * Create a new board card.
 */
router.post(
  "/",
  requireAuth,
  validateBody(createCardSchema),
  requireLeagueMember("leagueId"),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof createCardSchema>;

    // Only commissioners can post to "commissioner" column
    if (data.column === "commissioner") {
      const canPost = await isCommissionerOrAdmin(req.user!.id, data.leagueId, req.user!.isAdmin);
      if (!canPost) {
        return res.status(403).json({ error: "Only commissioners can post to the Commissioner column" });
      }
    }

    const card = await prisma.boardCard.create({
      data: {
        leagueId: data.leagueId,
        userId: req.user!.id,
        column: data.column,
        title: data.title,
        body: data.body ?? null,
        type: data.type,
        metadata: data.metadata ?? undefined,
        periodId: data.periodId ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        replies: true,
      },
    });

    logger.info({ cardId: card.id, leagueId: data.leagueId, column: data.column }, "Board card created");
    return res.status(201).json(card);
  }),
);

/**
 * POST /api/board/:id/vote
 * Toggle thumbs up or down on a card.
 */
router.post(
  "/:id/vote",
  requireAuth,
  validateBody(voteSchema),
  asyncHandler(async (req, res) => {
    const cardId = Number(req.params.id);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ error: "Invalid card id" });
    }

    const { vote } = req.body as z.infer<typeof voteSchema>;
    const userId = req.user!.id;

    // Look up the card to verify it exists and get leagueId
    const card = await prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, leagueId: true } });
    if (!card) return res.status(404).json({ error: "Card not found" });

    // Verify league membership
    if (!req.user!.isAdmin) {
      const isMember = await prisma.leagueMembership.findFirst({
        where: { leagueId: card.leagueId, userId: req.user!.id },
      });
      if (!isMember) return res.status(403).json({ error: "Not a member of this league" });
    }

    // Check existing vote
    const existing = await prisma.boardVote.findUnique({
      where: { cardId_userId: { cardId, userId } },
    });

    if (existing) {
      if (existing.vote === vote) {
        // Same vote = remove it (toggle off)
        await prisma.$transaction([
          prisma.boardVote.delete({ where: { id: existing.id } }),
          prisma.boardCard.update({
            where: { id: cardId },
            data: vote === "up" ? { thumbsUp: { decrement: 1 } } : { thumbsDown: { decrement: 1 } },
          }),
        ]);
        return res.json({ myVote: null });
      } else {
        // Different vote = switch
        await prisma.$transaction([
          prisma.boardVote.update({ where: { id: existing.id }, data: { vote } }),
          prisma.boardCard.update({
            where: { id: cardId },
            data:
              vote === "up"
                ? { thumbsUp: { increment: 1 }, thumbsDown: { decrement: 1 } }
                : { thumbsUp: { decrement: 1 }, thumbsDown: { increment: 1 } },
          }),
        ]);
        return res.json({ myVote: vote });
      }
    } else {
      // New vote
      await prisma.$transaction([
        prisma.boardVote.create({ data: { cardId, userId, vote } }),
        prisma.boardCard.update({
          where: { id: cardId },
          data: vote === "up" ? { thumbsUp: { increment: 1 } } : { thumbsDown: { increment: 1 } },
        }),
      ]);
      return res.json({ myVote: vote });
    }
  }),
);

/**
 * POST /api/board/:id/reply
 * Add a reply to a card.
 */
router.post(
  "/:id/reply",
  requireAuth,
  validateBody(replySchema),
  asyncHandler(async (req, res) => {
    const cardId = Number(req.params.id);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ error: "Invalid card id" });
    }

    const card = await prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, leagueId: true } });
    if (!card) return res.status(404).json({ error: "Card not found" });

    // Verify league membership
    if (!req.user!.isAdmin) {
      const isMember = await prisma.leagueMembership.findFirst({
        where: { leagueId: card.leagueId, userId: req.user!.id },
      });
      if (!isMember) return res.status(403).json({ error: "Not a member of this league" });
    }

    const { body } = req.body as z.infer<typeof replySchema>;

    const reply = await prisma.boardCardReply.create({
      data: {
        cardId,
        userId: req.user!.id,
        body,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    logger.info({ cardId, replyId: reply.id }, "Board reply added");
    return res.status(201).json(reply);
  }),
);

/**
 * PATCH /api/board/:id/pin
 * Toggle pin on a card (commissioner only).
 */
router.patch(
  "/:id/pin",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cardId = Number(req.params.id);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ error: "Invalid card id" });
    }

    const card = await prisma.boardCard.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: "Card not found" });

    const canPin = await isCommissionerOrAdmin(req.user!.id, card.leagueId, req.user!.isAdmin);
    if (!canPin) {
      return res.status(403).json({ error: "Only commissioners can pin cards" });
    }

    const updated = await prisma.boardCard.update({
      where: { id: cardId },
      data: {
        pinned: !card.pinned,
      },
    });

    logger.info({ cardId, pinned: updated.pinned }, "Board card pin toggled");
    return res.json(updated);
  }),
);

/**
 * DELETE /api/board/:id
 * Soft delete a card (owner or commissioner).
 */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cardId = Number(req.params.id);
    if (!Number.isFinite(cardId)) {
      return res.status(400).json({ error: "Invalid card id" });
    }

    const card = await prisma.boardCard.findUnique({ where: { id: cardId } });
    if (!card) return res.status(404).json({ error: "Card not found" });

    const isOwner = card.userId === req.user!.id;
    const isComm = await isCommissionerOrAdmin(req.user!.id, card.leagueId, req.user!.isAdmin);
    if (!isOwner && !isComm) {
      return res.status(403).json({ error: "You can only delete your own cards" });
    }

    await prisma.boardCard.update({
      where: { id: cardId },
      data: { deletedAt: new Date() },
    });

    logger.info({ cardId }, "Board card soft-deleted");
    return res.json({ success: true });
  }),
);

export const boardRouter = router;

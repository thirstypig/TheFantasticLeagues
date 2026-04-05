import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// GET /api/chat/:leagueId/messages?limit=50&before=ID — paginated history
router.get("/:leagueId/messages", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const before = Number(req.query.before) || undefined;

  const where: Record<string, unknown> = { leagueId, deletedAt: null };
  if (before) where.id = { lt: before };

  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  res.json({
    messages: messages.reverse().map(m => ({
      id: m.id,
      userId: m.userId,
      userName: m.user.name || m.user.email?.split("@")[0] || `User ${m.userId}`,
      avatarUrl: m.user.avatarUrl,
      text: m.text,
      msgType: m.type,
      metadata: m.metadata,
      createdAt: m.createdAt.toISOString(),
    })),
    hasMore: messages.length === limit,
  });
}));

// GET /api/chat/:leagueId/unread-count — unread message count for current user
router.get("/:leagueId/unread-count", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;

  const cursor = await prisma.chatReadCursor.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });

  const lastReadId = cursor?.lastReadId ?? 0;

  const count = await prisma.chatMessage.count({
    where: {
      leagueId,
      id: { gt: lastReadId },
      deletedAt: null,
    },
  });

  res.json({ unreadCount: count });
}));

// POST /api/chat/:leagueId/read — mark messages as read (update ChatReadCursor)
router.post("/:leagueId/read", requireAuth, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const userId = req.user!.id;

  // Get the latest message ID in this league
  const latest = await prisma.chatMessage.findFirst({
    where: { leagueId, deletedAt: null },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  if (!latest) return res.json({ success: true });

  await prisma.chatReadCursor.upsert({
    where: { userId_leagueId: { userId, leagueId } },
    update: { lastReadId: latest.id },
    create: { userId, leagueId, lastReadId: latest.id },
  });

  res.json({ success: true });
}));

// DELETE /api/chat/:leagueId/messages/:id — soft delete (commissioner only)
router.delete("/:leagueId/messages/:id", requireAuth, requireCommissionerOrAdmin("leagueId"), asyncHandler(async (req, res) => {
  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) return res.status(400).json({ error: "Invalid message ID" });

  const leagueId = Number(req.params.leagueId);

  // Verify message belongs to this league
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, leagueId },
  });
  if (!message) return res.status(404).json({ error: "Message not found" });

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  logger.info({ messageId, leagueId, userId: req.user!.id }, "Chat message deleted by commissioner");

  res.json({ success: true });
}));

export const chatRouter = router;

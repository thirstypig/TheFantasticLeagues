import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { getVapidPublicKey } from "../../lib/pushService.js";

const router = Router();

// GET /api/notifications/vapid-key — return VAPID public key (no auth required)
router.get("/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ error: "Push notifications not configured" });
  }
  res.json({ publicKey: key });
});

// POST /api/notifications/subscribe — save push subscription
const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  userAgent: z.string().max(500).optional(),
});

router.post(
  "/subscribe",
  requireAuth,
  validateBody(subscribeSchema),
  asyncHandler(async (req, res) => {
    const { endpoint, keys, userAgent } = req.body;
    const userId = req.user!.id;

    // P1 SECURITY: Prevent endpoint hijacking — reject if already owned by a different user
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (existing && existing.userId !== userId) {
      return res.status(409).json({ error: "Push endpoint already registered to another user" });
    }

    // Upsert: update if endpoint already exists, create otherwise
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
    });

    res.json({ success: true });
  }),
);

// DELETE /api/notifications/unsubscribe — remove subscription by endpoint
const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

router.delete(
  "/unsubscribe",
  requireAuth,
  validateBody(unsubscribeSchema),
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body;
    const userId = req.user!.id;

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });

    res.json({ success: true });
  }),
);

// GET /api/notifications/preferences — get user's notification preferences
router.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Return defaults if no record exists
    if (!prefs) {
      prefs = {
        id: 0,
        userId,
        tradeProposal: true,
        tradeResult: true,
        waiverResult: true,
        lineupReminder: true,
        commissionerAnnounce: true,
        boardReply: true,
      };
    }

    res.json(prefs);
  }),
);

// PUT /api/notifications/preferences — update notification preferences
const prefsSchema = z.object({
  tradeProposal: z.boolean().optional(),
  tradeResult: z.boolean().optional(),
  waiverResult: z.boolean().optional(),
  lineupReminder: z.boolean().optional(),
  commissionerAnnounce: z.boolean().optional(),
  boardReply: z.boolean().optional(),
});

router.put(
  "/preferences",
  requireAuth,
  validateBody(prefsSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      update: req.body,
      create: { userId, ...req.body },
    });

    res.json(prefs);
  }),
);

export const notificationsRouter = router;

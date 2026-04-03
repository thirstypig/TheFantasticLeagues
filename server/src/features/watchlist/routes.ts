import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, isTeamOwner } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const addSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  note: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const updateSchema = z.object({
  note: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// ---------------------------------------------------------------------------
// GET / — List watchlist for a team
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "teamId query parameter is required" });
    }

    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(teamId, req.user!.id);
      if (!owns) {
        return res.status(403).json({ error: "You do not own this team" });
      }
    }

    const items = await prisma.watchlist.findMany({
      where: { teamId },
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ items });
  }),
);

// ---------------------------------------------------------------------------
// POST / — Add player to watchlist
// ---------------------------------------------------------------------------

router.post(
  "/",
  requireAuth,
  validateBody(addSchema),
  asyncHandler(async (req, res) => {
    const { teamId, playerId, note, tags } = req.body as z.infer<typeof addSchema>;

    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(teamId, req.user!.id);
      if (!owns) {
        return res.status(403).json({ error: "You do not own this team" });
      }
    }

    // Verify the player exists
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    try {
      const item = await prisma.watchlist.create({
        data: {
          teamId,
          playerId,
          note: note ?? null,
          tags: tags ?? [],
        },
        include: {
          player: {
            select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
          },
        },
      });

      return res.status(201).json(item);
    } catch (err: unknown) {
      // Unique constraint violation (player already on watchlist)
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return res.status(409).json({ error: "Player is already on your watchlist" });
      }
      throw err;
    }
  }),
);

// ---------------------------------------------------------------------------
// PATCH /:id — Update note/tags
// ---------------------------------------------------------------------------

router.patch(
  "/:id",
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid watchlist item id" });
    }

    const { note, tags } = req.body as z.infer<typeof updateSchema>;

    const existing = await prisma.watchlist.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Watchlist item not found" });
    }

    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(existing.teamId, req.user!.id);
      if (!owns) {
        return res.status(403).json({ error: "You do not own this team" });
      }
    }

    const data: Record<string, unknown> = {};
    if (note !== undefined) data.note = note;
    if (tags !== undefined) data.tags = tags;

    const updated = await prisma.watchlist.update({
      where: { id },
      data,
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
    });

    return res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// DELETE /:playerId — Remove player from watchlist
// ---------------------------------------------------------------------------

router.delete(
  "/:playerId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId);
    const teamId = Number(req.query.teamId);

    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Invalid playerId" });
    }
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ error: "teamId query parameter is required" });
    }

    if (!req.user!.isAdmin) {
      const owns = await isTeamOwner(teamId, req.user!.id);
      if (!owns) {
        return res.status(403).json({ error: "You do not own this team" });
      }
    }

    const existing = await prisma.watchlist.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Player is not on your watchlist" });
    }

    await prisma.watchlist.delete({
      where: { teamId_playerId: { teamId, playerId } },
    });

    return res.status(204).send();
  }),
);

export const watchlistRouter = router;

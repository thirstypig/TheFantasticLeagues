import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireLeagueMember, isTeamOwner } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { logger } from "../../lib/logger.js";

/* ── Zod schemas ─────────────────────────────────────────────── */

const addSchema = z.object({
  teamId: z.number().int().positive(),
  playerId: z.number().int().positive(),
  askingFor: z.string().max(200).optional(),
});

const updateSchema = z.object({
  askingFor: z.string().max(200).nullable(),
});

/* ── Router ──────────────────────────────────────────────────── */

const router = Router();

/**
 * GET /api/trading-block
 * List all trading-block entries for a league.
 * Query: leagueId (required)
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

    // Get all teams in the league, then fetch their trading-block entries
    const teams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, code: true },
    });
    const teamIds = teams.map((t) => t.id);
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const entries = await prisma.tradingBlock.findMany({
      where: { teamId: { in: teamIds } },
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = entries.map((e) => {
      const team = teamMap.get(e.teamId);
      return {
        id: e.id,
        teamId: e.teamId,
        teamName: team?.name ?? "",
        teamCode: team?.code ?? "",
        player: e.player,
        askingFor: e.askingFor,
        createdAt: e.createdAt,
      };
    });

    return res.json({ items });
  }),
);

/**
 * GET /api/trading-block/my
 * List the authenticated user's trading-block entries for a team.
 * Query: teamId (required)
 */
router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(teamId)) {
      return res.status(400).json({ error: "teamId is required" });
    }

    const owns = req.user!.isAdmin || (await isTeamOwner(teamId, req.user!.id));
    if (!owns) {
      return res.status(403).json({ error: "You do not own this team" });
    }

    const entries = await prisma.tradingBlock.findMany({
      where: { teamId },
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ items: entries });
  }),
);

/**
 * POST /api/trading-block
 * Add a player to the trading block.
 * Body: { teamId, playerId, askingFor? }
 */
router.post(
  "/",
  requireAuth,
  validateBody(addSchema),
  asyncHandler(async (req, res) => {
    const { teamId, playerId, askingFor } = req.body as z.infer<typeof addSchema>;

    const owns = req.user!.isAdmin || (await isTeamOwner(teamId, req.user!.id));
    if (!owns) {
      return res.status(403).json({ error: "You do not own this team" });
    }

    // Verify player is on the team's active roster
    const rosterEntry = await prisma.roster.findFirst({
      where: { teamId, playerId, releasedAt: null },
    });
    if (!rosterEntry) {
      return res.status(400).json({ error: "Player is not on your active roster" });
    }

    const entry = await prisma.tradingBlock.upsert({
      where: { teamId_playerId: { teamId, playerId } },
      update: { askingFor: askingFor ?? null },
      create: { teamId, playerId, askingFor: askingFor ?? null },
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
    });

    // Enrich with team info for client TradingBlockItem shape
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true, code: true } });
    const result = { ...entry, teamName: team?.name ?? "", teamCode: team?.code ?? "" };

    logger.info({ teamId, playerId }, "Trading block: player added");
    return res.status(201).json(result);
  }),
);

/**
 * PATCH /api/trading-block/:id
 * Update the askingFor text on a trading-block entry.
 * Body: { askingFor }
 */
router.patch(
  "/:id",
  requireAuth,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const existing = await prisma.tradingBlock.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Trading block entry not found" });
    }

    const owns = req.user!.isAdmin || (await isTeamOwner(existing.teamId, req.user!.id));
    if (!owns) {
      return res.status(403).json({ error: "You do not own this team" });
    }

    const { askingFor } = req.body as z.infer<typeof updateSchema>;
    const updated = await prisma.tradingBlock.update({
      where: { id },
      data: { askingFor },
      include: {
        player: {
          select: { id: true, name: true, posPrimary: true, mlbTeam: true, mlbId: true },
        },
      },
    });

    return res.json(updated);
  }),
);

/**
 * DELETE /api/trading-block/:playerId
 * Remove a player from the trading block.
 * Query: teamId (required)
 */
router.delete(
  "/:playerId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const playerId = Number(req.params.playerId);
    const teamId = Number(req.query.teamId);
    if (!Number.isFinite(playerId) || !Number.isFinite(teamId)) {
      return res.status(400).json({ error: "playerId and teamId are required" });
    }

    const owns = req.user!.isAdmin || (await isTeamOwner(teamId, req.user!.id));
    if (!owns) {
      return res.status(403).json({ error: "You do not own this team" });
    }

    const existing = await prisma.tradingBlock.findUnique({
      where: { teamId_playerId: { teamId, playerId } },
    });
    if (!existing) {
      return res.status(404).json({ error: "Player not on trading block" });
    }

    await prisma.tradingBlock.delete({
      where: { teamId_playerId: { teamId, playerId } },
    });

    logger.info({ teamId, playerId }, "Trading block: player removed");
    return res.json({ success: true });
  }),
);

export const tradingBlockRouter = router;

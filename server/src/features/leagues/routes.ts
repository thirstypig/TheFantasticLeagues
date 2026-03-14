// server/src/routes/leagues.ts
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { KeeperPrepService } from "../keeper-prep/services/keeperPrepService.js";
import { requireAuth, requireCommissionerOrAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { logger } from "../../lib/logger.js";
import { z } from "zod";

const keepersSchema = z.object({
  keeperIds: z.array(z.number().int().positive()),
});

const keeperPrepService = new KeeperPrepService();

const router = Router();

/**
 * GET /api/leagues
 * Returns:
 * - leagues the user can access via membership
 * - plus public leagues (deduped)
 */
router.get("/leagues", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id as number;

  const memberships = await prisma.leagueMembership.findMany({
    where: { userId },
    select: {
      role: true,
      league: {
        select: { id: true, name: true, season: true, draftMode: true, draftOrder: true, isPublic: true, publicSlug: true },
      },
    },
    orderBy: [{ leagueId: "asc" }],
  });

  const memberLeagues = memberships.map((m) => ({
    ...m.league,
    access: { type: "MEMBER" as const, role: m.role },
  }));

  const publicLeaguesRaw = await prisma.league.findMany({
    where: { isPublic: true },
    select: { id: true, name: true, season: true, draftMode: true, draftOrder: true, isPublic: true, publicSlug: true },
    orderBy: [{ season: "desc" }, { name: "asc" }],
  });

  const byId = new Map<number, any>();
  for (const l of memberLeagues) byId.set(l.id, l);

  for (const l of publicLeaguesRaw) {
    if (!byId.has(l.id)) {
      byId.set(l.id, { ...l, access: { type: "PUBLIC" as const } });
    }
  }

  const leagues = Array.from(byId.values());
  return res.json({ leagues });
}));

/**
 * GET /api/leagues/:id
 * Returns full details including teams.
 */
router.get("/leagues/:id", asyncHandler(async (req, res) => {
  const userId = req.user?.id ? (req.user.id as number) : null;
  const leagueId = Number(req.params.id);

  // Check visibility/membership
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        select: {
          id: true,
          name: true,
          code: true,
          ownerUserId: true,
          owner: true,
          budget: true,
          ownerships: { select: { userId: true } }, // For multi-owner lookup
        },
      },
    },
  });

  if (!league) return res.status(404).json({ error: "League not found" });

  // Public or Member?
  let membership = null;
  if (userId) {
    membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
  }

  if (!league.isPublic && !membership && !req.user?.isAdmin) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Fetch outfield mode setting
  const outfieldRule = await prisma.leagueRule.findUnique({
    where: { leagueId_category_key: { leagueId, category: "roster", key: "outfield_mode" } },
  });
  const outfieldMode = outfieldRule?.value || "OF";

  return res.json({ league: { ...league, outfieldMode, access: membership ? { type: "MEMBER", role: membership.role } : { type: "PUBLIC_VIEWER" } } });
}));

/**
 * GET /api/leagues/:id/rosters
 * Returns active rosters for the league (Public/Member access)
 */
router.get("/leagues/:id/rosters", asyncHandler(async (req, res) => {
  const userId = req.user?.id ? (req.user.id as number) : null;
  const leagueId = Number(req.params.id);

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(404).json({ error: "League not found" });

  let membership = null;
  if (userId) {
    membership = await prisma.leagueMembership.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
    });
  }

  if (!league.isPublic && !membership && !req.user?.isAdmin) {
    return res.status(403).json({ error: "Access denied" });
  }

  const rosters = await prisma.roster.findMany({
    where: { team: { leagueId }, releasedAt: null },
    include: {
      team: { select: { id: true, code: true, name: true, budget: true } },
      player: { select: { id: true, name: true, posPrimary: true, mlbId: true, mlbTeam: true } },
    },
    orderBy: { teamId: "asc" },
  });

  return res.json({ rosters });
}));

/**
 * GET /api/leagues/:id/my-roster
 * Fetches the logged-in user's roster for the given league.
 * Returns players with cost and keeper status.
 */
router.get("/leagues/:id/my-roster", requireAuth, asyncHandler(async (req, res) => {
  const userId = Number(req.user!.id);
  const leagueId = Number(req.params.id);

  // 1. Find the user's team in this league
  // Support multi-owner via TeamOwnership or direct ownerUserId
  const team = await prisma.team.findFirst({
      where: {
          leagueId,
          OR: [
              { ownerUserId: userId },
              { ownerships: { some: { userId } } }
          ]
      }
  });

  if (!team) {
      return res.status(404).json({ error: "No team found for you in this league." });
  }

  // 2. Fetch Roster
  const roster = await prisma.roster.findMany({
      where: { teamId: team.id, releasedAt: null },
      include: {
          player: { select: { id: true, name: true, posPrimary: true, mlbTeam: true } }
      },
      orderBy: { player: { name: "asc" } }
  });

  const isLocked = await keeperPrepService.isKeepersLocked(leagueId);
  const keeperLimit = await keeperPrepService.getKeeperLimit(leagueId);

  return res.json({ team, roster, isLocked, keeperLimit });
}));

/**
 * POST /api/leagues/:id/my-roster/keepers
 * Updates keeper selections for the user's team.
 * Body: { keeperIds: number[] }
 */
router.post("/leagues/:id/my-roster/keepers", requireAuth, validateBody(keepersSchema), asyncHandler(async (req, res) => {
  const userId = Number(req.user!.id);
  const leagueId = Number(req.params.id);
  const { keeperIds } = req.body; // Array of Roster IDs

  if (!Array.isArray(keeperIds)) {
      return res.status(400).json({ error: "Invalid keeperIds" });
  }

  // 1. Validate Team Ownership
  const team = await prisma.team.findFirst({
      where: {
          leagueId,
          OR: [
              { ownerUserId: userId },
              { ownerships: { some: { userId } } }
          ]
      }
  });

  if (!team) {
      return res.status(403).json({ error: "You do not own a team in this league." });
  }

  // 2. Validate Roster Items belong to this team
  // Security check: ensure all keeperIds provided effectively belong to this team
  const validRosters = await prisma.roster.findMany({
      where: { teamId: team.id, id: { in: keeperIds } }
  });

  if (validRosters.length !== keeperIds.length) {
      return res.status(400).json({ error: "One or more invalid roster IDs provided." });
  }

  // 3. Validation: Lock Status and Keeper Limit
  const isLocked = await keeperPrepService.isKeepersLocked(leagueId);
  if (isLocked) {
      return res.status(403).json({ error: "Keeper selections are locked for this league." });
  }

  const keeperLimit = await keeperPrepService.getKeeperLimit(leagueId);
  if (keeperIds.length > keeperLimit) {
      return res.status(400).json({ error: `You can only select up to ${keeperLimit} keepers.` });
  }

  // 4. Update DB
  // Transaction: Reset all current keepers for this team, then set new ones
  await prisma.$transaction(async (tx) => {
      // Reset all to false
      await tx.roster.updateMany({
          where: { teamId: team.id },
          data: { isKeeper: false }
      });

      // Set selected to true
      if (keeperIds.length > 0) {
          await tx.roster.updateMany({
              where: { id: { in: keeperIds } },
              data: { isKeeper: true }
          });
      }
  }, { timeout: 30_000 });

  writeAuditLog({
    userId: req.user!.id,
    action: "KEEPER_SAVE",
    resourceType: "Roster",
    metadata: { leagueId, teamId: team.id, keeperCount: keeperIds.length },
  });

  return res.json({ success: true, count: keeperIds.length });
}));

// ─── Invite Code Endpoints ───

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(1).max(32),
});

/**
 * POST /api/leagues/join
 * Join a league using an invite code.
 */
router.post("/leagues/join", requireAuth, validateBody(joinLeagueSchema), asyncHandler(async (req, res) => {
  const userId = Number(req.user!.id);
  const { inviteCode } = req.body;

  const league = await prisma.league.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, season: true },
  });

  if (!league) {
    return res.status(404).json({ error: "Invalid invite code." });
  }

  // Check if already a member
  const existing = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId } },
  });

  if (existing) {
    return res.status(409).json({ error: "You are already a member of this league." });
  }

  await prisma.leagueMembership.create({
    data: { leagueId: league.id, userId, role: "OWNER" },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "LEAGUE_JOIN",
    resourceType: "League",
    metadata: { leagueId: league.id, inviteCode },
  });

  return res.json({ league });
}));

/**
 * GET /api/leagues/:id/invite-code
 * Get the current invite code for a league (commissioner/admin only).
 */
router.get("/leagues/:id/invite-code", requireAuth, requireCommissionerOrAdmin("id"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.id);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { inviteCode: true },
  });

  if (!league) return res.status(404).json({ error: "League not found" });

  return res.json({ inviteCode: league.inviteCode });
}));

/**
 * POST /api/leagues/:id/invite-code/regenerate
 * Generate a new invite code (commissioner/admin only).
 */
router.post("/leagues/:id/invite-code/regenerate", requireAuth, requireCommissionerOrAdmin("id"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.id);

  const newCode = randomBytes(4).toString("hex").toUpperCase();

  const league = await prisma.league.update({
    where: { id: leagueId },
    data: { inviteCode: newCode },
    select: { inviteCode: true },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "INVITE_CODE_REGENERATE",
    resourceType: "League",
    metadata: { leagueId },
  });

  logger.info({ leagueId }, "Invite code regenerated");

  return res.json({ inviteCode: league.inviteCode });
}));

export const leaguesRouter = router;
export default leaguesRouter;

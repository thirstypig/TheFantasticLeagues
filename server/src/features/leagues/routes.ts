// server/src/routes/leagues.ts
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { KeeperPrepService } from "../keeper-prep/services/keeperPrepService.js";
import { PlayerValueService } from "../keeper-prep/services/playerValueService.js";
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
const playerValueService = new PlayerValueService();

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
        select: { id: true, name: true, season: true, draftMode: true, draftOrder: true, isPublic: true, publicSlug: true, franchiseId: true },
      },
    },
    orderBy: [{ league: { name: "asc" } }, { league: { season: "desc" } }],
  });

  const memberLeagues = memberships.map((m) => ({
    ...m.league,
    access: { type: "MEMBER" as const, role: m.role },
  }));

  const publicLeaguesRaw = await prisma.league.findMany({
    where: { isPublic: true },
    select: { id: true, name: true, season: true, draftMode: true, draftOrder: true, isPublic: true, publicSlug: true, franchiseId: true },
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
  const leagueRaw = await prisma.league.findUnique({
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
  // Strip sensitive fields from owner (passwordHash, resetToken, isAdmin, payment handles)
  const league = leagueRaw ? {
    ...leagueRaw,
    teams: leagueRaw.teams.map(t => {
      const o = t.owner as any;
      return {
        ...t,
        owner: o ? { id: o.id, name: o.name, email: o.email, avatarUrl: o.avatarUrl } : null,
      };
    }),
  } : null;

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

  // Enrich with projected values
  const valueMap = await playerValueService.getValueMap(leagueId);
  const enrichedRoster = roster.map((r) => ({
    ...r,
    projectedValue: r.player?.id ? (valueMap.get(r.player.id) ?? null) : null,
  }));

  return res.json({ team, roster: enrichedRoster, isLocked, keeperLimit });
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
 * Join a franchise using an invite code. Also creates LeagueMembership
 * for the latest season for backwards compatibility.
 */
router.post("/leagues/join", requireAuth, validateBody(joinLeagueSchema), asyncHandler(async (req, res) => {
  const userId = Number(req.user!.id);
  const { inviteCode } = req.body;

  // Look up invite code on Franchise first, then fall back to League for backwards compat
  let franchiseId: number | null = null;
  let latestLeague: { id: number; name: string; season: number } | null = null;

  const franchise = await prisma.franchise.findUnique({
    where: { inviteCode },
    select: { id: true, name: true },
  });

  if (franchise) {
    franchiseId = franchise.id;
    // Find the latest season in this franchise
    latestLeague = await prisma.league.findFirst({
      where: { franchiseId: franchise.id },
      select: { id: true, name: true, season: true },
      orderBy: { season: "desc" },
    });
  } else {
    // Fallback: check League.inviteCode for backwards compat
    const league = await prisma.league.findUnique({
      where: { inviteCode },
      select: { id: true, name: true, season: true, franchiseId: true },
    });
    if (league) {
      franchiseId = league.franchiseId;
      latestLeague = league;
    }
  }

  if (!franchiseId || !latestLeague) {
    return res.status(404).json({ error: "Invalid invite code." });
  }

  // Create FranchiseMembership
  await prisma.franchiseMembership.upsert({
    where: { franchiseId_userId: { franchiseId, userId } },
    create: { franchiseId, userId, role: "OWNER" },
    update: {},
  });

  // Create LeagueMembership for latest season (backwards compat)
  await prisma.leagueMembership.upsert({
    where: { leagueId_userId: { leagueId: latestLeague.id, userId } },
    create: { leagueId: latestLeague.id, userId, role: "OWNER" },
    update: {},
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "LEAGUE_JOIN",
    resourceType: "Franchise",
    metadata: { franchiseId, leagueId: latestLeague.id, inviteCode },
  });

  return res.json({ league: latestLeague });
}));

/**
 * GET /api/leagues/:id/invite-code
 * Get the current invite code for a league (reads from franchise).
 */
router.get("/leagues/:id/invite-code", requireAuth, requireCommissionerOrAdmin("id"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.id);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { inviteCode: true, franchise: { select: { inviteCode: true } } },
  });

  if (!league) return res.status(404).json({ error: "League not found" });

  // Prefer franchise-level invite code, fall back to league-level
  const inviteCode = league.franchise?.inviteCode ?? league.inviteCode;
  return res.json({ inviteCode });
}));

/**
 * POST /api/leagues/:id/invite-code/regenerate
 * Generate a new invite code (updates franchise).
 */
router.post("/leagues/:id/invite-code/regenerate", requireAuth, requireCommissionerOrAdmin("id"), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.id);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { franchiseId: true },
  });
  if (!league) return res.status(404).json({ error: "League not found" });

  const newCode = randomBytes(16).toString("hex").toUpperCase();

  // Update on franchise
  await prisma.franchise.update({
    where: { id: league.franchiseId },
    data: { inviteCode: newCode },
  });

  // Also update on league for backwards compat
  await prisma.league.update({
    where: { id: leagueId },
    data: { inviteCode: newCode },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "INVITE_CODE_REGENERATE",
    resourceType: "Franchise",
    metadata: { leagueId, franchiseId: league.franchiseId },
  });

  logger.info({ leagueId, franchiseId: league.franchiseId }, "Invite code regenerated");

  return res.json({ inviteCode: newCode });
}));

// ─── Self-Service League Creation ──────────────────────────────────────────

const createLeagueSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  season: z.number().int().min(2020).max(2100),
  leagueType: z.enum(["NL", "AL", "MIXED"]).default("NL"),
  scoringFormat: z.enum(["ROTO", "H2H_CATEGORIES", "H2H_POINTS"]).default("ROTO"),
  draftMode: z.enum(["AUCTION", "DRAFT"]).default("AUCTION"),
  draftOrder: z.enum(["SNAKE", "LINEAR"]).optional(),
  isPublic: z.boolean().default(false),
  copyFromLeagueId: z.number().int().positive().optional(),
});

// POST /api/leagues — Create a new league (any authenticated user)
router.post("/", requireAuth, validateBody(createLeagueSchema), asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  // Rate limit: max 5 leagues per user
  const existingCount = await prisma.leagueMembership.count({
    where: { userId, role: "COMMISSIONER" },
  });
  if (existingCount >= 5) {
    return res.status(429).json({ error: "Maximum 5 leagues per user" });
  }

  const { CommissionerService } = await import("../commissioner/services/CommissionerService.js");
  const commissionerService = new CommissionerService();

  const league = await commissionerService.createLeague({
    name: req.body.name,
    season: req.body.season,
    draftMode: req.body.draftMode,
    draftOrder: req.body.draftOrder,
    scoringFormat: req.body.scoringFormat,
    isPublic: req.body.isPublic,
    copyFromLeagueId: req.body.copyFromLeagueId,
    creatorUserId: userId,
  });

  // Generate invite code for the franchise
  const franchise = await prisma.franchise.findFirst({
    where: { leagues: { some: { id: league.id } } },
    select: { id: true, inviteCode: true },
  });
  const inviteCode = franchise?.inviteCode || randomBytes(16).toString("hex").toUpperCase();
  if (franchise && !franchise.inviteCode) {
    await prisma.franchise.update({ where: { id: franchise.id }, data: { inviteCode } });
  }

  writeAuditLog({ userId, action: "LEAGUE_CREATED", resourceType: "league", resourceId: league.id, metadata: { name: league.name, season: league.season } });
  logger.info({ userId, leagueId: league.id }, "Self-service league created");

  res.status(201).json({
    league: { id: league.id, name: league.name, season: league.season, franchiseId: league.franchiseId },
    inviteCode,
  });
}));

export const leaguesRouter = router;
export default leaguesRouter;

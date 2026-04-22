// server/src/routes/commissioner.ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { norm, normCode, mustOneOf } from "../../lib/utils.js";
import multer from "multer";
import { CommissionerService } from "./services/CommissionerService.js";
import { requireAuth, requireAdmin, requireCommissionerOrAdmin, evictMembershipCache } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { addMemberSchema } from "../../lib/schemas.js";
import { isRuleLocked, getLockedFields, lockMessage } from "../../lib/ruleLock.js";
import { enforceRosterRules } from "../../lib/featureFlags.js";
import { isEligibleForSlot } from "../transactions/lib/positionInherit.js";
import { reconcileIlFeesForPeriod } from "../transactions/services/ilFeeService.js";

// --- Zod Schemas ---

const teamItemSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(10).optional(),
  owner: z.string().max(100).optional(),
  budget: z.number().nonnegative().optional(),
  priorTeamId: z.number().int().positive().optional(),
});

const createTeamsSchema = z.union([
  teamItemSchema,
  z.object({ teams: z.array(teamItemSchema).min(1) }),
]);

const addTeamOwnerSchema = z.object({
  userId: z.number().int().positive().optional(),
  email: z.string().email().optional(),
  ownerName: z.string().max(100).optional(),
}).refine(d => d.userId || d.email || d.ownerName, { message: "userId, email, or ownerName required" });

const effectiveDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}($|T)/, "effectiveDate must be YYYY-MM-DD or ISO datetime")
  .optional();

const rosterAssignSchema = z.object({
  teamId: z.number().int().positive(),
  mlbId: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1).max(200),
  posPrimary: z.string().max(10).optional(),
  posList: z.string().max(100).optional(),
  price: z.number().nonnegative().optional(),
  source: z.string().max(50).optional(),
  effectiveDate: effectiveDateSchema,
});

const rosterReleaseSchema = z.object({
  rosterId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  playerId: z.number().int().positive().optional(),
  effectiveDate: effectiveDateSchema,
}).refine(d => d.rosterId || (d.teamId && d.playerId), { message: "rosterId or teamId+playerId required" });

const periodSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(100),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  status: z.string().max(20).optional(),
});

const ruleSchema = z.object({
  category: z.string().min(1).max(50),
  key: z.string().min(1).max(50),
  value: z.string().max(500),
  label: z.string().max(100).optional(),
});

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'text/plain'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const createSeasonSchema = z.object({
  name: z.string().min(1).max(200),
  season: z.number().int().min(1900).max(2100),
  draftMode: z.enum(["AUCTION", "DRAFT"]).optional().default("AUCTION"),
  draftOrder: z.enum(["SNAKE", "LINEAR"]).optional(),
  isPublic: z.boolean().optional().default(false),
  copyFromLeagueId: z.number().int().positive().optional(),
});

const router = Router();
const commissionerService = new CommissionerService();

/**
 * POST /api/commissioner/create-season
 * Commissioner or Admin can create a new league/season.
 * Body: { name, season, draftMode?, draftOrder?, isPublic?, copyFromLeagueId? }
 */
router.post("/commissioner/create-season", requireAuth, asyncHandler(async (req, res) => {
    // Must be admin or commissioner of at least one league
    const user = req.user!;
    const isAdmin = user.isAdmin;
    if (!isAdmin) {
      const commMembership = await prisma.leagueMembership.findFirst({
        where: { userId: user.id, role: "COMMISSIONER" },
      });
      if (!commMembership) {
        return res.status(403).json({ error: "Commissioner or Admin access required" });
      }
    }

    const parsed = createSeasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    const body = parsed.data;

    const data = {
        name: norm(body.name),
        season: body.season,
        draftMode: body.draftMode as "AUCTION" | "DRAFT",
        draftOrder: body.draftMode === "DRAFT" ? (body.draftOrder as "SNAKE" | "LINEAR" | undefined) : undefined,
        isPublic: body.isPublic ?? false,
        publicSlug: "",
        copyFromLeagueId: body.copyFromLeagueId,
        creatorUserId: user.id,
    };

    if (!data.name) return res.status(400).json({ error: "Missing name" });

    const league = await commissionerService.createLeague(data);

    writeAuditLog({
      userId: user.id,
      action: "LEAGUE_CREATE",
      resourceType: "League",
      resourceId: String(league.id),
      metadata: { name: league.name, season: league.season },
    });

    return res.json({ league });
}));

/**
 * GET /api/commissioner/:leagueId
 * Returns league + teams + memberships (with user info)
 */
router.get("/commissioner/:leagueId", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);

    // NOTE: New fields (waiver*, visibility, maxTeams, description, entryFee, entryFeeNote)
    // require `npx prisma generate` after migration. Using `as any` until then.
    const league = await (prisma.league as any).findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        season: true,
        draftMode: true,
        draftOrder: true,
        isPublic: true,
        publicSlug: true,
        scoringFormat: true,
        pointsConfig: true,
        playoffWeeks: true,
        playoffTeams: true,
        regularSeasonWeeks: true,
        tradeReviewPolicy: true,
        vetoThreshold: true,
        waiverType: true,
        faabBudget: true,
        faabMinBid: true,
        waiverPeriodDays: true,
        processingFreq: true,
        faabTiebreaker: true,
        acquisitionLimit: true,
        conditionalClaims: true,
        tradeDeadline: true,
        rosterLockTime: true,
        visibility: true,
        maxTeams: true,
        description: true,
        entryFee: true,
        entryFeeNote: true,
      },
    });
    if (!league) return res.status(404).json({ error: "League not found" });

    const teams = await prisma.team.findMany({
      where: { leagueId },
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        leagueId: true,
        name: true,
        owner: true,
        budget: true,
        code: true,
        ownerUserId: true,
        ownerUser: { select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true } },
        ownerships: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    const memberships = await prisma.leagueMembership.findMany({
      where: { leagueId },
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        leagueId: true,
        userId: true,
        role: true,
        user: { select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true } },
      },
    });

    return res.json({ league, teams, memberships });
}));

/**
 * GET /api/commissioner/:leagueId/available-users
 * Returns all registered users for owner assignment dropdown
 */
router.get("/commissioner/:leagueId/available-users", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, avatarUrl: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    return res.json({ users });
}));

/**
 * GET /api/commissioner/:leagueId/prior-teams
 * Returns teams from the previous season for team history linking
 */
router.get("/commissioner/:leagueId/prior-teams", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);

    // Get current league to find its season
    const currentLeague = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!currentLeague) return res.status(404).json({ error: "League not found" });

    // Find the prior season's league within the same franchise
    const priorLeague = await prisma.league.findFirst({
      where: {
        franchiseId: currentLeague.franchiseId,
        season: currentLeague.season - 1,
      },
    });

    if (!priorLeague) {
      return res.json({ priorTeams: [], priorLeagueId: null });
    }

    const priorTeams = await prisma.team.findMany({
      where: { leagueId: priorLeague.id },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    return res.json({ priorTeams, priorLeagueId: priorLeague.id, priorSeason: priorLeague.season });
}));

/**
 * PATCH /api/commissioner/:leagueId
 * Update league details — enforces rule lock tiers based on season status.
 */
const updateLeagueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  scoringFormat: z.enum(["ROTO", "H2H_CATEGORIES", "H2H_POINTS"]).optional(),
  pointsConfig: z.record(z.string(), z.number()).optional(),
  playoffWeeks: z.number().int().min(0).max(10).optional(),
  playoffTeams: z.number().int().min(2).max(16).optional(),
  regularSeasonWeeks: z.number().int().min(1).max(30).optional(),
  // Waiver configuration
  waiverType: z.enum(["FAAB", "ROLLING_PRIORITY", "REVERSE_STANDINGS", "FREE_AGENT"]).optional(),
  faabBudget: z.number().int().min(50).max(1000).optional(),
  faabMinBid: z.number().int().min(0).max(1).optional(),
  waiverPeriodDays: z.number().int().min(0).max(7).optional(),
  processingFreq: z.enum(["DAILY", "WEEKLY_MON", "WEEKLY_WED", "WEEKLY_FRI", "WEEKLY_SUN"]).optional(),
  faabTiebreaker: z.enum(["ROLLING_PRIORITY", "REVERSE_STANDINGS", "RANDOM"]).optional(),
  acquisitionLimit: z.number().int().min(0).max(999).nullable().optional(),
  conditionalClaims: z.boolean().optional(),
  tradeDeadline: z.string().nullable().optional(), // ISO date string or null
  rosterLockTime: z.enum(["GAME_TIME", "DAILY_LOCK"]).nullable().optional(),
  // League discovery
  visibility: z.enum(["PRIVATE", "PUBLIC", "OPEN"]).optional(),
  maxTeams: z.number().int().min(4).max(30).optional(),
  description: z.string().max(500).nullable().optional(),
  entryFee: z.number().min(0).max(10000).nullable().optional(),
  entryFeeNote: z.string().max(200).nullable().optional(),
  // Trade settings
  tradeReviewPolicy: z.enum(["COMMISSIONER", "LEAGUE_VOTE"]).optional(),
  vetoThreshold: z.number().int().min(1).max(20).optional(),
});

router.patch("/commissioner/:leagueId", requireAuth, requireCommissionerOrAdmin(), validateBody(updateLeagueSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const body = req.body;

    // Get current season status for rule lock checks
    const season = await prisma.season.findFirst({
      where: { leagueId },
      orderBy: { year: "desc" },
      select: { status: true },
    });
    const seasonStatus = season?.status ?? null;

    // Check all submitted fields against rule locks
    const lockedViolations: string[] = [];
    for (const field of Object.keys(body)) {
      if (body[field] === undefined) continue;
      if (isRuleLocked(field, seasonStatus)) {
        lockedViolations.push(field);
      }
    }

    if (lockedViolations.length > 0) {
      return res.status(400).json({
        error: `These settings are locked and cannot be changed: ${lockedViolations.join(", ")}. ${lockMessage(lockedViolations[0])}`,
        lockedFields: lockedViolations,
      });
    }

    const league = await commissionerService.updateLeague(leagueId, body);

    writeAuditLog({
      userId: req.user!.id,
      action: "LEAGUE_UPDATE",
      resourceType: "League",
      resourceId: String(leagueId),
      metadata: { leagueId, fields: Object.keys(body).filter(k => body[k] !== undefined) },
    });

    return res.json({ league });
}));

/**
 * GET /api/commissioner/:leagueId/locked-fields
 * Returns list of fields that are currently locked based on season status.
 */
router.get("/commissioner/:leagueId/locked-fields", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);

    const season = await prisma.season.findFirst({
      where: { leagueId },
      orderBy: { year: "desc" },
      select: { status: true },
    });
    const seasonStatus = season?.status ?? null;

    return res.json({
      seasonStatus,
      lockedFields: getLockedFields(seasonStatus),
    });
}));

/**
 * POST /api/commissioner/:leagueId/teams
 * Body:
 *  - { name, code?, owner?, budget?, priorTeamId? }
 *  - OR { teams: [{ name, code?, owner?, budget?, priorTeamId? }, ...] }
 */
router.post("/commissioner/:leagueId/teams", requireAuth, requireCommissionerOrAdmin(), validateBody(createTeamsSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);

    const items = Array.isArray(req.body?.teams) ? req.body.teams : [req.body];

    if (!items.length) return res.status(400).json({ error: "Missing teams" });

    const created: { id: number; name: string; code: string | null; leagueId: number }[] = [];

    for (const raw of items) {
      const name = norm(raw?.name);
      if (!name) return res.status(400).json({ error: "Missing team name" });

      const t = await commissionerService.createTeam(leagueId, {
          name,
          code: raw?.code,
          owner: raw?.owner,
          budget: raw?.budget != null && String(raw.budget).trim() !== "" ? Number(raw.budget) : undefined,
          priorTeamId: raw?.priorTeamId != null ? Number(raw.priorTeamId) : undefined
      });

      created.push(t);
    }

    for (const t of created) {
      writeAuditLog({
        userId: req.user!.id,
        action: "TEAM_CREATE",
        resourceType: "Team",
        resourceId: String(t.id),
        metadata: { leagueId, teamName: t.name },
      });
    }

    return res.json({ teams: created });
}));

/**
 * DELETE /api/commissioner/:leagueId/teams/:teamId
 * Commissioner can delete a team (cleanup).
 */
router.delete("/commissioner/:leagueId/teams/:teamId", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const teamId = Number(req.params.teamId);

    if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Invalid teamId" });

    await commissionerService.deleteTeam(leagueId, teamId);

    writeAuditLog({
      userId: req.user!.id,
      action: "TEAM_DELETE",
      resourceType: "Team",
      resourceId: String(teamId),
      metadata: { leagueId },
    });

    return res.json({ success: true });
}));

/**
 * POST /api/commissioner/:leagueId/members
 * Commissioner or Admin can add members with any role.
 * If the user hasn't signed up yet, creates a pending invite.
 * Body: { userId?: number, email?: string, role: "OWNER" | "COMMISSIONER" }
 */
router.post("/commissioner/:leagueId/members", requireAuth, requireCommissionerOrAdmin(), validateBody(addMemberSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);

    const role = mustOneOf(norm(req.body?.role), ["COMMISSIONER", "OWNER"], "role") as
      | "COMMISSIONER"
      | "OWNER";

    const result = await commissionerService.addMember(leagueId, {
        userId: req.body?.userId != null && String(req.body.userId).trim() !== "" ? Number(req.body.userId) : undefined,
        email: req.body?.email,
        role,
        invitedBy: req.user!.id,
    });

    if (result.status === "added" && result.membership) {
      evictMembershipCache(result.membership.userId, leagueId);

      writeAuditLog({
        userId: req.user!.id,
        action: "MEMBER_ADD",
        resourceType: "LeagueMembership",
        resourceId: String(result.membership.id),
        metadata: { leagueId, targetUserId: result.membership.userId, role },
      });
    } else if (result.status === "invited" && result.invite) {
      writeAuditLog({
        userId: req.user!.id,
        action: "MEMBER_INVITE",
        resourceType: "LeagueInvite",
        resourceId: String(result.invite.id),
        metadata: { leagueId, email: req.body?.email, role },
      });
    }

    return res.json(result);
}));

/**
 * PATCH /api/commissioner/:leagueId/members/:membershipId
 * Change a member's role.
 * Body: { role: "COMMISSIONER" | "OWNER" }
 */
const changeMemberRoleSchema = z.object({
  role: z.enum(["COMMISSIONER", "OWNER"]),
});

router.patch("/commissioner/:leagueId/members/:membershipId", requireAuth, requireCommissionerOrAdmin(), validateBody(changeMemberRoleSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const membershipId = Number(req.params.membershipId);

    if (!Number.isFinite(membershipId)) return res.status(400).json({ error: "Invalid membershipId" });

    const membership = await commissionerService.changeMemberRole(leagueId, membershipId, req.body.role);

    writeAuditLog({
      userId: req.user!.id,
      action: "MEMBER_ROLE_CHANGE",
      resourceType: "LeagueMembership",
      resourceId: String(membershipId),
      metadata: { leagueId, targetUserId: membership.userId, newRole: req.body.role },
    });

    return res.json({ membership });
}));

/**
 * DELETE /api/commissioner/:leagueId/members/:membershipId
 * Remove a member from the league.
 */
router.delete("/commissioner/:leagueId/members/:membershipId", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const membershipId = Number(req.params.membershipId);

    if (!Number.isFinite(membershipId)) return res.status(400).json({ error: "Invalid membershipId" });

    const membership = await commissionerService.removeMember(leagueId, membershipId);

    evictMembershipCache(membership.userId, leagueId);

    writeAuditLog({
      userId: req.user!.id,
      action: "MEMBER_REMOVE",
      resourceType: "LeagueMembership",
      resourceId: String(membershipId),
      metadata: { leagueId, removedUserId: membership.userId },
    });

    return res.json({ success: true });
}));

/**
 * GET /api/commissioner/:leagueId/invites
 * List pending and recent invites for this league.
 */
router.get("/commissioner/:leagueId/invites", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const invites = await commissionerService.getInvites(leagueId);
    return res.json({ invites });
}));

/**
 * DELETE /api/commissioner/:leagueId/invites/:inviteId
 * Cancel a pending invite.
 */
router.delete("/commissioner/:leagueId/invites/:inviteId", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const inviteId = Number(req.params.inviteId);

    if (!Number.isFinite(inviteId)) return res.status(400).json({ error: "Invalid inviteId" });

    const invite = await commissionerService.cancelInvite(leagueId, inviteId);

    writeAuditLog({
      userId: req.user!.id,
      action: "INVITE_CANCEL",
      resourceType: "LeagueInvite",
      resourceId: String(inviteId),
      metadata: { leagueId, email: invite.email },
    });

    return res.json({ success: true, invite });
}));

/**
 * POST /api/commissioner/:leagueId/teams/:teamId/owner
 * Add an owner to the team (max 2 owners).
 * Body: { userId?: number, email?: string, ownerName?: string }
 */
router.post(
  "/commissioner/:leagueId/teams/:teamId/owner",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(addTeamOwnerSchema),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const teamId = Number(req.params.teamId);

      if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Invalid teamId" });

      let team;
      try {
        team = await commissionerService.addTeamOwner(leagueId, teamId, {
            userId: req.body?.userId != null && String(req.body.userId).trim() !== "" ? Number(req.body.userId) : undefined,
            email: req.body?.email,
            ownerName: req.body?.ownerName
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("already an owner") || msg.includes("already has 2 owners") || msg.includes("not found")) {
          return res.status(409).json({ error: msg });
        }
        throw err;
      }

      writeAuditLog({
        userId: req.user!.id,
        action: "TEAM_OWNER_ADD",
        resourceType: "Team",
        resourceId: String(teamId),
        metadata: { leagueId, targetUserId: req.body?.userId, ownerName: req.body?.ownerName },
      });

      return res.json({ team });
  })
);

/**
 * DELETE /api/commissioner/:leagueId/teams/:teamId/owner/:userId
 * Remove an owner from the team.
 */
router.delete(
  "/commissioner/:leagueId/teams/:teamId/owner/:userId",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const teamId = Number(req.params.teamId);
      const userId = Number(req.params.userId);

      if (!Number.isFinite(teamId) || !Number.isFinite(userId)) {
        return res.status(400).json({ error: "Invalid teamId or userId" });
      }

      const team = await commissionerService.removeTeamOwner(leagueId, teamId, userId);

      writeAuditLog({
        userId: req.user!.id,
        action: "TEAM_OWNER_REMOVE",
        resourceType: "Team",
        resourceId: String(teamId),
        metadata: { leagueId, removedUserId: userId },
      });

      return res.json({ team });
  })
);

/**
 * GET /api/commissioner/:leagueId/teams/:teamId/roster
 * Returns active roster (releasedAt is null) + player fields.
 */
router.get(
  "/commissioner/:leagueId/teams/:teamId/roster",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const teamId = Number(req.params.teamId);

      if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Invalid teamId" });

      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.leagueId !== leagueId) return res.status(404).json({ error: "Team not found" });

      const roster = await prisma.roster.findMany({
        where: { teamId, releasedAt: null },
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          teamId: true,
          playerId: true,
          acquiredAt: true,
          releasedAt: true,
          source: true,
          price: true,
          player: { select: { id: true, mlbId: true, name: true, posPrimary: true, posList: true } },
        },
      });

      return res.json({ roster });
  })
);

/**
 * POST /api/commissioner/:leagueId/roster/assign
 * Manual assignment:
 * Body:
 * {
 *   teamId: number,
 *   mlbId?: number|string,
 *   name: string,
 *   posPrimary: string,
 *   posList?: string,
 *   price?: number,
 *   source?: string
 * }
 */
router.post(
  "/commissioner/:leagueId/roster/assign",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(rosterAssignSchema),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const teamId = Number(req.body?.teamId);
      if (!Number.isFinite(teamId)) return res.status(400).json({ error: "Invalid teamId" });

      const mlbIdRaw = req.body?.mlbId;
      const mlbIdNum =
        mlbIdRaw != null && String(mlbIdRaw).trim() !== "" ? Number(String(mlbIdRaw).trim()) : undefined;
      const mlbId = typeof mlbIdNum === 'number' && Number.isFinite(mlbIdNum) ? mlbIdNum : undefined;

      const name = norm(req.body?.name);
      if (!name) return res.status(400).json({ error: "Missing name" });

      const roster = await commissionerService.assignPlayer(leagueId, {
          teamId,
          mlbId,
          name,
          posPrimary: req.body?.posPrimary,
          posList: req.body?.posList,
          price: req.body?.price,
          source: req.body?.source,
          effectiveDate: req.body?.effectiveDate,
      });

      writeAuditLog({
        userId: req.user!.id,
        action: "ROSTER_ASSIGN",
        resourceType: "Roster",
        resourceId: String(roster.id),
        metadata: { leagueId, teamId, playerName: name, mlbId },
      });

      return res.json({ roster });
  })
);

/**
 * POST /api/commissioner/:leagueId/roster/release
 * Body: { rosterId?: number, teamId?: number, playerId?: number }
 */
router.post(
  "/commissioner/:leagueId/roster/release",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(rosterReleaseSchema),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);

      const rosterIdRaw = req.body?.rosterId;
      const rosterId = rosterIdRaw != null && String(rosterIdRaw).trim() !== "" ? Number(rosterIdRaw) : undefined;
      const teamId = req.body?.teamId ? Number(req.body.teamId) : undefined;
      const playerId = req.body?.playerId ? Number(req.body.playerId) : undefined;

      const result = await commissionerService.releasePlayer(leagueId, {
          rosterId,
          teamId,
          playerId,
          effectiveDate: req.body?.effectiveDate,
      });

      writeAuditLog({
        userId: req.user!.id,
        action: "ROSTER_RELEASE",
        resourceType: "Roster",
        resourceId: String(rosterId ?? ""),
        metadata: { leagueId, teamId, playerId },
      });

      return res.json({ success: true, ...result });
  })
);

/**
 * PATCH /api/commissioner/:leagueId/roster/:rosterId
 * Edit a roster entry (price, position, source). Used to fix auction mistakes.
 */
const rosterEditSchema = z.object({
  price: z.number().int().min(0).optional(),
  assignedPosition: z.string().max(5).nullable().optional(),
  source: z.string().max(50).optional(),
});

router.patch(
  "/commissioner/:leagueId/roster/:rosterId",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(rosterEditSchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const rosterId = Number(req.params.rosterId);

    // Verify roster belongs to this league
    const roster = await prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        team: { select: { leagueId: true } },
        player: { select: { name: true, posList: true } },
      },
    });
    if (!roster || roster.team.leagueId !== leagueId) {
      return res.status(404).json({ error: "Roster entry not found" });
    }

    const updates: Record<string, unknown> = {};
    if (req.body.price !== undefined) updates.price = req.body.price;
    if (req.body.assignedPosition !== undefined) updates.assignedPosition = req.body.assignedPosition;
    if (req.body.source !== undefined) updates.source = req.body.source;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Phase 2b (plan Q8 follow-on): if the commissioner is changing the
    // assignedPosition, verify the player is eligible for the new slot.
    // The "IL" slot is exempt — MLB-IL eligibility is enforced by the
    // dedicated /transactions/il-stash endpoint, not here. A null clears
    // the assignment; also allowed.
    if (enforceRosterRules()
        && updates.assignedPosition !== undefined
        && updates.assignedPosition !== null
        && updates.assignedPosition !== "IL") {
      const targetSlot = String(updates.assignedPosition);
      if (!isEligibleForSlot(roster.player.posList, targetSlot)) {
        return res.status(400).json({
          error: `${roster.player.name} (${roster.player.posList}) is not eligible for the ${targetSlot} slot.`,
          code: "POSITION_INELIGIBLE",
        });
      }
    }

    // If price changes, adjust team budget accordingly
    if (updates.price !== undefined) {
      const priceDiff = (updates.price as number) - roster.price;
      if (priceDiff !== 0) {
        await prisma.team.update({
          where: { id: roster.teamId },
          data: { budget: { decrement: priceDiff } },
        });
      }
    }

    const updated = await prisma.roster.update({
      where: { id: rosterId },
      data: updates,
    });

    writeAuditLog({
      userId: req.user!.id,
      action: "ROSTER_EDIT",
      resourceType: "Roster",
      resourceId: String(rosterId),
      metadata: { leagueId, playerName: roster.player.name, updates },
    });

    return res.json({ success: true, roster: updated });
  })
);

/**
 * GET /api/commissioner/:leagueId/rosters
 * Get ALl active rosters for the league
 */
router.get(
  "/commissioner/:leagueId/rosters",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      const rosters = await prisma.roster.findMany({
        where: {
          team: { leagueId },
          releasedAt: null,
        },
        include: {
          team: { select: { id: true, code: true, name: true } },
          player: { select: { id: true, name: true, posPrimary: true, mlbId: true } },
        },
      });
      return res.json({ rosters });
  })
);

/**
 * POST /api/commissioner/:leagueId/roster/import
 * Import CSV: teamCode,playerName,position,acquisitionCost
 */
router.post(
  "/commissioner/:leagueId/roster/import",
  requireAuth,
  requireCommissionerOrAdmin(),
  upload.single("file"),
  asyncHandler(async (req, res) => {
      const leagueId = Number(req.params.leagueId);
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const csvContent = req.file.buffer.toString("utf-8"); // Convert buffer to string

      const result = await commissionerService.importRosters(leagueId, csvContent);

      writeAuditLog({
        userId: req.user!.id,
        action: "ROSTER_IMPORT",
        resourceType: "Roster",
        metadata: { leagueId },
      });

      return res.json(result);
  })
);


/**
 * ==========================================
 *  Period Management (Global / Season)
 * ==========================================
 */

/**
 * GET /api/commissioner/periods
 */
router.get("/commissioner/periods/list", requireAuth, asyncHandler(async (req, res) => {
     // Allow any auth user to see periods? Or restrict?
     // Usually public data, but editing is restricted.
     const periods = await prisma.period.findMany({ orderBy: { startDate: 'asc' } });
     return res.json({ periods });
}));

/**
 * POST /api/commissioner/periods
 * Create or Update Period
 */
router.post("/commissioner/periods", requireAuth, requireAdmin, validateBody(periodSchema), asyncHandler(async (req, res) => {
    const id = Number(req.body.id);
    const name = norm(req.body.name);
    const start = req.body.startDate ? new Date(req.body.startDate) : null;
    const end = req.body.endDate ? new Date(req.body.endDate) : null;
    const status = norm(req.body.status) || "upcoming";

    if (!name || !start || !end) return res.status(400).json({ error: "Missing fields" });

    let period;
    if (id && Number.isFinite(id)) {
      period = await prisma.period.update({
        where: { id },
        data: { name, startDate: start, endDate: end, status },
      });
    } else {
      period = await prisma.period.create({
         data: { name, startDate: start, endDate: end, status }
      });
    }
    return res.json({ period });
}));

/**
 * DELETE /api/commissioner/periods/:id
 */
router.delete("/commissioner/periods/:id", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
     const id = Number(req.params.id);
     await prisma.period.delete({ where: { id } });
     return res.json({ success: true });
}));

/**
 * ==========================================
 *  League Rules (Auction Settings, etc.)
 * ==========================================
 */

router.get("/commissioner/:leagueId/rules", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
        const leagueId = Number(req.params.leagueId);
        const rules = await prisma.leagueRule.findMany({ where: { leagueId } });
        return res.json({ rules });
}));

router.post("/commissioner/:leagueId/rules", requireAuth, requireCommissionerOrAdmin(), validateBody(ruleSchema), asyncHandler(async (req, res) => {
        const leagueId = Number(req.params.leagueId);
        const { category, key, value, label } = req.body;

        const rule = await prisma.leagueRule.upsert({
            where: { leagueId_category_key: { leagueId, category, key } },
            create: { leagueId, category, key, value, label: label || key },
            update: { value, label: label || undefined }
        });

        writeAuditLog({
          userId: req.user!.id,
          action: "RULES_UPDATE",
          resourceType: "LeagueRule",
          resourceId: String(rule.id),
          metadata: { leagueId, category, key, value },
        });

        return res.json({ rule });
}));

/**
 * ==========================================
 *  Auction Controls
 * ==========================================
 */

/**
 * POST /api/commissioner/:leagueId/end-auction
 * Finalizes auction:
 * 1. Checks if rosters are full (warns if not?)
 * 2. Creates initial RosterEntry snapshot for "Start of Season"
 * 3. Updates League status (if we had one) or Rule?
 */
router.post("/commissioner/:leagueId/end-auction", requireAuth, requireCommissionerOrAdmin(), validateBody(z.object({})), asyncHandler(async (req, res) => {
        const leagueId = Number(req.params.leagueId);

        const result = await commissionerService.endAuction(leagueId);

        writeAuditLog({
          userId: req.user!.id,
          action: "AUCTION_END",
          resourceType: "Auction",
          metadata: { leagueId, snapshotted: result.snapshotted },
        });

        return res.json({ success: true, ...result });
}));

/**
 * ==========================================
 *  Commissioner Direct Trade Execution
 * ==========================================
 */

import { tradeItemSchema } from "../trades/routes.js";

const executeTradeSchema = z.object({
  items: z.array(tradeItemSchema).min(1),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/commissioner/:leagueId/execute-trade
 * Commissioner directly records an offline trade (no proposal/accept flow).
 */
router.post(
  "/commissioner/:leagueId/execute-trade",
  requireAuth,
  requireCommissionerOrAdmin(),
  validateBody(executeTradeSchema),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const { items, note } = req.body;

    let trade: { id: number; items: { id: number }[] };
    try {
      trade = await commissionerService.executeTrade(leagueId, items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("All teams must belong")) {
        return res.status(400).json({ error: msg });
      }
      throw err;
    }

    writeAuditLog({
      userId: req.user!.id,
      action: "COMMISSIONER_TRADE_EXECUTE",
      resourceType: "Trade",
      resourceId: String(trade.id),
      metadata: { leagueId, itemCount: trade.items?.length, note },
    });

    return res.json({ success: true, trade });
  })
);

// ─── League Health Dashboard ───────────────────────────────────────────────

router.get("/commissioner/:leagueId/health", requireAuth, requireCommissionerOrAdmin(), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);

  // Get all teams with owners
  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      ownerUser: { select: { id: true, name: true, email: true, updatedAt: true } },
      ownerships: { include: { user: { select: { id: true, name: true, updatedAt: true } } } },
    },
  });

  // Get current season for period count
  const season = await prisma.season.findFirst({
    where: { leagueId },
    orderBy: { year: "desc" },
  });

  const totalPeriods = season
    ? await prisma.period.count({ where: { seasonId: season.id } })
    : 0;

  // Aggregate activity counts per team
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const health = await Promise.all(teams.map(async (team) => {
    const ownerName = team.ownerships?.[0]?.user?.name ?? team.ownerUser?.name ?? team.owner ?? "Unknown";
    const lastLogin = team.ownerships?.[0]?.user?.updatedAt ?? team.ownerUser?.updatedAt ?? null;

    // Count waiver claims this season
    const waiverClaims = await prisma.waiverClaim.count({
      where: { teamId: team.id, createdAt: { gte: thirtyDaysAgo } },
    });

    // Count trades (as proposer or party)
    const trades = await prisma.trade.count({
      where: {
        leagueId,
        OR: [
          { proposerId: team.id },
          { items: { some: { OR: [{ senderId: team.id }, { recipientId: team.id }] } } },
        ],
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Count periods with roster entries
    const periodsWithRoster = season
      ? await prisma.roster.count({
          where: { teamId: team.id, releasedAt: null },
        }).then(c => c > 0 ? totalPeriods : 0) // simplified: has roster = all periods
      : 0;

    // Engagement score (0-100)
    const daysSinceLogin = lastLogin ? Math.floor((now.getTime() - new Date(lastLogin).getTime()) / 86400000) : 999;
    const loginScore = daysSinceLogin <= 7 ? 30 : daysSinceLogin <= 14 ? 20 : daysSinceLogin <= 30 ? 10 : 0;
    const waiverScore = waiverClaims >= 3 ? 25 : waiverClaims >= 1 ? 15 : 0;
    const tradeScore = trades >= 2 ? 20 : trades >= 1 ? 10 : 0;
    const lineupRate = totalPeriods > 0 ? periodsWithRoster / totalPeriods : 1;
    const lineupScore = lineupRate >= 1 ? 25 : lineupRate >= 0.8 ? 20 : lineupRate >= 0.5 ? 10 : 0;
    const engagementScore = Math.min(100, loginScore + waiverScore + tradeScore + lineupScore);

    const status = engagementScore >= 70 ? "active" : engagementScore >= 40 ? "at-risk" : "inactive";

    return {
      teamId: team.id,
      teamName: team.name,
      teamCode: team.code ?? "",
      ownerName,
      lastLogin: lastLogin?.toISOString() ?? null,
      daysSinceLogin: daysSinceLogin === 999 ? null : daysSinceLogin,
      waiverClaimsThisSeason: waiverClaims,
      tradesThisSeason: trades,
      periodsWithLineupSet: periodsWithRoster,
      totalPeriods,
      engagementScore,
      status,
    };
  }));

  // Sort by score ascending (at-risk first)
  health.sort((a, b) => a.engagementScore - b.engagementScore);

  res.json({ health, leagueHealthScore: Math.round(health.reduce((s, h) => s + h.engagementScore, 0) / (health.length || 1)) });
}));

/**
 * POST /api/commissioner/:leagueId/reconcile-il-fees/:periodId
 *
 * Manual IL-fee recovery endpoint (plan Phase 3, security review). Walks
 * the RosterSlotEvent log for the period and brings the il_fee ledger to
 * the correct state via append-only void+reversal semantics.
 *
 * Query:
 *   - dryRun=true: preview the diff (counts of added/voided/unchanged)
 *     without writing. Commissioner uses this to inspect impact before
 *     committing.
 *
 * Gates:
 *   - Commissioner-or-admin for the league (requireCommissionerOrAdmin middleware)
 *   - IDOR guard: verifies Period.leagueId === leagueId (inside ilFeeService)
 *   - Rate limit: 1 call / 30s per (leagueId, periodId) to defend against DoS
 *     and reduce advisory-lock contention under repeated clicks.
 */
const reconcileRateLimitMap = new Map<string, number>();
const RECONCILE_COOLDOWN_MS = 30_000;

router.post(
  "/commissioner/:leagueId/reconcile-il-fees/:periodId",
  requireAuth,
  requireCommissionerOrAdmin(),
  asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const periodId = Number(req.params.periodId);
    const dryRun = req.query.dryRun === "true" || req.query.dryRun === "1";

    if (!Number.isFinite(leagueId) || !Number.isFinite(periodId)) {
      return res.status(400).json({ error: "Invalid leagueId or periodId" });
    }

    const key = `${leagueId}:${periodId}`;
    const last = reconcileRateLimitMap.get(key);
    if (last && Date.now() - last < RECONCILE_COOLDOWN_MS && !dryRun) {
      const wait = Math.ceil((RECONCILE_COOLDOWN_MS - (Date.now() - last)) / 1000);
      return res.status(429).json({
        error: `Reconcile cooling down — wait ${wait}s before retrying this period.`,
        code: "RATE_LIMIT",
      });
    }
    if (!dryRun) reconcileRateLimitMap.set(key, Date.now());

    try {
      const result = await reconcileIlFeesForPeriod(leagueId, periodId, {
        dryRun,
        actorUserId: req.user!.id,
      });
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("does not belong to league")) {
        // IDOR guard from ilFeeService
        return res.status(404).json({ error: "Period not found in league." });
      }
      if (msg.includes("Period") && msg.includes("not found")) {
        return res.status(404).json({ error: msg });
      }
      throw err;
    }
  }),
);

export const commissionerRouter = router;
export default commissionerRouter;

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

const rosterAssignSchema = z.object({
  teamId: z.number().int().positive(),
  mlbId: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1).max(200),
  posPrimary: z.string().max(10).optional(),
  posList: z.string().max(100).optional(),
  price: z.number().nonnegative().optional(),
  source: z.string().max(50).optional(),
});

const rosterReleaseSchema = z.object({
  rosterId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  playerId: z.number().int().positive().optional(),
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

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        season: true,
        draftMode: true,
        draftOrder: true,
        isPublic: true,
        publicSlug: true,
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
 * Update league details (e.g., name)
 */
const updateLeagueSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});

router.patch("/commissioner/:leagueId", requireAuth, requireCommissionerOrAdmin(), validateBody(updateLeagueSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const { name } = req.body;

    const league = await commissionerService.updateLeague(leagueId, { name });

    writeAuditLog({
      userId: req.user!.id,
      action: "LEAGUE_UPDATE",
      resourceType: "League",
      resourceId: String(leagueId),
      metadata: { leagueId, name },
    });

    return res.json({ league });
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
          source: req.body?.source
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
          playerId
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

export const commissionerRouter = router;
export default commissionerRouter;

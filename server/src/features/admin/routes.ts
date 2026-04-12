// server/src/routes/admin.ts
import { Router } from "express";
import express from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { norm, mustOneOf } from "../../lib/utils.js";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { writeAuditLog } from "../../lib/auditLog.js";
import { addMemberSchema } from "../../lib/schemas.js";
import { CommissionerService } from "../commissioner/services/CommissionerService.js";
import { syncAllPlayers, syncPositionEligibility, syncAAARosters, enrichStalePlayers } from "../players/services/mlbSyncService.js";
import { syncPeriodStats, syncAllActivePeriods } from "../players/services/mlbStatsSyncService.js";

const createLeagueSchema = z.object({
  name: z.string().min(1).max(200),
  season: z.number().int().min(1900).max(2100),
  draftMode: z.enum(["AUCTION", "DRAFT"]).optional().default("AUCTION"),
  draftOrder: z.enum(["SNAKE", "LINEAR"]).optional(),
  isPublic: z.boolean().optional().default(false),
  publicSlug: z.string().max(100).optional(),
  copyFromLeagueId: z.number().int().positive().optional(),
});

const router = Router();
const commissionerService = new CommissionerService();

/**
 * POST /api/admin/league
 * Body:
 * {
 *   name: string,
 *   season: number,
 *   draftMode: "AUCTION" | "DRAFT",
 *   draftOrder?: "SNAKE" | "LINEAR",
 *   isPublic?: boolean,
 *   publicSlug?: string,
 *   copyFromLeagueId?: number
 * }
 */
router.post("/admin/league", requireAuth, requireAdmin, validateBody(createLeagueSchema), asyncHandler(async (req, res) => {
    const data = {
        name: norm(req.body?.name),
        season: Number(req.body?.season),
        draftMode: mustOneOf(norm(req.body?.draftMode || "AUCTION"), ["AUCTION", "DRAFT"], "draftMode") as "AUCTION" | "DRAFT",
        draftOrder: req.body?.draftMode === "DRAFT" ? (mustOneOf(norm(req.body?.draftOrder || "SNAKE"), ["SNAKE", "LINEAR"], "draftOrder") as "SNAKE" | "LINEAR") : undefined,
        isPublic: Boolean(req.body?.isPublic ?? false),
        publicSlug: norm(req.body?.publicSlug || ""),
        copyFromLeagueId: Number.isFinite(Number(req.body?.copyFromLeagueId)) ? Number(req.body?.copyFromLeagueId) : undefined,
        creatorUserId: req.user!.id
    };

    if (!data.name) return res.status(400).json({ error: "Missing name" });
    if (!Number.isFinite(data.season) || data.season < 1900 || data.season > 2100) {
      return res.status(400).json({ error: "Invalid season" });
    }

    const league = await commissionerService.createLeague(data);

    writeAuditLog({
      userId: req.user!.id,
      action: "LEAGUE_CREATE",
      resourceType: "League",
      resourceId: String(league.id),
      metadata: { name: league.name, season: league.season },
    });

    return res.json({ league });
}));

/**
 * POST /api/admin/league/:leagueId/members
 * Body:
 * { userId?: number, email?: string, role: "COMMISSIONER" | "OWNER" }
 */
router.post("/admin/league/:leagueId/members", requireAuth, requireAdmin, validateBody(addMemberSchema), asyncHandler(async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

    const role = mustOneOf(norm(req.body?.role), ["COMMISSIONER", "OWNER"], "role") as
      | "COMMISSIONER"
      | "OWNER";

    const result = await commissionerService.addMember(leagueId, {
        userId: req.body?.userId ? Number(req.body.userId) : undefined,
        email: req.body?.email,
        role,
        invitedBy: req.user!.id,
    });

    if (result.status === "added" && result.membership) {
      writeAuditLog({
        userId: req.user!.id,
        action: "MEMBER_ADD",
        resourceType: "LeagueMembership",
        resourceId: String(result.membership.id),
        metadata: { leagueId, targetUserId: result.membership.userId, role },
      });
    }

    return res.json(result);
}));

/**
 * POST /api/admin/league/:leagueId/import-rosters
 * Body: Raw CSV text or multipart (simpler: pure text/csv body for now)
 */
router.post("/admin/league/:leagueId/import-rosters", requireAuth, requireAdmin, express.text({ type: ["text/csv", "text/plain"] }), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  // Expect raw body for simplicity
  const csvContent = typeof req.body === "string" ? req.body : "";
  if (!csvContent) return res.status(400).json({ error: "Missing CSV body" });

  const result = await commissionerService.importRosters(leagueId, csvContent);

  writeAuditLog({
    userId: req.user!.id,
    action: "ROSTER_IMPORT",
    resourceType: "Roster",
    metadata: { leagueId },
  });

  return res.json(result);
}));

/**
 * POST /api/admin/league/:leagueId/reset-rosters
 * Bulk-release all active roster entries for a league (clean slate).
 */
router.post("/admin/league/:leagueId/reset-rosters", requireAuth, requireAdmin, validateBody(z.object({})), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { select: { id: true } } },
  });
  if (!league) return res.status(404).json({ error: "League not found" });

  const teamIds = league.teams.map(t => t.id);
  const result = await prisma.roster.updateMany({
    where: { teamId: { in: teamIds }, releasedAt: null },
    data: { releasedAt: new Date() },
  });

  writeAuditLog({
    userId: req.user!.id,
    action: "ROSTER_RESET",
    resourceType: "Roster",
    metadata: { leagueId, releasedCount: result.count },
  });

  return res.json({ success: true, releasedCount: result.count });
}));

/**
 * DELETE /api/admin/league/:leagueId
 * Permanently deletes a league and all associated data (teams, rosters, memberships, etc.)
 */
router.delete("/admin/league/:leagueId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(404).json({ error: "League not found" });

  // Delete in dependency order
  const teamIds = (await prisma.team.findMany({ where: { leagueId }, select: { id: true } })).map(t => t.id);

  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { team: { leagueId } } }),
    prisma.auctionLot.deleteMany({ where: { player: { rosters: { some: { team: { leagueId } } } } } }),
    prisma.auctionSession.deleteMany({ where: { leagueId } }),
    prisma.roster.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.tradeItem.deleteMany({ where: { trade: { leagueId } } }),
    prisma.trade.deleteMany({ where: { leagueId } }),
    prisma.waiverClaim.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.transactionEvent.deleteMany({ where: { leagueId } }),
    prisma.teamStatsPeriod.deleteMany({ where: { teamId: { in: teamIds } } }),
    prisma.teamStatsSeason.deleteMany({ where: { teamId: { in: teamIds } } }), // deprecated but table still in DB
    prisma.team.deleteMany({ where: { leagueId } }),
    prisma.leagueMembership.deleteMany({ where: { leagueId } }),
    prisma.leagueRule.deleteMany({ where: { leagueId } }),
    prisma.period.deleteMany({ where: { leagueId } }),
    prisma.league.delete({ where: { id: leagueId } }),
  ]);

  writeAuditLog({
    userId: req.user!.id,
    action: "LEAGUE_DELETE",
    resourceType: "League",
    resourceId: String(leagueId),
    metadata: { name: league.name, season: league.season },
  });

  return res.json({ success: true });
}));

/**
 * PATCH /api/admin/league/:leagueId/team-codes
 * Body: { codes: { teamId: code, ... } }  e.g. { "9": "DOY", "10": "HAM" }
 */
const teamCodesSchema = z.object({
  codes: z.record(z.string(), z.string().min(1).max(10)),
});

router.patch("/admin/league/:leagueId/team-codes", requireAuth, requireAdmin, validateBody(teamCodesSchema), asyncHandler(async (req, res) => {
  const leagueId = Number(req.params.leagueId);
  if (!Number.isFinite(leagueId)) return res.status(400).json({ error: "Invalid leagueId" });

  const { codes } = req.body as { codes: Record<string, string> };

  // Parse and validate all team IDs + codes upfront
  const entries = Object.entries(codes)
    .map(([idStr, code]) => ({ teamId: Number(idStr), code: norm(code).toUpperCase() }))
    .filter(e => Number.isFinite(e.teamId));

  // Single query to verify all teams belong to this league (replaces N individual lookups)
  const validTeams = await prisma.team.findMany({
    where: { id: { in: entries.map(e => e.teamId) }, leagueId },
    select: { id: true },
  });
  const validTeamIds = new Set(validTeams.map(t => t.id));

  const results: { teamId: number; code: string }[] = [];

  // Batch update via transaction (replaces N individual updates)
  await prisma.$transaction(
    entries
      .filter(e => validTeamIds.has(e.teamId))
      .map(e => {
        results.push(e);
        return prisma.team.update({
          where: { id: e.teamId },
          data: { code: e.code },
        });
      })
  );

  writeAuditLog({
    userId: req.user!.id,
    action: "TEAM_CODES_UPDATE",
    resourceType: "Team",
    metadata: { leagueId, codes: results },
  });

  return res.json({ success: true, updated: results });
}));

/**
 * POST /api/admin/sync-mlb-players
 * Fetches all NL team rosters from MLB Stats API and upserts into Player table.
 * Body (optional): { season: 2026 }
 */
const syncMlbSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/sync-mlb-players", requireAuth, requireAdmin, validateBody(syncMlbSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await syncAllPlayers(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "MLB_PLAYER_SYNC",
    resourceType: "Player",
    metadata: { season, created: result.created, updated: result.updated, teams: result.teams, teamChanges: result.teamChanges.length },
  });

  return res.json({ success: true, season, ...result });
}));

/**
 * POST /api/admin/sync-stats
 * Manually trigger stats sync for a specific period or all active periods.
 * Body (optional): { periodId?: number }
 */
const syncStatsSchema = z.object({
  periodId: z.number().int().positive().optional(),
});

router.post("/admin/sync-stats", requireAuth, requireAdmin, validateBody(syncStatsSchema), asyncHandler(async (req, res) => {
  const periodId = req.body?.periodId ? Number(req.body.periodId) : null;

  if (periodId) {
    const result = await syncPeriodStats(periodId);

    writeAuditLog({
      userId: req.user!.id,
      action: "STATS_SYNC",
      resourceType: "Period",
      resourceId: String(periodId),
      metadata: result,
    });

    return res.json({ success: true, periodId, ...result });
  }

  // Sync all active periods
  await syncAllActivePeriods();

  writeAuditLog({
    userId: req.user!.id,
    action: "STATS_SYNC",
    resourceType: "Period",
    metadata: { scope: "all_active" },
  });

  return res.json({ success: true, scope: "all_active" });
}));

/**
 * POST /api/admin/sync-position-eligibility
 * Fetches fielding stats from MLB API and updates Player.posList based on
 * games-played threshold. Players qualify for a position if GP >= threshold.
 * Body (optional): { season?: number, gpThreshold?: number }
 * gpThreshold defaults to 20 if not provided.
 */
const syncEligibilitySchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
  gpThreshold: z.number().int().min(1).max(162).optional(),
});

router.post("/admin/sync-position-eligibility", requireAuth, requireAdmin, validateBody(syncEligibilitySchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();
  const gpThreshold = req.body?.gpThreshold ?? 20;

  const result = await syncPositionEligibility(season, gpThreshold);

  writeAuditLog({
    userId: req.user!.id,
    action: "POSITION_ELIGIBILITY_SYNC",
    resourceType: "Player",
    metadata: { season, gpThreshold, ...result },
  });

  return res.json({ success: true, season, gpThreshold, ...result });
}));

/**
 * POST /api/admin/sync-prospects
 * Fetches AAA (Triple-A) rosters from MLB API and upserts new players.
 * Creates players not already in DB; skips those already on MLB 40-man rosters.
 * Body (optional): { season?: number }
 */
const syncProspectsSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/sync-prospects", requireAuth, requireAdmin, validateBody(syncProspectsSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await syncAAARosters(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "AAA_PROSPECT_SYNC",
    resourceType: "Player",
    metadata: { season, ...result },
  });

  return res.json({ success: true, season, ...result });
}));

/**
 * POST /api/admin/enrich-stale-players
 * Finds players with null/empty mlbTeam or posPrimary and enriches from MLB API.
 * Body (optional): { season?: number }
 */
const enrichStaleSchema = z.object({
  season: z.number().int().min(1900).max(2100).optional(),
});

router.post("/admin/enrich-stale-players", requireAuth, requireAdmin, validateBody(enrichStaleSchema), asyncHandler(async (req, res) => {
  const season = Number(req.body?.season) || new Date().getFullYear();

  const result = await enrichStalePlayers(season);

  writeAuditLog({
    userId: req.user!.id,
    action: "STALE_PLAYER_ENRICHMENT",
    resourceType: "Player",
    metadata: { season, ...result },
  });

  return res.json({ success: true, season, ...result });
}));

/**
 * GET /api/admin/audit-log
 * Query params: action?, userId?, limit?, offset?
 */
router.get("/admin/audit-log", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const userId = Number(req.query.userId) || undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return res.json({ entries, total, limit, offset });
}));

// ── Admin Tasks (JSON file-backed) ──

import * as fs from "node:fs";
import * as path from "node:path";

const TASKS_FILE = path.join(process.cwd(), "data", "admin-tasks.json");

function readTasks(): any {
  if (!fs.existsSync(TASKS_FILE)) return { milestones: [] };
  return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
}

function writeTasks(data: any): void {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** GET /api/admin/tasks — read all milestones + tasks */
router.get("/admin/tasks", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  return res.json(readTasks());
}));

/** PATCH /api/admin/tasks/:taskId — update a task's status or fields */
const updateTaskSchema = z.object({
  status: z.enum(["not_started", "in_progress", "done"]).optional(),
  title: z.string().min(1).max(500).optional(),
  owner: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

router.patch("/admin/tasks/:taskId", requireAuth, requireAdmin, validateBody(updateTaskSchema), asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const updates = req.body;
  const data = readTasks();

  let found = false;
  for (const milestone of data.milestones) {
    const task = milestone.tasks.find((t: any) => t.id === taskId);
    if (task) {
      if (updates.status) task.status = updates.status;
      if (updates.title) task.title = updates.title;
      if (updates.owner) task.owner = updates.owner;
      if (updates.notes !== undefined) task.notes = updates.notes;
      task.updatedAt = new Date().toISOString();
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Task not found" });

  writeTasks(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TASK_UPDATE", resourceType: "AdminTask", resourceId: taskId, metadata: updates });
  return res.json({ success: true });
}));

/** POST /api/admin/tasks — add a new task to a milestone */
const addTaskSchema = z.object({
  milestoneId: z.string().min(1),
  title: z.string().min(1).max(500),
  owner: z.enum(["jimmy", "dev"]).optional().default("dev"),
  instructions: z.array(z.string()).optional().default([]),
});

router.post("/admin/tasks", requireAuth, requireAdmin, validateBody(addTaskSchema), asyncHandler(async (req, res) => {
  const { milestoneId, title, owner, instructions } = req.body;
  const data = readTasks();

  const milestone = data.milestones.find((m: any) => m.id === milestoneId);
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").substring(0, 50);
  const newTask = { id, title, status: "not_started", owner, instructions, createdAt: new Date().toISOString() };
  milestone.tasks.push(newTask);

  writeTasks(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TASK_CREATE", resourceType: "AdminTask", resourceId: id, metadata: { milestoneId, title } });
  return res.json({ success: true, task: newTask });
}));

/** DELETE /api/admin/tasks/:taskId — remove a task */
router.delete("/admin/tasks/:taskId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const data = readTasks();

  let found = false;
  for (const milestone of data.milestones) {
    const idx = milestone.tasks.findIndex((t: any) => t.id === taskId);
    if (idx !== -1) {
      milestone.tasks.splice(idx, 1);
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Task not found" });

  writeTasks(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TASK_DELETE", resourceType: "AdminTask", resourceId: taskId });
  return res.json({ success: true });
}));

// ── Todo Page (category-based micro-tasks, JSON file-backed) ──

const TODO_FILE = path.join(process.cwd(), "data", "todo-tasks.json");

function readTodos(): any {
  if (!fs.existsSync(TODO_FILE)) return { categories: [] };
  return JSON.parse(fs.readFileSync(TODO_FILE, "utf-8"));
}

function writeTodos(data: any): void {
  fs.writeFileSync(TODO_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** GET /api/admin/todos — read all categories + todos */
router.get("/admin/todos", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  return res.json(readTodos());
}));

/** PATCH /api/admin/todos/:todoId — update a todo */
const updateTodoSchema = z.object({
  status: z.enum(["not_started", "in_progress", "done"]).optional(),
  title: z.string().min(1).max(500).optional(),
  owner: z.string().max(100).optional(),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  targetDate: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional(),
  roadmapLink: z.string().max(200).optional().nullable(),
  conceptLink: z.string().max(200).optional().nullable(),
});

router.patch("/admin/todos/:todoId", requireAuth, requireAdmin, validateBody(updateTodoSchema), asyncHandler(async (req, res) => {
  const { todoId } = req.params;
  const updates = req.body;
  const data = readTodos();

  let found = false;
  for (const cat of data.categories) {
    const todo = cat.tasks.find((t: any) => t.id === todoId);
    if (todo) {
      for (const key of Object.keys(updates)) {
        (todo as any)[key] = (updates as any)[key];
      }
      todo.updatedAt = new Date().toISOString();
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Todo not found" });

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_UPDATE", resourceType: "AdminTodo", resourceId: todoId, metadata: updates });
  return res.json({ success: true });
}));

/** POST /api/admin/todos — add a new todo to a category */
const addTodoSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(500),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional().default("p2"),
  owner: z.string().max(100).optional().default("dev"),
  instructions: z.array(z.string()).optional().default([]),
  targetDate: z.string().max(50).optional(),
  roadmapLink: z.string().max(200).optional(),
  conceptLink: z.string().max(200).optional(),
});

router.post("/admin/todos", requireAuth, requireAdmin, validateBody(addTodoSchema), asyncHandler(async (req, res) => {
  const { categoryId, title, priority, owner, instructions, targetDate, roadmapLink, conceptLink } = req.body;
  const data = readTodos();

  const cat = data.categories.find((c: any) => c.id === categoryId);
  if (!cat) return res.status(404).json({ error: "Category not found" });

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").substring(0, 60);
  const newTodo: Record<string, any> = {
    id,
    title,
    status: "not_started",
    priority,
    owner,
    instructions,
    createdAt: new Date().toISOString(),
  };
  if (targetDate) newTodo.targetDate = targetDate;
  if (roadmapLink) newTodo.roadmapLink = roadmapLink;
  if (conceptLink) newTodo.conceptLink = conceptLink;

  cat.tasks.push(newTodo);

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_CREATE", resourceType: "AdminTodo", resourceId: id, metadata: { categoryId, title } });
  return res.json({ success: true, todo: newTodo });
}));

/** DELETE /api/admin/todos/:todoId — remove a todo */
router.delete("/admin/todos/:todoId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { todoId } = req.params;
  const data = readTodos();

  let found = false;
  for (const cat of data.categories) {
    const idx = cat.tasks.findIndex((t: any) => t.id === todoId);
    if (idx !== -1) {
      cat.tasks.splice(idx, 1);
      found = true;
      break;
    }
  }

  if (!found) return res.status(404).json({ error: "Todo not found" });

  writeTodos(data);
  writeAuditLog({ userId: req.user!.id, action: "ADMIN_TODO_DELETE", resourceType: "AdminTodo", resourceId: todoId });
  return res.json({ success: true });
}));

export const adminRouter = router;
export default adminRouter;

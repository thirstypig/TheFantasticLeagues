import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import { requireAuth, requireAdmin } from "../../../middleware/auth.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { buildDashboard } from "../services/dashboardService.js";
import * as errorBuffer from "../../../lib/errorBuffer.js";
import { BUFFER_CAPACITY } from "../../../lib/errorBuffer.js";
import { logger } from "../../../lib/logger.js";
import { readTodos } from "./todos.js";

const router = Router();

interface AdminStatsResponse {
  users: {
    total: number;
    active30d: number;
    newThisMonth: number;
    paid: number;
  };
  leagues: {
    total: number;
    byStatus: { setup: number; draft: number; inSeason: number; completed: number };
  };
  aiInsights: {
    total: number;
    generatedThisWeek: number;
    latestWeekKey: string | null;
  };
  todos: {
    total: number;
    notStarted: number;
    inProgress: number;
    done: number;
    topActive: Array<{
      id: string;
      title: string;
      status: "not_started" | "in_progress";
      priority: "p0" | "p1" | "p2" | "p3";
      categoryTitle: string;
    }>;
  };
  recentActivity: Array<{
    id: number;
    userId: number;
    userName: string | null;
    userEmail: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    createdAt: string;
  }>;
  recentErrors: ReturnType<typeof errorBuffer.list>;
  generatedAt: string;
}

// 10-second in-memory cache for /admin/stats
const STATS_CACHE_TTL_MS = 10_000;
let statsCache: { value: AdminStatsResponse; expiresAt: number } | null = null;

/** Compute Monday 00:00 UTC of the current ISO week. */
function startOfCurrentWeekUtc(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Compute start of the current calendar month (UTC). */
function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Priority weight for todo sorting (p0 = highest). */
const PRIORITY_WEIGHT: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

/** Status weight — in_progress sorts before not_started. */
const STATUS_WEIGHT: Record<string, number> = { in_progress: 0, not_started: 1 };

function computeTodoSummary(): AdminStatsResponse["todos"] {
  const data = readTodos();
  const categories = data.categories ?? [];

  let total = 0;
  let notStarted = 0;
  let inProgress = 0;
  let done = 0;
  const active: Array<{
    id: string;
    title: string;
    status: "not_started" | "in_progress";
    priority: "p0" | "p1" | "p2" | "p3";
    categoryTitle: string;
  }> = [];

  for (const cat of categories) {
    const tasks = Array.isArray(cat.tasks) ? cat.tasks : [];
    for (const t of tasks) {
      total++;
      if (t.status === "done") done++;
      else if (t.status === "in_progress") inProgress++;
      else notStarted++;

      if (t.status === "not_started" || t.status === "in_progress") {
        active.push({
          id: String(t.id),
          title: String(t.title ?? ""),
          status: t.status,
          priority: t.priority ?? "p2",
          categoryTitle: String(cat.title ?? cat.id ?? ""),
        });
      }
    }
  }

  active.sort((a, b) => {
    const pa = PRIORITY_WEIGHT[a.priority] ?? 99;
    const pb = PRIORITY_WEIGHT[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    const sa = STATUS_WEIGHT[a.status] ?? 99;
    const sb = STATUS_WEIGHT[b.status] ?? 99;
    return sa - sb;
  });

  return {
    total,
    notStarted,
    inProgress,
    done,
    topActive: active.slice(0, 5),
  };
}

async function computeAdminStats(): Promise<AdminStatsResponse> {
  const now = new Date();
  const monthStart = startOfCurrentMonthUtc(now);
  const weekStart = startOfCurrentWeekUtc(now);

  const [
    totalUsers,
    newUsersThisMonth,
    activeUsersRows,
    totalLeagues,
    seasonGroups,
    leaguesWithoutSeasonCount,
    totalAiInsights,
    aiInsightsThisWeek,
    latestAiInsight,
    recentAuditLog,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(DISTINCT "userId")::int AS count FROM "AuditLog" WHERE "createdAt" > now() - interval '30 days'`,
    prisma.league.count(),
    prisma.season.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.league.count({ where: { seasons: { none: {} } } }),
    prisma.aiInsight.count(),
    prisma.aiInsight.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.aiInsight.findFirst({ orderBy: { createdAt: "desc" }, select: { weekKey: true } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const byStatus = { setup: 0, draft: 0, inSeason: 0, completed: 0 };
  for (const row of seasonGroups) {
    const c = (row._count as { _all?: number })?._all ?? 0;
    switch (row.status) {
      case "SETUP":     byStatus.setup += c; break;
      case "DRAFT":     byStatus.draft += c; break;
      case "IN_SEASON": byStatus.inSeason += c; break;
      case "COMPLETED": byStatus.completed += c; break;
    }
  }
  byStatus.setup += leaguesWithoutSeasonCount;

  const active30d = activeUsersRows?.[0]?.count ?? 0;

  const todos = computeTodoSummary();

  const recentActivity = recentAuditLog.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    userName: entry.user?.name ?? null,
    userEmail: entry.user?.email ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    createdAt: entry.createdAt.toISOString(),
  }));

  return {
    users: {
      total: totalUsers,
      active30d,
      newThisMonth: newUsersThisMonth,
      paid: 0, // TODO: Stripe
    },
    leagues: {
      total: totalLeagues,
      byStatus,
    },
    aiInsights: {
      total: totalAiInsights,
      generatedThisWeek: aiInsightsThisWeek,
      latestWeekKey: latestAiInsight?.weekKey ?? null,
    },
    todos,
    recentActivity,
    recentErrors: errorBuffer.list().slice(0, 5),
    generatedAt: now.toISOString(),
  };
}

// ── GET /admin/users — paginated user list with engagement metrics ──

const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  search: z.string().trim().max(120).optional(),
  tier: z.enum(["free", "pro", "commissioner", "unknown"]).optional(),
  active: z.enum(["today", "7d", "30d", "dormant"]).optional(),
  sort: z.enum(["email", "signupAt", "lastLoginAt", "totalSessions", "totalSecondsOnSite"])
    .optional()
    .default("lastLoginAt"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
});

/**
 * GET /api/admin/users — paginated admin view of users + session metrics.
 */
router.get("/admin/users", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const parsed = adminUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: parsed.error.issues.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
  }
  const { page, pageSize, search, tier, active, sort, dir } = parsed.data;

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  if (active) {
    const now = Date.now();
    const metricsFilter: Record<string, unknown> = {};
    if (active === "today") {
      metricsFilter.lastLoginAt = { gte: new Date(now - 24 * 60 * 60 * 1000) };
    } else if (active === "7d") {
      metricsFilter.lastLoginAt = { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) };
    } else if (active === "30d") {
      metricsFilter.lastLoginAt = { gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
    } else if (active === "dormant") {
      metricsFilter.OR = [
        { lastLoginAt: null },
        { lastLoginAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
      ];
    }
    where.userMetrics = metricsFilter;
  }

  // tier filter is a no-op until Stripe ships — only "unknown" matches everybody.
  if (tier && tier !== "unknown") {
    return res.json({ users: [], total: 0, page, pageSize });
  }

  const sortDir = dir;
  let orderBy: Record<string, unknown>;
  switch (sort) {
    case "email":
      orderBy = { email: sortDir };
      break;
    case "signupAt":
      orderBy = { createdAt: sortDir };
      break;
    case "lastLoginAt":
      orderBy = { userMetrics: { lastLoginAt: sortDir } };
      break;
    case "totalSessions":
      orderBy = { userMetrics: { totalSessions: sortDir } };
      break;
    case "totalSecondsOnSite":
      orderBy = { userMetrics: { totalSecondsOnSite: sortDir } };
      break;
    default:
      orderBy = { userMetrics: { lastLoginAt: "desc" } };
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        userMetrics: true,
        _count: {
          select: { ownedTeams: true },
        },
        memberships: {
          where: { role: "COMMISSIONER" },
          select: { leagueId: true },
        },
        userSessions: {
          take: 1,
          orderBy: { startedAt: "desc" },
          select: { country: true },
        },
      },
    }),
  ]);

  const users = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin,
    signupAt: u.createdAt.toISOString(),
    lastLoginAt: u.userMetrics?.lastLoginAt ? u.userMetrics.lastLoginAt.toISOString() : null,
    totalLogins: u.userMetrics?.totalLogins ?? 0,
    totalSessions: u.userMetrics?.totalSessions ?? 0,
    totalSecondsOnSite: u.userMetrics?.totalSecondsOnSite ?? 0,
    avgSessionSec: u.userMetrics?.avgSessionSec ?? 0,
    leaguesOwned: u._count.ownedTeams,
    leaguesCommissioned: u.memberships.length,
    tier: "unknown" as const, // TODO: Stripe integration
    signupSource: u.userMetrics?.signupSource ?? null,
    country: u.userSessions[0]?.country ?? null,
  }));

  return res.json({ users, total, page, pageSize });
}));

/** GET /api/admin/stats — drives the admin dashboard top cards + feeds. */
router.get("/admin/stats", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const now = Date.now();
  if (statsCache && statsCache.expiresAt > now) {
    return res.json(statsCache.value);
  }

  try {
    const value = await computeAdminStats();
    statsCache = { value, expiresAt: now + STATS_CACHE_TTL_MS };
    return res.json(value);
  } catch (err) {
    logger.error({ error: String(err) }, "Failed to compute admin stats");
    throw err;
  }
}));

/** GET /api/admin/errors — list recent 500-errors from the ring buffer. */
router.get("/admin/errors", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const errors = errorBuffer.list();
  return res.json({
    errors,
    bufferSize: errors.length,
    bufferCapacity: BUFFER_CAPACITY,
  });
}));

/** GET /api/admin/errors/:ref — look up one error by ref (with or without ERR- prefix). */
router.get("/admin/errors/:ref", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const record = errorBuffer.find(req.params.ref);
  if (record) {
    return res.json({ error: record });
  }
  return res.json({
    error: null,
    note: "Not found in ring buffer — may have been evicted. Check Railway logs by requestId.",
  });
}));

/** GET /api/admin/dashboard — executive dashboard with hero + tiles + funnels + activity. */
router.get("/admin/dashboard", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  const data = await buildDashboard(days);
  return res.json(data);
}));

/** Test-only cache invalidator (used by adminStats.test.ts). */
export function __resetAdminStatsCacheForTests(): void {
  statsCache = null;
}

export default router;

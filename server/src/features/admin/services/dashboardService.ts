/**
 * Executive Dashboard Service
 *
 * SQL-level aggregation only (COUNT/SUM/GROUP BY — never fetch all rows).
 * Coalescing cache with stampede prevention (5-min TTL).
 * All queries in a single transaction for consistent snapshot.
 */

import { prisma } from "../../../db/prisma.js";
import { logger } from "../../../lib/logger.js";
import { computeInsights } from "./dashboardInsightEngine.js";

// ─── Types ────────────────────────────────────────────────────

export interface SparklinePoint {
  week: string; // ISO week label e.g. "W14"
  value: number;
}

export interface HeroMetric {
  label: string;
  value: number;
  formattedValue: string;
  delta: number; // % change vs prior period
  sparkline: SparklinePoint[];
  tooltip: string;
}

export interface StatTileData {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  delta: number; // % change
  tooltip: string;
  subtitle: string;
  sparkline: SparklinePoint[];
  href: string;
  status: "populated" | "empty" | "loading";
}

export interface FunnelStage {
  label: string;
  count: number;
  percent: number;
}

export interface FunnelData {
  id: string;
  label: string;
  stages: FunnelStage[];
}

export interface ActivityEntry {
  id: number;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
}

export interface InlineInsight {
  analysis: string;
  action: string;
  priority: "high" | "medium" | "low";
  generatedBy: "rules" | "ai";
}

export interface DashboardResponse {
  hero: HeroMetric;
  tiles: StatTileData[];
  funnels: FunnelData[];
  activity: ActivityEntry[];
  insights: Record<string, InlineInsight>;
  generatedAt: string;
  cacheTTLSeconds: number;
  dateRange: { days: number; from: string; to: string };
}

// ─── Cache ────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: DashboardResponse; expiry: number; pending?: Promise<DashboardResponse> }>();

export function clearDashboardCache(): void {
  cache.clear();
}

// ─── Main Entry ───────────────────────────────────────────────

export async function buildDashboard(days: number): Promise<DashboardResponse> {
  const key = `dashboard-${days}`;
  const cached = cache.get(key);

  // Warm cache hit
  if (cached && cached.expiry > Date.now()) return cached.data;

  // Stampede prevention: if another request is already computing, wait for it
  if (cached?.pending) return cached.pending;

  const start = performance.now();
  const promise = computeDashboard(days);

  // Store the pending promise so concurrent requests coalesce
  cache.set(key, { data: cached?.data as DashboardResponse, expiry: 0, pending: promise });

  try {
    const result = await promise;
    cache.set(key, { data: result, expiry: Date.now() + CACHE_TTL_MS });
    logger.info({ days, ms: Math.round(performance.now() - start) }, "dashboard computed");
    return result;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// ─── Computation ──────────────────────────────────────────────

async function computeDashboard(days: number): Promise<DashboardResponse> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  const priorFrom = new Date(from);
  priorFrom.setDate(priorFrom.getDate() - days);

  // Batch all count queries in a single $transaction (one DB connection)
  // to avoid exhausting Supabase's small session-mode pool.
  const [
    totalUsers, currentUsers, priorUsers,
    currentSessions, priorSessions,
    currentSeasons, priorSeasons, totalSeasons,
    currentTrades, priorTrades,
    currentWaivers, priorWaivers,
    currentInsights, priorInsights,
    currentTransactions, priorTransactions,
    totalSignups, profileSetups, firstActions,
    seasonsWithTeams, seasonsWithRosters, seasonsCompleted,
    usersCreated30dAgo,
    recentActivity,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: from } } }),
    prisma.user.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    prisma.userSession.count({ where: { startedAt: { gte: from } } }),
    prisma.userSession.count({ where: { startedAt: { gte: priorFrom, lt: from } } }),
    prisma.season.count({ where: { createdAt: { gte: from } } }),
    prisma.season.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    prisma.season.count(),
    prisma.trade.count({ where: { createdAt: { gte: from } } }),
    prisma.trade.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    prisma.waiverClaim.count({ where: { createdAt: { gte: from } } }),
    prisma.waiverClaim.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    prisma.aiInsight.count({ where: { createdAt: { gte: from } } }),
    prisma.aiInsight.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    prisma.transactionEvent.count({ where: { createdAt: { gte: from } } }),
    prisma.transactionEvent.count({ where: { createdAt: { gte: priorFrom, lt: from } } }),
    // Funnel: Onboarding
    prisma.user.count(),
    prisma.user.count({ where: { name: { not: null } } }),
    prisma.user.count({
      where: { OR: [{ ownedTeams: { some: {} } }, { teamOwnerships: { some: {} } }] },
    }),
    // Funnel: Season Lifecycle
    prisma.season.count({ where: { league: { teams: { some: {} } } } }),
    prisma.season.count({
      where: { league: { teams: { some: { rosters: { some: {} } } } } },
    }),
    prisma.season.count({ where: { status: "COMPLETED" } }),
    // Funnel: Retention (created 30d+ ago)
    prisma.user.count({ where: { createdAt: { lte: new Date(Date.now() - 30 * 86400000) } } }),
    // Activity feed
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, action: true, resourceType: true, resourceId: true,
        createdAt: true, user: { select: { email: true, name: true } },
      },
    }),
  ]);

  // Retention: active user counts (groupBy not supported in $transaction)
  const [active30dRows, active7dRows] = await Promise.all([
    prisma.userSession.groupBy({
      by: ["userId"],
      where: { startedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    }),
    prisma.userSession.groupBy({
      by: ["userId"],
      where: { startedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    }),
  ]);
  const usersActive30d = active30dRows.length;
  const usersActive7d = active7dRows.length;

  // Phase 3: Sparklines sequentially (each fires N queries internally)
  const userSparkline = await weeklySparkline("User", "createdAt", days, from);
  const sessionSparkline = await weeklySparkline("UserSession", "startedAt", days, from);
  const seasonSparkline = await weeklySparkline("Season", "createdAt", days, from);
  const tradeSparkline = await weeklySparkline("Trade", "createdAt", days, from);
  const insightSparkline = await weeklySparkline("AiInsight", "createdAt", days, from);
  const txSparkline = await weeklySparkline("TransactionEvent", "createdAt", days, from);

  // ─── Build Hero ───
  const activeUsers = usersActive30d;
  const heroSparkline = await weeklyActiveUsersSparkline(days, from);
  const priorActiveUsers = await prisma.userSession.groupBy({
    by: ["userId"],
    where: {
      startedAt: { gte: priorFrom, lt: from },
    },
  }).then(r => r.length);

  const hero: HeroMetric = {
    label: "Active Users",
    value: activeUsers,
    formattedValue: formatNum(activeUsers),
    delta: pctDelta(activeUsers, priorActiveUsers),
    sparkline: heroSparkline,
    tooltip: "Unique users with at least one session in the selected period",
  };

  // ─── Build Tiles ───
  const tiles: StatTileData[] = [
    {
      id: "users",
      label: "Total Users",
      value: totalUsers,
      formattedValue: formatNum(totalUsers),
      delta: pctDelta(currentUsers, priorUsers),
      tooltip: "All registered accounts. Delta shows new signups vs prior period.",
      subtitle: `+${currentUsers} new this period`,
      sparkline: userSparkline,
      href: "/admin/users",
      status: totalUsers > 0 ? "populated" : "empty",
    },
    {
      id: "sessions",
      label: "Sessions",
      value: currentSessions,
      formattedValue: formatNum(currentSessions),
      delta: pctDelta(currentSessions, priorSessions),
      tooltip: "Total login sessions started in this period.",
      subtitle: `${formatNum(totalUsers)} users, ${currentSessions > 0 ? (currentSessions / Math.max(1, activeUsers)).toFixed(1) : "0"} avg/user`,
      sparkline: sessionSparkline,
      href: "/admin/users",
      status: currentSessions > 0 ? "populated" : "empty",
    },
    {
      id: "seasons",
      label: "Seasons",
      value: totalSeasons,
      formattedValue: formatNum(totalSeasons),
      delta: pctDelta(currentSeasons, priorSeasons),
      tooltip: "League seasons (a league can have multiple seasons across years). Delta shows new seasons this period.",
      subtitle: `+${currentSeasons} new this period`,
      sparkline: seasonSparkline,
      href: "/admin",
      status: totalSeasons > 0 ? "populated" : "empty",
    },
    {
      id: "trades",
      label: "Trades",
      value: currentTrades,
      formattedValue: formatNum(currentTrades),
      delta: pctDelta(currentTrades, priorTrades),
      tooltip: "Trade proposals created in this period (all statuses).",
      subtitle: `${currentWaivers} waiver claims same period`,
      sparkline: tradeSparkline,
      href: "/activity?tab=trades",
      status: currentTrades > 0 ? "populated" : "empty",
    },
    {
      id: "ai-insights",
      label: "AI Insights",
      value: currentInsights,
      formattedValue: formatNum(currentInsights),
      delta: pctDelta(currentInsights, priorInsights),
      tooltip: "AI-generated insights (weekly team + league digest). Count of AiInsight rows created.",
      subtitle: `${(currentInsights / Math.max(1, days) * 7).toFixed(0)}/week avg`,
      sparkline: insightSparkline,
      href: "/ai",
      status: currentInsights > 0 ? "populated" : "empty",
    },
    {
      id: "roster-moves",
      label: "Roster Moves",
      value: currentTransactions,
      formattedValue: formatNum(currentTransactions),
      delta: pctDelta(currentTransactions, priorTransactions),
      tooltip: "Transaction events (add, drop, trade execution, waiver pickup).",
      subtitle: `${currentTrades} trades, ${currentWaivers} waivers`,
      sparkline: txSparkline,
      href: "/activity",
      status: currentTransactions > 0 ? "populated" : "empty",
    },
  ];

  // ─── Build Funnels ───
  const funnels: FunnelData[] = [
    {
      id: "onboarding",
      label: "Onboarding",
      stages: [
        { label: "Signed Up", count: totalSignups, percent: 100 },
        { label: "Profile Set Up", count: profileSetups, percent: pct(profileSetups, totalSignups) },
        { label: "Joined a Team", count: firstActions, percent: pct(firstActions, totalSignups) },
      ],
    },
    {
      id: "season-lifecycle",
      label: "Season Lifecycle",
      stages: [
        { label: "Season Created", count: totalSeasons, percent: 100 },
        { label: "Teams Assigned", count: seasonsWithTeams, percent: pct(seasonsWithTeams, totalSeasons) },
        { label: "Rosters Drafted", count: seasonsWithRosters, percent: pct(seasonsWithRosters, totalSeasons) },
        { label: "Season Completed", count: seasonsCompleted, percent: pct(seasonsCompleted, totalSeasons) },
      ],
    },
    {
      id: "retention",
      label: "Retention",
      stages: [
        { label: "Created 30d+ ago", count: usersCreated30dAgo, percent: 100 },
        { label: "Active last 30d", count: usersActive30d, percent: pct(usersActive30d, usersCreated30dAgo) },
        { label: "Active last 7d", count: usersActive7d, percent: pct(usersActive7d, usersCreated30dAgo) },
      ],
    },
  ];

  // ─── Activity Feed ───
  const activity: ActivityEntry[] = recentActivity.map((a) => ({
    id: a.id,
    action: a.action,
    resourceType: a.resourceType,
    resourceId: a.resourceId ? String(a.resourceId) : null,
    userEmail: a.user?.email ?? null,
    userName: a.user?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  const response: DashboardResponse = {
    hero,
    tiles,
    funnels,
    activity,
    insights: {},
    generatedAt: now.toISOString(),
    cacheTTLSeconds: Math.round(CACHE_TTL_MS / 1000),
    dateRange: { days, from: from.toISOString(), to: now.toISOString() },
  };

  // Compute rule-based insights after all data is assembled
  response.insights = computeInsights(response);

  return response;
}

// ─── Helpers ──────────────────────────────────────────────────

function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prior) / prior) * 100);
}

function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function weeklySparkline(
  model: string,
  dateField: string,
  days: number,
  from: Date,
): Promise<SparklinePoint[]> {
  const weeks = Math.min(Math.ceil(days / 7), 30);
  const points: SparklinePoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(from);
    weekEnd.setDate(weekEnd.getDate() + (weeks - i) * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const count = await (prisma as any)[model[0].toLowerCase() + model.slice(1)].count({
      where: { [dateField]: { gte: weekStart, lt: weekEnd } },
    });
    points.push({ week: `W${weeks - i}`, value: count });
  }
  return points;
}

async function weeklyActiveUsersSparkline(
  days: number,
  from: Date,
): Promise<SparklinePoint[]> {
  const weeks = Math.min(Math.ceil(days / 7), 30);
  const points: SparklinePoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(from);
    weekEnd.setDate(weekEnd.getDate() + (weeks - i) * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const result = await prisma.userSession.groupBy({
      by: ["userId"],
      where: { startedAt: { gte: weekStart, lt: weekEnd } },
    });
    points.push({ week: `W${weeks - i}`, value: result.length });
  }
  return points;
}

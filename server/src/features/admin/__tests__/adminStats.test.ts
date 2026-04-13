import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    user: { count: vi.fn() },
    league: { count: vi.fn() },
    season: { groupBy: vi.fn() },
    aiInsight: { count: vi.fn(), findFirst: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

// Capture the admin-guard mock so we can flip it per-test
let isAdminFlag = true;
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: any, res: any, next: () => void) => {
    if (!isAdminFlag) return res.status(403).json({ error: "Forbidden" });
    return next();
  }),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

vi.mock("../../commissioner/services/CommissionerService.js", () => ({
  CommissionerService: class {
    createLeague = vi.fn();
    addMember = vi.fn();
    importRosters = vi.fn();
  },
}));
vi.mock("../../players/services/mlbSyncService.js", () => ({
  syncAllPlayers: vi.fn(),
  syncPositionEligibility: vi.fn(),
  syncAAARosters: vi.fn(),
  enrichStalePlayers: vi.fn(),
}));
vi.mock("../../players/services/mlbStatsSyncService.js", () => ({
  syncPeriodStats: vi.fn(),
  syncAllActivePeriods: vi.fn(),
}));
vi.mock("../../../lib/schemas.js", () => ({ addMemberSchema: { parse: vi.fn() } }));

// Mock the todo file read by mocking node:fs
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<any>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        categories: [
          {
            id: "alpha",
            title: "Alpha Category",
            tasks: [
              { id: "a-done", title: "Done task", status: "done", priority: "p0" },
              { id: "a-p1-not", title: "P1 not started", status: "not_started", priority: "p1" },
              { id: "a-p1-prog", title: "P1 in progress", status: "in_progress", priority: "p1" },
              { id: "a-p0-not", title: "P0 not started", status: "not_started", priority: "p0" },
              { id: "a-p2-prog", title: "P2 in progress", status: "in_progress", priority: "p2" },
              { id: "a-p3-not", title: "P3 not started", status: "not_started", priority: "p3" },
            ],
          },
        ],
      }),
    ),
  };
});

import { prisma } from "../../../db/prisma.js";
const mockPrisma = prisma as any;

import express from "express";
import { adminRouter, __resetAdminStatsCacheForTests } from "../routes.js";
import supertest from "supertest";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: NextFunction) => {
    req.user = { id: 1, isAdmin: isAdminFlag, email: "admin@test.com" };
    next();
  });
  app.use(adminRouter);
  app.use((err: any, _req: any, res: any, _next: NextFunction) => {
    res.status(500).json({ error: "Internal Server Error", detail: err?.message });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  isAdminFlag = true;
  __resetAdminStatsCacheForTests();

  // Default Prisma mock responses
  mockPrisma.user.count.mockImplementation((args?: any) => {
    if (args?.where?.createdAt) return Promise.resolve(3); // newThisMonth
    return Promise.resolve(42); // total
  });
  mockPrisma.league.count.mockImplementation((args?: any) => {
    if (args?.where?.seasons?.none) return Promise.resolve(1); // leagues with no season
    return Promise.resolve(5); // total
  });
  mockPrisma.season.groupBy.mockResolvedValue([
    { status: "SETUP", _count: { _all: 1 } },
    { status: "DRAFT", _count: { _all: 1 } },
    { status: "IN_SEASON", _count: { _all: 2 } },
  ]);
  mockPrisma.aiInsight.count.mockImplementation((args?: any) => {
    if (args?.where?.createdAt) return Promise.resolve(4); // this week
    return Promise.resolve(17); // total
  });
  mockPrisma.aiInsight.findFirst.mockResolvedValue({ weekKey: "2026-W15" });
  mockPrisma.auditLog.findMany.mockResolvedValue([
    {
      id: 101,
      userId: 1,
      action: "TRADE_PROCESS",
      resourceType: "Trade",
      resourceId: "55",
      createdAt: new Date("2026-04-12T00:00:00Z"),
      user: { name: "Admin", email: "admin@test.com" },
    },
    {
      id: 100,
      userId: 2,
      action: "AUCTION_INIT",
      resourceType: "Auction",
      resourceId: null,
      createdAt: new Date("2026-04-11T00:00:00Z"),
      user: null,
    },
  ]);
  mockPrisma.$queryRaw.mockResolvedValue([{ count: 12 }]);
});

// ── GET /admin/stats — shape + content ───────────────────────────

describe("GET /admin/stats", () => {
  it("returns the full AdminStatsResponse shape", async () => {
    const res = await supertest(makeApp()).get("/admin/stats");

    expect(res.status).toBe(200);
    const body = res.body;

    // Top-level keys per contract
    expect(Object.keys(body).sort()).toEqual(
      [
        "aiInsights",
        "generatedAt",
        "leagues",
        "recentActivity",
        "recentErrors",
        "todos",
        "users",
      ].sort(),
    );

    // Users block
    expect(body.users).toEqual({ total: 42, active30d: 12, newThisMonth: 3, paid: 0 });

    // Leagues block — 1 SETUP from groupBy + 1 from "no season" fallback = 2
    expect(body.leagues.total).toBe(5);
    expect(body.leagues.byStatus).toEqual({ setup: 2, draft: 1, inSeason: 2, completed: 0 });

    // AiInsights block
    expect(body.aiInsights).toEqual({
      total: 17,
      generatedThisWeek: 4,
      latestWeekKey: "2026-W15",
    });

    // Todos block
    expect(body.todos.total).toBe(6);
    expect(body.todos.done).toBe(1);
    expect(body.todos.inProgress).toBe(2);
    expect(body.todos.notStarted).toBe(3);
    expect(Array.isArray(body.todos.topActive)).toBe(true);
    expect(body.todos.topActive).toHaveLength(5);

    // Recent activity shaped
    expect(body.recentActivity).toHaveLength(2);
    expect(body.recentActivity[0]).toEqual({
      id: 101,
      userId: 1,
      userName: "Admin",
      userEmail: "admin@test.com",
      action: "TRADE_PROCESS",
      resourceType: "Trade",
      resourceId: "55",
      createdAt: "2026-04-12T00:00:00.000Z",
    });
    // Null user survives as nulls
    expect(body.recentActivity[1].userName).toBeNull();
    expect(body.recentActivity[1].userEmail).toBeNull();

    // Recent errors + generatedAt present
    expect(Array.isArray(body.recentErrors)).toBe(true);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("sorts topActive by priority (p0 > p1 > p2 > p3), then in_progress before not_started within a priority", async () => {
    const res = await supertest(makeApp()).get("/admin/stats");
    expect(res.status).toBe(200);
    const ids = res.body.todos.topActive.map((t: any) => t.id);

    // Fixture has: P0 not-started, P1 in-progress, P1 not-started, P2 in-progress, P3 not-started
    // Expected order: P0 > P1-in_progress > P1-not_started > P2-in_progress > P3-not_started
    expect(ids).toEqual([
      "a-p0-not",
      "a-p1-prog",
      "a-p1-not",
      "a-p2-prog",
      "a-p3-not",
    ]);
  });

  it("caches the response for 10 seconds", async () => {
    const app = makeApp();
    await supertest(app).get("/admin/stats");
    await supertest(app).get("/admin/stats");
    // Each query should fire exactly once (cache hit on second call)
    expect(mockPrisma.user.count).toHaveBeenCalledTimes(2); // one call for total + one for newThisMonth = 2, from call #1 only
  });

  it("returns 403 for non-admin users", async () => {
    isAdminFlag = false;
    const res = await supertest(makeApp()).get("/admin/stats");
    expect(res.status).toBe(403);
  });
});

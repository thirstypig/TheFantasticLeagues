import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    leagueRule: { findMany: vi.fn() },
    roster: { count: vi.fn() },
    period: { findUnique: vi.fn() },
    playerStatsDaily: { aggregate: vi.fn() },
    transactionEvent: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: (...a: any[]) => Promise<unknown>) => (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

import express from "express";
import supertest from "supertest";
import { prisma } from "../../../db/prisma.js";
import { requireCommissionerOrAdmin } from "../../../middleware/auth.js";
import { invalidateLeagueRules } from "../../../lib/leagueRuleCache.js";

// requireCommissionerOrAdmin() runs at route-registration (module load) time, so
// load the router dynamically and record the call count before any beforeEach
// clears the mock.
const { hubRouter } = await import("../hubRoutes.js");
const authFactoryCallsAfterImport = (requireCommissionerOrAdmin as any).mock.calls.length;

const m = prisma as any;

const app = express();
app.use(express.json());
app.use("/api", hubRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error", message: err?.message });
});

beforeEach(() => {
  vi.clearAllMocks();
  invalidateLeagueRules(20);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("auth wiring", () => {
  it("registers requireCommissionerOrAdmin once per route (5 routes)", () => {
    expect(authFactoryCallsAfterImport).toBe(5);
  });
});

describe("GET /api/commissioner/:leagueId/roster-check", () => {
  it("400s on a non-numeric leagueId", async () => {
    const res = await supertest(app).get("/api/commissioner/abc/roster-check");
    expect(res.status).toBe(400);
  });

  it("derives cap 23 from rules, flags over-cap teams, and counts with the assertRosterLimit definition", async () => {
    m.leagueRule.findMany.mockResolvedValue([
      { category: "roster", key: "pitcher_count", value: "9" },
      { category: "roster", key: "batter_count", value: "14" },
    ]);
    m.team.findMany.mockResolvedValue([
      { id: 1, name: "Aces" },
      { id: 2, name: "Titans" },
    ]);
    m.roster.count.mockImplementation(async ({ where }: any) => (where.teamId === 1 ? 24 : 23));

    const res = await supertest(app).get("/api/commissioner/20/roster-check");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cap: 23,
      teams: [
        { teamId: 1, teamName: "Aces", activeCount: 24, over: true },
        { teamId: 2, teamName: "Titans", activeCount: 23, over: false },
      ],
    });
    expect(m.team.findMany.mock.calls[0][0].where).toEqual({ leagueId: 20 });
    expect(m.roster.count).toHaveBeenCalledTimes(2);
    expect(m.roster.count.mock.calls[0][0].where).toEqual({
      teamId: 1,
      releasedAt: null,
      assignedPosition: { not: "IL" },
    });
    expect(m.roster.count.mock.calls[1][0].where).toEqual({
      teamId: 2,
      releasedAt: null,
      assignedPosition: { not: "IL" },
    });
  });
});

describe("GET /api/commissioner/:leagueId/periods/:periodId/close-readiness", () => {
  const period = (over: Record<string, unknown> = {}) => ({
    id: 5,
    name: "Period 5",
    leagueId: 20,
    status: "active",
    startDate: new Date("2026-09-15T12:00:00Z"),
    endDate: new Date("2026-09-28T12:00:00Z"),
    ...over,
  });

  beforeEach(() => {
    m.playerStatsDaily.aggregate.mockResolvedValue({ _max: { gameDate: new Date("2026-09-28T00:00:00Z") } });
  });

  it("400s on non-numeric ids", async () => {
    expect((await supertest(app).get("/api/commissioner/x/periods/5/close-readiness")).status).toBe(400);
    expect((await supertest(app).get("/api/commissioner/20/periods/x/close-readiness")).status).toBe(400);
  });

  it("404s when the period belongs to another league", async () => {
    m.period.findUnique.mockResolvedValue(period({ leagueId: 99 }));
    const res = await supertest(app).get("/api/commissioner/20/periods/5/close-readiness");
    expect(res.status).toBe(404);
    expect(m.period.findUnique.mock.calls[0][0].where).toEqual({ id: 5 });
  });

  it("not ready one minute before 14:00 UTC the day after endDate (sync cron starts 13:00)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T13:59:00Z"));
    m.period.findUnique.mockResolvedValue(period());
    const res = await supertest(app).get("/api/commissioner/20/periods/5/close-readiness");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
  });

  it("ready at 14:00 UTC the day after endDate; reports lastStatDate and queries the period window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T14:00:00Z"));
    const p = period();
    m.period.findUnique.mockResolvedValue(p);
    const res = await supertest(app).get("/api/commissioner/20/periods/5/close-readiness");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      periodId: 5,
      name: "Period 5",
      status: "active",
      endDate: "2026-09-28T12:00:00.000Z",
      lastStatDate: "2026-09-28",
      ready: true,
    });
    expect(m.playerStatsDaily.aggregate.mock.calls[0][0].where).toEqual({
      gameDate: { gte: p.startDate, lte: p.endDate },
    });
  });

  it("lastStatDate is null when no stats exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T14:00:00Z"));
    m.period.findUnique.mockResolvedValue(period());
    m.playerStatsDaily.aggregate.mockResolvedValue({ _max: { gameDate: null } });
    const res = await supertest(app).get("/api/commissioner/20/periods/5/close-readiness");
    expect(res.body.lastStatDate).toBeNull();
  });

  it("never ready when status is not active, even long after endDate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    m.period.findUnique.mockResolvedValue(period({ status: "pending" }));
    const res = await supertest(app).get("/api/commissioner/20/periods/5/close-readiness");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
  });
});

describe("GET /api/commissioner/:leagueId/periods/:periodId/moves-since-start", () => {
  const startDate = new Date("2026-09-15T12:00:00Z");

  it("404s when the period belongs to another league", async () => {
    m.period.findUnique.mockResolvedValue({ id: 5, leagueId: 99, startDate });
    const res = await supertest(app).get("/api/commissioner/20/periods/5/moves-since-start");
    expect(res.status).toBe(404);
    expect(m.transactionEvent.findMany).not.toHaveBeenCalled();
  });

  it("400s on non-numeric periodId", async () => {
    const res = await supertest(app).get("/api/commissioner/20/periods/x/moves-since-start");
    expect(res.status).toBe(400);
  });

  it("queries by league and effDate >= UTC midnight of the start day, ordered asc, and maps names with raw fallbacks", async () => {
    m.period.findUnique.mockResolvedValue({ id: 5, leagueId: 20, startDate });
    m.transactionEvent.findMany.mockResolvedValue([
      {
        id: 1,
        team: { name: "Aces" },
        player: { name: "Juan Soto" },
        ogbaTeamName: "raw team",
        playerAliasRaw: "raw player",
        transactionType: "ADD",
        effDate: new Date("2026-09-16T00:00:00Z"),
      },
      {
        id: 2,
        team: null,
        player: null,
        ogbaTeamName: "Raw Team",
        playerAliasRaw: "Raw Player",
        transactionType: null,
        effDate: new Date("2026-09-17T00:00:00Z"),
      },
    ]);

    const res = await supertest(app).get("/api/commissioner/20/periods/5/moves-since-start");
    expect(res.status).toBe(200);

    const args = m.transactionEvent.findMany.mock.calls[0][0];
    // Periods are stored at T12:00Z; moves (meeting saves included) are dated at
    // UTC midnight of their day, so the start-day moves must count.
    expect(args.where).toEqual({ leagueId: 20, effDate: { gte: new Date("2026-09-15T00:00:00Z") } });
    expect(args.orderBy).toEqual({ effDate: "asc" });

    expect(res.body.moves).toEqual([
      { id: 1, teamName: "Aces", playerName: "Juan Soto", transactionType: "ADD", effDate: "2026-09-16T00:00:00.000Z" },
      { id: 2, teamName: "Raw Team", playerName: "Raw Player", transactionType: null, effDate: "2026-09-17T00:00:00.000Z" },
    ]);
  });
});

describe("GET /api/commissioner/:leagueId/recent-changes", () => {
  const row = (id: number, leagueId: number, over: Record<string, unknown> = {}) => ({
    id,
    action: "PERIOD_START",
    resourceType: "Period",
    resourceId: String(id),
    metadata: { leagueId },
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, id)),
    user: { name: "Commish" },
    ...over,
  });

  it("400s on a non-numeric leagueId", async () => {
    expect((await supertest(app).get("/api/commissioner/x/recent-changes")).status).toBe(400);
  });

  it("filters by league in the database (metadata JSON path, newest first, take = limit) and maps fields", async () => {
    m.auditLog.findMany.mockResolvedValue([
      row(5, 20),
      row(3, 20, { user: null }),
      row(2, 20, { metadata: { leagueId: 20, billed: true } }),
    ]);
    const res = await supertest(app).get("/api/commissioner/20/recent-changes");
    expect(res.status).toBe(200);

    const args = m.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ metadata: { path: ["leagueId"], equals: 20 } });
    expect(args.take).toBe(50);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.include).toEqual({ user: { select: { name: true } } });

    expect(res.body.changes.map((c: any) => c.id)).toEqual([5, 3, 2]);
    expect(res.body.changes[0]).toEqual({
      id: 5,
      action: "PERIOD_START",
      resourceType: "Period",
      resourceId: "5",
      createdAt: "2026-10-01T00:05:00.000Z",
      userName: "Commish",
      metadata: { leagueId: 20 },
    });
    expect(res.body.changes[1].userName).toBeNull();
  });

  it("scopes the where clause to the requested league", async () => {
    m.auditLog.findMany.mockResolvedValue([]);
    await supertest(app).get("/api/commissioner/21/recent-changes");
    expect(m.auditLog.findMany.mock.calls[0][0].where).toEqual({ metadata: { path: ["leagueId"], equals: 21 } });
  });

  it("passes take = limit: default 50, explicit 2, 200 allowed, clamped to 200", async () => {
    m.auditLog.findMany.mockResolvedValue([]);
    const takeFor = async (qs: string) => {
      m.auditLog.findMany.mockClear();
      await supertest(app).get(`/api/commissioner/20/recent-changes${qs}`);
      return m.auditLog.findMany.mock.calls[0][0].take;
    };
    expect(await takeFor("")).toBe(50);
    expect(await takeFor("?limit=2")).toBe(2);
    expect(await takeFor("?limit=200")).toBe(200);
    expect(await takeFor("?limit=1000")).toBe(200);
    expect(await takeFor("?limit=abc")).toBe(50);
  });
});

describe("GET /api/commissioner/:leagueId/unbilled-periods", () => {
  const ev = (id: number, action: string, periodId: number, iso: string, metadata: any) => ({
    id,
    action,
    resourceType: "Period",
    resourceId: String(periodId),
    metadata,
    createdAt: new Date(iso),
  });
  const T0 = "2026-10-01T00:00:00Z";
  const T1 = "2026-10-02T00:00:00Z";
  const T2 = "2026-10-03T00:00:00Z";
  const close = (id: number, p: number, iso: string, billed: boolean, leagueId = 20) =>
    ev(id, "PERIOD_CLOSE", p, iso, { leagueId, periodId: p, billed });
  const reconcile = (id: number, p: number, iso: string, leagueId = 20) =>
    ev(id, "IL_FEE_RECONCILE", p, iso, { leagueId });

  it("400s on a non-numeric leagueId", async () => {
    expect((await supertest(app).get("/api/commissioner/x/unbilled-periods")).status).toBe(400);
  });

  it("queries Period close/reconcile rows and lists a billed:false close with nothing after", async () => {
    m.auditLog.findMany.mockResolvedValue([close(1, 6, T1, false)]);
    const res = await supertest(app).get("/api/commissioner/20/unbilled-periods");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ periods: [{ periodId: 6, closedAt: "2026-10-02T00:00:00.000Z" }] });
    const args = m.auditLog.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      action: { in: ["PERIOD_CLOSE", "IL_FEE_RECONCILE"] },
      resourceType: "Period",
    });
  });

  it("a later IL_FEE_RECONCILE clears the period", async () => {
    m.auditLog.findMany.mockResolvedValue([close(1, 6, T1, false), reconcile(2, 6, T2)]);
    const res = await supertest(app).get("/api/commissioner/20/unbilled-periods");
    expect(res.body.periods).toEqual([]);
  });

  it("an earlier IL_FEE_RECONCILE does not clear a later billed:false close", async () => {
    m.auditLog.findMany.mockResolvedValue([reconcile(1, 6, T0), close(2, 6, T1, false)]);
    const res = await supertest(app).get("/api/commissioner/20/unbilled-periods");
    expect(res.body.periods).toEqual([{ periodId: 6, closedAt: "2026-10-02T00:00:00.000Z" }]);
  });

  it("billed:true is not unbilled", async () => {
    m.auditLog.findMany.mockResolvedValue([close(1, 6, T1, true)]);
    expect((await supertest(app).get("/api/commissioner/20/unbilled-periods")).body.periods).toEqual([]);
  });

  it("uses the latest close per period, ignores other leagues and reconciles for other periods", async () => {
    m.auditLog.findMany.mockResolvedValue([
      close(1, 6, T0, false),
      close(2, 6, T1, true), // latest close is billed -> not unbilled
      close(3, 7, T1, false, 21), // other league
      close(4, 8, T1, false),
      reconcile(5, 9, T2), // different period; does not clear 8
    ]);
    const res = await supertest(app).get("/api/commissioner/20/unbilled-periods");
    expect(res.body.periods).toEqual([{ periodId: 8, closedAt: "2026-10-02T00:00:00.000Z" }]);
  });

  it("matches reconciles by period id alone (period ids are global), same as the drainer's skip rule", async () => {
    // The hub list and the automatic-billing skip share one predicate
    // (lib/deferredBilling). A reconcile row for period 6 ends 6's deferral
    // whatever its metadata says — so the hub can never show a period as
    // unbilled that the drainer would bill.
    m.auditLog.findMany.mockResolvedValue([close(1, 6, T1, false), reconcile(2, 6, T2, 21)]);
    const res = await supertest(app).get("/api/commissioner/20/unbilled-periods");
    expect(res.body.periods).toEqual([]);
  });
});

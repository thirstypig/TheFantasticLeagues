/**
 * Wire-list hardening (todos #164, #165, #167) — server-side checks:
 *   - #167: per-user rate limiter on mutation endpoints (POST/PATCH/DELETE)
 *           returns 429 once the bucket is drained.
 *   - #165: state-changing endpoints await the audit-log write so a
 *           transient logger failure surfaces in logs and (for /finalize)
 *           in the admin errorBuffer; response stays 200 either way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    waiverPeriod: { findUnique: vi.fn(), update: vi.fn() },
    team: { findUnique: vi.fn() },
    waiverAddEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    waiverDropEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    roster: { findFirst: vi.fn(), findMany: vi.fn() },
    player: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
    league: { findUnique: vi.fn() },
    teamOwnership: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn().mockResolvedValue("NL"),
  getTeamsForSource: vi.fn().mockReturnValue(null),
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireLeagueMember: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCommissionerOrAdmin: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTeamOwner: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  isTeamOwner: vi.fn(async () => true),
}));

import { prisma } from "../../../db/prisma.js";
import { _resetRateLimitPerUserBuckets } from "../../../middleware/rateLimitPerUser.js";
import * as errorBuffer from "../../../lib/errorBuffer.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import supertest from "supertest";
import { wireListRouter } from "../routes.js";
import { wireListProcessorRouter } from "../processor.js";

function buildApp(userId: number = 42) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: NextFunction) => {
    req.user = { id: userId, isAdmin: true, email: "tester@example.com" };
    req.requestId = "deadbeef";
    next();
  });
  app.use("/api/wire-list", wireListRouter);
  app.use("/api/wire-list", wireListProcessorRouter);
  app.use((err: any, _req: any, res: any, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error("test app error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetRateLimitPerUserBuckets();
  errorBuffer.clear();
  // Default: audit-log writes succeed. Specific tests override to inject a
  // failure. We must default-resolve here because the fire-and-forget
  // `writeAuditLog` (still used in routes.ts for owner CRUD) chains a
  // `.catch` and a `vi.fn()` that returns undefined throws on `.catch`.
  mockPrisma.auditLog.create.mockResolvedValue({});
});

// ── todo #167: per-user rate limit on mutation endpoints ─────────

describe("wire-list rate limiter (todo #167)", () => {
  it("returns 429 on the 31st POST /periods/:id/adds in a 60s window", async () => {
    const app = buildApp(101);
    // Make the route succeed for every legitimate request — we only care
    // about the rate-limit branch firing, not the downstream Prisma path.
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 1 });
    mockPrisma.roster.findFirst.mockResolvedValue(null);
    mockPrisma.waiverAddEntry.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    mockPrisma.player.findUnique.mockResolvedValue({ id: 999, mlbTeam: "NYM" });
    mockPrisma.$transaction.mockResolvedValue({ id: 1, periodId: 10, teamId: 50, playerId: 999, priority: 1 });

    // Drain the bucket (capacity 30).
    for (let i = 0; i < 30; i++) {
      const res = await supertest(app)
        .post("/api/wire-list/periods/10/adds")
        .send({ teamId: 50, playerId: 999 });
      expect(res.status).toBe(201);
    }

    const limited = await supertest(app)
      .post("/api/wire-list/periods/10/adds")
      .send({ teamId: 50, playerId: 999 });
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  it("uses separate buckets for adds vs drops (different scope)", async () => {
    const app = buildApp(202);
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING", createdAt: new Date(),
    });
    mockPrisma.team.findUnique.mockResolvedValue({ id: 50, leagueId: 1 });
    mockPrisma.roster.findFirst.mockResolvedValue({ id: 5 });
    mockPrisma.waiverDropEntry.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    mockPrisma.$transaction.mockResolvedValue({ id: 7, periodId: 10, teamId: 50, playerId: 999, priority: 1, dropMode: "RELEASE" });

    // Pre-drain the add bucket — but drops should still go through.
    mockPrisma.player.findUnique.mockResolvedValue({ id: 999, mlbTeam: "NYM" });
    mockPrisma.waiverAddEntry.aggregate.mockResolvedValue({ _max: { priority: 0 } });
    for (let i = 0; i < 30; i++) {
      await supertest(app)
        .post("/api/wire-list/periods/10/adds")
        .send({ teamId: 50, playerId: 999 });
    }

    const dropRes = await supertest(app)
      .post("/api/wire-list/periods/10/drops")
      .send({ teamId: 50, playerId: 999 });
    expect(dropRes.status).toBe(201);
  });
});

// ── todo #165: await audit-log on state-changing endpoints ───────

describe("wire-list audit-log await (todo #165)", () => {
  it("/lock — audit-log failure is logged but response still returns 200", async () => {
    const app = buildApp(303);
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING",
    });
    mockPrisma.waiverPeriod.update.mockResolvedValue({ id: 10, status: "LOCKED" });
    // Simulate audit-log DB failure.
    mockPrisma.auditLog.create.mockRejectedValue(new Error("audit pool exhausted"));

    const res = await supertest(app).post("/api/wire-list/periods/10/lock").send({});
    // Mutation already committed — response stays 200; failure logged.
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    // /lock does NOT push to errorBuffer — only /finalize does.
    expect(errorBuffer.list()).toHaveLength(0);
  });

  it("/finalize — audit-log failure is captured in admin errorBuffer", async () => {
    const app = buildApp(404);
    // Set period to LOCKED with no pending adds, so finalize can run.
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "LOCKED", createdAt: new Date(),
    });
    mockPrisma.waiverAddEntry.count.mockResolvedValue(0);
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    // $transaction returns the success summary.
    mockPrisma.$transaction.mockResolvedValue({
      period: { id: 10, status: "PROCESSED" },
      dropsConsumed: 0,
      dropsUnused: 0,
      addsApplied: 0,
    });
    mockPrisma.waiverAddEntry.findMany.mockResolvedValue([]); // notification fan-out: no adds
    mockPrisma.auditLog.create.mockRejectedValue(new Error("audit DB hiccup"));

    const res = await supertest(app).post("/api/wire-list/periods/10/finalize").send({});
    expect(res.status).toBe(200);

    // /finalize is irreversible — failure pushes into errorBuffer.
    const records = errorBuffer.list();
    expect(records.length).toBeGreaterThanOrEqual(1);
    const rec = records[0];
    expect(rec.message).toMatch(/WIRE_LIST_PERIOD_FINALIZE/);
    expect(rec.message).toMatch(/audit DB hiccup/i);
    expect(rec.ref).toBe("ERR-deadbeef");
  });

  it("/lock — audit-log success path writes one auditLog row", async () => {
    const app = buildApp(505);
    mockPrisma.waiverPeriod.findUnique.mockResolvedValue({
      id: 10, leagueId: 1, status: "PENDING",
    });
    mockPrisma.waiverPeriod.update.mockResolvedValue({ id: 10, status: "LOCKED" });
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await supertest(app).post("/api/wire-list/periods/10/lock").send({});
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe(
      "WIRE_LIST_PERIOD_LOCK",
    );
  });
});

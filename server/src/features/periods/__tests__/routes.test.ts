import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    season: { findUnique: vi.fn() },
    leagueMembership: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireCommissionerOrAdmin: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireTeamOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

vi.mock("../../../lib/outboxDrainer.js", () => ({
  enqueueIlFeeReconcile: vi.fn(),
}));
vi.mock("../../../lib/auditLog.js", () => ({
  writeAuditLog: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import { enqueueIlFeeReconcile } from "../../../lib/outboxDrainer.js";
import { writeAuditLog } from "../../../lib/auditLog.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { periodsRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(periodsRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET / ────────────────────────────────────────────────────────

describe("GET /", () => {
  it("returns periods for a league", async () => {
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 1, name: "P1", startDate: new Date("2026-04-01"), endDate: new Date("2026-05-01"), status: "active", leagueId: 1, seasonId: 1 },
    ]);

    const res = await supertest(app).get("/?leagueId=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("P1");
    expect(res.body.data[0].isActive).toBe(true);
  });

  it("returns 400 when leagueId is missing", async () => {
    const res = await supertest(app).get("/");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/leagueId/i);
  });
});

// ── POST / ───────────────────────────────────────────────────────

describe("POST /", () => {
  it("creates a period", async () => {
    mockPrisma.season.findUnique.mockResolvedValue({ id: 1, leagueId: 1 });
    mockPrisma.period.create.mockResolvedValue({
      id: 5, name: "P3", startDate: new Date(), endDate: new Date(), status: "pending", leagueId: 1, seasonId: 1,
    });

    const res = await supertest(app).post("/").send({
      leagueId: 1, seasonId: 1, name: "P3", startDate: "2026-06-01", endDate: "2026-07-01",
    });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("P3");
  });

  it("returns 400 when season not in league", async () => {
    mockPrisma.season.findUnique.mockResolvedValue({ id: 1, leagueId: 2 }); // different league

    const res = await supertest(app).post("/").send({
      leagueId: 1, seasonId: 1, name: "P3", startDate: "2026-06-01", endDate: "2026-07-01",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Season not found");
  });

  it("returns 403 for non-commissioner non-admin", async () => {
    // Override user to non-admin
    const nonAdminApp = express();
    nonAdminApp.use(express.json());
    nonAdminApp.use((req: any, _res: any, next: NextFunction) => {
      req.user = { id: 2, isAdmin: false };
      next();
    });
    nonAdminApp.use(periodsRouter);
    nonAdminApp.use((err: any, _req: any, res: any, _next: NextFunction) => {
      res.status(500).json({ error: "Internal Server Error" });
    });

    mockPrisma.leagueMembership.findUnique.mockResolvedValue({ role: "OWNER" });

    const res = await supertest(nonAdminApp).post("/").send({
      leagueId: 1, seasonId: 1, name: "P3", startDate: "2026-06-01", endDate: "2026-07-01",
    });

    expect(res.status).toBe(403);
  });
});

// ── PATCH /:id ───────────────────────────────────────────────────

describe("PATCH /:id", () => {
  it("updates a period", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "pending" });
    mockPrisma.period.update.mockResolvedValue({ id: 1, name: "P1 Updated", status: "active" });

    const res = await supertest(app).patch("/1").send({ name: "P1 Updated", status: "active" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("P1 Updated");
  });

  it("completed without billFees enqueues IL fee reconcile and audits billed:true", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "active" });
    mockPrisma.period.update.mockResolvedValue({ id: 1, status: "completed" });

    const res = await supertest(app).patch("/1").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(enqueueIlFeeReconcile).toHaveBeenCalledWith(null, 1, [1]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PERIOD_CLOSE",
        resourceType: "Period",
        resourceId: "1",
        metadata: { leagueId: 1, periodId: 1, billed: true },
      }),
    );
  });

  it("completed with billFees:false does not enqueue and audits billed:false", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "active" });
    mockPrisma.period.update.mockResolvedValue({ id: 1, status: "completed" });

    const res = await supertest(app).patch("/1").send({ status: "completed", billFees: false });
    expect(res.status).toBe(200);
    expect(enqueueIlFeeReconcile).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PERIOD_CLOSE",
        metadata: { leagueId: 1, periodId: 1, billed: false },
      }),
    );
    // billFees is a request flag, never persisted on the Period row
    expect(mockPrisma.period.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "completed" },
    });
  });

  it("already-completed period does not re-enqueue or re-audit", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "completed" });
    mockPrisma.period.update.mockResolvedValue({ id: 1, status: "completed" });

    const res = await supertest(app).patch("/1").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(enqueueIlFeeReconcile).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("pending → active audits PERIOD_START", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "pending" });
    mockPrisma.period.update.mockResolvedValue({ id: 1, status: "active" });

    const res = await supertest(app).patch("/1").send({ status: "active" });
    expect(res.status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PERIOD_START",
        resourceType: "Period",
        resourceId: "1",
        metadata: { leagueId: 1, periodId: 1 },
      }),
    );
    expect(enqueueIlFeeReconcile).not.toHaveBeenCalled();
  });

  it("returns 404 for non-existent period", async () => {
    mockPrisma.period.findUnique.mockResolvedValue(null);

    const res = await supertest(app).patch("/999").send({ name: "Nope" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid ID", async () => {
    const res = await supertest(app).patch("/abc").send({ name: "Nope" });
    expect(res.status).toBe(400);
  });
});

// ── DELETE /:id ──────────────────────────────────────────────────

describe("DELETE /:id", () => {
  it("deletes a pending period", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "pending" });
    mockPrisma.period.delete.mockResolvedValue({});

    const res = await supertest(app).delete("/1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects deleting non-pending period", async () => {
    mockPrisma.period.findUnique.mockResolvedValue({ id: 1, leagueId: 1, status: "active" });

    const res = await supertest(app).delete("/1");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("pending");
  });

  it("returns 404 for non-existent period", async () => {
    mockPrisma.period.findUnique.mockResolvedValue(null);

    const res = await supertest(app).delete("/999");
    expect(res.status).toBe(404);
  });
});

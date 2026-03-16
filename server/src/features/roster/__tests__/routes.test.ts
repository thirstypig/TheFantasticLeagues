import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    rosterEntry: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    team: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  isTeamOwner: vi.fn(),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { prisma } from "../../../db/prisma.js";
import { isTeamOwner } from "../../../middleware/auth.js";

const mockPrisma = prisma as any;
const mockIsTeamOwner = isTeamOwner as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { rosterRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use(rosterRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockIsTeamOwner.mockResolvedValue(true);
  mockPrisma.team.findFirst.mockResolvedValue({ id: 10, code: "ABC" });
});

// ── POST /api/roster/add-player ──────────────────────────────────

describe("POST /api/roster/add-player", () => {
  it("adds a player to the roster", async () => {
    mockPrisma.rosterEntry.create.mockResolvedValue({
      id: 1, year: 2026, teamCode: "ABC", playerName: "Mike Trout", position: "CF",
    });

    const res = await supertest(app)
      .post("/api/roster/add-player")
      .send({ teamCode: "ABC", playerName: "Mike Trout", position: "CF" });

    expect(res.status).toBe(200);
    expect(res.body.playerName).toBe("Mike Trout");
  });

  it("returns 403 when user does not own the team", async () => {
    mockIsTeamOwner.mockResolvedValue(false);

    const res = await supertest(app)
      .post("/api/roster/add-player")
      .send({ teamCode: "ABC", playerName: "Test", position: "SS" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("do not own");
  });

  it("returns 404 when team not found", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/roster/add-player")
      .send({ teamCode: "ZZZ", playerName: "Test", position: "SS" });

    expect(res.status).toBe(404);
  });

  it("allows admin to bypass ownership check", async () => {
    // Use admin app
    const adminApp = express();
    adminApp.use(express.json());
    adminApp.use((req: any, _res: any, next: NextFunction) => {
      req.user = { id: 99, isAdmin: true };
      next();
    });
    adminApp.use(rosterRouter);

    mockPrisma.rosterEntry.create.mockResolvedValue({
      id: 1, year: 2026, teamCode: "ABC", playerName: "Test", position: "SS",
    });

    const res = await supertest(adminApp)
      .post("/api/roster/add-player")
      .send({ teamCode: "ABC", playerName: "Test", position: "SS" });

    expect(res.status).toBe(200);
    // isTeamOwner should NOT have been called (admin bypass)
    expect(mockIsTeamOwner).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/roster/:id ───────────────────────────────────────

describe("DELETE /api/roster/:id", () => {
  it("deletes a roster entry", async () => {
    mockPrisma.rosterEntry.findUnique.mockResolvedValue({
      id: 1, teamCode: "ABC", playerName: "Mike Trout",
    });
    mockPrisma.rosterEntry.delete.mockResolvedValue({});

    const res = await supertest(app).delete("/api/roster/1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when entry not found", async () => {
    mockPrisma.rosterEntry.findUnique.mockResolvedValue(null);

    const res = await supertest(app).delete("/api/roster/999");
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own the team", async () => {
    mockPrisma.rosterEntry.findUnique.mockResolvedValue({ id: 1, teamCode: "ABC" });
    mockIsTeamOwner.mockResolvedValue(false);

    const res = await supertest(app).delete("/api/roster/1");
    expect(res.status).toBe(403);
  });
});

// ── GET /api/roster/:teamCode ────────────────────────────────────

describe("GET /api/roster/:teamCode", () => {
  it("returns roster for a team", async () => {
    mockPrisma.rosterEntry.findMany.mockResolvedValue([
      { id: 1, teamCode: "ABC", playerName: "Mike Trout", position: "CF", year: 2026 },
    ]);

    const res = await supertest(app).get("/api/roster/ABC");
    expect(res.status).toBe(200);
    expect(res.body.roster).toHaveLength(1);
  });

  it("filters by year query param", async () => {
    mockPrisma.rosterEntry.findMany.mockResolvedValue([]);

    await supertest(app).get("/api/roster/ABC?year=2025");
    expect(mockPrisma.rosterEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamCode: "ABC", year: 2025 }),
      })
    );
  });
});

// ── GET /api/roster/year/:year ───────────────────────────────────

describe("GET /api/roster/year/:year", () => {
  it("returns all rosters for a year", async () => {
    mockPrisma.rosterEntry.findMany.mockResolvedValue([
      { id: 1, teamCode: "ABC", playerName: "Player 1", year: 2026 },
      { id: 2, teamCode: "DEF", playerName: "Player 2", year: 2026 },
    ]);

    const res = await supertest(app).get("/api/roster/year/2026");
    expect(res.status).toBe(200);
    expect(res.body.roster).toHaveLength(2);
  });
});

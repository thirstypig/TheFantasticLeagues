import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    franchiseMembership: { findMany: vi.fn(), findUnique: vi.fn() },
    franchise: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireFranchiseCommissioner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/validate.js", () => ({
  validateBody: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

// ── Express test app ─────────────────────────────────────────────

import express from "express";
import { franchiseRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: true };
  next();
});
app.use(franchiseRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error" });
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /franchises ──────────────────────────────────────────────

describe("GET /franchises", () => {
  it("returns franchises for the user", async () => {
    mockPrisma.franchiseMembership.findMany.mockResolvedValue([
      {
        role: "COMMISSIONER",
        franchise: { id: 1, name: "OGBA", isPublic: false, publicSlug: null },
      },
    ]);

    const res = await supertest(app).get("/franchises");
    expect(res.status).toBe(200);
    expect(res.body.franchises).toHaveLength(1);
    expect(res.body.franchises[0].name).toBe("OGBA");
    expect(res.body.franchises[0].role).toBe("COMMISSIONER");
  });

  it("returns empty when user has no franchises", async () => {
    mockPrisma.franchiseMembership.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/franchises");
    expect(res.status).toBe(200);
    expect(res.body.franchises).toEqual([]);
  });
});

// ── GET /franchises/:id ──────────────────────────────────────────

describe("GET /franchises/:id", () => {
  it("returns franchise detail with seasons", async () => {
    mockPrisma.franchise.findUnique.mockResolvedValue({
      id: 1,
      name: "OGBA",
      isPublic: false,
      publicSlug: null,
      tradeReviewPolicy: "COMMISSIONER",
      vetoThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      leagues: [{ id: 1, name: "OGBA 2026", season: 2026, draftMode: "AUCTION" }],
    });

    const res = await supertest(app).get("/franchises/1");
    expect(res.status).toBe(200);
    expect(res.body.franchise.name).toBe("OGBA");
    expect(res.body.franchise.leagues).toHaveLength(1);
  });

  it("returns 404 for non-existent franchise", async () => {
    mockPrisma.franchise.findUnique.mockResolvedValue(null);

    const res = await supertest(app).get("/franchises/999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid ID", async () => {
    const res = await supertest(app).get("/franchises/abc");
    expect(res.status).toBe(400);
  });
});

// ── PATCH /franchises/:id ────────────────────────────────────────

describe("PATCH /franchises/:id", () => {
  it("updates franchise settings", async () => {
    mockPrisma.franchise.update.mockResolvedValue({
      id: 1, name: "OGBA Updated", isPublic: true,
      publicSlug: null, tradeReviewPolicy: "LEAGUE_VOTE", vetoThreshold: 4,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await supertest(app)
      .patch("/franchises/1")
      .send({ name: "OGBA Updated", tradeReviewPolicy: "LEAGUE_VOTE", vetoThreshold: 4 });

    expect(res.status).toBe(200);
    expect(res.body.franchise.name).toBe("OGBA Updated");
  });
});

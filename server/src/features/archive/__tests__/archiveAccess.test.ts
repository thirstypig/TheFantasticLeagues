import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    franchiseMembership: { findFirst: vi.fn() },
  },
}));
vi.mock("../services/trophyCaseService.js", () => ({ computeTrophyCase: vi.fn().mockResolvedValue({}) }));
vi.mock("../../../lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
// Real requireAuth is replaced by "signed in iff req.user is set" so the test
// exercises the archive guard, not Supabase.
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => (req.user ? next() : res.status(401).end()),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireLeagueMember: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { prisma } from "../../../db/prisma.js";
import { archiveRouter } from "../routes.js";
import { computeTrophyCase } from "../services/trophyCaseService.js";

const mockPrisma = prisma as unknown as {
  franchiseMembership: { findFirst: ReturnType<typeof vi.fn> };
};

function appAs(user: { id: number; isAdmin: boolean } | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = user; // partial user is enough for the guard
    next();
  });
  app.use("/api", archiveRouter);
  // Another router mounted at /api after the archive one: must stay reachable.
  app.get("/api/standings/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("archive is members-only", () => {
  it("returns 403 to a signed-in user who is not in the franchise", async () => {
    mockPrisma.franchiseMembership.findFirst.mockResolvedValue(null);
    const res = await supertest(appAs({ id: 42, isAdmin: false })).get("/api/archive/trophy-case?leagueId=1");
    expect(res.status).toBe(403);
    expect(computeTrophyCase).not.toHaveBeenCalled();
  });

  it("looks the user up by franchise membership of a league that has archived seasons", async () => {
    mockPrisma.franchiseMembership.findFirst.mockResolvedValue(null);
    await supertest(appAs({ id: 42, isAdmin: false })).get("/api/archive/history/2024");
    expect(mockPrisma.franchiseMembership.findFirst).toHaveBeenCalledWith({
      where: { userId: 42, franchise: { leagues: { some: { historicalSeasons: { some: {} } } } } },
      select: { id: true },
    });
  });

  it("lets a franchise member through", async () => {
    mockPrisma.franchiseMembership.findFirst.mockResolvedValue({ id: 7 });
    const res = await supertest(appAs({ id: 42, isAdmin: false })).get("/api/archive/trophy-case?leagueId=1");
    expect(res.status).toBe(200);
  });

  it("lets an admin through without a membership lookup", async () => {
    const res = await supertest(appAs({ id: 1, isAdmin: true })).get("/api/archive/trophy-case?leagueId=1");
    expect(res.status).toBe(200);
    expect(mockPrisma.franchiseMembership.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    const res = await supertest(appAs(null)).get("/api/archive/trophy-case?leagueId=1");
    expect(res.status).toBe(401);
  });

  it("does not gate other /api routes (the guard is path-scoped)", async () => {
    mockPrisma.franchiseMembership.findFirst.mockResolvedValue(null);
    const res = await supertest(appAs({ id: 42, isAdmin: false })).get("/api/standings/ping");
    expect(res.status).toBe(200);
    expect(mockPrisma.franchiseMembership.findFirst).not.toHaveBeenCalled();
  });
});

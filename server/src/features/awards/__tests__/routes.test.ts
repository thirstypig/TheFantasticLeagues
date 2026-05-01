/**
 * Awards endpoint tests — GET /api/leagues/:leagueId/awards (todo #115).
 *
 * Verifies:
 *  - Round-trip: persisted digest awards are returned with `source: "persisted"`.
 *  - On-demand: when no digest exists, computeAwardsRankings runs and
 *    `source: "computed"` is returned.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    aiInsight: { findFirst: vi.fn() },
    period: { findMany: vi.fn().mockResolvedValue([]) },
    team: { findMany: vi.fn().mockResolvedValue([]) },
    playerStatsPeriod: { groupBy: vi.fn() },
  },
}));
vi.mock("../../../middleware/auth.js", () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireLeagueMember: () => vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock("../../../middleware/asyncHandler.js", () => ({
  asyncHandler: (fn: Function) => fn,
}));

import { prisma } from "../../../db/prisma.js";

const mockPrisma = prisma as any;

import express from "express";
import { awardsRouter } from "../routes.js";
import supertest from "supertest";

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: NextFunction) => {
  req.user = { id: 1, isAdmin: false };
  next();
});
app.use("/api/leagues", awardsRouter);
app.use((err: any, _req: any, res: any, _next: NextFunction) => {
  res.status(500).json({ error: "Internal Server Error", message: String(err) });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/leagues/:leagueId/awards", () => {
  it("returns 400 for invalid leagueId", async () => {
    const res = await supertest(app).get("/api/leagues/abc/awards");
    expect(res.status).toBe(400);
  });

  it("returns persisted awards from digest payload when available", async () => {
    const persistedAwards = {
      leagueId: 1,
      weekKey: "2026-W13",
      computedAt: "2026-04-29T00:00:00.000Z",
      hitterPool: 5,
      starterPool: 3,
      mvp: [
        {
          rank: 1, playerId: 100, name: "Slugger", team: "Bombers", mvpScore: 11.2,
          stats: { AB: 200, H: 70, HR: 25, RBI: 60, R: 50, SB: 5, BB: 30, TB: 160, SO: 40, AVG: 0.35, OBP: 0.43, SLG: 0.80, OPS: 1.23 },
          zScores: { OPS: 2.0, HR: 2.0, OBP: 1.5, RBI: 1.0, R: 1.0, SB: 0, TB: 1.0, BB: 0.5, SO: -0.5 },
        },
      ],
      cyYoung: [],
    };
    const createdAt = new Date("2026-04-29T01:00:00.000Z");
    mockPrisma.aiInsight.findFirst.mockResolvedValue({
      data: { weekInOneSentence: "...", awards: persistedAwards },
      createdAt,
    });

    const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("persisted");
    expect(res.body.weekKey).toBe("2026-W13");
    expect(res.body.mvp).toHaveLength(1);
    expect(res.body.mvp[0].name).toBe("Slugger");
    // Round-trip: composite score and per-component z-scores survive persistence
    expect(res.body.mvp[0].mvpScore).toBeCloseTo(11.2, 3);
    expect(res.body.mvp[0].zScores.HR).toBeCloseTo(2.0, 3);
    expect(res.body.digestGeneratedAt).toBe(createdAt.toISOString());
  });

  it("falls back to on-demand compute when no digest exists for the week", async () => {
    mockPrisma.aiInsight.findFirst.mockResolvedValue(null);
    // computeAwardsRankings will run with no periods → empty result
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("computed");
    expect(res.body.weekKey).toBe("2026-W13");
    expect(res.body.mvp).toEqual([]);
    expect(res.body.cyYoung).toEqual([]);
  });

  it("falls back to on-demand compute when digest exists but has no awards field (pre-#115 row)", async () => {
    mockPrisma.aiInsight.findFirst.mockResolvedValue({
      data: { weekInOneSentence: "old digest with no awards" },
      createdAt: new Date(),
    });
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/api/leagues/1/awards");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("computed");
  });

  it("falls back to on-demand compute when persisted awards blob fails schema validation (todo #118)", async () => {
    // Simulate a digest written before a server-side shape change — the blob
    // is present but doesn't match `AwardsRankingsSchema` (e.g. missing
    // `computedAt` and `cyYoung`). Pre-#118 the route's blind cast would
    // ship this garbage to the client; now it must fall through to compute.
    mockPrisma.aiInsight.findFirst.mockResolvedValue({
      data: {
        weekInOneSentence: "drifted digest",
        awards: {
          // Missing required fields — schema parse should fail.
          leagueId: 1,
          weekKey: "2026-W13",
          mvp: [{ /* malformed candidate */ rank: 1 }],
        },
      },
      createdAt: new Date(),
    });
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("computed");
    // No persisted-only field bleeds through
    expect(res.body.digestGeneratedAt).toBeUndefined();
  });

  it("uses current week when weekKey query param is missing/invalid", async () => {
    mockPrisma.aiInsight.findFirst.mockResolvedValue(null);
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const res = await supertest(app).get("/api/leagues/1/awards?weekKey=invalid");
    expect(res.status).toBe(200);
    // weekKey is YYYY-WNN — verify it matches that pattern (i.e., default applied)
    expect(res.body.weekKey).toMatch(/^\d{4}-W\d{2}$/);
  });
});

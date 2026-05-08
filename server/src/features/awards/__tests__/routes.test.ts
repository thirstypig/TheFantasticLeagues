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
    aiInsight: {
      findFirst: vi.fn(),
      // findMany is used by the availableWeeks enumeration (todo #179).
      // Default to empty so existing tests don't have to set it up.
      findMany: vi.fn().mockResolvedValue([]),
    },
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
import { clearAwardsCache } from "../services/awardsService.js";
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
  // The service-layer cache (todo #119) is process-scoped — clear between
  // tests so each test sees its own mock prisma responses, not a hit from
  // a previous test's compute path.
  clearAwardsCache();
  // Re-establish defaults that vi.clearAllMocks() wipes. The
  // availableWeeks enumeration (todo #179) reads via findMany; tests
  // that don't override it expect an empty list (just the synthetic
  // current week appended by the service).
  mockPrisma.aiInsight.findMany.mockResolvedValue([]);
  mockPrisma.period.findMany.mockResolvedValue([]);
  mockPrisma.team.findMany.mockResolvedValue([]);
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

  it("serves repeat requests for the same (league, week) from cache without re-querying prisma (todo #119)", async () => {
    mockPrisma.aiInsight.findFirst.mockResolvedValue(null);
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const a = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W14");
    const b = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W14");

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // First request hits prisma; second is served from cache
    expect(mockPrisma.aiInsight.findFirst).toHaveBeenCalledTimes(1);
    // Same body either way
    expect(b.body).toEqual(a.body);
  });

  describe("weekKey regex (todo #179)", () => {
    // The tightened regex rejects nonsense year/week combos at the seam
    // instead of doing useless DB work. Falls through to default
    // (current week via getWeekKey) on any reject.
    it.each([
      ["0000-W01", "year before 2020"],
      ["1999-W01", "year before 2020"],
      ["3000-W01", "year after 2099"],
      ["2026-W00", "week 0 invalid"],
      ["2026-W54", "week 54 above max"],
      ["2026-W99", "week 99 invalid"],
      ["abcd-W01", "non-numeric year"],
      ["2026-Wxx", "non-numeric week"],
      ["2026W01", "missing dash"],
      ["", "empty string"],
    ])("rejects %s (%s) and falls back to current week", async (weekKey) => {
      const res = await supertest(app).get(`/api/leagues/1/awards?weekKey=${encodeURIComponent(weekKey)}`);
      expect(res.status).toBe(200);
      // Default applied — must match the tightened regex itself.
      expect(res.body.weekKey).toMatch(/^(20[2-9]\d)-W(0[1-9]|[1-4]\d|5[0-3])$/);
      expect(res.body.weekKey).not.toBe(weekKey);
    });

    it.each([
      "2024-W01",
      "2026-W13",
      "2099-W53",
      "2030-W49",
    ])("accepts realistic %s", async (weekKey) => {
      const res = await supertest(app).get(`/api/leagues/1/awards?weekKey=${weekKey}`);
      expect(res.status).toBe(200);
      expect(res.body.weekKey).toBe(weekKey);
    });
  });

  describe("availableWeeks enumeration (todo #179)", () => {
    it("returns the persisted digest weeks plus a synthetic current week", async () => {
      // Two persisted digest rows for unrelated weeks. The handler must
      // surface both AND append a synthetic current-week entry with
      // generatedAt: null (so the UI can offer it as a tab even if no
      // digest has run yet for that week).
      mockPrisma.aiInsight.findMany.mockResolvedValue([
        { weekKey: "2026-W10", createdAt: new Date("2026-03-09T12:00:00.000Z") },
        { weekKey: "2026-W11", createdAt: new Date("2026-03-16T12:00:00.000Z") },
      ]);
      mockPrisma.aiInsight.findFirst.mockResolvedValue(null);

      const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W10");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.availableWeeks)).toBe(true);
      expect(res.body.availableWeeks).toHaveLength(3);
      expect(res.body.availableWeeks[0]).toEqual({
        weekKey: "2026-W10",
        label: expect.any(String),
        generatedAt: "2026-03-09T12:00:00.000Z",
      });
      expect(res.body.availableWeeks[1]).toEqual({
        weekKey: "2026-W11",
        label: expect.any(String),
        generatedAt: "2026-03-16T12:00:00.000Z",
      });
      // Synthetic current-week entry tacked on (generatedAt: null)
      const synthetic = res.body.availableWeeks[2];
      expect(synthetic.weekKey).toMatch(/^\d{4}-W\d{2}$/);
      expect(synthetic.generatedAt).toBeNull();
    });

    it("does not duplicate the current week when it already has a digest", async () => {
      // Match getWeekKey()'s current return so the dedup branch fires.
      // We can't import getWeekKey here without polluting the SUT mocks, so
      // just probe via the response itself.
      mockPrisma.aiInsight.findFirst.mockResolvedValue(null);
      // First call — discover what the service considers "current week"
      const probe = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
      const currentWeekKey = probe.body.availableWeeks.at(-1).weekKey;
      clearAwardsCache();

      mockPrisma.aiInsight.findMany.mockResolvedValue([
        { weekKey: currentWeekKey, createdAt: new Date("2026-04-01T00:00:00.000Z") },
      ]);

      const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
      expect(res.status).toBe(200);
      // Only one entry for current week; the synthetic dup is suppressed.
      const matches = res.body.availableWeeks.filter(
        (w: { weekKey: string }) => w.weekKey === currentWeekKey,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].generatedAt).toBe("2026-04-01T00:00:00.000Z");
    });

    it("accompanies persisted-source responses too", async () => {
      const persistedAwards = {
        leagueId: 1,
        weekKey: "2026-W13",
        computedAt: "2026-04-29T00:00:00.000Z",
        hitterPool: 0,
        starterPool: 0,
        mvp: [],
        cyYoung: [],
      };
      mockPrisma.aiInsight.findFirst.mockResolvedValue({
        data: { weekInOneSentence: "...", awards: persistedAwards },
        createdAt: new Date("2026-04-29T01:00:00.000Z"),
      });
      mockPrisma.aiInsight.findMany.mockResolvedValue([
        { weekKey: "2026-W13", createdAt: new Date("2026-04-29T01:00:00.000Z") },
      ]);

      const res = await supertest(app).get("/api/leagues/1/awards?weekKey=2026-W13");
      expect(res.status).toBe(200);
      expect(res.body.source).toBe("persisted");
      expect(res.body.availableWeeks).toBeDefined();
      // Persisted week is in the list; current-week may also be appended.
      expect(
        res.body.availableWeeks.some(
          (w: { weekKey: string }) => w.weekKey === "2026-W13",
        ),
      ).toBe(true);
    });
  });

  it("coalesces concurrent compute requests via the in-flight pending promise (todo #119)", async () => {
    let resolveFindFirst: (value: unknown) => void = () => {};
    const findFirstPromise = new Promise((resolve) => {
      resolveFindFirst = resolve;
    });
    mockPrisma.aiInsight.findFirst.mockReturnValue(findFirstPromise);
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    // Fire three concurrent requests before the first compute resolves —
    // all three should join the same pending Promise rather than each
    // triggering a fresh prisma read.
    const [a, b, c] = await Promise.all([
      Promise.resolve().then(() => supertest(app).get("/api/leagues/1/awards?weekKey=2026-W15")),
      Promise.resolve().then(() => supertest(app).get("/api/leagues/1/awards?weekKey=2026-W15")),
      Promise.resolve().then(() => supertest(app).get("/api/leagues/1/awards?weekKey=2026-W15")),
      // Resolve after the three requests have all entered the cache layer
      Promise.resolve().then(() => resolveFindFirst(null)),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    // Single prisma read shared by all three concurrent callers
    expect(mockPrisma.aiInsight.findFirst).toHaveBeenCalledTimes(1);
  });
});

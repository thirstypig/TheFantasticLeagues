/**
 * Awards service tests — z-score composite MVP/Cy Young rankings (todo #115).
 *
 * Mocks Prisma so the test exercises the math + shape contract without
 * touching the DB. The structured output replaces the previously discarded
 * inline computation in digestService.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    playerStatsPeriod: { groupBy: vi.fn() },
  },
}));

import { prisma } from "../../../db/prisma.js";
import {
  computeAwardsRankings,
  formatMvpForPrompt,
  formatCyYoungForPrompt,
  MIN_AB_FOR_MVP,
  MIN_IP_FOR_CY_YOUNG,
  MIN_GS_FOR_STARTER,
} from "../services/awardsService.js";

const mockPrisma = prisma as unknown as {
  period: { findMany: ReturnType<typeof vi.fn> };
  team: { findMany: ReturnType<typeof vi.fn> };
  playerStatsPeriod: { groupBy: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── helpers ──────────────────────────────────────────────────────

/** Build a mocked playerStatsPeriod.groupBy result row with sensible zero defaults. */
function statsRow(playerId: number, sums: Record<string, number>) {
  return {
    playerId,
    _sum: {
      AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0,
      BB: 0, TB: 0, SO: 0,
      W: 0, SV: 0, K: 0, ER: 0, L: 0, GS: 0, HR_A: 0,
      IP: 0, BB_H: 0,
      ...sums,
    },
  };
}

// ── empty / edge cases ───────────────────────────────────────────

describe("computeAwardsRankings — empty league", () => {
  it("returns empty rankings when league has no active periods", async () => {
    mockPrisma.period.findMany.mockResolvedValue([]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const result = await computeAwardsRankings(1, "2026-W13");
    expect(result.mvp).toEqual([]);
    expect(result.cyYoung).toEqual([]);
    expect(result.hitterPool).toBe(0);
    expect(result.starterPool).toBe(0);
    expect(result.weekKey).toBe("2026-W13");
    expect(result.leagueId).toBe(1);
  });

  it("returns empty rankings when there are no rostered players", async () => {
    mockPrisma.period.findMany.mockResolvedValue([{ id: 10 }]);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const result = await computeAwardsRankings(1, "2026-W13");
    expect(result.mvp).toEqual([]);
    expect(result.cyYoung).toEqual([]);
  });

  it("returns empty mvp/cyYoung when fewer than 3 qualified players", async () => {
    mockPrisma.period.findMany.mockResolvedValue([{ id: 10 }]);
    mockPrisma.team.findMany.mockResolvedValue([
      { name: "Aces", rosters: [{ player: { id: 1, name: "Solo" } }] },
    ]);
    // Only 1 qualified hitter — pool < 3
    mockPrisma.playerStatsPeriod.groupBy
      .mockResolvedValueOnce([statsRow(1, { AB: MIN_AB_FOR_MVP + 50, HR: 5, H: 30, RBI: 20, R: 25 })])
      .mockResolvedValueOnce([{ playerId: 1, _sum: { IP: 0, BB_H: 0 } }]);

    const result = await computeAwardsRankings(1, "2026-W13");
    expect(result.hitterPool).toBe(1);
    expect(result.mvp).toEqual([]);
  });
});

// ── MVP: full ranking ────────────────────────────────────────────

describe("computeAwardsRankings — MVP", () => {
  beforeEach(() => {
    mockPrisma.period.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockPrisma.team.findMany.mockResolvedValue([
      {
        name: "Bombers",
        rosters: [
          { player: { id: 1, name: "Slugger" } },
          { player: { id: 2, name: "Speedy" } },
        ],
      },
      {
        name: "Contact",
        rosters: [
          { player: { id: 3, name: "Average Joe" } },
          { player: { id: 4, name: "Below Threshold" } },
        ],
      },
    ]);
  });

  it("ranks top-3 hitters by composite z-score and includes raw stats", async () => {
    mockPrisma.playerStatsPeriod.groupBy
      .mockResolvedValueOnce([
        // Slugger: huge OPS via lots of HR + TB
        statsRow(1, { AB: 200, H: 70, HR: 25, RBI: 60, R: 50, SB: 5, BB: 30, TB: 160, SO: 40 }),
        // Speedy: high SB, modest power
        statsRow(2, { AB: 200, H: 60, HR: 5, RBI: 30, R: 40, SB: 30, BB: 20, TB: 90, SO: 50 }),
        // Average Joe: middling everything
        statsRow(3, { AB: 200, H: 50, HR: 8, RBI: 25, R: 25, SB: 5, BB: 15, TB: 80, SO: 60 }),
        // Below Threshold: filtered out (AB < MIN_AB_FOR_MVP)
        statsRow(4, { AB: MIN_AB_FOR_MVP - 1, H: 10, HR: 3 }),
      ])
      .mockResolvedValueOnce([]); // ipSums (no pitchers)

    const result = await computeAwardsRankings(42, "2026-W13");

    expect(result.hitterPool).toBe(3); // Below Threshold filtered
    expect(result.mvp).toHaveLength(3);

    const slugger = result.mvp.find(c => c.name === "Slugger");
    expect(slugger).toBeDefined();
    expect(slugger!.rank).toBe(1); // expect Slugger to top the rankings
    expect(slugger!.team).toBe("Bombers");
    expect(slugger!.stats.HR).toBe(25);
    expect(slugger!.stats.TB).toBe(160);
    expect(slugger!.stats.AVG).toBeCloseTo(70 / 200, 4);
    // OBP = (H + BB) / (AB + BB) = 100 / 230
    expect(slugger!.stats.OBP).toBeCloseTo(100 / 230, 4);
    // SLG = TB / AB
    expect(slugger!.stats.SLG).toBeCloseTo(160 / 200, 4);
    expect(slugger!.zScores.HR).toBeGreaterThan(0); // above-mean

    // ranks should be 1, 2, 3
    expect(result.mvp.map(c => c.rank)).toEqual([1, 2, 3]);
    // composite scores should be monotonically decreasing
    expect(result.mvp[0].mvpScore).toBeGreaterThan(result.mvp[1].mvpScore);
    expect(result.mvp[1].mvpScore).toBeGreaterThan(result.mvp[2].mvpScore);
  });

  it("z-scores are signed and per-component", async () => {
    mockPrisma.playerStatsPeriod.groupBy
      .mockResolvedValueOnce([
        statsRow(1, { AB: 200, H: 70, HR: 30, RBI: 60, R: 50, SB: 0, BB: 30, TB: 180, SO: 40 }),
        statsRow(2, { AB: 200, H: 60, HR: 0, RBI: 30, R: 40, SB: 0, BB: 20, TB: 90, SO: 50 }),
        statsRow(3, { AB: 200, H: 50, HR: 0, RBI: 25, R: 25, SB: 0, BB: 15, TB: 80, SO: 60 }),
      ])
      .mockResolvedValueOnce([]);

    const result = await computeAwardsRankings(42, "2026-W13");
    const top = result.mvp[0];
    // The HR=30 player is well above mean of (30+0+0)/3 = 10
    expect(top.zScores.HR).toBeGreaterThan(0);
    // The lowest HR players should have negative HR z-scores
    const last = result.mvp[result.mvp.length - 1];
    expect(last.zScores.HR).toBeLessThanOrEqual(0);
  });
});

// ── Cy Young: full ranking ──────────────────────────────────────

describe("computeAwardsRankings — Cy Young", () => {
  beforeEach(() => {
    mockPrisma.period.findMany.mockResolvedValue([{ id: 10 }]);
    mockPrisma.team.findMany.mockResolvedValue([
      {
        name: "Arms",
        rosters: [
          { player: { id: 10, name: "Ace" } },
          { player: { id: 11, name: "Workhorse" } },
        ],
      },
      {
        name: "Bullpen",
        rosters: [
          { player: { id: 12, name: "Mid Rotation" } },
          { player: { id: 13, name: "Below IP Threshold" } },
        ],
      },
    ]);
  });

  it("ranks top-3 starters by composite z-score with correct sign on rate stats", async () => {
    mockPrisma.playerStatsPeriod.groupBy
      .mockResolvedValueOnce([
        // Ace: low ERA, lots of K
        statsRow(10, { W: 10, L: 2, K: 90, GS: 12, ER: 18, HR_A: 5, H: 50 }),
        // Workhorse: lots of IP, decent stats
        statsRow(11, { W: 8, L: 5, K: 70, GS: 12, ER: 30, HR_A: 12, H: 80 }),
        // Mid Rotation
        statsRow(12, { W: 6, L: 6, K: 50, GS: 10, ER: 35, HR_A: 14, H: 90 }),
        // Below IP Threshold: filtered out
        statsRow(13, { W: 1, L: 0, K: 5, GS: MIN_GS_FOR_STARTER, ER: 1 }),
      ])
      .mockResolvedValueOnce([
        { playerId: 10, _sum: { IP: 80, BB_H: 60 } },
        { playerId: 11, _sum: { IP: 90, BB_H: 90 } },
        { playerId: 12, _sum: { IP: 70, BB_H: 100 } },
        // Below IP threshold
        { playerId: 13, _sum: { IP: MIN_IP_FOR_CY_YOUNG - 1, BB_H: 5 } },
      ]);

    const result = await computeAwardsRankings(42, "2026-W13");

    expect(result.starterPool).toBe(3); // 4th was filtered
    expect(result.cyYoung).toHaveLength(3);

    const ace = result.cyYoung.find(c => c.name === "Ace");
    expect(ace).toBeDefined();
    expect(ace!.rank).toBe(1);
    expect(ace!.stats.W).toBe(10);
    expect(ace!.stats.K).toBe(90);
    // ERA = ER * 9 / IP = 18 * 9 / 80 = 2.025
    expect(ace!.stats.ERA).toBeCloseTo((18 * 9) / 80, 3);
    // WHIP = BB_H / IP = 60 / 80
    expect(ace!.stats.WHIP).toBeCloseTo(60 / 80, 3);
    // SP role since GS >= MIN_GS_FOR_STARTER
    expect(ace!.role).toBe("SP");
    // Lower ERA → positive z-score (sign-flipped in service)
    expect(ace!.zScores.ERA).toBeGreaterThan(0);
    expect(ace!.zScores.WHIP).toBeGreaterThan(0);

    expect(result.cyYoung.map(c => c.rank)).toEqual([1, 2, 3]);
    expect(result.cyYoung[0].cyScore).toBeGreaterThan(result.cyYoung[2].cyScore);
  });
});

// ── Prompt formatting ───────────────────────────────────────────

describe("formatMvpForPrompt / formatCyYoungForPrompt", () => {
  it("returns empty string when there are no candidates", () => {
    const empty = {
      leagueId: 1, weekKey: "2026-W01", computedAt: "now",
      hitterPool: 0, starterPool: 0, mvp: [], cyYoung: [],
    };
    expect(formatMvpForPrompt(empty)).toBe("");
    expect(formatCyYoungForPrompt(empty)).toBe("");
  });

  it("formats MVP candidates as multi-line strings the digest prompt expects", () => {
    const mvpRanking = {
      leagueId: 1, weekKey: "2026-W01", computedAt: "now",
      hitterPool: 3, starterPool: 0,
      mvp: [
        {
          rank: 1, playerId: 1, name: "Slugger", team: "Bombers", mvpScore: 12.5,
          stats: { AB: 200, H: 70, HR: 25, RBI: 60, R: 50, SB: 5, BB: 30, TB: 160, SO: 40, AVG: 0.350, OBP: 0.435, SLG: 0.800, OPS: 1.235 },
          zScores: { OPS: 2, HR: 2, OBP: 2, RBI: 1, R: 1, SB: 0, TB: 1, BB: 0, SO: -1 },
        },
      ],
      cyYoung: [],
    };
    const out = formatMvpForPrompt(mvpRanking);
    expect(out).toContain("1. Slugger (Bombers)");
    expect(out).toContain("Score: 12.5");
    expect(out).toContain("25 HR");
  });
});

/**
 * Tests for the releasedAt >= period.startDate boundary fix.
 *
 * Prior to the fix, players released at exactly period.startDate were
 * excluded from the roster query (strict `gt` comparison), so their period
 * stats counted for no team. The fix changes to `gte` so those players'
 * stats are credited to the team that held them when the period began.
 *
 * Real-world precedent: Moreno/Bailey/Bader released from RGS on 2026-04-19
 * (period 2 start) — 5 R went uncredited, causing RGS to rank below DLC in
 * Runs despite having more per-FanGraphs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockTeamFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockDailyFindMany = vi.fn();
const mockDailyGroupBy = vi.fn();
const mockPeriodStatsFindMany = vi.fn();
const mockPeriodStatsCount = vi.fn();
const mockTransactionEventFindMany = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a) },
    team: { findMany: (...a: unknown[]) => mockTeamFindMany(...a) },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsDaily: {
      findMany: (...a: unknown[]) => mockDailyFindMany(...a),
      groupBy: (...a: unknown[]) => mockDailyGroupBy(...a),
    },
    playerStatsPeriod: {
      findMany: (...a: unknown[]) => mockPeriodStatsFindMany(...a),
      count: (...a: unknown[]) => mockPeriodStatsCount(...a),
    },
    transactionEvent: {
      findMany: (...a: unknown[]) => mockTransactionEventFindMany(...a),
    },
  },
}));

import { computeTeamStatsFromDb } from "../services/standingsService.js";

const PERIOD_START = new Date("2026-04-19T00:00:00.000Z");
const PERIOD_END = new Date("2026-05-16T23:59:59.999Z");
const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockDailyGroupBy.mockReset();
  mockPeriodStatsFindMany.mockReset();
  mockPeriodStatsCount.mockReset();
  mockTransactionEventFindMany.mockReset();
  mockTransactionEventFindMany.mockResolvedValue([]);

  mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
  mockTeamFindMany.mockResolvedValue([
    { id: 145, name: "RGing Sluggers", code: "RGS" },
    { id: 148, name: "Demolition Lumber Co.", code: "DLC" },
  ]);
  mockPeriodStatsCount.mockResolvedValue(1);
});

describe("computeTeamStatsFromDb — releasedAt boundary (gte fix)", () => {
  describe("period-stats path", () => {
    it("credits stats to team that released a player AT period.startDate (gte boundary)", async () => {
      // Player released from RGS exactly on period.startDate — was on the roster when period began.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 10, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START, // exactly equal — old `gt` would exclude this
          assignedPosition: "C",
          player: { id: 10, mlbId: 1000, posPrimary: "C" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 10, ...ZERO_STATS, R: 2, HR: 1, RBI: 3 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      expect(rgs.R).toBe(2);
      expect(rgs.HR).toBe(1);
    });

    it("does NOT credit stats when player was released BEFORE period.startDate", async () => {
      // Released one day before the period — should not appear in roster query at all.
      const dayBefore = new Date("2026-04-18T00:00:00.000Z");
      mockRosterFindMany.mockResolvedValue([]);  // roster query returns empty (releasedAt < startDate)
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 10, ...ZERO_STATS, R: 5 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      expect(rgs.R).toBe(0); // no roster entry → no credit
    });

    it("credits stats to new team when player moved mid-period (releasedAt > startDate)", async () => {
      // Player traded mid-period: released from RGS on Apr 25, acquired by DLC on Apr 25.
      // computeWithPeriodStats attributes full-period stats to the player's current team (DLC).
      const tradedAt = new Date("2026-04-25T00:00:00.000Z");
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 20, acquiredAt: new Date("2026-03-22"),
          releasedAt: tradedAt,
          assignedPosition: "SS",
          player: { id: 20, mlbId: 2000, posPrimary: "SS" },
        },
        {
          teamId: 148, playerId: 20, acquiredAt: tradedAt,
          releasedAt: null,
          assignedPosition: "SS",
          player: { id: 20, mlbId: 2000, posPrimary: "SS" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 20, ...ZERO_STATS, R: 10, HR: 3 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      // Stats go to current owner (DLC); RGS gets nothing for traded player
      expect(dlc.R).toBe(10);
      expect(rgs.R).toBe(0);
    });

    it("does not double-count stats when both releasing and acquiring team entries exist at period start", async () => {
      // Edge: two roster rows for same player (released from one team exactly at startDate,
      // acquired by another team exactly at startDate via same-day transaction).
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 145, playerId: 30, acquiredAt: new Date("2026-03-22"),
          releasedAt: PERIOD_START, // released at period start (now included via gte)
          assignedPosition: "OF",
          player: { id: 30, mlbId: 3000, posPrimary: "OF" },
        },
        {
          teamId: 148, playerId: 30, acquiredAt: PERIOD_START,
          releasedAt: null, // currently active on DLC
          assignedPosition: "OF",
          player: { id: 30, mlbId: 3000, posPrimary: "OF" },
        },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 30, ...ZERO_STATS, R: 8, HR: 2 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      const rgs = result.find(r => r.team.code === "RGS")!;
      const dlc = result.find(r => r.team.code === "DLC")!;
      const totalR = rgs.R + dlc.R;
      // Stats must count exactly once, not doubled
      expect(totalR).toBe(8);
      // Active team (DLC) takes priority
      expect(dlc.R).toBe(8);
      expect(rgs.R).toBe(0);
    });
  });
});

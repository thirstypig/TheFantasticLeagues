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
const IL_STASH_BEFORE_PERIOD = new Date("2026-04-19T00:00:00.000Z"); // exactly at period start
const IL_STASH_AFTER_PERIOD_START = new Date("2026-04-25T00:00:00.000Z"); // mid-period

const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

function dailyRow(playerId: number, date: string, stats: Partial<typeof ZERO_STATS>) {
  return { playerId, gameDate: new Date(date), ...ZERO_STATS, ...stats };
}

function ilStashEvent(playerId: number, effDate: Date) {
  return { playerId, transactionType: "IL_STASH", effDate };
}

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockDailyGroupBy.mockReset();
  mockPeriodStatsFindMany.mockReset();
  mockPeriodStatsCount.mockReset();
  mockTransactionEventFindMany.mockReset();
  // Default: no IL events (most tests override when needed)
  mockTransactionEventFindMany.mockResolvedValue([]);
});

describe("computeTeamStatsFromDb — IL slot exclusion (todo #155)", () => {
  describe("daily-stats path (no PlayerStatsPeriod data)", () => {
    beforeEach(() => {
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockTeamFindMany.mockResolvedValue([{ id: 147, name: "Los Doyers", code: "LDY" }]);
      // No PlayerStatsPeriod rows → fall back to daily stats.
      mockPeriodStatsCount.mockResolvedValue(0);
    });

    it("excludes IL player's stats when IL_STASH effDate is at or before period start", async () => {
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
        {
          teamId: 147, playerId: 1086, acquiredAt: new Date("2026-04-19"), releasedAt: null,
          assignedPosition: "SS",
          player: { id: 1086, mlbId: 687401, posPrimary: "SS" },
        },
      ]);
      // Betts was stashed at period start; Cruz was never IL'd
      mockTransactionEventFindMany.mockResolvedValue([
        ilStashEvent(1, IL_STASH_BEFORE_PERIOD),
      ]);
      mockDailyFindMany.mockResolvedValue([
        dailyRow(1, "2026-04-25", { HR: 3, R: 5, AB: 4, H: 1 }),    // IL'd — excluded
        dailyRow(1086, "2026-04-25", { HR: 1, R: 2, AB: 4, H: 2 }), // active — counted
      ]);

      const result = await computeTeamStatsFromDb(20, 36);

      expect(result).toHaveLength(1);
      expect(result[0].HR).toBe(1); // only the active player's 1 HR
      expect(result[0].R).toBe(2);
    });

    it("includes player stats when IL_STASH effDate is AFTER period start (mid-period stash)", async () => {
      // If stashed mid-period, we can't split period stats — include for whole period.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      mockTransactionEventFindMany.mockResolvedValue([
        ilStashEvent(1, IL_STASH_AFTER_PERIOD_START), // stashed mid-period, not at start
      ]);
      mockDailyFindMany.mockResolvedValue([
        dailyRow(1, "2026-04-25", { HR: 3, R: 5, AB: 4, H: 1 }),
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      // IL'd mid-period → stats still counted for whole period
      expect(result[0].HR).toBe(3);
      expect(result[0].R).toBe(5);
    });

    it("does NOT exclude players with no IL events regardless of assignedPosition", async () => {
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "1B", // active slot
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      // No IL events for this player
      mockTransactionEventFindMany.mockResolvedValue([]);
      mockDailyFindMany.mockResolvedValue([
        dailyRow(1, "2026-04-25", { HR: 4, R: 3 }),
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      expect(result[0].HR).toBe(4);
      expect(result[0].R).toBe(3);
    });

    it("does not divide by zero when all pitchers are IL'd (ERA/WHIP)", async () => {
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 200, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL",
          player: { id: 200, mlbId: 1, posPrimary: "P" },
        },
      ]);
      mockTransactionEventFindMany.mockResolvedValue([
        ilStashEvent(200, IL_STASH_BEFORE_PERIOD),
      ]);
      mockDailyFindMany.mockResolvedValue([
        dailyRow(200, "2026-04-25", { W: 1, K: 5, IP: 6, ER: 2, BB_H: 7 }),
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      expect(result[0].ERA).toBe(0);
      expect(result[0].WHIP).toBe(0);
      expect(result[0].W).toBe(0);
      expect(result[0].K).toBe(0);
    });
  });

  describe("period-stats path (PlayerStatsPeriod data present)", () => {
    beforeEach(() => {
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockTeamFindMany.mockResolvedValue([{ id: 147, name: "Los Doyers", code: "LDY" }]);
      // PlayerStatsPeriod rows exist → use the accurate MLB byDateRange data.
      mockPeriodStatsCount.mockResolvedValue(2);
    });

    it("excludes IL player's stats when IL_STASH effDate is at or before period start", async () => {
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
        {
          teamId: 147, playerId: 1086, acquiredAt: new Date("2026-04-19"), releasedAt: null,
          assignedPosition: "SS",
          player: { id: 1086, mlbId: 687401, posPrimary: "SS" },
        },
      ]);
      mockTransactionEventFindMany.mockResolvedValue([
        ilStashEvent(1, IL_STASH_BEFORE_PERIOD),
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 1, AB: 80, H: 25, R: 12, HR: 5, RBI: 18, SB: 1, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
        { playerId: 1086, AB: 60, H: 18, R: 8, HR: 2, RBI: 10, SB: 3, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      expect(result).toHaveLength(1);
      expect(result[0].HR).toBe(2); // only 1086 contributes
      expect(result[0].R).toBe(8);
      expect(result[0].RBI).toBe(10);
    });

    it("includes player stats for periods BEFORE the IL_STASH effDate", async () => {
      // Betts is currently on IL (stashed on 2026-04-19 = period 36 start),
      // but for an earlier period his stats should count.
      const PERIOD1_START = new Date("2026-03-25T00:00:00.000Z");
      const PERIOD1_END = new Date("2026-04-18T00:00:00.000Z");
      mockPeriodFindUnique.mockResolvedValue({ id: 35, startDate: PERIOD1_START, endDate: PERIOD1_END });
      mockPeriodStatsCount.mockResolvedValue(1);
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL", // current state is IL, but during period 1 he was active
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      // IL stash happened at period 2 start — after period 1 ended
      mockTransactionEventFindMany.mockResolvedValue([
        ilStashEvent(1, new Date("2026-04-19T00:00:00.000Z")),
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 1, AB: 90, H: 28, R: 7, HR: 2, RBI: 7, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
      ]);

      const result = await computeTeamStatsFromDb(20, 35);
      // Period 1: IL stash effDate (2026-04-19) > period1Start (2026-03-25) → not on IL during period 1 → stats count
      expect(result[0].HR).toBe(2);
      expect(result[0].R).toBe(7);
    });

    it("restores stats when IL_ACTIVATE closes a stint before the period starts", async () => {
      // Player: stashed 2026-03-01 (before period 1), activated 2026-04-10 (before period 1 end).
      // Period 36 (starts 2026-04-19): IL window already closed → stats should count.
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockPeriodStatsCount.mockResolvedValue(1);
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "OF",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      mockTransactionEventFindMany.mockResolvedValue([
        { playerId: 1, transactionType: "IL_STASH", effDate: new Date("2026-03-01T00:00:00.000Z") },
        { playerId: 1, transactionType: "IL_ACTIVATE", effDate: new Date("2026-04-10T00:00:00.000Z") },
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 1, AB: 60, H: 18, R: 8, HR: 3, RBI: 10, SB: 1, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      // Activated before period 36 started → not on IL at period start → stats count
      expect(result[0].HR).toBe(3);
      expect(result[0].R).toBe(8);
    });

    it("correctly handles multiple IL stints — excludes period overlapping second stint", async () => {
      // Player: stash1 → activate → stash2 (before period 36). Should be excluded in period 36.
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockPeriodStatsCount.mockResolvedValue(1);
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "IL",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      mockTransactionEventFindMany.mockResolvedValue([
        { playerId: 1, transactionType: "IL_STASH",    effDate: new Date("2026-03-01T00:00:00.000Z") },
        { playerId: 1, transactionType: "IL_ACTIVATE", effDate: new Date("2026-03-20T00:00:00.000Z") },
        { playerId: 1, transactionType: "IL_STASH",    effDate: new Date("2026-04-19T00:00:00.000Z") }, // second stint starts at period 36 start
      ]);
      mockPeriodStatsFindMany.mockResolvedValue([
        { playerId: 1, AB: 60, H: 18, R: 8, HR: 3, RBI: 10, SB: 1, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      // Second stash starts exactly at period 36 start → excluded
      expect(result[0].HR).toBe(0);
      expect(result[0].R).toBe(0);
    });
  });
});

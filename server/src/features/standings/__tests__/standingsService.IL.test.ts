import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPeriodFindUnique = vi.fn();
const mockTeamFindMany = vi.fn();
const mockRosterFindMany = vi.fn();
const mockDailyFindMany = vi.fn();
const mockDailyGroupBy = vi.fn();
const mockPeriodStatsFindMany = vi.fn();

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findUnique: (...a: unknown[]) => mockPeriodFindUnique(...a) },
    team: { findMany: (...a: unknown[]) => mockTeamFindMany(...a) },
    roster: { findMany: (...a: unknown[]) => mockRosterFindMany(...a) },
    playerStatsDaily: {
      findMany: (...a: unknown[]) => mockDailyFindMany(...a),
      groupBy: (...a: unknown[]) => mockDailyGroupBy(...a),
    },
    playerStatsPeriod: { findMany: (...a: unknown[]) => mockPeriodStatsFindMany(...a) },
  },
}));

import { computeTeamStatsFromDb } from "../services/standingsService.js";

const PERIOD_START = new Date("2026-04-19T00:00:00.000Z");
const PERIOD_END = new Date("2026-05-16T23:59:59.999Z");

const ZERO_STATS = { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };

function dailyRow(playerId: number, date: string, stats: Partial<typeof ZERO_STATS>) {
  return { playerId, gameDate: new Date(date), ...ZERO_STATS, ...stats };
}

beforeEach(() => {
  mockPeriodFindUnique.mockReset();
  mockTeamFindMany.mockReset();
  mockRosterFindMany.mockReset();
  mockDailyFindMany.mockReset();
  mockDailyGroupBy.mockReset();
  mockPeriodStatsFindMany.mockReset();
});

describe("computeTeamStatsFromDb — IL slot exclusion (todo #155)", () => {
  describe("daily-stats path (high coverage)", () => {
    beforeEach(() => {
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockTeamFindMany.mockResolvedValue([{ id: 147, name: "Los Doyers", code: "LDY" }]);
      // Force daily-stats path: ≥80% coverage. Period spans 28 days; supply 28 distinct dates.
      const days = Array.from({ length: 28 }, (_, i) => ({ gameDate: new Date(2026, 3, 19 + i) }));
      mockDailyGroupBy.mockResolvedValue(days);
    });

    it("excludes IL-slotted player's stats from team totals", async () => {
      // Two players: one active (SS), one IL. Both have HRs in the period.
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
      mockDailyFindMany.mockResolvedValue([
        dailyRow(1, "2026-04-25", { HR: 3, R: 5, AB: 4, H: 1 }),    // IL'd player
        dailyRow(1086, "2026-04-25", { HR: 1, R: 2, AB: 4, H: 2 }), // active player
      ]);

      const result = await computeTeamStatsFromDb(20, 36);

      expect(result).toHaveLength(1);
      expect(result[0].HR).toBe(1); // only the active player's 1 HR; IL'd 3 HR excluded
      expect(result[0].R).toBe(2);
    });

    it("ignores assignedPosition casing — 'il' / 'IL' / 'Il' all excluded", async () => {
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "il", // lowercase
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
      mockDailyFindMany.mockResolvedValue([
        dailyRow(1, "2026-04-25", { HR: 99, R: 99 }),
      ]);

      const result = await computeTeamStatsFromDb(20, 36);
      expect(result[0].HR).toBe(0);
      expect(result[0].R).toBe(0);
    });

    it("does NOT exclude players with similar but non-IL slots", async () => {
      // Defensive: only the literal "IL" slot is excluded.
      mockRosterFindMany.mockResolvedValue([
        {
          teamId: 147, playerId: 1, acquiredAt: new Date("2026-03-22"), releasedAt: null,
          assignedPosition: "1B",
          player: { id: 1, mlbId: 605141, posPrimary: "OF" },
        },
      ]);
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

  describe("period-stats fallback path (low coverage)", () => {
    beforeEach(() => {
      mockPeriodFindUnique.mockResolvedValue({ id: 36, startDate: PERIOD_START, endDate: PERIOD_END });
      mockTeamFindMany.mockResolvedValue([{ id: 147, name: "Los Doyers", code: "LDY" }]);
      // Force period-stats path: <80% coverage. Empty array (zero days).
      mockDailyGroupBy.mockResolvedValue([]);
    });

    it("excludes IL-slotted player's stats from team totals", async () => {
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
  });
});

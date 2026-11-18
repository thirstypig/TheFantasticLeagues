import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findFirst: vi.fn() },
    league: { findMany: vi.fn() },
    teamStatsCategoryDaily: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockComputeTeamStatsFromDb = vi.fn();
const mockComputeCategoryRows = vi.fn();
vi.mock("../services/standingsService.js", () => ({
  computeTeamStatsFromDb: (...args: unknown[]) => mockComputeTeamStatsFromDb(...args),
  computeCategoryRows: (...args: unknown[]) => mockComputeCategoryRows(...args),
}));

const THREE_CATS = [
  { key: "R", label: "Runs", lowerIsBetter: false, group: "H" },
  { key: "HR", label: "Home Runs", lowerIsBetter: false, group: "H" },
  { key: "ERA", label: "ERA", lowerIsBetter: true, group: "P" },
];
const mockGetLeagueCategories = vi.fn();
vi.mock("../../../lib/leagueCategories.js", () => ({
  getLeagueCategories: (...args: unknown[]) => mockGetLeagueCategories(...args),
}));

import { prisma } from "../../../db/prisma.js";
import {
  snapshotLeagueCategoryDaily,
  snapshotAllActiveLeaguesCategoryDaily,
  readLeagueSnapshotForDate,
} from "../services/categoryDailySnapshotService.js";

const mockPrisma = prisma as unknown as {
  period: { findFirst: ReturnType<typeof vi.fn> };
  league: { findMany: ReturnType<typeof vi.fn> };
  teamStatsCategoryDaily: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLeagueCategories.mockResolvedValue(THREE_CATS);
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  mockPrisma.teamStatsCategoryDaily.upsert.mockResolvedValue({});
  mockPrisma.teamStatsCategoryDaily.findMany.mockResolvedValue([]);
});

const sampleTeamStats = [
  { team: { id: 1, name: "Team A" }, stats: { R: 50, HR: 10, ERA: 3.5 } },
  { team: { id: 2, name: "Team B" }, stats: { R: 45, HR: 12, ERA: 4.1 } },
];

describe("snapshotLeagueCategoryDaily — period selection", () => {
  it("uses active period when one exists, ignoring completed periods", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 7, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockReturnValue([
      { teamId: 1, value: 50, rank: 1, points: 2 },
      { teamId: 2, value: 45, rank: 2, points: 1 },
    ]);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(result.periodId).toBe(7);
    expect(mockPrisma.period.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith({
      where: { status: "active", leagueId: 99 },
      orderBy: { endDate: "desc" },
    });
  });

  it("falls back to most recent completed period when no active period exists", async () => {
    mockPrisma.period.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12, status: "completed" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockReturnValue([{ teamId: 1, value: 50, rank: 1, points: 2 }]);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(result.periodId).toBe(12);
    expect(mockPrisma.period.findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns rowsWritten=0 and periodId=null when no period exists at all", async () => {
    mockPrisma.period.findFirst.mockResolvedValue(null);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(result).toEqual({ rowsWritten: 0, periodId: null });
    expect(mockPrisma.teamStatsCategoryDaily.upsert).not.toHaveBeenCalled();
  });
});

describe("snapshotLeagueCategoryDaily — empty data short-circuit", () => {
  it("returns rowsWritten=0 with the periodId when the league has no teams", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue([]);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(result).toEqual({ rowsWritten: 0, periodId: 5 });
    expect(mockPrisma.teamStatsCategoryDaily.upsert).not.toHaveBeenCalled();
  });
});

describe("snapshotLeagueCategoryDaily — league categories", () => {
  it("writes rows only for the league's categories, keyed by category key", async () => {
    mockGetLeagueCategories.mockResolvedValue([
      { key: "R", label: "Runs", lowerIsBetter: false, group: "H" },
      { key: "HR", label: "Home Runs", lowerIsBetter: false, group: "H" },
      { key: "W", label: "Wins", lowerIsBetter: false, group: "P" },
      { key: "SV", label: "Saves", lowerIsBetter: false, group: "P" },
    ]);
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockImplementation(() => [
      { teamId: 1, value: 50, rank: 1, points: 2 },
      { teamId: 2, value: 45, rank: 2, points: 1 },
    ]);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(mockGetLeagueCategories).toHaveBeenCalledWith(99);
    expect(result.rowsWritten).toBe(8);
    const written = mockPrisma.teamStatsCategoryDaily.upsert.mock.calls.map(
      (c) => c[0].create.category as string
    );
    expect([...new Set(written)]).toEqual(["R", "HR", "W", "SV"]);
  });
});

describe("snapshotLeagueCategoryDaily — row generation", () => {
  it("writes teams × categories rows and uses category keys (not DB field names) as category", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    mockComputeCategoryRows.mockImplementation((_stats: unknown, _key: string) => [
      { teamId: 1, value: 50, rank: 1, points: 2 },
      { teamId: 2, value: 45, rank: 2, points: 1 },
    ]);

    const result = await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    // 2 teams × 3 categories (R, HR, ERA per the mocked league categories)
    expect(result.rowsWritten).toBe(6);
    expect(mockPrisma.teamStatsCategoryDaily.upsert).toHaveBeenCalledTimes(6);

    const categories = mockPrisma.teamStatsCategoryDaily.upsert.mock.calls.map(
      (c) => c[0].create.category as string
    );
    expect(new Set(categories)).toEqual(new Set(["R", "HR", "ERA"]));
  });

  it("persists the ranked category value, so value and rank always describe the same number", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue(sampleTeamStats);
    // Deliberately differs from sampleTeamStats' stats.R (50/45): the snapshot
    // must store the value the rank was computed from, not re-read the row.
    mockComputeCategoryRows.mockImplementation(() => [
      { teamId: 1, value: 77, rank: 1, points: 2 },
      { teamId: 2, value: 33, rank: 2, points: 1 },
    ]);

    await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    const rCalls = mockPrisma.teamStatsCategoryDaily.upsert.mock.calls
      .map((c) => c[0].create)
      .filter((row) => row.category === "R");
    expect(rCalls.map((row) => [row.teamId, row.value, row.rank])).toEqual([[1, 77, 1], [2, 33, 2]]);
  });

  it("upserts (not inserts) keyed on (teamId, leagueId, date, category) — idempotent re-runs", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue([sampleTeamStats[0]]);
    mockComputeCategoryRows.mockReturnValue([{ teamId: 1, value: 50, rank: 1, points: 2 }]);
    const date = new Date("2026-04-29T00:00:00Z");

    await snapshotLeagueCategoryDaily(99, date);

    const firstCall = mockPrisma.teamStatsCategoryDaily.upsert.mock.calls[0][0];
    expect(firstCall.where).toEqual({
      teamId_leagueId_date_category: {
        teamId: 1,
        leagueId: 99,
        date,
        category: "R",
      },
    });
    expect(firstCall.update).toEqual({ value: 50, rank: 1, rankPoints: 2 });
  });

  it("wraps all upserts in a single transaction for atomicity", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue([sampleTeamStats[0]]);
    mockComputeCategoryRows.mockReturnValue([{ teamId: 1, value: 50, rank: 1, points: 2 }]);

    await snapshotLeagueCategoryDaily(99, new Date("2026-04-29"));

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("snapshotAllActiveLeaguesCategoryDaily", () => {
  it("normalizes today to UTC midnight (no time component) before snapshotting", async () => {
    mockPrisma.league.findMany.mockResolvedValue([{ id: 1, name: "L1" }]);
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb.mockResolvedValue([sampleTeamStats[0]]);
    mockComputeCategoryRows.mockReturnValue([{ teamId: 1, value: 50, rank: 1, points: 2 }]);

    await snapshotAllActiveLeaguesCategoryDaily();

    const dateUsed = mockPrisma.teamStatsCategoryDaily.upsert.mock.calls[0][0].create.date as Date;
    expect(dateUsed.getUTCHours()).toBe(0);
    expect(dateUsed.getUTCMinutes()).toBe(0);
    expect(dateUsed.getUTCSeconds()).toBe(0);
    expect(dateUsed.getUTCMilliseconds()).toBe(0);
  });

  it("filters to leagues that have at least one active or completed period", async () => {
    mockPrisma.league.findMany.mockResolvedValue([]);

    await snapshotAllActiveLeaguesCategoryDaily();

    expect(mockPrisma.league.findMany).toHaveBeenCalledWith({
      where: {
        periods: { some: { status: { in: ["active", "completed"] } } },
      },
      select: { id: true, name: true },
    });
  });

  it("continues iterating remaining leagues after a single league throws — errors are counted, not propagated", async () => {
    mockPrisma.league.findMany.mockResolvedValue([
      { id: 1, name: "L1" },
      { id: 2, name: "L2" },
      { id: 3, name: "L3" },
    ]);
    // L1: succeeds, L2: throws inside computeTeamStatsFromDb, L3: succeeds
    mockPrisma.period.findFirst.mockResolvedValue({ id: 5, status: "active" });
    mockComputeTeamStatsFromDb
      .mockResolvedValueOnce([sampleTeamStats[0]])
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([sampleTeamStats[0]]);
    mockComputeCategoryRows.mockReturnValue([{ teamId: 1, value: 50, rank: 1, points: 2 }]);

    const result = await snapshotAllActiveLeaguesCategoryDaily();

    expect(result.leaguesProcessed).toBe(3);
    expect(result.errors).toBe(1);
    // L1 + L3 each wrote 3 rows (1 team × 3 categories from mocked league categories)
    expect(result.totalRowsWritten).toBe(6);
  });
});

describe("readLeagueSnapshotForDate", () => {
  it("normalizes the input date to UTC midnight before querying", async () => {
    await readLeagueSnapshotForDate(99, new Date("2026-04-29T17:42:00Z"));

    const where = mockPrisma.teamStatsCategoryDaily.findMany.mock.calls[0][0].where;
    const queriedDate = where.date as Date;
    expect(queriedDate.getUTCHours()).toBe(0);
    expect(queriedDate.getUTCMinutes()).toBe(0);
    expect(where.leagueId).toBe(99);
  });

  it("returns nested Map<teamId, Map<category, snapshot>> for fast lookup", async () => {
    mockPrisma.teamStatsCategoryDaily.findMany.mockResolvedValue([
      { teamId: 1, category: "R", value: 50, rank: 1, rankPoints: 2 },
      { teamId: 1, category: "HR", value: 10, rank: 3, rankPoints: 1 },
      { teamId: 2, category: "R", value: 45, rank: 2, rankPoints: 1 },
    ]);

    const result = await readLeagueSnapshotForDate(99, new Date("2026-04-29"));

    expect(result.size).toBe(2);
    expect(result.get(1)?.get("R")).toEqual({ value: 50, rank: 1, rankPoints: 2 });
    expect(result.get(1)?.get("HR")).toEqual({ value: 10, rank: 3, rankPoints: 1 });
    expect(result.get(2)?.get("R")).toEqual({ value: 45, rank: 2, rankPoints: 1 });
  });

  it("returns an empty map when no snapshots exist for the date", async () => {
    mockPrisma.teamStatsCategoryDaily.findMany.mockResolvedValue([]);

    const result = await readLeagueSnapshotForDate(99, new Date("2026-04-29"));

    expect(result.size).toBe(0);
  });
});

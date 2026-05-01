import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findMany: vi.fn() },
    roster: { findMany: vi.fn(), deleteMany: vi.fn() },
    league: { findUnique: vi.fn() },
    rosterSlotEvent: { create: vi.fn() },
    transactionEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

const mockGetMlbPlayerStatus = vi.fn();
vi.mock("../../../lib/mlbApi.js", () => ({
  getMlbPlayerStatus: (...a: any[]) => mockGetMlbPlayerStatus(...a),
}));

const mockCheckMlbIlEligibility = vi.fn();
const mockAssertIlSlotAvailable = vi.fn();
const mockAssertNoGhostIl = vi.fn();
vi.mock("../../../lib/ilSlotGuard.js", () => ({
  checkMlbIlEligibility: (...a: any[]) => mockCheckMlbIlEligibility(...a),
  assertIlSlotAvailable: (...a: any[]) => mockAssertIlSlotAvailable(...a),
  assertNoGhostIl: (...a: any[]) => mockAssertNoGhostIl(...a),
  isMlbIlStatus: (s: string | null | undefined) =>
    !!s && /^Injured (List )?\d+-Day$/.test(s),
}));

vi.mock("../../transactions/lib/autoResolveLineup.js", () => ({
  loadSlotCapacities: vi.fn().mockResolvedValue({}),
  buildCandidatesForTeam: vi.fn().mockResolvedValue({ candidates: [], playerNames: new Map() }),
  verifyEligibilityUnchanged: vi.fn().mockResolvedValue(null),
  applyAssignments: vi.fn().mockResolvedValue([]),
  resolveLineup: vi.fn().mockReturnValue({ ok: true, assignments: [] }),
}));

vi.mock("../../../lib/rosterWindow.js", () => ({
  resolveEffectiveDate: () => new Date("2026-04-30T00:00:00.000Z"),
}));

vi.mock("../../players/services/playersListCache.js", () => ({
  clearPlayersCache: vi.fn(),
}));

vi.mock("../../standings/services/standingsService.js", () => ({
  clearStandingsCache: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import {
  auditLeagueIlPlayers,
  performBulkIlStash,
  cleanupDroppedRosterRows,
} from "../services/bulkOperationsService.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auditLeagueIlPlayers", () => {
  it("returns empty when the league has no teams", async () => {
    mockPrisma.team.findMany.mockResolvedValue([]);
    const res = await auditLeagueIlPlayers(99);
    expect(res.rows).toEqual([]);
    expect(res.totalRows).toBe(0);
    expect(res.totalTeams).toBe(0);
  });

  it("includes only players whose MLB status starts with 'Injured'", async () => {
    mockPrisma.team.findMany.mockResolvedValue([
      { id: 10, name: "Aces", code: "ACE" },
    ]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 100, assignedPosition: "OF",
        player: { id: 100, name: "Mike Trout", mlbId: 545361, mlbTeam: "LAA" } },
      { playerId: 101, assignedPosition: "1B",
        player: { id: 101, name: "Freddie Freeman", mlbId: 518692, mlbTeam: "LAD" } },
      { playerId: 102, assignedPosition: "SP",
        player: { id: 102, name: "Shohei Ohtani", mlbId: 660271, mlbTeam: "LAD" } },
    ]);
    mockGetMlbPlayerStatus.mockImplementation(async (mlbId: number) => {
      if (mlbId === 545361) return { status: "Injured 10-Day", fetchedAt: new Date() };
      if (mlbId === 518692) return { status: "Active", fetchedAt: new Date() };
      if (mlbId === 660271) return { status: "Injured 60-Day", fetchedAt: new Date() };
      return null;
    });

    const res = await auditLeagueIlPlayers(99);
    expect(res.totalRows).toBe(2);
    expect(res.totalTeams).toBe(1);
    const names = res.rows.map(r => r.playerName).sort();
    expect(names).toEqual(["Mike Trout", "Shohei Ohtani"]);
  });

  it("excludes players already on an IL slot via the prisma where clause", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 1, name: "T", code: "T" }]);
    mockPrisma.roster.findMany.mockResolvedValue([]);
    await auditLeagueIlPlayers(99);
    const args = mockPrisma.roster.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      teamId: 1,
      releasedAt: null,
      NOT: { assignedPosition: "IL" },
    });
  });

  it("skips a player when MLB feed throws (fail-open on read path)", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10, name: "Aces", code: "ACE" }]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 100, assignedPosition: "OF",
        player: { id: 100, name: "Mike Trout", mlbId: 545361, mlbTeam: "LAA" } },
    ]);
    mockGetMlbPlayerStatus.mockRejectedValue(new Error("MLB feed down"));

    const res = await auditLeagueIlPlayers(99);
    expect(res.rows).toEqual([]);
    expect(res.totalRows).toBe(0);
  });

  it("skips players missing mlbId or mlbTeam", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10, name: "Aces", code: "ACE" }]);
    mockPrisma.roster.findMany.mockResolvedValue([
      { playerId: 100, assignedPosition: "OF",
        player: { id: 100, name: "No Identity", mlbId: null, mlbTeam: "LAA" } },
      { playerId: 101, assignedPosition: "OF",
        player: { id: 101, name: "Also Missing", mlbId: 1, mlbTeam: null } },
    ]);

    const res = await auditLeagueIlPlayers(99);
    expect(res.rows).toEqual([]);
    expect(mockGetMlbPlayerStatus).not.toHaveBeenCalled();
  });
});

describe("performBulkIlStash", () => {
  it("rejects entries whose teamId is outside the league (IDOR guard)", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10 }]); // team 20 not in league
    // When team 10 is processed, the stash flow runs — stub findFirst to
    // hit the "not on roster" branch so the test stays focused on the
    // IDOR guard for team 20.
    (mockPrisma.roster as any).findFirst = vi.fn().mockResolvedValue(null);

    const res = await performBulkIlStash(99, [
      { teamId: 10, playerId: 100 },
      { teamId: 20, playerId: 200 },
    ], 1);
    expect(res.failed.find(f => f.teamId === 20)).toBeTruthy();
    expect(res.failed.find(f => f.teamId === 20)?.code).toBe("TEAM_NOT_IN_LEAGUE");
  });

  it("treats already-on-IL as a noop success (idempotency)", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10 }]);
    // The mocked roster.findFirst is missing — bulkOperationsService uses
    // findFirst on roster to look up the active row. Add it dynamically.
    (mockPrisma.roster as any).findFirst = vi.fn().mockResolvedValue({
      id: 7, assignedPosition: "IL",
    });

    const res = await performBulkIlStash(99, [{ teamId: 10, playerId: 100 }], 1);
    expect(res.failed).toEqual([]);
    expect(res.succeeded).toHaveLength(1);
    expect(res.succeeded[0].outcome).toBe("noop");
  });

  it("flags missing-active-roster as a failure", async () => {
    mockPrisma.team.findMany.mockResolvedValue([{ id: 10 }]);
    (mockPrisma.roster as any).findFirst = vi.fn().mockResolvedValue(null);

    const res = await performBulkIlStash(99, [{ teamId: 10, playerId: 100 }], 1);
    expect(res.succeeded).toEqual([]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].code).toBe("IL_UNKNOWN_PLAYER");
  });
});

describe("cleanupDroppedRosterRows", () => {
  it("scopes the eligible-row lookup to the requested leagueId", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([]);
    mockPrisma.roster.deleteMany.mockResolvedValue({ count: 0 });

    await cleanupDroppedRosterRows(42, 30, 99);

    const args = mockPrisma.roster.findMany.mock.calls[0][0];
    expect(args.where.team).toEqual({ leagueId: 42 });
    expect(args.where.releasedAt.lt).toBeInstanceOf(Date);
  });

  it("returns 0 deletedCount when no rows match", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([]);

    const res = await cleanupDroppedRosterRows(42, 30, 99);
    expect(res.deletedCount).toBe(0);
    expect(mockPrisma.roster.deleteMany).not.toHaveBeenCalled();
    expect(res.cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("hard-deletes the eligible rows and returns the count", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockPrisma.roster.deleteMany.mockResolvedValue({ count: 3 });

    const res = await cleanupDroppedRosterRows(42, 30, 99);
    expect(res.deletedCount).toBe(3);
    expect(mockPrisma.roster.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 2, 3] } } });
  });

  it("uses the `olderThanDays` cutoff when computing the date threshold", async () => {
    mockPrisma.roster.findMany.mockResolvedValue([]);
    const before = Date.now();
    await cleanupDroppedRosterRows(42, 7, 99);
    const after = Date.now();
    const args = mockPrisma.roster.findMany.mock.calls[0][0];
    const cutoffMs = (args.where.releasedAt.lt as Date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - sevenDaysMs + 1000);
  });
});

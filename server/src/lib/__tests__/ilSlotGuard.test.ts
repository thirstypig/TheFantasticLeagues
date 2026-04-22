import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isMlbIlStatus,
  loadLeagueIlSlotCount,
  assertIlSlotAvailable,
  checkMlbIlEligibility,
  listGhostIlPlayersForTeam,
  assertNoGhostIl,
} from "../ilSlotGuard.js";
import { isRosterRuleError } from "../rosterRuleError.js";

// ── Hoisted mocks ────────────────────────────────────────────────
// Vitest hoists vi.mock() above imports. Use vi.hoisted() so mock functions
// are defined before the factory runs.

const { mockGetMlbPlayerStatus, mockPrisma } = vi.hoisted(() => ({
  mockGetMlbPlayerStatus: vi.fn(),
  mockPrisma: {
    player: { findUnique: vi.fn() },
  },
}));

vi.mock("../mlbApi.js", () => ({
  getMlbPlayerStatus: (...args: any[]) => mockGetMlbPlayerStatus(...args),
}));
vi.mock("../../db/prisma.js", () => ({
  prisma: mockPrisma,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── isMlbIlStatus ────────────────────────────────────────────────

describe("isMlbIlStatus", () => {
  // The live MLB statsapi 40-man feed returns `description` values like
  // "Injured 10-Day" / "Injured 15-Day" / "Injured 60-Day" — these are the
  // real-world strings the predicate has to accept.
  it("matches all MLB-API IL variants", () => {
    expect(isMlbIlStatus("Injured 7-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 10-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 15-Day")).toBe(true);
    expect(isMlbIlStatus("Injured 60-Day")).toBe(true);
  });

  // Forward-compat: if MLB ever returns the longer "Injured List N-Day" form,
  // keep treating it as a valid IL designation.
  it("matches the legacy 'Injured List N-Day' form", () => {
    expect(isMlbIlStatus("Injured List 7-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 10-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 15-Day")).toBe(true);
    expect(isMlbIlStatus("Injured List 60-Day")).toBe(true);
  });

  it("rejects non-IL statuses", () => {
    expect(isMlbIlStatus("Active")).toBe(false);
    expect(isMlbIlStatus("Paternity List")).toBe(false);
    expect(isMlbIlStatus("Bereavement List")).toBe(false);
    expect(isMlbIlStatus("Restricted List")).toBe(false);
    expect(isMlbIlStatus("Suspended")).toBe(false);
    expect(isMlbIlStatus("Minor League")).toBe(false);
    expect(isMlbIlStatus("Optioned")).toBe(false);
    expect(isMlbIlStatus("Reassigned to Minors")).toBe(false);
    expect(isMlbIlStatus("Unknown")).toBe(false);
  });

  it("rejects malformed Injured strings (no day count)", () => {
    expect(isMlbIlStatus("Injured")).toBe(false);
    expect(isMlbIlStatus("Injured List")).toBe(false);
    expect(isMlbIlStatus("Injured Day")).toBe(false);
    expect(isMlbIlStatus("Injured 10")).toBe(false);
  });

  it("rejects empty / nullish", () => {
    expect(isMlbIlStatus("")).toBe(false);
    expect(isMlbIlStatus(null)).toBe(false);
    expect(isMlbIlStatus(undefined)).toBe(false);
  });

  it("is case-sensitive (guards against typo in MLB data)", () => {
    expect(isMlbIlStatus("injured 10-day")).toBe(false);
    expect(isMlbIlStatus("INJURED 10-DAY")).toBe(false);
    expect(isMlbIlStatus("injured list 10-day")).toBe(false);
  });
});

// ── loadLeagueIlSlotCount ───────────────────────────────────────

describe("loadLeagueIlSlotCount", () => {
  it("reads the il.slot_count rule", async () => {
    const tx = {
      roster: { count: vi.fn(), findMany: vi.fn() },
      leagueRule: { findFirst: vi.fn().mockResolvedValue({ value: "3" }) },
    };
    expect(await loadLeagueIlSlotCount(tx as any, 1)).toBe(3);
  });

  it("falls back to 2 when rule is missing", async () => {
    const tx = {
      roster: { count: vi.fn(), findMany: vi.fn() },
      leagueRule: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    expect(await loadLeagueIlSlotCount(tx as any, 1)).toBe(2);
  });

  it("falls back to 2 on invalid / negative rule value", async () => {
    const tx = {
      roster: { count: vi.fn(), findMany: vi.fn() },
      leagueRule: { findFirst: vi.fn().mockResolvedValue({ value: "not a number" }) },
    };
    expect(await loadLeagueIlSlotCount(tx as any, 1)).toBe(2);
  });
});

// ── assertIlSlotAvailable ────────────────────────────────────────

describe("assertIlSlotAvailable", () => {
  const mkTx = (overrides: { ilCount?: number; slotCountRule?: string | null } = {}) => ({
    roster: {
      count: vi.fn().mockResolvedValue(overrides.ilCount ?? 0),
      findMany: vi.fn(),
    },
    leagueRule: {
      findFirst: vi.fn().mockResolvedValue(
        overrides.slotCountRule == null ? null : { value: overrides.slotCountRule },
      ),
    },
  });

  it("passes when team has 0 IL slots in use and cap=2", async () => {
    const tx = mkTx({ ilCount: 0, slotCountRule: "2" });
    await expect(assertIlSlotAvailable(tx as any, 1, 10)).resolves.toBeUndefined();
  });

  it("passes when team has 1 IL slot in use and cap=2", async () => {
    const tx = mkTx({ ilCount: 1, slotCountRule: "2" });
    await expect(assertIlSlotAvailable(tx as any, 1, 10)).resolves.toBeUndefined();
  });

  it("rejects when team has 2 IL slots in use and cap=2", async () => {
    const tx = mkTx({ ilCount: 2, slotCountRule: "2" });
    try {
      await assertIlSlotAvailable(tx as any, 1, 10);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) {
        expect(err.code).toBe("IL_SLOT_FULL");
        expect(err.metadata.currentInIl).toBe(2);
      }
    }
  });

  it("filters roster count to assignedPosition='IL' only", async () => {
    const tx = mkTx({ ilCount: 0, slotCountRule: "2" });
    await assertIlSlotAvailable(tx as any, 1, 10);
    const call = (tx.roster.count as any).mock.calls[0][0];
    expect(call.where).toMatchObject({
      teamId: 1,
      releasedAt: null,
      assignedPosition: "IL",
    });
  });
});

// ── checkMlbIlEligibility ────────────────────────────────────────

describe("checkMlbIlEligibility", () => {
  it("returns MlbStatusCheck for an IL player", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Mike Trout", mlbId: 545361, mlbTeam: "LAA",
    });
    mockGetMlbPlayerStatus.mockResolvedValue({
      status: "Injured 10-Day", position: "OF", fetchedAt: 1776900000000,
    });
    const result = await checkMlbIlEligibility(42);
    expect(result.status).toBe("Injured 10-Day");
    expect(result.cacheFetchedAt).toEqual(new Date(1776900000000));
  });

  it("rejects an Active player with NOT_MLB_IL", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Mike Trout", mlbId: 545361, mlbTeam: "LAA",
    });
    mockGetMlbPlayerStatus.mockResolvedValue({
      status: "Active", position: "OF", fetchedAt: Date.now(),
    });
    try {
      await checkMlbIlEligibility(42);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) expect(err.code).toBe("NOT_MLB_IL");
    }
  });

  it("rejects Paternity List with NOT_MLB_IL", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "P Player", mlbId: 1, mlbTeam: "LAA",
    });
    mockGetMlbPlayerStatus.mockResolvedValue({
      status: "Paternity List", position: "SP", fetchedAt: Date.now(),
    });
    await expect(checkMlbIlEligibility(42)).rejects.toMatchObject({ code: "NOT_MLB_IL" });
  });

  it("FAILS CLOSED when MLB feed is unavailable (MLB_FEED_UNAVAILABLE)", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Mike Trout", mlbId: 545361, mlbTeam: "LAA",
    });
    mockGetMlbPlayerStatus.mockRejectedValue(new Error("MLB API circuit breaker open"));
    try {
      await checkMlbIlEligibility(42);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) {
        expect(err.code).toBe("MLB_FEED_UNAVAILABLE");
        expect(err.metadata.error).toContain("circuit breaker");
      }
    }
  });

  it("rejects MLB_IDENTITY_MISSING when player has no mlbId", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "Unknown Player", mlbId: null, mlbTeam: "LAA",
    });
    await expect(checkMlbIlEligibility(42)).rejects.toMatchObject({
      code: "MLB_IDENTITY_MISSING",
    });
  });

  it("rejects IL_UNKNOWN_PLAYER when player doesn't exist", async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    await expect(checkMlbIlEligibility(999)).rejects.toMatchObject({
      code: "IL_UNKNOWN_PLAYER",
    });
  });

  it("rejects NOT_MLB_IL when player is off the 40-man", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 42, name: "DFA Player", mlbId: 1, mlbTeam: "LAA",
    });
    mockGetMlbPlayerStatus.mockResolvedValue(null);
    await expect(checkMlbIlEligibility(42)).rejects.toMatchObject({
      code: "NOT_MLB_IL",
    });
  });
});

// ── listGhostIlPlayersForTeam + assertNoGhostIl ─────────────────

describe("listGhostIlPlayersForTeam", () => {
  it("returns players whose MLB status is no longer IL", async () => {
    const tx = {
      roster: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 100, playerId: 42, player: { name: "Ghost", mlbId: 1, mlbTeam: "LAA" } },
          { id: 101, playerId: 43, player: { name: "Still Hurt", mlbId: 2, mlbTeam: "LAA" } },
        ]),
      },
      leagueRule: { findFirst: vi.fn() },
    };
    mockGetMlbPlayerStatus
      .mockResolvedValueOnce({ status: "Active", position: "OF", fetchedAt: Date.now() })
      .mockResolvedValueOnce({ status: "Injured 60-Day", position: "SP", fetchedAt: Date.now() });

    const ghosts = await listGhostIlPlayersForTeam(tx as any, 1);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].playerName).toBe("Ghost");
    expect(ghosts[0].currentMlbStatus).toBe("Active");
  });

  it("skips players when feed is unavailable (never labels ghost speculatively)", async () => {
    const tx = {
      roster: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 100, playerId: 42, player: { name: "Unknown", mlbId: 1, mlbTeam: "LAA" } },
        ]),
      },
      leagueRule: { findFirst: vi.fn() },
    };
    mockGetMlbPlayerStatus.mockRejectedValue(new Error("feed down"));
    const ghosts = await listGhostIlPlayersForTeam(tx as any, 1);
    expect(ghosts).toHaveLength(0);
  });

  it("skips players missing mlbId/mlbTeam", async () => {
    const tx = {
      roster: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 100, playerId: 42, player: { name: "No Identity", mlbId: null, mlbTeam: null } },
        ]),
      },
      leagueRule: { findFirst: vi.fn() },
    };
    const ghosts = await listGhostIlPlayersForTeam(tx as any, 1);
    expect(ghosts).toHaveLength(0);
    expect(mockGetMlbPlayerStatus).not.toHaveBeenCalled();
  });
});

describe("assertNoGhostIl", () => {
  it("passes when no ghost-IL players", async () => {
    const tx = {
      roster: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      leagueRule: { findFirst: vi.fn() },
    };
    await expect(assertNoGhostIl(tx as any, 1)).resolves.toBeUndefined();
  });

  it("throws GHOST_IL when a ghost exists, listing names and ids", async () => {
    const tx = {
      roster: {
        count: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          { id: 100, playerId: 42, player: { name: "Reactivated Guy", mlbId: 1, mlbTeam: "LAA" } },
        ]),
      },
      leagueRule: { findFirst: vi.fn() },
    };
    mockGetMlbPlayerStatus.mockResolvedValue({ status: "Active", position: "OF", fetchedAt: Date.now() });

    try {
      await assertNoGhostIl(tx as any, 1);
      throw new Error("should have thrown");
    } catch (err) {
      expect(isRosterRuleError(err)).toBe(true);
      if (isRosterRuleError(err)) {
        expect(err.code).toBe("GHOST_IL");
        expect(err.message).toContain("Reactivated Guy");
        expect(err.metadata.ghostPlayerIds).toEqual([42]);
      }
    }
  });
});

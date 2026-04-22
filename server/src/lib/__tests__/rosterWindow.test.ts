import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEffectiveDate, resolveEffectiveDate, assertNoOwnershipConflict } from "../rosterWindow.js";

// We stub nextDayEffective via the utils module so resolveEffectiveDate's
// fallback is deterministic.
vi.mock("../utils.js", async () => {
  const actual = await vi.importActual<typeof import("../utils.js")>("../utils.js");
  return {
    ...actual,
    nextDayEffective: () => new Date("2026-04-22T00:00:00.000Z"),
  };
});

describe("parseEffectiveDate", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseEffectiveDate(null)).toBeNull();
    expect(parseEffectiveDate(undefined)).toBeNull();
    expect(parseEffectiveDate("")).toBeNull();
    expect(parseEffectiveDate("   ")).toBeNull();
  });

  it("parses YYYY-MM-DD as UTC midnight of that day", () => {
    const d = parseEffectiveDate("2026-04-11");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-04-11T00:00:00.000Z");
  });

  it("normalizes ISO datetime to UTC midnight of same calendar day", () => {
    const d = parseEffectiveDate("2026-04-11T18:30:00Z");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-04-11T00:00:00.000Z");
  });

  it("throws on invalid date string", () => {
    expect(() => parseEffectiveDate("not-a-date")).toThrow(/Invalid effectiveDate/);
    expect(() => parseEffectiveDate("2026-13-40")).toThrow(/Invalid effectiveDate/);
  });
});

describe("resolveEffectiveDate", () => {
  it("returns parsed override when provided", () => {
    expect(resolveEffectiveDate("2026-04-11").toISOString()).toBe("2026-04-11T00:00:00.000Z");
  });

  it("falls back to nextDayEffective() when no override", () => {
    expect(resolveEffectiveDate(null).toISOString()).toBe("2026-04-22T00:00:00.000Z");
    expect(resolveEffectiveDate(undefined).toISOString()).toBe("2026-04-22T00:00:00.000Z");
    expect(resolveEffectiveDate("").toISOString()).toBe("2026-04-22T00:00:00.000Z");
  });
});

describe("assertNoOwnershipConflict", () => {
  const mockTx = {
    roster: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    mockTx.roster.findMany.mockReset();
  });

  it("passes when no existing rows match", async () => {
    mockTx.roster.findMany.mockResolvedValue([]);
    await expect(
      assertNoOwnershipConflict(mockTx as any, {
        leagueId: 1,
        playerId: 100,
        acquiredAt: new Date("2026-04-11T00:00:00Z"),
        releasedAt: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("throws descriptive error when overlap detected", async () => {
    mockTx.roster.findMany.mockResolvedValue([
      {
        id: 42,
        teamId: 7,
        acquiredAt: new Date("2026-04-01T00:00:00Z"),
        releasedAt: null,
        team: { name: "Team Seven" },
        player: { name: "Aaron Judge" },
      },
    ]);
    await expect(
      assertNoOwnershipConflict(mockTx as any, {
        leagueId: 1,
        playerId: 100,
        acquiredAt: new Date("2026-04-11T00:00:00Z"),
        releasedAt: null,
      }),
    ).rejects.toThrow(/Ownership conflict.*Aaron Judge.*Team Seven/);
  });

  it("excludes rosterIds provided in excludeRosterIds", async () => {
    mockTx.roster.findMany.mockResolvedValue([]);
    await assertNoOwnershipConflict(mockTx as any, {
      leagueId: 1,
      playerId: 100,
      acquiredAt: new Date("2026-04-11T00:00:00Z"),
      releasedAt: null,
      excludeRosterIds: [42, 43],
    });
    const call = mockTx.roster.findMany.mock.calls[0][0];
    expect(call.where.id).toEqual({ notIn: [42, 43] });
  });

  it("omits id filter when excludeRosterIds is empty", async () => {
    mockTx.roster.findMany.mockResolvedValue([]);
    await assertNoOwnershipConflict(mockTx as any, {
      leagueId: 1,
      playerId: 100,
      acquiredAt: new Date("2026-04-11T00:00:00Z"),
      releasedAt: null,
    });
    const call = mockTx.roster.findMany.mock.calls[0][0];
    expect(call.where.id).toBeUndefined();
  });

  it("builds correct overlap clauses for open-ended new window", async () => {
    mockTx.roster.findMany.mockResolvedValue([]);
    const acquiredAt = new Date("2026-04-11T00:00:00Z");
    await assertNoOwnershipConflict(mockTx as any, {
      leagueId: 1,
      playerId: 100,
      acquiredAt,
      releasedAt: null,
    });
    const call = mockTx.roster.findMany.mock.calls[0][0];
    // No releasedAt bound on the new window → only the "existing hasn't ended" clause applies
    expect(call.where.AND).toHaveLength(1);
    expect(call.where.AND[0]).toEqual({
      OR: [{ releasedAt: null }, { releasedAt: { gt: acquiredAt } }],
    });
  });

  it("builds both overlap clauses for closed new window", async () => {
    mockTx.roster.findMany.mockResolvedValue([]);
    const acquiredAt = new Date("2026-04-11T00:00:00Z");
    const releasedAt = new Date("2026-04-20T00:00:00Z");
    await assertNoOwnershipConflict(mockTx as any, {
      leagueId: 1,
      playerId: 100,
      acquiredAt,
      releasedAt,
    });
    const call = mockTx.roster.findMany.mock.calls[0][0];
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[1]).toEqual({ acquiredAt: { lt: releasedAt } });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findFirst: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/prisma.js";
import {
  getAuctionCutoff,
  getAuctionDaySnapshot,
} from "../lib/auctionDaySnapshot.js";

const mockPrisma = prisma as unknown as {
  period: { findFirst: ReturnType<typeof vi.fn> };
  team: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  mockPrisma.period.findFirst.mockReset();
  mockPrisma.team.findMany.mockReset();
});

// ─── getAuctionCutoff ──────────────────────────────────────────────────

describe("getAuctionCutoff", () => {
  it("returns first period startDate + 7 days when periods exist", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({
      startDate: new Date("2026-03-25T00:00:00Z"),
    });
    const cutoff = await getAuctionCutoff(20);
    expect(cutoff.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("orders periods by startDate ascending — picks earliest, not latest", async () => {
    // If the orderBy is broken (e.g. flipped to desc) the wrong period
    // would be selected. Verifying the call args catches that regression
    // without needing the DB to actually contain multiple periods.
    mockPrisma.period.findFirst.mockResolvedValueOnce({
      startDate: new Date("2026-03-25T00:00:00Z"),
    });
    await getAuctionCutoff(20);
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { startDate: "asc" },
        where: expect.objectContaining({ season: { leagueId: 20 } }),
      }),
    );
  });

  it("falls back to current-year April 1 when no periods exist", async () => {
    mockPrisma.period.findFirst.mockResolvedValueOnce(null);
    const cutoff = await getAuctionCutoff(20);
    expect(cutoff.toISOString().slice(5, 10)).toBe("04-01");
  });
});

// ─── getAuctionDaySnapshot — WHERE clause invariants ───────────────────

describe("getAuctionDaySnapshot — query predicates", () => {
  beforeEach(() => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({
      startDate: new Date("2026-03-25T00:00:00Z"),
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([]);
  });

  it("filters source to the 4 auction-time values (incl. mis-labeled rows)", async () => {
    // Regression: dropping DROP or SEASON_IMPORT from the allowlist
    // would silently undercount OGBA 2026 by $77 across 4 rows
    // (Busch, Vaughn, Palencia, Priester).
    await getAuctionDaySnapshot(20);
    const call = mockPrisma.team.findMany.mock.calls[0][0];
    const rosterWhere = call.include.rosters.where;
    expect(rosterWhere.source.in).toEqual([
      "auction_2026", "prior_season", "DROP", "SEASON_IMPORT",
    ]);
  });

  it("requires acquiredAt strictly before cutoff (not lte)", async () => {
    // Regression: switching `lt` → `lte` would include rows acquired
    // ON the cutoff date, which by convention belong to the post-auction
    // window. Anchors the boundary semantic.
    await getAuctionDaySnapshot(20);
    const call = mockPrisma.team.findMany.mock.calls[0][0];
    const acquiredAt = call.include.rosters.where.acquiredAt;
    expect(acquiredAt).toEqual({ lt: expect.any(Date) });
    expect(acquiredAt.lt.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("includes releasedAt=null OR releasedAt>=cutoff (post-auction drops kept)", async () => {
    // Regression: removing the `releasedAt: { gte: cutoff }` branch
    // collapses to "current active only" — exactly the bug PR #370 fixed.
    // Verifying the OR clause structure pins the snapshot semantic.
    await getAuctionDaySnapshot(20);
    const call = mockPrisma.team.findMany.mock.calls[0][0];
    const orClause = call.include.rosters.where.OR;
    expect(orClause).toEqual([
      { releasedAt: null },
      { releasedAt: { gte: expect.any(Date) } },
    ]);
    expect(orClause[1].releasedAt.gte.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("scopes query to the requested leagueId", async () => {
    await getAuctionDaySnapshot(20);
    const call = mockPrisma.team.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ leagueId: 20 });
  });
});

// ─── getAuctionDaySnapshot — output transformation ─────────────────────

describe("getAuctionDaySnapshot — wire shape", () => {
  beforeEach(() => {
    mockPrisma.period.findFirst.mockResolvedValueOnce({
      startDate: new Date("2026-03-25T00:00:00Z"),
    });
  });

  function fakeRosterRow(over: Partial<{
    id: number; playerId: number; price: number; source: string;
    assignedPosition: string | null; player: {
      id: number; name: string; posPrimary: string;
      posList: string; mlbId: number; mlbTeam: string;
    } | null;
  }> = {}) {
    return {
      id: over.id ?? 1,
      playerId: over.playerId ?? 100,
      price: over.price ?? 25,
      source: over.source ?? "auction_2026",
      assignedPosition: over.assignedPosition ?? null,
      player: over.player ?? {
        id: 100, name: "Test Player", posPrimary: "SS",
        posList: "SS,2B", mlbId: 600100, mlbTeam: "LAD",
      },
    };
  }

  it("normalizes DROP source to auction_2026 in the output", async () => {
    // Regression: PR #370 introduced this normalization so consumers
    // (UI keeper/auction badge, Draft Report Card keeper filter) don't
    // see the 4 OGBA mis-labels as a third category. Verifying the
    // transformation catches accidental removal.
    mockPrisma.team.findMany.mockResolvedValueOnce([{
      id: 1, name: "Team A", code: "TMA", budget: 400,
      rosters: [fakeRosterRow({ source: "DROP" })],
    }]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.teams[0].rosters[0].source).toBe("auction_2026");
  });

  it("normalizes SEASON_IMPORT source to auction_2026", async () => {
    mockPrisma.team.findMany.mockResolvedValueOnce([{
      id: 1, name: "Team A", code: "TMA", budget: 400,
      rosters: [fakeRosterRow({ source: "SEASON_IMPORT" })],
    }]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.teams[0].rosters[0].source).toBe("auction_2026");
  });

  it("preserves prior_season source (keeper indicator) without normalization", async () => {
    // The Draft Report Card keeper-exclusion filter depends on this
    // exact string — collapsing prior_season into auction_2026 would
    // make every keeper indistinguishable from an auction win.
    mockPrisma.team.findMany.mockResolvedValueOnce([{
      id: 1, name: "Team A", code: "TMA", budget: 400,
      rosters: [fakeRosterRow({ source: "prior_season" })],
    }]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.teams[0].rosters[0].source).toBe("prior_season");
  });

  it("derives isPitcher from posPrimary via PITCHER_CODES", async () => {
    mockPrisma.team.findMany.mockResolvedValueOnce([{
      id: 1, name: "Team A", code: "TMA", budget: 400,
      rosters: [
        fakeRosterRow({ id: 1, player: {
          id: 1, name: "Pitcher", posPrimary: "P",
          posList: "P", mlbId: 1, mlbTeam: "LAD",
        }}),
        fakeRosterRow({ id: 2, player: {
          id: 2, name: "Hitter", posPrimary: "SS",
          posList: "SS", mlbId: 2, mlbTeam: "LAD",
        }}),
      ],
    }]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.teams[0].rosters[0].isPitcher).toBe(true);
    expect(snap.teams[0].rosters[1].isPitcher).toBe(false);
  });

  it("falls back teamCode to 'UNK' when team.code is null", async () => {
    mockPrisma.team.findMany.mockResolvedValueOnce([{
      id: 1, name: "Unnamed", code: null, budget: null,
      rosters: [],
    }]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.teams[0].teamCode).toBe("UNK");
    expect(snap.teams[0].budget).toBeNull();
  });

  it("returns cutoff in the response payload", async () => {
    mockPrisma.team.findMany.mockResolvedValueOnce([]);
    const snap = await getAuctionDaySnapshot(20);
    expect(snap.auctionCutoff.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(snap.leagueId).toBe(20);
  });
});

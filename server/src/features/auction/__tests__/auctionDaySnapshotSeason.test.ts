/**
 * S4 (UX step F final fix wave): the auction-day snapshot was hardwired to
 * 2026 — `auction_2026` in the source allowlist and the label it normalizes
 * mis-labeled rows to, and a cutoff from the earliest period of ANY season
 * (falling back to April 1 of the current year when there are none).
 *
 * The 2026 test below pins OGBA's output: the expected object and query args
 * were written against the pre-fix implementation, run green there, and must
 * stay identical after the fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    league: { findUnique: vi.fn() },
    period: { findFirst: vi.fn() },
    team: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/prisma.js";
import { getAuctionDaySnapshot } from "../lib/auctionDaySnapshot.js";

const mockPrisma = prisma as any;

function row(id: number, source: string, price: number, player: { name: string; pos: string; mlbId: number }) {
  return {
    id, playerId: id + 100, price, source, assignedPosition: player.pos,
    player: { id: id + 100, name: player.name, posPrimary: player.pos, posList: player.pos, mlbId: player.mlbId, mlbTeam: "LAD" },
  };
}

/** OGBA-shaped fixture: keeper, auction win, the two mis-label kinds. */
function ogbaTeams(auctionSource: string) {
  return [
    {
      id: 141, name: "Los Doyers", code: "LDY", budget: 400,
      rosters: [
        row(1, "prior_season", 31, { name: "Keeper Bat", pos: "OF", mlbId: 600001 }),
        row(2, auctionSource, 44, { name: "Auction Arm", pos: "SP", mlbId: 600002 }),
        row(3, "DROP", 12, { name: "Mislabel Drop", pos: "2B", mlbId: 600003 }),
      ],
    },
    {
      id: 142, name: "Dodger Dawgs", code: null, budget: null,
      rosters: [row(4, "SEASON_IMPORT", 9, { name: "Mislabel Import", pos: "RP", mlbId: 600004 })],
    },
  ];
}

function expectedSnapshot(leagueId: number, cutoff: string, normalized: string) {
  const r = (id: number, source: string, price: number, name: string, pos: string, mlbId: number, isPitcher: boolean) => ({
    rosterId: id, playerId: id + 100, mlbId, playerName: name, posPrimary: pos, posList: pos,
    mlbTeam: "LAD", price, assignedPosition: pos, source, isPitcher,
  });
  return {
    leagueId,
    auctionCutoff: new Date(cutoff),
    teams: [
      {
        teamId: 141, teamName: "Los Doyers", teamCode: "LDY", budget: 400,
        rosters: [
          r(1, "prior_season", 31, "Keeper Bat", "OF", 600001, false),
          r(2, normalized, 44, "Auction Arm", "SP", 600002, true),
          r(3, normalized, 12, "Mislabel Drop", "2B", 600003, false),
        ],
      },
      {
        teamId: 142, teamName: "Dodger Dawgs", teamCode: "UNK", budget: null,
        rosters: [r(4, normalized, 9, "Mislabel Import", "RP", 600004, true)],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S4: auction-day snapshot follows the league's season", () => {
  it("OGBA 2026: output and query are identical to the pre-fix implementation", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2026 });
    mockPrisma.period.findFirst.mockResolvedValue({ startDate: new Date("2026-03-25T00:00:00Z") });
    mockPrisma.team.findMany.mockResolvedValue(ogbaTeams("auction_2026"));

    const snap = await getAuctionDaySnapshot(20);

    expect(snap).toEqual(expectedSnapshot(20, "2026-04-01T00:00:00.000Z", "auction_2026"));
    const where = mockPrisma.team.findMany.mock.calls[0][0];
    expect(where.where).toEqual({ leagueId: 20 });
    expect(where.include.rosters.where).toEqual({
      source: { in: ["auction_2026", "prior_season", "DROP", "SEASON_IMPORT"] },
      acquiredAt: { lt: new Date("2026-04-01T00:00:00.000Z") },
      OR: [{ releasedAt: null }, { releasedAt: { gte: new Date("2026-04-01T00:00:00.000Z") } }],
    });
  });

  it("2027: reads auction_2027 rows, normalizes to auction_2027, and takes the cutoff from 2027's periods", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2027 });
    mockPrisma.period.findFirst.mockResolvedValue({ startDate: new Date("2027-03-30T00:00:00Z") });
    mockPrisma.team.findMany.mockResolvedValue(ogbaTeams("auction_2027"));

    const snap = await getAuctionDaySnapshot(31);

    expect(mockPrisma.league.findUnique).toHaveBeenCalledWith({ where: { id: 31 }, select: { season: true } });
    expect(mockPrisma.period.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { season: { leagueId: 31, year: 2027 } },
      orderBy: { startDate: "asc" },
    }));
    const rw = mockPrisma.team.findMany.mock.calls[0][0].include.rosters.where;
    expect(rw.source.in).toEqual(["auction_2027", "prior_season", "DROP", "SEASON_IMPORT"]);
    expect(rw.source.in).not.toContain("auction_2026");
    expect(snap).toEqual(expectedSnapshot(31, "2027-04-06T00:00:00.000Z", "auction_2027"));
  });

  it("a season with no periods yet uses 'now' as the cutoff, never April 1", async () => {
    mockPrisma.league.findUnique.mockResolvedValue({ season: 2027 });
    mockPrisma.period.findFirst.mockResolvedValue(null);
    mockPrisma.team.findMany.mockResolvedValue([]);

    const before = Date.now();
    const snap = await getAuctionDaySnapshot(31);
    const after = Date.now();

    const t = snap.auctionCutoff.getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
    const rw = mockPrisma.team.findMany.mock.calls[0][0].include.rosters.where;
    expect(rw.acquiredAt.lt.getTime()).toBe(t);
  });
});

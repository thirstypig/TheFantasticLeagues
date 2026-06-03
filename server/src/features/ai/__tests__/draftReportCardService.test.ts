import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    period: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    playerStatsPeriod: { groupBy: vi.fn() },
  },
}));

// Stub the snapshot module so we control auction-day rosters directly
// (the lib does its own period.findMany call we don't want to interfere
// with the checkpoint lookup).
vi.mock("../../auction/lib/auctionDaySnapshot.js", () => ({
  getAuctionDaySnapshot: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import { getAuctionDaySnapshot } from "../../auction/lib/auctionDaySnapshot.js";
import {
  computeDraftReportCard,
  CheckpointUnavailableError,
} from "../services/draftReportCardService.js";

const mockPrisma = prisma as unknown as {
  period: { findMany: ReturnType<typeof vi.fn> };
  team: { findMany: ReturnType<typeof vi.fn> };
  playerStatsPeriod: { groupBy: ReturnType<typeof vi.fn> };
};
const mockSnapshot = getAuctionDaySnapshot as ReturnType<typeof vi.fn>;

function snapshotRoster(over: Partial<{
  rosterId: number; playerId: number; mlbId: number; playerName: string;
  posPrimary: string; price: number; isPitcher: boolean; mlbTeam: string;
}>) {
  return {
    rosterId: over.rosterId ?? 1,
    playerId: over.playerId!,
    mlbId: over.mlbId ?? null,
    playerName: over.playerName ?? "Player",
    posPrimary: over.posPrimary ?? "SS",
    posList: over.posPrimary ?? "SS",
    mlbTeam: over.mlbTeam ?? "LAD",
    price: over.price ?? 10,
    assignedPosition: null,
    source: "auction_2026",
    isPitcher: over.isPitcher ?? false,
  };
}

beforeEach(() => {
  mockPrisma.period.findMany.mockReset();
  mockPrisma.team.findMany.mockReset();
  mockPrisma.playerStatsPeriod.groupBy.mockReset();
  mockSnapshot.mockReset();
});

describe("computeDraftReportCard — checkpoint gating", () => {
  it("throws CheckpointUnavailableError when checkpoint hasn't started", async () => {
    // Periods exist but the first hasn't started yet.
    mockPrisma.period.findMany.mockResolvedValueOnce([
      { id: 1, startDate: new Date("2099-01-01"), endDate: new Date("2099-02-01"), status: "upcoming" },
      { id: 2, startDate: new Date("2099-02-02"), endDate: new Date("2099-03-01"), status: "upcoming" },
      { id: 3, startDate: new Date("2099-03-02"), endDate: new Date("2099-04-01"), status: "upcoming" },
    ]);
    await expect(computeDraftReportCard(1, "one_third")).rejects.toBeInstanceOf(
      CheckpointUnavailableError,
    );
  });
});

describe("computeDraftReportCard — surplus calculation", () => {
  beforeEach(() => {
    // Three completed periods so the checkpoint resolves cleanly.
    mockPrisma.period.findMany.mockResolvedValue([
      { id: 1, startDate: new Date("2026-04-01"), endDate: new Date("2026-04-30"), status: "completed" },
      { id: 2, startDate: new Date("2026-05-01"), endDate: new Date("2026-05-15"), status: "completed" },
      { id: 3, startDate: new Date("2026-05-16"), endDate: new Date("2026-06-01"), status: "completed" },
    ]);
  });

  it("ranks values descending and busts ascending within a 6-hitter team", async () => {
    // 6 hitters, identical $10 price so price_z = 0 → surplus = composite_z.
    // Hand-constructed stats: HRs spread from 0 to 25 across the same z-pool.
    const players = [1, 2, 3, 4, 5, 6].map((id) => ({
      playerId: id,
      mlbId: id,
      playerName: `H${id}`,
      posPrimary: "OF",
      price: 10,
      isPitcher: false,
    }));
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1,
      auctionCutoff: new Date("2026-04-07"),
      teams: [{
        teamId: 100, teamName: "Alpha", teamCode: "ALP", budget: 260,
        rosters: players.map(snapshotRoster),
      }],
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([
      { id: 100, rosters: players.map((p) => ({ playerId: p.playerId })) },
    ]);
    // Player N: 5N HR, 5N R, 5N RBI, 5N SB, 30 AB (qualifies), 10 H so AVG=.333.
    mockPrisma.playerStatsPeriod.groupBy.mockResolvedValueOnce(
      players.map((p) => ({
        playerId: p.playerId,
        _sum: {
          AB: 30, H: 10,
          R: 5 * p.playerId, HR: 5 * p.playerId, RBI: 5 * p.playerId, SB: 5 * p.playerId,
          W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0,
        },
      })),
    );

    const card = await computeDraftReportCard(1, "one_third");
    expect(card.teams).toHaveLength(1);
    const t = card.teams[0];
    // Values: top 3 by surplus — that's the highest-HR/R/RBI/SB players (id=6,5,4).
    expect(t.values.map((p) => p.playerId)).toEqual([6, 5, 4]);
    expect(t.values[0].surplus).toBeGreaterThan(t.values[1].surplus);
    expect(t.values[1].surplus).toBeGreaterThan(t.values[2].surplus);
    // Busts: bottom 3 ascending — the lowest-stat players (id=1,2,3).
    expect(t.busts.map((p) => p.playerId)).toEqual([1, 2, 3]);
    // price_z = 0 when all prices equal → surplus equals compositeZ.
    expect(t.values[0].priceZ).toBeCloseTo(0, 5);
    expect(t.values[0].surplus).toBeCloseTo(t.values[0].compositeZ, 5);
  });

  it("excludes auction-day players no longer on the current roster", async () => {
    // 2 players on snapshot, only 1 on current roster — the dropped one
    // shouldn't appear in values or busts.
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1,
      auctionCutoff: new Date("2026-04-07"),
      teams: [{
        teamId: 100, teamName: "Alpha", teamCode: "ALP", budget: 260,
        rosters: [
          snapshotRoster({ playerId: 1, playerName: "Kept" }),
          snapshotRoster({ playerId: 2, playerName: "Dropped" }),
        ],
      }],
    });
    // Current roster has playerId=1 only.
    mockPrisma.team.findMany.mockResolvedValueOnce([
      { id: 100, rosters: [{ playerId: 1 }] },
    ]);
    mockPrisma.playerStatsPeriod.groupBy.mockResolvedValueOnce([
      { playerId: 1, _sum: { AB: 100, H: 30, R: 20, HR: 5, RBI: 25, SB: 3, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
    ]);

    const card = await computeDraftReportCard(1, "one_third");
    const allPicks = [...card.teams[0].values, ...card.teams[0].busts];
    expect(allPicks.map((p) => p.playerId)).not.toContain(2);
    expect(allPicks.map((p) => p.playerId)).toContain(1);
  });

  it("excludes hitters below AB>=30 and pitchers below IP>=10 (small-sample floor)", async () => {
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1,
      auctionCutoff: new Date("2026-04-07"),
      teams: [{
        teamId: 100, teamName: "Alpha", teamCode: "ALP", budget: 260,
        rosters: [
          snapshotRoster({ playerId: 1, playerName: "Healthy hitter", price: 10 }),
          snapshotRoster({ playerId: 2, playerName: "IL hitter", price: 40 }),
          snapshotRoster({ playerId: 3, playerName: "Healthy pitcher", price: 10, isPitcher: true, posPrimary: "SP" }),
          snapshotRoster({ playerId: 4, playerName: "IL pitcher", price: 30, isPitcher: true, posPrimary: "SP" }),
        ],
      }],
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([
      { id: 100, rosters: [{ playerId: 1 }, { playerId: 2 }, { playerId: 3 }, { playerId: 4 }] },
    ]);
    mockPrisma.playerStatsPeriod.groupBy.mockResolvedValueOnce([
      // Healthy hitter — 50 AB qualifies
      { playerId: 1, _sum: { AB: 50, H: 15, R: 10, HR: 3, RBI: 10, SB: 2, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
      // IL hitter — 10 AB, below floor
      { playerId: 2, _sum: { AB: 10, H: 2, R: 1, HR: 0, RBI: 1, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
      // Healthy pitcher — 20 IP qualifies
      { playerId: 3, _sum: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 2, SV: 0, K: 25, IP: 20, ER: 5, BB_H: 22 } },
      // IL pitcher — 3 IP, below floor
      { playerId: 4, _sum: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 2, IP: 3, ER: 2, BB_H: 5 } },
    ]);

    const card = await computeDraftReportCard(1, "one_third");
    const all = [...card.teams[0].values, ...card.teams[0].busts];
    const ids = all.map((p) => p.playerId);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(4);
  });

  it("flips ERA/WHIP signs so lower-is-better pitchers score positive z", async () => {
    // Two pitchers, identical price; A has crushed ERA/WHIP, B is bad.
    // Composite_z for A should be > B even though raw ERA/WHIP are lower.
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1,
      auctionCutoff: new Date("2026-04-07"),
      teams: [{
        teamId: 100, teamName: "Alpha", teamCode: "ALP", budget: 260,
        rosters: [
          snapshotRoster({ playerId: 1, playerName: "Ace", price: 20, isPitcher: true, posPrimary: "SP" }),
          snapshotRoster({ playerId: 2, playerName: "Scrub", price: 20, isPitcher: true, posPrimary: "SP" }),
        ],
      }],
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([
      { id: 100, rosters: [{ playerId: 1 }, { playerId: 2 }] },
    ]);
    // Ace: ERA 2.00, WHIP 1.00. Scrub: ERA 5.00, WHIP 1.50.
    mockPrisma.playerStatsPeriod.groupBy.mockResolvedValueOnce([
      { playerId: 1, _sum: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 5, SV: 0, K: 40, IP: 45, ER: 10, BB_H: 45 } },
      { playerId: 2, _sum: { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 2, SV: 0, K: 20, IP: 30, ER: 16.67, BB_H: 45 } },
    ]);

    const card = await computeDraftReportCard(1, "one_third");
    const picks = [...card.teams[0].values, ...card.teams[0].busts];
    const ace = picks.find((p) => p.playerId === 1)!;
    const scrub = picks.find((p) => p.playerId === 2)!;
    expect(ace.compositeZ).toBeGreaterThan(scrub.compositeZ);
    expect(ace.surplus).toBeGreaterThan(scrub.surplus);
  });

  it("sorts teams alphabetically by teamName", async () => {
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1,
      auctionCutoff: new Date("2026-04-07"),
      teams: [
        { teamId: 100, teamName: "Zebra", teamCode: "ZEB", budget: 260,
          rosters: [snapshotRoster({ playerId: 1, rosterId: 1 })] },
        { teamId: 101, teamName: "Alpha", teamCode: "ALP", budget: 260,
          rosters: [snapshotRoster({ playerId: 2, rosterId: 2 })] },
        { teamId: 102, teamName: "Mid", teamCode: "MID", budget: 260,
          rosters: [snapshotRoster({ playerId: 3, rosterId: 3 })] },
      ],
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([
      { id: 100, rosters: [{ playerId: 1 }] },
      { id: 101, rosters: [{ playerId: 2 }] },
      { id: 102, rosters: [{ playerId: 3 }] },
    ]);
    mockPrisma.playerStatsPeriod.groupBy.mockResolvedValueOnce([
      { playerId: 1, _sum: { AB: 100, H: 30, R: 20, HR: 5, RBI: 20, SB: 2, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
      { playerId: 2, _sum: { AB: 100, H: 25, R: 15, HR: 8, RBI: 25, SB: 1, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
      { playerId: 3, _sum: { AB: 100, H: 28, R: 18, HR: 6, RBI: 22, SB: 3, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 } },
    ]);

    const card = await computeDraftReportCard(1, "one_third");
    expect(card.teams.map((t) => t.teamName)).toEqual(["Alpha", "Mid", "Zebra"]);
  });

  it("sets isPreview=true when last period is active", async () => {
    mockPrisma.period.findMany.mockReset();
    mockPrisma.period.findMany.mockResolvedValueOnce([
      { id: 1, startDate: new Date("2026-04-01"), endDate: new Date("2026-04-30"), status: "completed" },
      { id: 2, startDate: new Date("2026-05-01"), endDate: new Date("2026-05-15"), status: "completed" },
      { id: 3, startDate: new Date("2026-05-16"), endDate: new Date(Date.now() + 86_400_000), status: "active" },
    ]);
    mockSnapshot.mockResolvedValueOnce({
      leagueId: 1, auctionCutoff: new Date("2026-04-07"), teams: [],
    });
    mockPrisma.team.findMany.mockResolvedValueOnce([]);

    const card = await computeDraftReportCard(1, "one_third");
    expect(card.isPreview).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    team: { findUnique: vi.fn() },
    period: { findFirst: vi.fn() },
    teamStatsPeriod: { findMany: vi.fn(), findUnique: vi.fn() },
    roster: { findMany: vi.fn() },
    playerStatsPeriod: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../db/prisma.js";
import { TeamService } from "../services/teamService.js";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults — every getTeamSummary path queries these.
  mockPrisma.period.findFirst.mockResolvedValue(null);
  mockPrisma.teamStatsPeriod.findMany.mockResolvedValue([]);
  mockPrisma.teamStatsPeriod.findUnique.mockResolvedValue(null);
  mockPrisma.playerStatsPeriod.findMany.mockResolvedValue([]);
});

// ── Player.mlbStatus → TeamDetailResponse.currentRoster[].mlbStatus ─
//
// Pinning the wire-format contract: the team-detail endpoint surfaces the
// raw `Player.mlbStatus` string on each roster row so the v3 hub's
// ghost-IL warning chip can wake up. Verbatim per direction-lock IL #1.

describe("TeamService.getTeamSummary — mlbStatus pass-through", () => {
  function setup(rosterPlayers: Array<{ id: number; name: string; mlbStatus: string | null }>) {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      name: "Test Team",
      owner: "Tester",
      budget: 260,
    });
    // Active roster rows — each carries an embedded `player` from the
    // include({ player: true }) on the service.
    mockPrisma.roster.findMany.mockImplementation((args: any) => {
      // Active vs released split: active is `releasedAt: null`
      if (args?.where?.releasedAt === null) {
        return Promise.resolve(
          rosterPlayers.map((p, i) => ({
            id: 100 + i,
            playerId: p.id,
            teamId: 10,
            assignedPosition: null,
            isKeeper: false,
            price: 1,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: p.id,
              mlbId: 600000 + i,
              name: p.name,
              posPrimary: "OF",
              posList: "OF",
              mlbTeam: "LAD",
              mlbStatus: p.mlbStatus,
            },
          })),
        );
      }
      return Promise.resolve([]); // dropped
    });
  }

  it("includes mlbStatus on every active-roster row when set", async () => {
    setup([
      { id: 1, name: "Mike Trout", mlbStatus: "Injured 10-Day" },
      { id: 2, name: "Mookie Betts", mlbStatus: "Active" },
    ]);

    const service = new TeamService();
    const result = await service.getTeamSummary(10);

    expect(result.currentRoster).toHaveLength(2);
    expect(result.currentRoster[0]).toMatchObject({
      name: "Mike Trout",
      mlbStatus: "Injured 10-Day",
    });
    expect(result.currentRoster[1]).toMatchObject({
      name: "Mookie Betts",
      mlbStatus: "Active",
    });
  });

  it("passes mlbStatus through verbatim — no normalization", async () => {
    // Per direction-lock IL #1 the value is whatever the MLB API said.
    // Including odd legacy strings ("Injured List 10-Day") and edge cases
    // ("Restricted") — the service must NOT massage them.
    setup([
      { id: 1, name: "Edge Case A", mlbStatus: "Injured List 10-Day" },
      { id: 2, name: "Edge Case B", mlbStatus: "Restricted" },
      { id: 3, name: "Edge Case C", mlbStatus: "Suspended" },
    ]);

    const service = new TeamService();
    const result = await service.getTeamSummary(10);

    expect(result.currentRoster.map((r: any) => r.mlbStatus)).toEqual([
      "Injured List 10-Day",
      "Restricted",
      "Suspended",
    ]);
  });

  it("emits null mlbStatus when Player.mlbStatus is null (free agent / synthetic)", async () => {
    // Filler/synthetic rows or AAA-only players never had a 40-man status
    // populated — the wire shape is `null`, not undefined, so the client's
    // `?? undefined` pass-through normalizes it.
    setup([{ id: 1, name: "Synthetic Row", mlbStatus: null }]);

    const service = new TeamService();
    const result = await service.getTeamSummary(10);

    expect(result.currentRoster[0].mlbStatus).toBeNull();
  });

  it("ghost-IL gap: active-roster player carries mlbStatus that indicates IL", async () => {
    // The whole point of this plumbing — a player NOT on the team's IL
    // slot but whose Player.mlbStatus is "Injured N-Day". The client v3
    // hub uses this exact gap to render the ghost-IL warning chip.
    setup([
      { id: 1, name: "Ghost IL Suspect", mlbStatus: "Injured 60-Day" },
    ]);

    const service = new TeamService();
    const result = await service.getTeamSummary(10);

    const row: any = result.currentRoster[0];
    expect(row.mlbStatus).toBe("Injured 60-Day");
    // assignedPosition null → not on the IL slot. The chip wakes up on
    // exactly this combination via Team.tsx → toHubPlayer → RosterHubPlayer.
    expect(row.assignedPosition).toBeNull();
  });
});

describe("TeamService.getTeamRosterHub", () => {
  it("returns hub-ready hitters, pitchers, and IL rows with active-period stats", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 10,
      leagueId: 1,
      name: "Test Team",
      owner: "Tester",
      budget: 260,
    });
    mockPrisma.period.findFirst.mockResolvedValue({
      id: 7,
      leagueId: 1,
      name: "Period 7",
      status: "active",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-14"),
    });
    mockPrisma.playerStatsPeriod.findMany.mockResolvedValue([
      { playerId: 1, AB: 20, H: 6, R: 4, HR: 2, RBI: 5, SB: 1, IP: 0, ER: 0, BB_H: 0, W: 0, SV: 0, K: 0 },
      { playerId: 2, AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, IP: 12, ER: 3, BB_H: 10, W: 1, SV: 0, K: 14 },
      { playerId: 3, AB: 8, H: 2, R: 1, HR: 0, RBI: 1, SB: 0, IP: 0, ER: 0, BB_H: 0, W: 0, SV: 0, K: 0 },
    ]);
    mockPrisma.roster.findMany.mockImplementation((args: any) => {
      if (args?.where?.releasedAt === null) {
        return Promise.resolve([
          {
            id: 101,
            playerId: 1,
            teamId: 10,
            assignedPosition: "OF",
            isKeeper: true,
            price: 25,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: 1,
              mlbId: 600001,
              name: "Hitter One",
              posPrimary: "OF",
              posList: "OF,2B",
              mlbTeam: "LAD",
              mlbStatus: "Active",
            },
          },
          {
            id: 102,
            playerId: 2,
            teamId: 10,
            assignedPosition: "SP",
            isKeeper: false,
            price: 18,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: 2,
              mlbId: 600002,
              name: "Pitcher One",
              posPrimary: "P",
              posList: "P",
              mlbTeam: "SFG",
              mlbStatus: "Active",
            },
          },
          {
            id: 103,
            playerId: 3,
            teamId: 10,
            assignedPosition: "IL",
            isKeeper: false,
            price: 3,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: 3,
              mlbId: 600003,
              name: "IL One",
              posPrimary: "OF",
              posList: "OF",
              mlbTeam: "NYM",
              mlbStatus: "Injured 10-Day",
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const service = new TeamService();
    const result = await service.getTeamRosterHub(10);

    expect(result.team.id).toBe(10);
    expect(result.period?.id).toBe(7);
    expect(result.hitters).toHaveLength(1);
    expect(result.hitters[0]).toMatchObject({
      rosterId: 101,
      playerId: 1,
      playerName: "Hitter One",
      assignedPosition: "OF",
      isPitcher: false,
      isKeeper: true,
      AB: 20,
      H: 6,
      AVG: 0.3,
      HR: 2,
    });
    // No posGames in this fixture → synthetic fallback
    expect(result.hitters[0].posGamesSource).toBe("synthetic");
    expect(result.pitchers).toHaveLength(1);
    expect(result.pitchers[0]).toMatchObject({
      rosterId: 102,
      playerName: "Pitcher One",
      assignedPosition: "SP",
      isPitcher: true,
      IP: 12,
      ER: 3,
      BB_H: 10,
      ERA: 2.25,
      WHIP: 10 / 12,
    });
    expect(result.ilPlayers).toHaveLength(1);
    expect(result.ilPlayers[0]).toMatchObject({
      rosterId: 103,
      playerName: "IL One",
      assignedPosition: "IL",
      mlbStatus: "Injured 10-Day",
    });
  });

  it("posGamesSource is 'real' when player.posGames has MLB data, 'synthetic' otherwise", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: 20,
      leagueId: 1,
      name: "T",
      owner: "O",
      budget: 260,
    });
    mockPrisma.roster.findMany.mockImplementation((args: any) => {
      if (args?.where?.releasedAt === null) {
        return Promise.resolve([
          {
            id: 201,
            playerId: 10,
            teamId: 20,
            assignedPosition: "C",
            isKeeper: false,
            price: 20,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: 10,
              mlbId: 700010,
              name: "Real GP Player",
              posPrimary: "C",
              posList: "C",
              mlbTeam: "LAD",
              mlbStatus: null,
              // real MLB data from the cron
              posGames: { C: 48, DH: 2 },
            },
          },
          {
            id: 202,
            playerId: 11,
            teamId: 20,
            assignedPosition: "SS",
            isKeeper: false,
            price: 10,
            acquiredAt: new Date("2026-04-01"),
            releasedAt: null,
            source: "auction",
            player: {
              id: 11,
              mlbId: 700011,
              name: "No GP Player",
              posPrimary: "SS",
              posList: "SS",
              mlbTeam: "LAD",
              mlbStatus: null,
              // cron hasn't run yet
              posGames: null,
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const service = new TeamService();
    const result = await service.getTeamRosterHub(20);

    const realRow = result.hitters.find((r: { playerId: number }) => r.playerId === 10)! as any;
    const syntheticRow = result.hitters.find((r: { playerId: number }) => r.playerId === 11)! as any;

    expect(realRow.posGamesSource).toBe("real");
    expect(realRow.gamesByPos).toEqual({ C: 48, DH: 2 });

    expect(syntheticRow.posGamesSource).toBe("synthetic");
    // Synthetic single-position: 20 GP
    expect(syntheticRow.gamesByPos).toEqual({ SS: 20 });
  });
});

// ── TeamService.buildGamesByPos — real posGames vs synthetic fallback ──
//
// Pinning the posGames integration: when real MLB fielding data is present
// it must take precedence; when absent or invalid the synthetic 60/40 split
// must kick in.

describe("TeamService.buildGamesByPos", () => {
  it("returns real posGames when provided and non-empty", () => {
    const realData = { OF: 45, "1B": 12 };
    const result = TeamService.buildGamesByPos("OF", "OF,1B", realData);
    expect(result).toEqual({ OF: 45, "1B": 12 });
  });

  it("returns synthetic 60/40 split when posGames is null", () => {
    const result = TeamService.buildGamesByPos("OF", "OF,1B", null);
    // Synthetic: OF gets Math.round(20 * 0.6) = 12, 1B gets Math.round(20 * 0.4 / 1) = 8
    expect(result["OF"]).toBe(12);
    expect(result["1B"]).toBe(8);
  });

  it("falls back to synthetic when posGames is an empty object", () => {
    const result = TeamService.buildGamesByPos("SS", "SS", {});
    expect(result["SS"]).toBe(20);
  });

  it("falls back to synthetic when posGames is undefined", () => {
    const result = TeamService.buildGamesByPos("3B", "3B");
    expect(result["3B"]).toBe(20);
  });

  it("single-position synthetic gives full 20 GP", () => {
    const result = TeamService.buildGamesByPos("C", "C", null);
    expect(result).toEqual({ C: 20 });
  });

  it("real posGames with a single position is returned verbatim", () => {
    const result = TeamService.buildGamesByPos("C", "C", { C: 58 });
    expect(result).toEqual({ C: 58 });
  });
});

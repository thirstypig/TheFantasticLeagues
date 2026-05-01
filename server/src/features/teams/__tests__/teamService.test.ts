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

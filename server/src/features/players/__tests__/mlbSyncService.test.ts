import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    player: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { syncAllPlayers, fetchAllTeams, syncNLPlayers, fetchNLTeams, syncPositionEligibility, syncAAARosters, fetchAAATeams } from "../services/mlbSyncService.js";

const mockPrisma = prisma as any;
const mockMlbGetJson = mlbGetJson as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── fetchAllTeams ────────────────────────────────────────────────

describe("fetchAllTeams", () => {
  it("returns all MLB teams", async () => {
    mockMlbGetJson.mockResolvedValue({
      teams: [
        { id: 108, name: "Los Angeles Angels", abbreviation: "LAA", league: { id: 103 } },
        { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", league: { id: 104 } },
        { id: 147, name: "New York Yankees", abbreviation: "NYY", league: { id: 103 } },
      ],
    });

    const teams = await fetchAllTeams(2026);
    expect(teams).toHaveLength(3);
    expect(mockMlbGetJson).toHaveBeenCalledWith(expect.stringContaining("sportId=1&season=2026"));
  });
});

// ── fetchNLTeams ─────────────────────────────────────────────────

describe("fetchNLTeams", () => {
  it("filters to NL teams only", async () => {
    mockMlbGetJson.mockResolvedValue({
      teams: [
        { id: 108, name: "Los Angeles Angels", abbreviation: "LAA", league: { id: 103 } },
        { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", league: { id: 104 } },
      ],
    });

    const teams = await fetchNLTeams(2026);
    expect(teams).toHaveLength(1);
    expect(teams[0].abbreviation).toBe("LAD");
  });
});

// ── syncAllPlayers ───────────────────────────────────────────────

describe("syncAllPlayers", () => {
  const mockTeams = {
    teams: [
      { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", league: { id: 104 } },
    ],
  };

  const mockRoster = {
    roster: [
      { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "DH", type: "Hitter" } },
      { person: { id: 605141, fullName: "Mookie Betts" }, position: { abbreviation: "SS", type: "Hitter" } },
    ],
  };

  it("creates new players", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)   // fetchAllTeams
      .mockResolvedValueOnce(mockRoster); // fetchTeamRoster

    mockPrisma.player.findFirst.mockResolvedValue(null); // no existing players
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAllPlayers(2026);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.teams).toBe(1);
    expect(result.teamChanges).toHaveLength(0);
    expect(mockPrisma.player.create).toHaveBeenCalledTimes(2);
  });

  it("updates existing players", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce(mockRoster);

    mockPrisma.player.findFirst.mockResolvedValue({ id: 1, mlbId: 660271, mlbTeam: "LAD" });
    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncAllPlayers(2026);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);
    expect(result.teamChanges).toHaveLength(0);
  });

  it("detects team changes", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "DH", type: "Hitter" } },
        ],
      });

    // Player was previously on NYY, now on LAD
    mockPrisma.player.findFirst.mockResolvedValue({ id: 1, mlbId: 660271, mlbTeam: "NYY" });
    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncAllPlayers(2026);

    expect(result.teamChanges).toHaveLength(1);
    expect(result.teamChanges[0]).toEqual({
      playerId: 1,
      name: "Shohei Ohtani",
      from: "NYY",
      to: "LAD",
    });
  });

  it("continues on roster fetch failure", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce({
        teams: [
          { id: 119, name: "Dodgers", abbreviation: "LAD", league: { id: 104 } },
          { id: 147, name: "Yankees", abbreviation: "NYY", league: { id: 103 } },
        ],
      })
      .mockRejectedValueOnce(new Error("API error")) // LAD fails
      .mockResolvedValueOnce(mockRoster); // NYY succeeds

    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAllPlayers(2026);

    expect(result.teams).toBe(2);
    expect(result.created).toBe(2); // only NYY roster processed
  });

  it("handles empty roster", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({ roster: [] });

    const result = await syncAllPlayers(2026);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.teams).toBe(1);
  });

  it("resolves TWP position to DH for two-way players (Ohtani)", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "TWP", type: "Two-Way Player" } },
        ],
      });

    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    // Should store "DH" (from TWO_WAY_PLAYERS hitterPos), not "TWP"
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mlbId: 660271,
        posPrimary: "DH",
        posList: "DH",
      }),
    });
  });

  it("resolves TWP position on update for two-way players", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "TWP", type: "Two-Way Player" } },
        ],
      });

    mockPrisma.player.findFirst.mockResolvedValue({ id: 3, mlbId: 660271, mlbTeam: "LAD" });
    mockPrisma.player.update.mockResolvedValue({ id: 3 });

    await syncAllPlayers(2026);

    // Should update to "DH", not "TWP"
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({
        posPrimary: "DH",
      }),
    });
  });
});

// ── syncPositionEligibility ─────────────────────────────────────

describe("syncPositionEligibility", () => {
  const makeMlbFieldingResponse = (players: Array<{ id: number; positions: Array<{ pos: string; games: number }> }>) => ({
    people: players.map((p) => ({
      id: p.id,
      stats: [{
        group: { displayName: "fielding" },
        splits: p.positions.map((pos) => ({
          stat: { position: { abbreviation: pos.pos }, games: pos.games },
        })),
      }],
    })),
  });

  it("updates posList based on GP threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "1B", posList: "1B" },
    ]);

    // Player has 75 GP at OF, 50 GP at 1B
    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "1B", games: 50 }, { pos: "LF", games: 75 }] }])
    );

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(0);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { posList: "1B,LF" },
    });
  });

  it("excludes positions below GP threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "SS", posList: "SS" },
    ]);

    // 80 GP at SS, only 5 at 2B (below threshold)
    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SS", games: 80 }, { pos: "2B", games: 5 }] }])
    );

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    // posList stays "SS" — no new positions, so no update needed
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("normalizes SP/RP to P", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "P", posList: "P" },
    ]);

    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SP", games: 30 }, { pos: "RP", games: 10 }] }])
    );

    const result = await syncPositionEligibility(2026, 20);

    // SP + RP both normalize to P, which is already primary
    expect(result.unchanged).toBe(1);
  });

  it("always includes primary position even below threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "CF", posList: "CF" },
    ]);

    // Called up in September — only 10 GP at CF, but 25 GP at LF from earlier in year
    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "CF", games: 10 }, { pos: "LF", games: 25 }] }])
    );

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(1);
    // CF is primary (always included), LF qualifies at 25 GP
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { posList: "CF,LF" },
    });
  });

  it("skips players with no fielding data", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "DH", posList: "DH" },
    ]);

    // No fielding data (DH doesn't play the field)
    mockMlbGetJson.mockResolvedValue({ people: [{ id: 12345, stats: [] }] });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });

  it("aggregates stats across teams for traded players", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "1B", posList: "1B" },
    ]);

    // Traded mid-season: 15 GP at OF on team A + 10 GP at OF on team B = 25 total
    mockMlbGetJson.mockResolvedValue({
      people: [{
        id: 12345,
        stats: [{
          group: { displayName: "fielding" },
          splits: [
            { stat: { position: { abbreviation: "1B" }, games: 40 } },
            { stat: { position: { abbreviation: "LF" }, games: 15 } },
            { stat: { position: { abbreviation: "LF" }, games: 10 } },
          ],
        }],
      }],
    });

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(1);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { posList: "1B,LF" },
    });
  });

  it("respects custom GP threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "SS", posList: "SS" },
    ]);

    // 15 GP at 2B — below 20 default but above 10
    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SS", games: 80 }, { pos: "2B", games: 15 }] }])
    );

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    // With threshold = 10, 2B should qualify
    const result = await syncPositionEligibility(2026, 10);

    expect(result.updated).toBe(1);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { posList: "SS,2B" },
    });
  });

  it("handles multiple players in batch", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 111, posPrimary: "1B", posList: "1B" },
      { id: 2, mlbId: 222, posPrimary: "SS", posList: "SS" },
      { id: 3, mlbId: 333, posPrimary: "CF", posList: "CF" },
    ]);

    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([
        { id: 111, positions: [{ pos: "1B", games: 80 }, { pos: "RF", games: 30 }] },
        { id: 222, positions: [{ pos: "SS", games: 100 }] },  // no change
        { id: 333, positions: [{ pos: "CF", games: 60 }, { pos: "LF", games: 25 }, { pos: "RF", games: 22 }] },
      ])
    );

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(2);   // players 1 and 3
    expect(result.unchanged).toBe(1); // player 2
    expect(result.total).toBe(3);
  });
});

// ── fetchAAATeams ───────────────────────────────────────────────

describe("fetchAAATeams", () => {
  it("returns AAA teams with sportId=11", async () => {
    mockMlbGetJson.mockResolvedValue({
      teams: [
        { id: 238, name: "Oklahoma City Baseball Club", abbreviation: "OKC", parentOrgId: 119 },
        { id: 233, name: "Indianapolis Indians", abbreviation: "IND", parentOrgId: 134 },
      ],
    });

    const teams = await fetchAAATeams(2026);
    expect(teams).toHaveLength(2);
    expect(mockMlbGetJson).toHaveBeenCalledWith(expect.stringContaining("sportId=11"));
  });
});

// ── syncAAARosters ──────────────────────────────────────────────

describe("syncAAARosters", () => {
  const mockMlbTeams = {
    teams: [
      { id: 119, name: "Los Angeles Dodgers", abbreviation: "LAD", league: { id: 104 } },
      { id: 134, name: "Pittsburgh Pirates", abbreviation: "PIT", league: { id: 104 } },
    ],
  };

  const mockAAATeams = {
    teams: [
      { id: 238, name: "Oklahoma City Baseball Club", abbreviation: "OKC", parentOrgId: 119 },
      { id: 233, name: "Indianapolis Indians", abbreviation: "IND", parentOrgId: 134 },
    ],
  };

  const mockOkcRoster = {
    roster: [
      { person: { id: 700001, fullName: "Prospect A" }, position: { abbreviation: "SS", type: "Hitter" } },
    ],
  };

  const mockIndRoster = {
    roster: [
      { person: { id: 804606, fullName: "Konnor Griffin" }, position: { abbreviation: "SS", type: "Hitter" } },
    ],
  };

  it("creates new players from AAA rosters", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)    // fetchAllTeams
      .mockResolvedValueOnce(mockAAATeams)     // fetchAAATeams
      .mockResolvedValueOnce(mockOkcRoster)    // OKC roster
      .mockResolvedValueOnce(mockIndRoster);   // IND roster

    mockPrisma.player.findFirst.mockResolvedValue(null); // no existing players
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAAARosters(2026);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.aaaTeams).toBe(2);

    // Verify parent org mapping: OKC → LAD, IND → PIT
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbTeam: "LAD", name: "Prospect A" }),
    });
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbTeam: "PIT", name: "Konnor Griffin" }),
    });
  });

  it("skips players already on MLB 40-man rosters", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)
      .mockResolvedValueOnce({
        teams: [{ id: 238, name: "OKC", abbreviation: "OKC", parentOrgId: 119 }],
      })
      .mockResolvedValueOnce(mockOkcRoster);

    // Player already exists with an MLB team
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 5, mlbId: 700001, mlbTeam: "LAD", posPrimary: "SS",
    });

    const result = await syncAAARosters(2026);

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });

  it("updates players with no MLB team (free agents)", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)
      .mockResolvedValueOnce({
        teams: [{ id: 233, name: "IND", abbreviation: "IND", parentOrgId: 134 }],
      })
      .mockResolvedValueOnce(mockIndRoster);

    // Player exists but has no team (FA)
    mockPrisma.player.findFirst.mockResolvedValue({
      id: 10, mlbId: 804606, mlbTeam: "FA", posPrimary: "SS",
    });
    mockPrisma.player.update.mockResolvedValue({ id: 10 });

    const result = await syncAAARosters(2026);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { name: "Konnor Griffin", mlbTeam: "PIT", posPrimary: "SS" },
    });
  });

  it("continues on roster fetch failure", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)
      .mockResolvedValueOnce(mockAAATeams)
      .mockRejectedValueOnce(new Error("API error")) // OKC fails
      .mockResolvedValueOnce(mockIndRoster);          // IND succeeds

    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAAARosters(2026);

    expect(result.aaaTeams).toBe(2);
    expect(result.created).toBe(1); // only IND roster processed
  });

  it("uses FA when parentOrgId is missing", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)
      .mockResolvedValueOnce({
        teams: [{ id: 999, name: "Unknown AAA", abbreviation: "UNK" }], // no parentOrgId
      })
      .mockResolvedValueOnce({
        roster: [{ person: { id: 700099, fullName: "Mystery Player" }, position: { abbreviation: "CF", type: "Hitter" } }],
      });

    mockPrisma.player.findFirst.mockResolvedValue(null);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAAARosters(2026);

    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbTeam: "FA" }),
    });
  });
});

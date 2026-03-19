import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──────────────────────────────────────────────

vi.mock("../../../db/prisma.js", () => ({
  prisma: {
    player: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/mlbApi.js", () => ({
  mlbGetJson: vi.fn(),
}));

import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { syncAllPlayers, fetchAllTeams, syncNLPlayers, fetchNLTeams } from "../services/mlbSyncService.js";

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

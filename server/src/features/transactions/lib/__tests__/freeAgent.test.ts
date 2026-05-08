/**
 * Unit tests for `transactions/lib/freeAgent` (todo #175).
 *
 * Covers the policy:
 *   - Player not found → 404 PLAYER_NOT_FA
 *   - On a roster in this league → 400 PLAYER_NOT_FA
 *   - mlbTeam = "FA" sentinel → ok
 *   - mlbTeam in allowed set → ok
 *   - mlbTeam outside allowed set → 400 PLAYER_NOT_FA
 *   - mlbTeam empty string → 400 PLAYER_NOT_FA (FAIL-CLOSED, security tightening)
 *   - mlbTeam null → 400 PLAYER_NOT_FA (FAIL-CLOSED)
 *   - No-filter source ("ALL"/"Other") + non-empty team + not rostered → ok
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../db/prisma.js", () => ({
  prisma: {
    player: { findUnique: vi.fn() },
    roster: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../../lib/mlbTeams.js", () => ({
  getLeagueStatsSource: vi.fn(),
  getTeamsForSource: vi.fn(),
}));

import { prisma } from "../../../../db/prisma.js";
import {
  getLeagueStatsSource,
  getTeamsForSource,
} from "../../../../lib/mlbTeams.js";
import { assertPlayerIsFreeAgent } from "../freeAgent.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetLeagueStatsSource = getLeagueStatsSource as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetTeamsForSource = getTeamsForSource as any;

describe("assertPlayerIsFreeAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLeagueStatsSource.mockResolvedValue("NL");
    mockGetTeamsForSource.mockReturnValue(
      new Set(["LAD", "SF", "SD", "ARI", "COL", "NYM", "PHI", "ATL", "MIA", "WSH", "CHC", "STL", "MIL", "PIT", "CIN"]),
    );
  });

  it("returns 404 PLAYER_NOT_FA when player does not exist", async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.body.code).toBe("PLAYER_NOT_FA");
    }
  });

  it("returns 400 PLAYER_NOT_FA when player is rostered in this league", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "LAD" });
    mockPrisma.roster.findFirst.mockResolvedValue({ id: 99 });

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("PLAYER_NOT_FA");
      expect(result.body.error).toContain("already on a roster");
    }
  });

  it("returns ok for mlbTeam = 'FA' sentinel and not rostered", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "FA" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(true);
  });

  it("returns ok for allowed-source team and not rostered", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "LAD" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(true);
  });

  it("returns 400 PLAYER_NOT_FA for disallowed-source team (e.g. AL team in NL league)", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "NYY" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("PLAYER_NOT_FA");
      expect(result.body.error).toContain("stats source");
    }
  });

  it("FAIL-CLOSED: returns 400 PLAYER_NOT_FA for empty-string mlbTeam", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("PLAYER_NOT_FA");
      expect(result.body.error).toContain("no MLB team");
    }
  });

  it("FAIL-CLOSED: returns 400 PLAYER_NOT_FA for null mlbTeam", async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: null });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("PLAYER_NOT_FA");
      expect(result.body.error).toContain("no MLB team");
    }
  });

  it("returns ok when stats source has no filter (e.g. 'ALL') and team is non-empty", async () => {
    mockGetLeagueStatsSource.mockResolvedValue("ALL");
    mockGetTeamsForSource.mockReturnValue(null);
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "NYY" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(true);
  });

  it("FAIL-CLOSED even with no-filter source: empty mlbTeam still rejected", async () => {
    mockGetLeagueStatsSource.mockResolvedValue("ALL");
    mockGetTeamsForSource.mockReturnValue(null);
    mockPrisma.player.findUnique.mockResolvedValue({ id: 123, mlbTeam: "" });
    mockPrisma.roster.findFirst.mockResolvedValue(null);

    const result = await assertPlayerIsFreeAgent(123, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.body.code).toBe("PLAYER_NOT_FA");
    }
  });

  it("uses the passed transaction client when provided", async () => {
    const txPlayerFindUnique = vi.fn().mockResolvedValue({ id: 123, mlbTeam: "LAD" });
    const txRosterFindFirst = vi.fn().mockResolvedValue(null);
    const tx = {
      player: { findUnique: txPlayerFindUnique },
      roster: { findFirst: txRosterFindFirst },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assertPlayerIsFreeAgent(123, 1, tx as any);

    expect(result.ok).toBe(true);
    expect(txPlayerFindUnique).toHaveBeenCalledTimes(1);
    expect(txRosterFindFirst).toHaveBeenCalledTimes(1);
    // Default prisma should NOT have been hit for row reads.
    expect(mockPrisma.player.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.roster.findFirst).not.toHaveBeenCalled();
  });
});

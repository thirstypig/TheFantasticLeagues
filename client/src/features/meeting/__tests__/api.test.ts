import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../api/base", () => ({
  API_BASE: "/api",
  fetchJsonApi: vi.fn(),
  parseJsonResponse: (_s: unknown, p: unknown) => p,
}));

import { fetchJsonApi } from "../../../api/base";
import { getSeasonOrder, searchFreeAgents, submitMove } from "../api";

beforeEach(() => vi.mocked(fetchJsonApi).mockReset());

describe("getSeasonOrder", () => {
  it("getSeasonOrder sorts worst first, ties by name", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      periodIds: [1],
      rows: [
        { teamId: 1, teamName: "Zebras", teamCode: "ZEB", periodPoints: [50], totalPoints: 50 },
        { teamId: 2, teamName: "Aces", teamCode: "ACE", periodPoints: [30], totalPoints: 30 },
        { teamId: 3, teamName: "Bats", teamCode: "BAT", periodPoints: [30], totalPoints: 30 },
        { teamId: 4, teamName: "Mets", teamCode: "MET", periodPoints: [40], totalPoints: 40 },
      ],
    });
    expect(await getSeasonOrder(7)).toEqual([2, 3, 4, 1]);
    expect(vi.mocked(fetchJsonApi).mock.calls[0][0]).toBe("/api/standings/season?leagueId=7");
  });
});

describe("searchFreeAgents", () => {
  it("maps real player-season-stats rows and dedupes two-way rows", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      stats: [
        { id: 11, mlb_id: "660271", player_name: "Shohei Ohtani", positions: "DH", mlb_team: "LAD", ogba_team_id: null },
        { id: 11, mlb_id: "660271", player_name: "Shohei Ohtani", positions: "P", mlb_team: "LAD", ogba_team_id: null },
        { id: 12, mlb_id: "", player_name: "No Id", positions: null, mlb_team: "" },
      ],
    });
    expect(await searchFreeAgents(7, " oh ")).toEqual([
      { playerId: 11, name: "Shohei Ohtani", pos: "DH", mlbTeam: "LAD", mlbId: 660271 },
      { playerId: 12, name: "No Id", pos: "", mlbTeam: null, mlbId: null },
    ]);
    const url = vi.mocked(fetchJsonApi).mock.calls[0][0] as string;
    expect(url).toContain("/api/player-season-stats?");
    expect(url).toContain("freeAgentsOnly=true");
    expect(url).toContain("q=oh");
    expect(url).toContain("take=20");
  });
  it("skips the request for a blank query", async () => {
    expect(await searchFreeAgents(7, "  ")).toEqual([]);
    expect(fetchJsonApi).not.toHaveBeenCalled();
  });
});

describe("submitMove", () => {
  it("POSTs the body to the session route", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({});
    await submitMove(5, { teamId: 1, addPlayerId: 2, dropPlayerId: 3, version: 4 });
    const [url, init] = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(url).toBe("/api/meeting/sessions/5/submit");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      teamId: 1, addPlayerId: 2, dropPlayerId: 3, version: 4,
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../api/base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/base")>();
  return { ...actual, fetchJsonApi: vi.fn(), API_BASE: "/api" };
});

import { fetchJsonApi, ApiError } from "../../../api/base";
import {
  searchFreeAgents, previewMove, saveMove, previewCommissionerIlStash, commissionerIlStash,
  previewCommissionerIlActivate, commissionerIlActivate, previewOneOffSwap, oneOffSwap,
} from "../api";

const mockFetch = vi.mocked(fetchJsonApi);

function apiError(status: number, body: unknown) {
  return new ApiError({ message: "x", status, url: "/u", requestId: null, body });
}
function lastCall() {
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
  return { url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

beforeEach(() => vi.clearAllMocks());

describe("searchFreeAgents", () => {
  it("returns [] without a request for blank queries", async () => {
    expect(await searchFreeAgents(20, "   ")).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("GETs the season-stats endpoint and maps the real row shape", async () => {
    // Row shape copied from server/src/features/players/routes.ts (player-season-stats)
    mockFetch.mockResolvedValueOnce({
      computedAt: "2026-11-10T00:00:00Z",
      stats: [{
        id: 77, mlb_id: "660271", player_name: "Shohei Ohtani", mlb_full_name: "Shohei Ohtani",
        ogba_team_code: "", ogba_team_name: "", positions: "DH", is_pitcher: false,
        G: 0, AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, AVG: 0, mlb_team: "LAD", mlbTeam: "LAD",
        fantasy_value: undefined, dollar_value: 0, value: 0,
      }, {
        id: 78, mlb_id: "78", player_name: "No Team", positions: "", mlb_team: "", mlbTeam: "",
      }],
    });
    const out = await searchFreeAgents(20, " Ohtani ");
    const { url } = lastCall();
    expect(url).toBe("/api/player-season-stats?leagueId=20&freeAgentsOnly=true&q=Ohtani&take=20");
    expect(out).toEqual([
      { playerId: 77, name: "Shohei Ohtani", pos: "DH", mlbTeam: "LAD", mlbId: 660271 },
      { playerId: 78, name: "No Team", pos: "", mlbTeam: null, mlbId: 78 },
    ]);
  });

  it("drops duplicate player ids (two-way expansion)", async () => {
    const row = { id: 5, mlb_id: "5", player_name: "Two Way", positions: "DH", mlb_team: "LAD" };
    mockFetch.mockResolvedValueOnce({ stats: [row, { ...row, positions: "P" }] });
    expect(await searchFreeAgents(1, "two")).toHaveLength(1);
  });
});

describe("previews", () => {
  it.each([
    ["previewMove", () => previewMove(20, 3, 11, 12), "/api/transactions/claim/preview",
      { leagueId: 20, teamId: 3, playerId: 11, dropPlayerId: 12 }],
    ["previewOneOffSwap", () => previewOneOffSwap(20, 3, 11, 12), "/api/transactions/claim/preview",
      { leagueId: 20, teamId: 3, playerId: 11, dropPlayerId: 12 }],
    ["previewCommissionerIlStash", () => previewCommissionerIlStash(20, 3, 11, 12), "/api/transactions/il-stash/preview",
      { leagueId: 20, teamId: 3, stashPlayerId: 11, addPlayerId: 12 }],
    ["previewCommissionerIlActivate", () => previewCommissionerIlActivate(20, 3, 11, 12), "/api/transactions/il-activate/preview",
      { leagueId: 20, teamId: 3, activatePlayerId: 11, dropPlayerId: 12 }],
  ])("%s POSTs the exact body with no effectiveDate", async (_n, call, url, body) => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    expect(await call()).toEqual({ ok: true });
    const c = lastCall();
    expect(c.url).toBe(url);
    expect(c.method).toBe("POST");
    expect(c.body).toEqual(body);
    expect("effectiveDate" in c.body).toBe(false);
  });

  it("resolves {ok:false,error,code} on a 400 rule failure", async () => {
    mockFetch.mockRejectedValueOnce(apiError(400, { ok: false, error: "Already owned by Doyers", code: "OWNERSHIP_CONFLICT" }));
    expect(await previewMove(20, 3, 11, 12)).toEqual({ ok: false, error: "Already owned by Doyers", code: "OWNERSHIP_CONFLICT" });
  });

  it("resolves {ok:false,error,code} on a 404", async () => {
    mockFetch.mockRejectedValueOnce(apiError(404, { ok: false, error: "Player not found", code: "NOT_FOUND" }));
    expect(await previewCommissionerIlStash(20, 3, 11, 12)).toEqual({ ok: false, error: "Player not found", code: "NOT_FOUND" });
  });

  it("resolves the generic message on a 500", async () => {
    mockFetch.mockRejectedValueOnce(apiError(500, { error: "boom" }));
    expect(await previewMove(20, 3, 11, 12)).toEqual({ ok: false, error: "Couldn't check this move. Try again." });
  });

  it("resolves the generic message on a network error", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await previewCommissionerIlActivate(20, 3, 11, 12)).toEqual({ ok: false, error: "Couldn't check this move. Try again." });
  });
});

describe("mutations", () => {
  it("saveMove always sends effectiveDate", async () => {
    mockFetch.mockResolvedValueOnce({});
    await saveMove(20, 3, 11, 12, "2026-06-15");
    const c = lastCall();
    expect(c.url).toBe("/api/transactions/claim");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ leagueId: 20, teamId: 3, playerId: 11, dropPlayerId: 12, effectiveDate: "2026-06-15" });
  });

  it("oneOffSwap, commissionerIlStash, commissionerIlActivate send no effectiveDate", async () => {
    mockFetch.mockResolvedValue({});
    await oneOffSwap(20, 3, 11, 12);
    expect(lastCall()).toEqual({ url: "/api/transactions/claim", method: "POST", body: { leagueId: 20, teamId: 3, playerId: 11, dropPlayerId: 12 } });
    mockFetch.mockClear();
    await commissionerIlStash(20, 3, 11, 12);
    expect(lastCall()).toEqual({ url: "/api/transactions/il-stash", method: "POST", body: { leagueId: 20, teamId: 3, stashPlayerId: 11, addPlayerId: 12 } });
    mockFetch.mockClear();
    await commissionerIlActivate(20, 3, 11, 12);
    expect(lastCall()).toEqual({ url: "/api/transactions/il-activate", method: "POST", body: { leagueId: 20, teamId: 3, activatePlayerId: 11, dropPlayerId: 12 } });
  });

  it("rejects with the server error text", async () => {
    mockFetch.mockRejectedValueOnce(apiError(400, { error: "Roster is full", code: "ROSTER_FULL" }));
    await expect(saveMove(20, 3, 11, 12, "2026-06-15")).rejects.toThrow("Roster is full");
  });

  it("rejects with 'Save failed' when the body has no error", async () => {
    mockFetch.mockRejectedValueOnce(apiError(500, null));
    await expect(oneOffSwap(20, 3, 11, 12)).rejects.toThrow("Save failed");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the fetchJsonApi boundary for the same reason as
// ../../transactions/__tests__/api.test.ts — the wrappers are thin; we're
// asserting URL + shape, not re-testing auth / error envelopes.
vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn(),
  API_BASE: "/api",
}));

import { fetchJsonApi } from "../../../api/base";
import { getGhostIlSummary } from "../api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getGhostIlSummary", () => {
  it("GETs /api/commissioner/:leagueId/ghost-il and returns the parsed summary", async () => {
    const summary = {
      teams: [
        {
          teamId: 147,
          teamName: "Los Doyers",
          teamCode: "LDY",
          ghosts: [
            {
              rosterId: 3737,
              playerId: 1,
              playerName: "Mookie Betts",
              currentMlbStatus: "Active",
            },
          ],
        },
      ],
      totalTeamsWithGhosts: 1,
      totalGhosts: 1,
    };
    vi.mocked(fetchJsonApi).mockResolvedValue(summary);

    const result = await getGhostIlSummary(20);

    expect(fetchJsonApi).toHaveBeenCalledTimes(1);
    expect(fetchJsonApi).toHaveBeenCalledWith("/api/commissioner/20/ghost-il");
    expect(result).toBe(summary);
  });

  it("interpolates leagueId into the URL (guards against template-string drift)", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      teams: [],
      totalTeamsWithGhosts: 0,
      totalGhosts: 0,
    });

    await getGhostIlSummary(42);

    const [url] = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(url).toBe("/api/commissioner/42/ghost-il");
    expect(url).not.toMatch(/:leagueId/);
    expect(url).not.toMatch(/undefined/);
  });

  it("propagates server errors unchanged", async () => {
    const serverError = new Error("Forbidden");
    vi.mocked(fetchJsonApi).mockRejectedValue(serverError);

    await expect(getGhostIlSummary(20)).rejects.toBe(serverError);
  });

  it("does not pass a second arg — this is a plain GET", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      teams: [],
      totalTeamsWithGhosts: 0,
      totalGhosts: 0,
    });

    await getGhostIlSummary(20);

    const call = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(call.length).toBe(1);
  });
});

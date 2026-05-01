import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the fetchJsonApi boundary for the same reason as
// ../../transactions/__tests__/api.test.ts — the wrappers are thin; we're
// asserting URL + shape, not re-testing auth / error envelopes.
vi.mock("../../../api/base", () => ({
  fetchJsonApi: vi.fn(),
  API_BASE: "/api",
}));

import { fetchJsonApi } from "../../../api/base";
import {
  getGhostIlSummary,
  getIlAudit,
  postBulkIlStash,
  postCleanupDropped,
} from "../api";

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

describe("getIlAudit", () => {
  it("GETs /api/commissioner/:leagueId/il-audit and returns the parsed payload", async () => {
    const payload = {
      rows: [
        {
          teamId: 10, teamName: "Aces", teamCode: "ACE",
          playerId: 100, playerName: "Mike Trout", mlbId: 545361,
          mlbStatus: "Injured 10-Day", assignedPosition: "OF",
        },
      ],
      totalRows: 1, totalTeams: 1,
      fetchedAt: "2026-04-30T00:00:00.000Z",
    };
    vi.mocked(fetchJsonApi).mockResolvedValue(payload);

    const res = await getIlAudit(7);
    expect(fetchJsonApi).toHaveBeenCalledWith("/api/commissioner/7/il-audit");
    expect(res).toBe(payload);
  });

  it("interpolates leagueId into the URL", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({ rows: [], totalRows: 0, totalTeams: 0, fetchedAt: "" });
    await getIlAudit(123);
    const [url] = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(url).toBe("/api/commissioner/123/il-audit");
  });
});

describe("postBulkIlStash", () => {
  it("POSTs entries with method + JSON body", async () => {
    const result = { succeeded: [], failed: [] };
    vi.mocked(fetchJsonApi).mockResolvedValue(result);

    const entries = [
      { teamId: 10, playerId: 100 },
      { teamId: 10, playerId: 101 },
    ];
    const res = await postBulkIlStash(7, entries);
    expect(res).toBe(result);

    const [url, options] = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(url).toBe("/api/commissioner/7/bulk-il-stash");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ entries });
  });
});

describe("postCleanupDropped", () => {
  it("POSTs olderThanDays in the body", async () => {
    const result = { deletedCount: 12, cutoff: "2026-04-01T00:00:00.000Z" };
    vi.mocked(fetchJsonApi).mockResolvedValue(result);

    const res = await postCleanupDropped(7, 30);
    expect(res).toBe(result);

    const [url, options] = vi.mocked(fetchJsonApi).mock.calls[0];
    expect(url).toBe("/api/commissioner/7/cleanup-dropped");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ olderThanDays: 30 });
  });

  it("forwards arbitrary day counts unchanged (no client-side bounds enforcement)", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({ deletedCount: 0, cutoff: "" });
    await postCleanupDropped(1, 365);
    const options = vi.mocked(fetchJsonApi).mock.calls[0][1];
    expect(JSON.parse(options?.body as string)).toEqual({ olderThanDays: 365 });
  });
});

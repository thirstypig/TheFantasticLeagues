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
  getLeagueBalances,
  getLeaguePeriods,
  setPeriodStatus,
  getRosterCheck,
  getCloseReadiness,
  getMovesSinceStart,
  getRecentChanges,
  getUnbilledPeriods,
  previewIlFees,
  billIlFees,
  getAcceptedTradeCount,
  getPeriodStandingsPreview,
  toTeamTotals,
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

describe("getLeagueBalances", () => {
  it("GETs /api/commissioner/:leagueId/balances and unwraps the balances array", async () => {
    // The wrapper returns `resp.balances`, not the envelope. If the server
    // shape changes (or someone returns the array bare), this returns
    // undefined and the Balances tab renders nothing with no error.
    vi.mocked(fetchJsonApi).mockResolvedValue({
      balances: [
        { teamId: 147, teamName: "Los Doyers", balance: 25 },
        { teamId: 148, teamName: "Demolition", balance: 0 },
      ],
    });

    const rows = await getLeagueBalances(20);

    expect(fetchJsonApi).toHaveBeenCalledWith("/api/commissioner/20/balances");
    expect(rows).toEqual([
      { teamId: 147, teamName: "Los Doyers", balance: 25 },
      { teamId: 148, teamName: "Demolition", balance: 0 },
    ]);
  });

  it("passes a negative balance through untouched", async () => {
    // Negative = the league owes the team. The ledger is append-only and the
    // server already returns the NET, so any clamping or Math.abs here would
    // be a second opinion about money (todo #311).
    vi.mocked(fetchJsonApi).mockResolvedValue({
      balances: [{ teamId: 147, teamName: "Los Doyers", balance: -40 }],
    });

    await expect(getLeagueBalances(20)).resolves.toEqual([
      { teamId: 147, teamName: "Los Doyers", balance: -40 },
    ]);
  });
});

describe("hub wrappers", () => {
  const lastCall = () => vi.mocked(fetchJsonApi).mock.calls[0];

  it("getLeaguePeriods GETs /periods?leagueId= and unwraps data", async () => {
    const data = [{ id: 1, name: "P1", startDate: "a", endDate: "b", status: "active" }];
    vi.mocked(fetchJsonApi).mockResolvedValue({ data });
    await expect(getLeaguePeriods(20)).resolves.toBe(data);
    expect(lastCall()[0]).toBe("/api/periods?leagueId=20");
  });

  it("setPeriodStatus PATCHes /periods/:id with body and unwraps data", async () => {
    const period = { id: 7, name: "P7", startDate: "a", endDate: "b", status: "completed" };
    vi.mocked(fetchJsonApi).mockResolvedValue({ data: period });
    await expect(setPeriodStatus(7, { status: "completed", billFees: true })).resolves.toBe(period);
    const [url, opts] = lastCall();
    expect(url).toBe("/api/periods/7");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ status: "completed", billFees: true });
  });

  it("getRosterCheck GETs roster-check", async () => {
    const r = { cap: 23, teams: [] };
    vi.mocked(fetchJsonApi).mockResolvedValue(r);
    await expect(getRosterCheck(20)).resolves.toBe(r);
    expect(lastCall()[0]).toBe("/api/commissioner/20/roster-check");
  });

  it("getCloseReadiness GETs close-readiness for the period", async () => {
    const r = { periodId: 7, name: "P7", status: "active", endDate: "x", lastStatDate: null, ready: false };
    vi.mocked(fetchJsonApi).mockResolvedValue(r);
    await expect(getCloseReadiness(20, 7)).resolves.toBe(r);
    expect(lastCall()[0]).toBe("/api/commissioner/20/periods/7/close-readiness");
  });

  it("getMovesSinceStart GETs moves-since-start and unwraps moves", async () => {
    const moves = [{ id: 1, teamName: "A", playerName: "B", transactionType: "ADD", effDate: "x" }];
    vi.mocked(fetchJsonApi).mockResolvedValue({ moves });
    await expect(getMovesSinceStart(20, 8)).resolves.toBe(moves);
    expect(lastCall()[0]).toBe("/api/commissioner/20/periods/8/moves-since-start");
  });

  it("getRecentChanges passes limit when given, omits it otherwise", async () => {
    const changes = [{ id: 1 }];
    vi.mocked(fetchJsonApi).mockResolvedValue({ changes });
    await expect(getRecentChanges(20, 10)).resolves.toBe(changes);
    expect(lastCall()[0]).toBe("/api/commissioner/20/recent-changes?limit=10");
    vi.clearAllMocks();
    vi.mocked(fetchJsonApi).mockResolvedValue({ changes });
    await getRecentChanges(20);
    expect(lastCall()[0]).toBe("/api/commissioner/20/recent-changes");
  });

  it("getUnbilledPeriods GETs unbilled-periods and unwraps periods", async () => {
    const periods = [{ periodId: 3, closedAt: "x" }];
    vi.mocked(fetchJsonApi).mockResolvedValue({ periods });
    await expect(getUnbilledPeriods(20)).resolves.toBe(periods);
    expect(lastCall()[0]).toBe("/api/commissioner/20/unbilled-periods");
  });

  it("previewIlFees POSTs with dryRun=true", async () => {
    const r = { leagueId: 20, periodId: 7, added: 0, voided: 0, unchanged: 0, dryRun: true, preview: [] };
    vi.mocked(fetchJsonApi).mockResolvedValue(r);
    await expect(previewIlFees(20, 7)).resolves.toBe(r);
    const [url, opts] = lastCall();
    expect(url).toBe("/api/commissioner/20/reconcile-il-fees/7?dryRun=true");
    expect(opts?.method).toBe("POST");
  });

  it("billIlFees POSTs without dryRun", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({ dryRun: false });
    await billIlFees(20, 7);
    const [url, opts] = lastCall();
    expect(url).toBe("/api/commissioner/20/reconcile-il-fees/7");
    expect(url).not.toMatch(/dryRun/);
    expect(opts?.method).toBe("POST");
  });

  it("getAcceptedTradeCount filters status=ACCEPTED and returns trades.length", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({ trades: [{ id: 1 }, { id: 2 }] });
    await expect(getAcceptedTradeCount(20)).resolves.toBe(2);
    expect(lastCall()[0]).toBe("/api/trades?leagueId=20&status=ACCEPTED");
  });

  it("getPeriodStandingsPreview GETs period-category-standings", async () => {
    const r = { periodId: 7, categories: [], teamCount: 0, totalDelta: {}, computedAt: "x" };
    vi.mocked(fetchJsonApi).mockResolvedValue(r);
    await expect(getPeriodStandingsPreview(20, 7)).resolves.toBe(r);
    expect(lastCall()[0]).toBe("/api/standings/period-category-standings?leagueId=20&periodId=7");
  });
});

describe("toTeamTotals", () => {
  it("sums category points per team and sorts by points desc", () => {
    const resp = {
      periodId: 7,
      categories: [
        { key: "R", label: "R", rows: [
          { teamId: 1, teamName: "A", points: 1 },
          { teamId: 2, teamName: "B", points: 2 },
        ] },
        { key: "HR", label: "HR", rows: [
          { teamId: 1, teamName: "A", points: 2 },
          { teamId: 2, teamName: "B", points: 2.5 },
        ] },
      ],
      teamCount: 2,
      totalDelta: {},
      computedAt: "x",
    };
    expect(toTeamTotals(resp)).toEqual([
      { teamName: "B", points: 4.5 },
      { teamName: "A", points: 3 },
    ]);
  });

  it("returns [] when there are no categories", () => {
    expect(toTeamTotals({ periodId: 1, categories: [], teamCount: 0, totalDelta: {}, computedAt: "" })).toEqual([]);
  });
});

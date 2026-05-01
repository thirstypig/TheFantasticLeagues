import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadRosterMovePlayers } from "../loadRosterMovePlayers";

// Tests pinning the contract that closes todo #116 / the bug class flagged
// in MEMORY.md `feedback_partial_browser_verification.md`. Before this
// loader, `setPlayers(getPlayerSeasonStats(...))` was cast straight into
// the panels via `as unknown as RosterMovesPlayer[]` and the drop-dropdown
// filter `(p._dbTeamId === teamId && p._dbPlayerId > 0)` excluded every
// row in production.
//
// Mocks mirror real wire shapes:
//   - `getPlayerSeasonStats` returns rows with `id` (Player.id) and
//     `mlb_id` only — no roster enrichment.
//   - `getTeamDetails` returns `currentRoster` rows with `id` (rosterId),
//     `playerId`, `mlbId`, and `assignedPosition`.
// See MEMORY.md `feedback_test_fixtures.md` — fabricated fields here would
// mask the prod bug. Each fixture below must match a real API response.

vi.mock("../../../../api", () => ({
  getPlayerSeasonStats: vi.fn(),
}));
vi.mock("../../../teams/api", () => ({
  getTeamDetails: vi.fn(),
}));

import { getPlayerSeasonStats } from "../../../../api";
import { getTeamDetails } from "../../../teams/api";

const TEAM_ID = 147;
const LEAGUE_ID = 20;

beforeEach(() => {
  vi.mocked(getPlayerSeasonStats).mockReset();
  vi.mocked(getTeamDetails).mockReset();
});

describe("loadRosterMovePlayers — enriches own-team roster rows", () => {
  it("populates _dbPlayerId, _dbTeamId, assignedPosition for own-team players (matched by mlb_id)", async () => {
    vi.mocked(getPlayerSeasonStats).mockResolvedValueOnce([
      // Own-team player — matches a currentRoster row by mlb_id.
      {
        id: 600,
        mlb_id: "642731",
        player_name: "Michael Busch",
        positions: "1B",
        ogba_team_code: "OGB",
        ogba_team_name: "Test Team",
      },
      // Free agent — no matching roster row.
      {
        id: 999,
        mlb_id: "111222",
        player_name: "Jake Bauers",
        positions: "1B,OF",
      },
      // Another team's player — present in stats with ogba_team_code set
      // but no roster row in OUR team's currentRoster, so no enrichment.
      {
        id: 700,
        mlb_id: "333444",
        player_name: "Other Owner Player",
        positions: "OF",
        ogba_team_code: "ELS",
      },
    ] as any);

    vi.mocked(getTeamDetails).mockResolvedValueOnce({
      team: { id: TEAM_ID, name: "Test Team", code: "OGB" } as any,
      period: null,
      periodStats: [] as any,
      seasonStats: [] as any,
      currentRoster: [
        {
          id: 5001,            // rosterId
          playerId: 600,       // Player.id — matches stats.id
          mlbId: 642731,       // joins stats.mlb_id
          name: "Michael Busch",
          posPrimary: "1B",
          posList: "1B",
          mlbTeam: "LAD",
          acquiredAt: "2026-04-01T00:00:00Z",
          price: 12,
          assignedPosition: "1B",
          isKeeper: false,
          gamesByPos: { "1B": 12 },
          periodStats: null,
        },
      ] as any,
      droppedPlayers: [] as any,
      periodSummaries: [] as any,
      seasonTotal: null as any,
    } as any);

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);

    const busch = result.find((p) => p.player_name === "Michael Busch");
    expect(busch).toBeDefined();
    // The three fields the panels' drop/stash/IL filters require.
    expect(busch?._dbPlayerId).toBe(600);
    expect(busch?._dbTeamId).toBe(TEAM_ID);
    expect(busch?.assignedPosition).toBe("1B");

    const bauers = result.find((p) => p.player_name === "Jake Bauers");
    expect(bauers).toBeDefined();
    // Free agent — no enrichment.
    expect(bauers?._dbPlayerId).toBeUndefined();
    expect(bauers?._dbTeamId).toBeUndefined();

    const other = result.find((p) => p.player_name === "Other Owner Player");
    expect(other).toBeDefined();
    // Player on a DIFFERENT team — must NOT be tagged with our teamId,
    // otherwise the panel would offer it as a drop candidate.
    expect(other?._dbTeamId).toBeUndefined();
    expect(other?._dbPlayerId).toBeUndefined();
  });

  it("preserves free-agent rows when stats has no matching roster row", async () => {
    vi.mocked(getPlayerSeasonStats).mockResolvedValueOnce([
      { id: 999, mlb_id: "111222", player_name: "Jake Bauers" },
    ] as any);
    vi.mocked(getTeamDetails).mockResolvedValueOnce({
      team: { id: TEAM_ID } as any,
      period: null,
      periodStats: [],
      seasonStats: [],
      currentRoster: [],
      droppedPlayers: [],
      periodSummaries: [],
      seasonTotal: null,
    } as any);

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].player_name).toBe("Jake Bauers");
    expect(result[0]._dbPlayerId).toBeUndefined();
  });

  it("returns the stats payload unchanged when getTeamDetails fails", async () => {
    vi.mocked(getPlayerSeasonStats).mockResolvedValueOnce([
      { id: 999, mlb_id: "111222", player_name: "Jake Bauers" },
    ] as any);
    vi.mocked(getTeamDetails).mockRejectedValueOnce(new Error("503"));

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);
    // Loader uses Promise.allSettled — a rejection on getTeamDetails
    // mustn't blow up the page, just leaves players unenriched.
    expect(result).toHaveLength(1);
    expect(result[0]._dbPlayerId).toBeUndefined();
  });

  it("returns an empty array when both endpoints fail", async () => {
    vi.mocked(getPlayerSeasonStats).mockRejectedValueOnce(new Error("503"));
    vi.mocked(getTeamDetails).mockRejectedValueOnce(new Error("503"));

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);
    expect(result).toEqual([]);
  });

  it("coerces string vs number mlb_id when joining (server returns string in stats, number in roster)", async () => {
    // Real API behaviour: getPlayerSeasonStats stringifies mlb_id (the
    // route does `String(p.mlbId ?? p.id)`), while getTeamDetails returns
    // the raw number. The join must tolerate this.
    vi.mocked(getPlayerSeasonStats).mockResolvedValueOnce([
      { id: 600, mlb_id: "642731", player_name: "Michael Busch" },
    ] as any);
    vi.mocked(getTeamDetails).mockResolvedValueOnce({
      team: { id: TEAM_ID } as any,
      period: null,
      periodStats: [],
      seasonStats: [],
      currentRoster: [
        {
          id: 5001,
          playerId: 600,
          mlbId: 642731, // number, not string
          name: "Michael Busch",
          posPrimary: "1B",
          posList: "1B",
          mlbTeam: "LAD",
          acquiredAt: "2026-04-01T00:00:00Z",
          price: 12,
          assignedPosition: "BN",
          isKeeper: false,
          gamesByPos: {},
          periodStats: null,
        },
      ],
      droppedPlayers: [],
      periodSummaries: [],
      seasonTotal: null,
    } as any);

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);
    const busch = result[0];
    expect(busch._dbPlayerId).toBe(600);
    expect(busch.assignedPosition).toBe("BN");
  });

  it("skips currentRoster rows with null mlbId (synthetic players)", async () => {
    // Two-way Ohtani synthetic pitcher row has null mlbId in the DB.
    // Loader must skip joining on those — `String(null)` would otherwise
    // shadow the real row and produce wrong enrichment.
    vi.mocked(getPlayerSeasonStats).mockResolvedValueOnce([
      { id: 600, mlb_id: "642731", player_name: "Real Player" },
    ] as any);
    vi.mocked(getTeamDetails).mockResolvedValueOnce({
      team: { id: TEAM_ID } as any,
      period: null,
      periodStats: [],
      seasonStats: [],
      currentRoster: [
        {
          id: 5001,
          playerId: 1234,
          mlbId: null, // synthetic
          name: "Synthetic Row",
          posPrimary: "P",
          posList: "P",
          mlbTeam: null,
          acquiredAt: "2026-04-01T00:00:00Z",
          price: 1,
          assignedPosition: "P",
          isKeeper: false,
          gamesByPos: {},
          periodStats: null,
        },
      ],
      droppedPlayers: [],
      periodSummaries: [],
      seasonTotal: null,
    } as any);

    const result = await loadRosterMovePlayers(LEAGUE_ID, TEAM_ID);
    // No enrichment applied — the only stats row's mlb_id ("642731") doesn't
    // match the synthetic row's null mlbId.
    expect(result[0]._dbPlayerId).toBeUndefined();
  });
});

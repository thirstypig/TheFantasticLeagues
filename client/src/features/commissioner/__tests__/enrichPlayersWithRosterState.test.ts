import { describe, it, expect } from "vitest";
import { enrichPlayersWithRosterState } from "../lib/enrichPlayersWithRosterState";

// Minimal fixtures that mirror the real API shapes — no fabricated fields.
//   - Roster row: `{ id, teamId, assignedPosition, player: { id } }` per
//     `getCommissionerRosters`.
//   - Player row: `getPlayerSeasonStats` returns rows with `id` (DB
//     Player.id) but does NOT enrich with `_dbTeamId` / `_dbPlayerId` —
//     that's exactly the gap the helper closes.
const teams = [
  { id: 141, name: "Skunk Dogs", code: "SKD" },
  { id: 147, name: "Los Doyers", code: "LDY" },
  // No `code` — exercises the fallback to `name.substring(0,3)`.
  { id: 148, name: "Demolition Lumber Co.", code: null },
];

const rosters = [
  { id: 1001, teamId: 141, assignedPosition: "OF", player: { id: 500 } },
  { id: 1002, teamId: 141, assignedPosition: "IL", player: { id: 501 } },
  { id: 1003, teamId: 147, assignedPosition: "P", player: { id: 502 } },
  { id: 1004, teamId: 148, assignedPosition: "1B", player: { id: 503 } },
];

const players = [
  { id: 500, mlb_id: "100500", player_name: "Byron Buxton", positions: "OF" },
  { id: 501, mlb_id: "100501", player_name: "Bryce Harper", positions: "OF" },
  { id: 502, mlb_id: "100502", player_name: "Shohei Ohtani (Pitcher)", positions: "P" },
  { id: 503, mlb_id: "100503", player_name: "Pete Alonso", positions: "1B" },
  // Free agent — has id from the player table but is NOT on a roster.
  { id: 600, mlb_id: "100600", player_name: "Free Agent", positions: "1B" },
];

describe("enrichPlayersWithRosterState", () => {
  it("returns players unchanged when rosters is empty (early-out)", () => {
    const result = enrichPlayersWithRosterState(players, [], teams);
    expect(result).toBe(players);
  });

  it("adds _dbTeamId, _dbPlayerId, _rosterId, and assignedPosition to roster rows", () => {
    const result = enrichPlayersWithRosterState(players, rosters, teams);
    const skunkBuxton = result.find(p => p.id === 500)!;

    // The exact bug from session 80: `_dbTeamId` was missing, so
    // `players.filter(p => p._dbTeamId === teamId)` matched nothing.
    expect(skunkBuxton._dbTeamId).toBe(141);
    expect(skunkBuxton._dbPlayerId).toBe(500);
    expect(skunkBuxton._rosterId).toBe(1001);
    expect(skunkBuxton.assignedPosition).toBe("OF");
  });

  it("preserves the player's existing assignedPosition when the roster row's is null/undefined", () => {
    const playersWithExistingAssignedPos = [
      { id: 500, mlb_id: "100500", player_name: "Byron Buxton", assignedPosition: "OF-from-player" },
    ];
    const rosterWithNullAssigned = [
      { id: 1001, teamId: 141, assignedPosition: null, player: { id: 500 } },
    ];
    const result = enrichPlayersWithRosterState(
      playersWithExistingAssignedPos,
      rosterWithNullAssigned,
      teams,
    );
    expect(result[0].assignedPosition).toBe("OF-from-player");
  });

  it("uses team.code for ogba_team_code when set", () => {
    const result = enrichPlayersWithRosterState(players, rosters, teams);
    const skunkBuxton = result.find(p => p.id === 500)!;
    expect(skunkBuxton.ogba_team_code).toBe("SKD");
    expect(skunkBuxton.ogba_team_name).toBe("Skunk Dogs");
  });

  it("falls back to name[0..3] when team.code is null/undefined", () => {
    const result = enrichPlayersWithRosterState(players, rosters, teams);
    const dlcAlonso = result.find(p => p.id === 503)!;
    // "Demolition Lumber Co.".substring(0, 3).toUpperCase() === "DEM"
    expect(dlcAlonso.ogba_team_code).toBe("DEM");
    expect(dlcAlonso.ogba_team_name).toBe("Demolition Lumber Co.");
  });

  it("leaves free agents (no roster row) unchanged", () => {
    const result = enrichPlayersWithRosterState(players, rosters, teams);
    const freeAgent = result.find(p => p.id === 600)!;
    expect(freeAgent._dbTeamId).toBeUndefined();
    expect(freeAgent._dbPlayerId).toBeUndefined();
    expect(freeAgent._rosterId).toBeUndefined();
    expect(freeAgent.ogba_team_code).toBeUndefined();
  });

  it("leaves players without a DB id unchanged (no enrichment possible)", () => {
    const playersWithMissingId = [
      { mlb_id: "999999", player_name: "No DB ID Phantom", positions: "OF" },
    ];
    const result = enrichPlayersWithRosterState(playersWithMissingId, rosters, teams);
    expect(result[0]._dbTeamId).toBeUndefined();
    expect(result[0]._dbPlayerId).toBeUndefined();
  });

  it("leaves rows whose teamId isn't in the teams list unchanged", () => {
    // Stray roster pointing at an unknown teamId — the league lookup fails
    // and the player is returned without enrichment rather than crashing.
    const orphanRosters = [
      { id: 9999, teamId: 9999, assignedPosition: "OF", player: { id: 500 } },
    ];
    const result = enrichPlayersWithRosterState(players, orphanRosters, teams);
    const buxton = result.find(p => p.id === 500)!;
    expect(buxton._dbTeamId).toBeUndefined();
    expect(buxton._dbPlayerId).toBeUndefined();
  });

  it("filtering by _dbTeamId after enrichment correctly partitions players by team", () => {
    // The integration assertion — this is what AddDropPanel's drop dropdown
    // actually does. Pre-fix, every team's drop list was empty because
    // _dbTeamId was undefined for everyone. Post-fix, the partition is
    // correct.
    const result = enrichPlayersWithRosterState(players, rosters, teams);
    const skunkPlayers = result.filter(p => p._dbTeamId === 141);
    const doyersPlayers = result.filter(p => p._dbTeamId === 147);
    const dlcPlayers = result.filter(p => p._dbTeamId === 148);

    expect(skunkPlayers.map(p => p.id).sort()).toEqual([500, 501]);
    expect(doyersPlayers.map(p => p.id)).toEqual([502]);
    expect(dlcPlayers.map(p => p.id)).toEqual([503]);
  });
});

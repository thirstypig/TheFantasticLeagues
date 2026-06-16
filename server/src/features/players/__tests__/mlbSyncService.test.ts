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
import { syncAllPlayers, fetchAllTeams, syncPositionEligibility, syncAAARosters, fetchAAATeams } from "../services/mlbSyncService.js";

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

    mockPrisma.player.findMany.mockResolvedValue([]); // no existing players
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

    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 660271, mlbTeam: "LAD" },
      { id: 2, mlbId: 605141, mlbTeam: "LAD" },
    ]);
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
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 660271, mlbTeam: "NYY" },
    ]);
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

    mockPrisma.player.findMany.mockResolvedValue([]);
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

  // ── mlbStatus plumbing (ghost-IL chip wake-up) ───────────────────
  //
  // The 40-man roster API includes `status.description` per entry
  // ("Active", "Injured 10-Day", "Injured 60-Day", "Restricted", …).
  // Per direction-lock IL #1 the value is written verbatim — no
  // normalization. When the API omits the field we preserve the
  // existing Player.mlbStatus rather than blowing it away (same
  // pattern as posList preservation under syncPositionEligibility).

  it("writes mlbStatus verbatim from API on create", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          {
            person: { id: 660271, fullName: "Shohei Ohtani" },
            position: { abbreviation: "DH", type: "Hitter" },
            status: { code: "A", description: "Active" },
          },
          {
            person: { id: 605141, fullName: "Mookie Betts" },
            position: { abbreviation: "SS", type: "Hitter" },
            status: { code: "D10", description: "Injured 10-Day" },
          },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbId: 660271, mlbStatus: "Active" }),
    });
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbId: 605141, mlbStatus: "Injured 10-Day" }),
    });
  });

  it("writes mlbStatus verbatim from API on update", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          {
            person: { id: 660271, fullName: "Shohei Ohtani" },
            position: { abbreviation: "DH", type: "Hitter" },
            status: { code: "D60", description: "Injured 60-Day" },
          },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 660271, mlbTeam: "LAD", posPrimary: "DH", posList: "DH", mlbStatus: "Active" },
    ]);
    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ mlbStatus: "Injured 60-Day" }),
    });
  });

  it("preserves existing mlbStatus when API omits status field (transient gap)", async () => {
    // Simulates the API returning a roster entry without status — the cron
    // shouldn't blow away a known status because of a one-tick API hiccup.
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          {
            person: { id: 660271, fullName: "Shohei Ohtani" },
            position: { abbreviation: "DH", type: "Hitter" },
            // no `status` field
          },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 660271, mlbTeam: "LAD", posPrimary: "DH", posList: "DH", mlbStatus: "Injured 10-Day" },
    ]);
    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    // The update payload must NOT carry an mlbStatus key — preserving the
    // existing value. Other fields (name, mlbTeam, posPrimary) still flow.
    const updateCall = mockPrisma.player.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("mlbStatus");
    expect(updateCall.data).toMatchObject({ name: "Shohei Ohtani", mlbTeam: "LAD" });
  });

  it("preserves existing mlbStatus when API returns empty status.description", async () => {
    // Defense in depth: `status: { code: "A" }` with no description should
    // also fall through to the preservation branch.
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          {
            person: { id: 660271, fullName: "Shohei Ohtani" },
            position: { abbreviation: "DH", type: "Hitter" },
            status: { code: "A" }, // description missing
          },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 660271, mlbTeam: "LAD", posPrimary: "DH", posList: "DH", mlbStatus: "Injured 10-Day" },
    ]);
    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    const updateCall = mockPrisma.player.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty("mlbStatus");
  });

  it.skip("OBSOLETE: Ohtani split — resolves TWP position to DH for two-way players (Ohtani)", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "TWP", type: "Two-Way Player" } },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    await syncAllPlayers(2026);

    // Should store "DH" primary and "DH,P" for posList (two-way player)
    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mlbId: 660271,
        posPrimary: "DH",
        posList: "DH,P",
      }),
    });
  });

  it.skip("OBSOLETE: Ohtani split — resolves TWP position on update for two-way players", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockTeams)
      .mockResolvedValueOnce({
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, position: { abbreviation: "TWP", type: "Two-Way Player" } },
        ],
      });

    mockPrisma.player.findMany.mockResolvedValue([
      { id: 3, mlbId: 660271, mlbTeam: "LAD" },
    ]);
    mockPrisma.player.update.mockResolvedValue({ id: 3 });

    await syncAllPlayers(2026);

    // Should update to "DH" primary and "DH,P" for posList (two-way player)
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: expect.objectContaining({
        posPrimary: "DH",
        posList: "DH,P",
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
          // Real MLB API puts `position` at the split level (alongside `stat`)
          position: { abbreviation: pos.pos },
          stat: { position: { abbreviation: pos.pos }, games: pos.games, gamesPlayed: pos.games },
        })),
      }],
    })),
  });

  it("updates posList based on GP threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "1B", posList: "1B", posGames: null },
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
      data: expect.objectContaining({ posList: "1B,LF" }),
    });
  });

  it("excludes positions below GP threshold", async () => {
    // posGames pre-populated to match API — ensures only posList logic is tested here
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "SS", posList: "SS", posGames: { "2B": 5, SS: 80 } },
    ]);

    // 80 GP at SS, only 5 at 2B (below threshold)
    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SS", games: 80 }, { pos: "2B", games: 5 }] }])
    );

    const result = await syncPositionEligibility(2026, 20);

    // posList stays "SS" — 2B below threshold; posGames unchanged too → true no-op
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });

  it("normalizes SP/RP to P", async () => {
    // posGames pre-populated with raw API keys (SP/RP) to isolate posList logic
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "P", posList: "P", posGames: { RP: 10, SP: 30 } },
    ]);

    mockMlbGetJson.mockResolvedValue(
      makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SP", games: 30 }, { pos: "RP", games: 10 }] }])
    );

    const result = await syncPositionEligibility(2026, 20);

    // SP + RP both normalize to P, which is already primary; posGames unchanged too
    expect(result.unchanged).toBe(1);
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });

  it("always includes primary position even below threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "CF", posList: "CF", posGames: null },
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
      data: expect.objectContaining({ posList: "CF,LF" }),
    });
  });

  it("skips players with no fielding data", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "DH", posList: "DH", posGames: null },
    ]);

    // No fielding data (DH doesn't play the field)
    mockMlbGetJson.mockResolvedValue({ people: [{ id: 12345, stats: [] }] });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });

  it.skip("OBSOLETE: Ohtani split — adds P to posList for two-way players even without fielding data", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 3, mlbId: 660271, posPrimary: "DH", posList: "DH" },
    ]);

    // Ohtani as DH has no fielding stats (DHs don't field)
    mockMlbGetJson.mockResolvedValue({ people: [{ id: 660271, stats: [] }] });

    mockPrisma.player.update.mockResolvedValue({ id: 3 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(1);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { posList: "DH,P" },
    });
  });

  it("aggregates stats across teams for traded players", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "1B", posList: "1B", posGames: null },
    ]);

    // Traded mid-season: 15 GP at OF on team A + 10 GP at OF on team B = 25 total
    mockMlbGetJson.mockResolvedValue({
      people: [{
        id: 12345,
        stats: [{
          group: { displayName: "fielding" },
          splits: [
            { position: { abbreviation: "1B" }, stat: { position: { abbreviation: "1B" }, games: 40 } },
            { position: { abbreviation: "LF" }, stat: { position: { abbreviation: "LF" }, games: 15 } },
            { position: { abbreviation: "LF" }, stat: { position: { abbreviation: "LF" }, games: 10 } },
          ],
        }],
      }],
    });

    mockPrisma.player.update.mockResolvedValue({ id: 1 });

    const result = await syncPositionEligibility(2026, 20);

    expect(result.updated).toBe(1);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ posList: "1B,LF" }),
    });
  });

  it("respects custom GP threshold", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 12345, posPrimary: "SS", posList: "SS", posGames: null },
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
      data: expect.objectContaining({ posList: "SS,2B" }),
    });
  });

  it("handles multiple players in batch", async () => {
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 1, mlbId: 111, posPrimary: "1B", posList: "1B", posGames: null },
      // Player 2 has posGames pre-populated so it's a true no-op
      { id: 2, mlbId: 222, posPrimary: "SS", posList: "SS", posGames: { SS: 100 } },
      { id: 3, mlbId: 333, posPrimary: "CF", posList: "CF", posGames: null },
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

  // ── Rule 2: prior-year 20-GP fallback ─────────────────────────
  //
  // syncPositionEligibility now calls fetchPlayerFieldingStats twice per
  // invocation: once for the current season, once for the prior season
  // (for the OGBA Rule 2 fallback). The existing tests above use
  // mockResolvedValue (sticky), so the second call returns the same data
  // as the first — harmless because set union is idempotent and the
  // existing assertions don't distinguish current vs prior behavior.
  //
  // The tests in this block explicitly mock the two calls separately via
  // mockResolvedValueOnce so prior-year behavior can be asserted.

  describe("Rule 2 — prior-year 20-GP fallback", () => {
    it("fallback fires when current-season fielding is empty", async () => {
      // Player dropped mid-April — 0 GP this year — but played 40 GP at 2B
      // and 22 GP at SS last year. Rule 2 should grant both.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "UT", posList: "UT", posGames: null },
      ]);

      mockMlbGetJson
        // current season: empty fielding
        .mockResolvedValueOnce({ people: [{ id: 12345, stats: [] }] })
        // prior season: 40 GP at 2B, 22 GP at SS
        .mockResolvedValueOnce(
          makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "2B", games: 40 }, { pos: "SS", games: 22 }] }])
        );

      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ posList: "UT,2B,SS" }),
      });
    });

    it("prior-year positions merge additively with current season (no suppression)", async () => {
      // Current season has SS: 5 GP (qualifies at threshold 3). Prior year
      // has 2B: 40 GP. Both should land in posList — Rule 2 is additive,
      // not a fallback-only-when-current-is-empty rule. This matches the
      // Yahoo/ESPN industry convention of persisting prior-year eligibility.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "UT", posList: "UT", posGames: null },
      ]);

      mockMlbGetJson
        .mockResolvedValueOnce(
          makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "SS", games: 5 }] }])
        )
        .mockResolvedValueOnce(
          makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "2B", games: 40 }] }])
        );

      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ posList: "UT,2B,SS" }),
      });
    });

    it("prior-year threshold of 20 GP is respected", async () => {
      // Prior year has 2B: 15 GP (below Rule 2's 20-GP threshold). Current
      // year empty. Result: posList collapses to primary only.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "SS", posList: "SS", posGames: null },
      ]);

      mockMlbGetJson
        .mockResolvedValueOnce({ people: [{ id: 12345, stats: [] }] })
        .mockResolvedValueOnce(
          makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "2B", games: 15 }] }])
        );

      const result = await syncPositionEligibility(2026, 3);

      // posList stays "SS" — below-threshold prior-year position not merged.
      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
    });

    it("fail-closed when prior-season fetch throws — existing posList preserved", async () => {
      // Simulates MLB API rate limit or 5xx on the second (prior-season)
      // call. Plan requires all-or-nothing semantics: no partial fallback.
      // First call succeeds, second throws → fallback is skipped this tick,
      // a warn is logged, cron self-heals next day.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF,1B", posGames: null },
      ]);

      mockMlbGetJson
        // current-season succeeds — 80 GP at OF, 1B not qualifying (0 GP)
        .mockResolvedValueOnce(
          makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "LF", games: 80 }] }])
        )
        // prior-season throws
        .mockRejectedValueOnce(new Error("MLB API timeout"));

      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 20);

      // Sync still completes without raising. Current-season processing
      // applied as normal: posList built from current only.
      // Player's new posList = "OF,LF" (OF is primary, LF qualifies at 80).
      expect(result.updated).toBe(1);
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ posList: "OF,LF" }),
      });
    });

    it("derived-ID pitcher row is filtered out of prior-season fetch", async () => {
      // Ohtani post-split: two player rows — real hitter mlbId 660271 and
      // synthetic pitcher mlbId 1660271 (>= 1M). MLB API doesn't recognize
      // derived IDs and 404s on lookups. The Rule 2 implementation pre-
      // filters mlbIds >= 1_000_000 before the prior-season call to avoid
      // doubling 404s. See docs/solutions/logic-errors/ohtani-two-way-player-split-architecture.md.
      //
      // Two-player fixture: one real (hitter row) + one derived (pitcher row).
      // Asserts the prior-season fetch URL includes only the real ID.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 6, mlbId: 660271, posPrimary: "DH", posList: "DH", posGames: null },
        { id: 7, mlbId: 1660271, posPrimary: "P", posList: "P", posGames: null },
      ]);

      mockMlbGetJson.mockResolvedValue({ people: [] });

      await syncPositionEligibility(2026, 20);

      // Two mlbGetJson calls expected: call[0] = current season, call[1] = prior
      expect(mockMlbGetJson).toHaveBeenCalledTimes(2);
      const currentCallUrl = mockMlbGetJson.mock.calls[0][0] as string;
      const priorCallUrl = mockMlbGetJson.mock.calls[1][0] as string;

      // Current-season URL contains both IDs (no filter on current)
      expect(currentCallUrl).toContain("660271");

      // Prior-season URL: must contain real hitter ID, must NOT contain derived pitcher ID
      expect(priorCallUrl).toContain(`season=${2026 - 1}`);
      expect(priorCallUrl).toContain("660271");
      expect(priorCallUrl).not.toMatch(/[?&,]1660271([&,]|$)/);
    });
  });

  // ── posGames write paths ────────────────────────────────────────
  //
  // Pinning the posGames persistence logic added in PR #378:
  //   - first write (null → populated)
  //   - no-op skip when both posList and posGames unchanged
  //   - empty fielding Map guard (size === 0 → no {} write)
  //   - posGames-only update when only posGames changed
  //   - key-order invariance (JSONB alphabetizes; insertion order must not
  //     produce a false-positive diff)
  //   - corrupt stored value (non-object) treated as null

  describe("posGames write paths", () => {
    it("writes posGames on first sync when column is null", async () => {
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF", posGames: null },
      ]);
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "LF", games: 45 }, { pos: "CF", games: 10 }] }])
      );
      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      // posGames should be written; keys are insertion-order from the API
      const updateCall = mockPrisma.player.update.mock.calls[0][0];
      expect(updateCall.data).toHaveProperty("posGames");
      expect(updateCall.data.posGames).toMatchObject({ LF: 45, CF: 10 });
    });

    it("skips update when posGames and posList are both unchanged", async () => {
      // Stored posGames already matches what the API returns — should be a no-op.
      // posList must already include all qualifying positions (CF + LF at threshold 3)
      // sorted: primary OF first, then alpha CF, LF → "OF,CF,LF"
      mockPrisma.player.findMany.mockResolvedValue([
        {
          id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF,CF,LF",
          // Simulate Postgres alphabetical key order on stored value
          posGames: { CF: 10, LF: 45 },
        },
      ]);
      // MLB API returns same GP counts but in insertion order (reversed)
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "LF", games: 45 }, { pos: "CF", games: 10 }] }])
      );

      const result = await syncPositionEligibility(2026, 3);

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(mockPrisma.player.update).not.toHaveBeenCalled();
    });

    it("empty fielding Map does not write {} to posGames (size === 0 guard)", async () => {
      // Player with no MLB fielding data this season — should not write {}
      // which would corrupt `posGames IS NOT NULL` semantics.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "DH", posList: "DH", posGames: null },
      ]);
      // MLB Stats API returns the player but with no fielding splits
      mockMlbGetJson.mockResolvedValue({ people: [{ id: 12345, stats: [] }] });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(mockPrisma.player.update).not.toHaveBeenCalled();
    });

    it("writes only posGames when posList is unchanged but GP counts changed", async () => {
      // posList already reflects OF + LF eligibility (both above threshold 3).
      // GP count for LF went up since the last cron run → only posGames in update.
      mockPrisma.player.findMany.mockResolvedValue([
        {
          id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF,LF",
          posGames: { LF: 30 },
        },
      ]);
      // Same position, more games now
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "LF", games: 55 }] }])
      );
      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      const updateData = mockPrisma.player.update.mock.calls[0][0].data;
      expect(updateData).toHaveProperty("posGames");
      expect(updateData).not.toHaveProperty("posList"); // posList unchanged
    });

    it("key-order invariance: different insertion order does not trigger re-write", async () => {
      // JSONB stores keys alphabetically: { CF: 10, LF: 45 }
      // API returns in a different order: LF first, CF second
      // sortedJson normalizes both sides — must not detect a change.
      // posList is already "OF,CF,LF" (primary first, then alpha at threshold 3)
      mockPrisma.player.findMany.mockResolvedValue([
        {
          id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF,CF,LF",
          // Postgres alphabetical storage
          posGames: { CF: 10, LF: 45 },
        },
      ]);
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([
          // API returns LF first — insertion order differs from stored order
          { id: 12345, positions: [{ pos: "LF", games: 45 }, { pos: "CF", games: 10 }] },
        ])
      );

      const result = await syncPositionEligibility(2026, 3);

      // posGames identical, posList identical → pure no-op
      expect(result.unchanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(mockPrisma.player.update).not.toHaveBeenCalled();
    });

    it("KNOWN_FIELD_POSITIONS allowlist: filters unknown API keys from posGames", async () => {
      // The MLB Stats API occasionally returns non-standard position keys
      // (e.g. "XB", "TWP", pitch-only codes). KNOWN_FIELD_POSITIONS guards
      // the extraction loop so garbage keys never land in the DB.
      mockPrisma.player.findMany.mockResolvedValue([
        { id: 1, mlbId: 12345, posPrimary: "1B", posList: "1B", posGames: null },
      ]);
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([
          { id: 12345, positions: [{ pos: "1B", games: 50 }, { pos: "XB", games: 30 }, { pos: "TWP", games: 5 }] },
        ])
      );
      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      const updateData = mockPrisma.player.update.mock.calls[0][0].data;
      // Only "1B" (a KNOWN_FIELD_POSITION) should be stored
      expect(updateData.posGames).toEqual({ "1B": 50 });
      expect(updateData.posGames).not.toHaveProperty("XB");
      expect(updateData.posGames).not.toHaveProperty("TWP");
    });

    it("treats corrupt stored posGames (non-object) as null and writes real data", async () => {
      // Defensive: if a bad value somehow landed in the DB (e.g. a string
      // "null" or a plain number), the runtime guard in storedPosGames
      // normalises it to null so the fresh data is always written.
      mockPrisma.player.findMany.mockResolvedValue([
        {
          id: 1, mlbId: 12345, posPrimary: "OF", posList: "OF",
          posGames: "invalid" as unknown as null, // corrupt value
        },
      ]);
      mockMlbGetJson.mockResolvedValue(
        makeMlbFieldingResponse([{ id: 12345, positions: [{ pos: "LF", games: 40 }] }])
      );
      mockPrisma.player.update.mockResolvedValue({ id: 1 });

      const result = await syncPositionEligibility(2026, 3);

      expect(result.updated).toBe(1);
      const updateData = mockPrisma.player.update.mock.calls[0][0].data;
      expect(updateData.posGames).toMatchObject({ LF: 40 });
    });
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

    mockPrisma.player.findMany.mockResolvedValue([]); // no existing players
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
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 5, mlbId: 700001, mlbTeam: "LAD" },
    ]);

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
    mockPrisma.player.findMany.mockResolvedValue([
      { id: 10, mlbId: 804606, mlbTeam: "FA" },
    ]);
    mockPrisma.player.update.mockResolvedValue({ id: 10 });

    const result = await syncAAARosters(2026);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { name: "Konnor Griffin", mlbTeam: "PIT" },  // posPrimary no longer overwritten on update
    });
  });

  it("continues on roster fetch failure", async () => {
    mockMlbGetJson
      .mockResolvedValueOnce(mockMlbTeams)
      .mockResolvedValueOnce(mockAAATeams)
      .mockRejectedValueOnce(new Error("API error")) // OKC fails
      .mockResolvedValueOnce(mockIndRoster);          // IND succeeds

    mockPrisma.player.findMany.mockResolvedValue([]);
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

    mockPrisma.player.findMany.mockResolvedValue([]);
    mockPrisma.player.create.mockResolvedValue({ id: 1 });

    const result = await syncAAARosters(2026);

    expect(mockPrisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mlbTeam: "FA" }),
    });
  });
});

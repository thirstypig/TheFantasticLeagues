import { describe, it, expect, vi, beforeEach } from "vitest";
import { Cache } from "../src/cache.js";
import { RateLimiter } from "../src/rateLimiter.js";
import { MlbClient } from "../src/mlbClient.js";

// ── Mock fetch globally ──────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

// ── Test suite ───────────────────────────────────────────────────

describe("MCP Tools (via MlbClient)", () => {
  let cache: Cache;
  let rateLimiter: RateLimiter;
  let client: MlbClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use in-memory cache (no file path → :memory: SQLite)
    cache = new Cache(":memory:");
    rateLimiter = new RateLimiter(20, 10, 50);
    client = new MlbClient(cache, rateLimiter);
  });

  // ── get-player-info ──────────────────────────────────────────

  describe("getPlayerInfo", () => {
    it("returns player data for a valid ID", async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          people: [{
            id: 660271,
            fullName: "Shohei Ohtani",
            primaryPosition: { abbreviation: "DH" },
            currentTeam: { id: 119, name: "Los Angeles Dodgers" },
            primaryNumber: "17",
            batSide: { code: "L" },
            pitchHand: { code: "R" },
          }],
        })
      );

      const data = (await client.getPlayerInfo(660271)) as any;
      expect(data.people).toHaveLength(1);
      expect(data.people[0].fullName).toBe("Shohei Ohtani");
      expect(data.people[0].currentTeam.name).toBe("Los Angeles Dodgers");
    });

    it("returns empty people array for unknown ID", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [] }));

      const data = (await client.getPlayerInfo(999999)) as any;
      expect(data.people).toHaveLength(0);
    });

    it("caches player info for subsequent calls", async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({ people: [{ id: 660271, fullName: "Ohtani" }] })
      );

      await client.getPlayerInfo(660271);
      await client.getPlayerInfo(660271); // should hit cache

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── get-player-stats ─────────────────────────────────────────

  describe("getPlayerStats", () => {
    it("returns hitting stats for a player", async () => {
      const statsData = {
        stats: [{
          group: { displayName: "Hitting" },
          splits: [{
            season: "2026",
            stat: { avg: ".285", hr: 35, rbi: 102 },
          }],
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(statsData));

      const data = (await client.getPlayerStats(660271, 2026, "hitting")) as any;
      expect(data.stats[0].splits[0].stat.avg).toBe(".285");
      expect(data.stats[0].splits[0].stat.hr).toBe(35);
    });

    it("returns pitching stats when group=pitching", async () => {
      const statsData = {
        stats: [{
          group: { displayName: "Pitching" },
          splits: [{ season: "2026", stat: { era: "2.95", wins: 12 } }],
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(statsData));

      const data = (await client.getPlayerStats(660271, 2026, "pitching")) as any;
      expect(data.stats[0].group.displayName).toBe("Pitching");
      expect(data.stats[0].splits[0].stat.era).toBe("2.95");
    });
  });

  // ── search-players ───────────────────────────────────────────

  describe("searchPlayers", () => {
    it("returns matching players", async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          people: [
            { id: 660271, fullName: "Shohei Ohtani" },
            { id: 123456, fullName: "Shota Imanaga" },
          ],
        })
      );

      const data = (await client.searchPlayers("sho", 5)) as any;
      expect(data.people).toHaveLength(2);
      expect(data.people[0].fullName).toBe("Shohei Ohtani");
    });

    it("returns empty for no matches", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [] }));

      const data = (await client.searchPlayers("zzzzzzz")) as any;
      expect(data.people).toHaveLength(0);
    });
  });

  // ── get-team-roster ──────────────────────────────────────────

  describe("getTeamRoster", () => {
    it("returns roster for a team", async () => {
      const rosterData = {
        roster: [
          { person: { id: 660271, fullName: "Shohei Ohtani" }, jerseyNumber: "17", position: { abbreviation: "DH" } },
          { person: { id: 605141, fullName: "Mookie Betts" }, jerseyNumber: "50", position: { abbreviation: "SS" } },
        ],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(rosterData));

      const data = (await client.getTeamRoster(119, "active")) as any;
      expect(data.roster).toHaveLength(2);
      expect(data.roster[0].person.fullName).toBe("Shohei Ohtani");
    });
  });

  // ── get-mlb-standings ────────────────────────────────────────

  describe("getStandings", () => {
    it("returns standings data", async () => {
      const standingsData = {
        records: [{
          division: { name: "National League West" },
          teamRecords: [
            { team: { name: "Los Angeles Dodgers" }, wins: 95, losses: 67, winningPercentage: ".586" },
          ],
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(standingsData));

      const data = (await client.getStandings(2026)) as any;
      expect(data.records[0].division.name).toBe("National League West");
      expect(data.records[0].teamRecords[0].wins).toBe(95);
    });
  });

  // ── get-mlb-schedule ─────────────────────────────────────────

  describe("getSchedule", () => {
    it("returns schedule for a date", async () => {
      const scheduleData = {
        dates: [{
          date: "2026-06-15",
          games: [
            {
              gamePk: 123,
              teams: {
                away: { team: { name: "San Francisco Giants" } },
                home: { team: { name: "Los Angeles Dodgers" } },
              },
              status: { detailedState: "Final" },
            },
          ],
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(scheduleData));

      const data = (await client.getSchedule("2026-06-15")) as any;
      expect(data.dates[0].games).toHaveLength(1);
      expect(data.dates[0].games[0].teams.home.team.name).toBe("Los Angeles Dodgers");
    });

    it("filters by teamId", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ dates: [{ games: [] }] }));

      await client.getSchedule("2026-06-15", 119);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("teamId=119");
    });
  });

  // ── sync-player-teams ──────────────────────────────────────

  describe("syncPlayerTeams", () => {
    it("maps player IDs to team abbreviations", async () => {
      // First call: getTeams
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          teams: [
            { id: 119, abbreviation: "LAD" },
            { id: 137, abbreviation: "SF" },
          ],
        })
      );
      // Second call: batch people lookup
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          people: [
            { id: 660271, currentTeam: { id: 119 } },
            { id: 605141, currentTeam: { id: 119 } },
          ],
        })
      );

      const result = await client.syncPlayerTeams([660271, 605141]);
      expect(result).toEqual({ 660271: "LAD", 605141: "LAD" });
    });

    it("skips players with no current team", async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({ teams: [{ id: 119, abbreviation: "LAD" }] })
      );
      mockFetch.mockReturnValueOnce(
        jsonResponse({ people: [{ id: 999, currentTeam: undefined }] })
      );

      const result = await client.syncPlayerTeams([999]);
      expect(result).toEqual({});
    });

    it("batches player IDs into groups of 50", async () => {
      const teamIds = Array.from({ length: 60 }, (_, i) => i + 1);

      // getTeams
      mockFetch.mockReturnValueOnce(
        jsonResponse({ teams: [{ id: 119, abbreviation: "LAD" }] })
      );
      // Batch 1: 50 players
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [] }));
      // Batch 2: 10 players
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [] }));

      await client.syncPlayerTeams(teamIds);

      // 1 for teams + 2 for player batches = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ── cache-status (cache.stats / cache.clear) ──────────────

  describe("cache stats and clear", () => {
    it("returns stats after caching entries", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }));
      await client.getPlayerInfo(1);

      const stats = cache.stats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(1);
      expect(stats.hitRate).toBeDefined();
    });

    it("clears cache and resets counts", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }));
      await client.getPlayerInfo(1);

      const deleted = cache.clear();
      expect(deleted).toBe(1);

      const stats = cache.stats();
      expect(stats.totalEntries).toBe(0);
    });
  });
});

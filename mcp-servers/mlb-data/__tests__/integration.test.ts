import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Cache } from "../src/cache.js";
import { RateLimiter } from "../src/rateLimiter.js";
import { MlbClient, TTL, resetCircuitBreaker } from "../src/mlbClient.js";

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

// ── Integration Tests ────────────────────────────────────────────

describe("MCP Integration", () => {
  let cache: Cache;
  let rateLimiter: RateLimiter;
  let client: MlbClient;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCircuitBreaker();
    cache = new Cache(":memory:");
    rateLimiter = new RateLimiter(20, 10, 50);
    client = new MlbClient(cache, rateLimiter);
  });

  afterEach(() => {
    cache.close();
    rateLimiter.destroy();
  });

  // ── Tool Registry Completeness ───────────────────────────────

  describe("tool registry completeness", () => {
    const EXPECTED_TOOLS = [
      "getPlayerInfo",
      "getPlayerStats",
      "searchPlayers",
      "getTeamRoster",
      "getStandings",
      "getSchedule",
      "getTeams",
      "syncPlayerTeams",
    ];

    for (const method of EXPECTED_TOOLS) {
      it(`MlbClient exposes ${method}()`, () => {
        expect(typeof (client as Record<string, unknown>)[method]).toBe("function");
      });
    }

    it("exposes getJson() for custom queries", () => {
      expect(typeof client.getJson).toBe("function");
    });
  });

  // ── TTL Configuration ────────────────────────────────────────

  describe("TTL configuration", () => {
    it("defines TTL for all endpoint types", () => {
      expect(TTL.TEAMS).toBe(86400);        // 24h
      expect(TTL.PLAYER_INFO).toBe(86400);  // 24h
      expect(TTL.PLAYER_STATS).toBe(3600);  // 1h
      expect(TTL.ROSTER).toBe(21600);       // 6h
      expect(TTL.STANDINGS).toBe(900);      // 15min
      expect(TTL.SCHEDULE).toBe(300);       // 5min
    });
  });

  // ── Cache Round-Trip ─────────────────────────────────────────

  describe("cache round-trip", () => {
    it("fetches from API on first call, cache on second", async () => {
      const playerData = {
        people: [{ id: 660271, fullName: "Shohei Ohtani" }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(playerData));

      // First call — cache miss, hits API
      const result1 = await client.getPlayerInfo(660271);
      expect(result1).toEqual(playerData);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call — cache hit, no API call
      const result2 = await client.getPlayerInfo(660271);
      expect(result2).toEqual(playerData);
      expect(mockFetch).toHaveBeenCalledTimes(1); // still 1

      // Verify cache stats reflect the hit
      const stats = cache.stats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.hitRate).toBe("50.0%"); // 1 hit, 1 miss
    });

    it("caches different tools independently", async () => {
      const playerData = { people: [{ id: 1, fullName: "Player A" }] };
      const statsData = { stats: [{ group: { displayName: "Hitting" }, splits: [] }] };
      const rosterData = { roster: [{ person: { id: 1 } }] };

      mockFetch
        .mockReturnValueOnce(jsonResponse(playerData))
        .mockReturnValueOnce(jsonResponse(statsData))
        .mockReturnValueOnce(jsonResponse(rosterData));

      await client.getPlayerInfo(1);
      await client.getPlayerStats(1, 2026, "hitting");
      await client.getTeamRoster(119, "active");

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // All three should now be cached
      await client.getPlayerInfo(1);
      await client.getPlayerStats(1, 2026, "hitting");
      await client.getTeamRoster(119, "active");

      // No additional API calls
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const stats = cache.stats();
      expect(stats.totalEntries).toBe(3);
    });

    it("re-fetches after cache invalidation", async () => {
      const data1 = { people: [{ id: 1, fullName: "Old Name" }] };
      const data2 = { people: [{ id: 1, fullName: "New Name" }] };

      mockFetch
        .mockReturnValueOnce(jsonResponse(data1))
        .mockReturnValueOnce(jsonResponse(data2));

      await client.getPlayerInfo(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Invalidate all people entries
      cache.invalidate("people");

      // Should re-fetch
      const result = (await client.getPlayerInfo(1)) as { people: Array<{ fullName: string }> };
      expect(result.people[0].fullName).toBe("New Name");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("re-fetches after cache.clear()", async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }))
        .mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }));

      await client.getPlayerInfo(1);
      cache.clear();
      await client.getPlayerInfo(1);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Rate Limiter Integration ─────────────────────────────────

  describe("rate limiter integration", () => {
    it("rate limiter is consulted for cache misses", async () => {
      mockFetch.mockReturnValue(jsonResponse({ people: [] }));

      // Make 5 unique requests (all cache misses)
      for (let i = 0; i < 5; i++) {
        await client.getPlayerInfo(i);
      }

      expect(rateLimiter.totalRequests).toBe(5);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("rate limiter is NOT consulted for cache hits", async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }));

      await client.getPlayerInfo(1); // miss — consults rate limiter
      const initialRequests = rateLimiter.totalRequests;

      await client.getPlayerInfo(1); // hit — skips rate limiter

      expect(rateLimiter.totalRequests).toBe(initialRequests); // no change
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── End-to-End Tool Scenarios ────────────────────────────────

  describe("end-to-end tool scenarios", () => {
    it("search then get detail flow", async () => {
      // Step 1: Search for player
      const searchResult = {
        people: [
          { id: 660271, fullName: "Shohei Ohtani" },
          { id: 123456, fullName: "Shota Imanaga" },
        ],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(searchResult));

      const search = (await client.searchPlayers("sho")) as { people: Array<{ id: number }> };
      expect(search.people).toHaveLength(2);

      // Step 2: Get detail for the first result
      const playerDetail = {
        people: [{
          id: 660271,
          fullName: "Shohei Ohtani",
          primaryPosition: { abbreviation: "DH" },
          currentTeam: { id: 119, name: "Los Angeles Dodgers" },
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(playerDetail));

      const detail = (await client.getPlayerInfo(search.people[0].id)) as {
        people: Array<{ fullName: string; currentTeam: { name: string } }>;
      };
      expect(detail.people[0].fullName).toBe("Shohei Ohtani");
      expect(detail.people[0].currentTeam.name).toBe("Los Angeles Dodgers");

      // Step 3: Get stats
      const statsResult = {
        stats: [{
          group: { displayName: "Hitting" },
          splits: [{ season: "2026", stat: { avg: ".285", hr: 35 } }],
        }],
      };
      mockFetch.mockReturnValueOnce(jsonResponse(statsResult));

      const stats = (await client.getPlayerStats(660271, 2026)) as {
        stats: Array<{ splits: Array<{ stat: { avg: string; hr: number } }> }>;
      };
      expect(stats.stats[0].splits[0].stat.avg).toBe(".285");
    });

    it("syncPlayerTeams maps IDs to team abbreviations via cache", async () => {
      // Teams call
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          teams: [
            { id: 119, abbreviation: "LAD" },
            { id: 137, abbreviation: "SF" },
          ],
        })
      );
      // People batch call
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          people: [
            { id: 660271, currentTeam: { id: 119 } },
            { id: 605141, currentTeam: { id: 119 } },
            { id: 700001, currentTeam: { id: 137 } },
          ],
        })
      );

      const result = await client.syncPlayerTeams([660271, 605141, 700001]);
      expect(result).toEqual({
        660271: "LAD",
        605141: "LAD",
        700001: "SF",
      });

      // Second call with same player IDs — teams are cached, people batch is cached
      const result2 = await client.syncPlayerTeams([660271, 605141, 700001]);
      expect(result2).toEqual(result);

      // Only 2 fetch calls total (teams + batch), not 4
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("standings and schedule use short TTLs", async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse({ records: [] }))
        .mockReturnValueOnce(jsonResponse({ dates: [] }));

      await client.getStandings(2026);
      await client.getSchedule("2026-06-15");

      // Both should be cached
      await client.getStandings(2026);
      await client.getSchedule("2026-06-15");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe("error handling", () => {
    it("propagates API errors to the caller", async () => {
      mockFetch.mockReturnValue(
        Promise.reject(new Error("Network error"))
      );

      await expect(client.getPlayerInfo(1)).rejects.toThrow();
    });
  });

  // ── Cache Stats ──────────────────────────────────────────────

  describe("cache stats accuracy", () => {
    it("tracks hits, misses, entries, and size across multiple tools", async () => {
      mockFetch
        .mockReturnValueOnce(jsonResponse({ people: [{ id: 1 }] }))
        .mockReturnValueOnce(jsonResponse({ roster: [{ person: { id: 1 } }] }));

      // 2 misses
      await client.getPlayerInfo(1);
      await client.getTeamRoster(119);

      // 2 hits
      await client.getPlayerInfo(1);
      await client.getTeamRoster(119);

      const stats = cache.stats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.hitRate).toBe("50.0%"); // 2 hits / 4 total
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeTypeOf("number");
    });
  });
});

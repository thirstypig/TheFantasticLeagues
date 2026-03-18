import { Cache } from "./cache.js";
import { RateLimiter } from "./rateLimiter.js";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

// Circuit breaker state
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000;

/** TTL presets in seconds */
export const TTL = {
  TEAMS: 86400,       // 24h
  PLAYER_INFO: 86400, // 24h
  PLAYER_STATS: 3600, // 1h (during season: override to 900 for live)
  ROSTER: 21600,      // 6h
  STANDINGS: 900,     // 15min
  SCHEDULE: 300,      // 5min
} as const;

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  if (consecutiveFailures >= CIRCUIT_THRESHOLD && Date.now() < circuitOpenUntil) {
    throw new Error(`MLB API circuit breaker open (${consecutiveFailures} consecutive failures)`);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        consecutiveFailures = 0;
        return res;
      }
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`MLB API ${res.status}: ${url}`);
      }
      lastError = new Error(`MLB API ${res.status}: ${url}`);
    } catch (err) {
      lastError = err as Error;
      if ((err as Error).name === "AbortError" || (err as Error).name === "TimeoutError") {
        lastError = new Error(`MLB API timeout: ${url}`);
      }
    }

    if (attempt < retries - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
  }

  throw lastError || new Error(`MLB API failed after ${retries} retries`);
}

/**
 * MLB API client with persistent SQLite cache and rate limiting.
 */
export class MlbClient {
  constructor(
    private cache: Cache,
    private rateLimiter: RateLimiter
  ) {}

  /**
   * Fetch JSON from MLB API with caching and rate limiting.
   */
  async getJson(urlPath: string, ttlSeconds: number): Promise<unknown> {
    const url = urlPath.startsWith("http") ? urlPath : `${MLB_BASE}${urlPath}`;

    // Check cache first (no rate limit cost)
    const cached = this.cache.get(url);
    if (cached !== null) return cached;

    // Acquire rate limit token
    await this.rateLimiter.acquire();

    // Fetch from MLB API
    const res = await fetchWithRetry(url);
    const data = await res.json();

    // Store in cache
    this.cache.set(url, data, ttlSeconds);

    return data;
  }

  /** Convenience: get player info */
  async getPlayerInfo(playerId: number): Promise<unknown> {
    return this.getJson(`/people/${playerId}?hydrate=currentTeam`, TTL.PLAYER_INFO);
  }

  /** Convenience: get player season stats */
  async getPlayerStats(
    playerId: number,
    season?: number,
    group: "hitting" | "pitching" = "hitting"
  ): Promise<unknown> {
    const yr = season ?? new Date().getFullYear();
    return this.getJson(
      `/people/${playerId}/stats?stats=season&season=${yr}&group=${group}`,
      TTL.PLAYER_STATS
    );
  }

  /** Convenience: search players by name */
  async searchPlayers(query: string, limit = 10): Promise<unknown> {
    return this.getJson(
      `/people/search?names=${encodeURIComponent(query)}&limit=${limit}`,
      TTL.PLAYER_STATS
    );
  }

  /** Convenience: get team roster */
  async getTeamRoster(
    teamId: number,
    rosterType: "40Man" | "active" = "active"
  ): Promise<unknown> {
    return this.getJson(`/teams/${teamId}/roster?rosterType=${rosterType}`, TTL.ROSTER);
  }

  /** Convenience: get MLB standings */
  async getStandings(season?: number, leagueId?: number): Promise<unknown> {
    const yr = season ?? new Date().getFullYear();
    let url = `/standings?leagueId=${leagueId ?? "103,104"}&season=${yr}`;
    return this.getJson(url, TTL.STANDINGS);
  }

  /** Convenience: get MLB schedule */
  async getSchedule(date?: string, teamId?: number): Promise<unknown> {
    const d = date ?? new Date().toISOString().slice(0, 10);
    let url = `/schedule?sportId=1&date=${d}`;
    if (teamId) url += `&teamId=${teamId}`;
    return this.getJson(url, TTL.SCHEDULE);
  }

  /** Convenience: get all 30 MLB teams */
  async getTeams(): Promise<unknown> {
    return this.getJson("/teams?sportId=1", TTL.TEAMS);
  }

  /** Batch: resolve player IDs to current team abbreviations */
  async syncPlayerTeams(playerIds: number[]): Promise<Record<number, string>> {
    const teamsData = (await this.getTeams()) as { teams?: Array<{ id: number; abbreviation: string }> };
    const teamMap = new Map<number, string>();
    for (const t of teamsData.teams ?? []) {
      teamMap.set(t.id, t.abbreviation);
    }

    const result: Record<number, string> = {};
    // Batch into groups of 50
    for (let i = 0; i < playerIds.length; i += 50) {
      const batch = playerIds.slice(i, i + 50);
      const url = `/people?personIds=${batch.join(",")}`;
      const data = (await this.getJson(url, TTL.PLAYER_INFO)) as {
        people?: Array<{ id: number; currentTeam?: { id: number } }>;
      };
      for (const p of data.people ?? []) {
        const teamAbbr = p.currentTeam?.id ? teamMap.get(p.currentTeam.id) : undefined;
        if (teamAbbr) result[p.id] = teamAbbr;
      }
    }
    return result;
  }
}

/** Reset circuit breaker (for testing) */
export function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}


import { logger } from './logger.js';
import { chunk } from './utils.js';
import { cacheGet, cacheSet } from './mlbCache.js';

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/** Default cache TTL in seconds (10 minutes, same as previous in-memory TTL) */
const DEFAULT_TTL = 600;

/** Longer TTL for team/player mappings (24 hours — rarely changes) */
const TEAM_MAP_TTL = 86400;

// Circuit breaker state
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 60_000; // 1 minute

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  // Circuit breaker check
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
      // Don't retry 4xx errors
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`MLB API error ${res.status} for ${url}`);
      }
      lastError = new Error(`MLB API error ${res.status} for ${url}`);
    } catch (err) {
      lastError = err as Error;
      if ((err as Error).name === "AbortError" || (err as Error).name === "TimeoutError") {
        lastError = new Error(`MLB API timeout for ${url}`);
      }
    }

    if (attempt < retries - 1) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      logger.warn({ url, attempt: attempt + 1, delay }, "MLB API retry");
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
    logger.error({ failures: consecutiveFailures }, "MLB API circuit breaker opened");
  }

  throw lastError || new Error(`MLB API failed after ${retries} retries`);
}

export async function mlbGetJson<T = any>(url: string, ttlSeconds = DEFAULT_TTL): Promise<T> {
  const cached = cacheGet(url);
  if (cached !== null) return cached as T;

  const res = await fetchWithRetry(url);
  const data = await res.json() as T;
  cacheSet(url, data, ttlSeconds);
  return data;
}

export async function fetchMlbTeamsMap(): Promise<Record<number, string>> {
  const url = `${MLB_BASE}/teams?sportId=1`;
  const data = await mlbGetJson(url, TEAM_MAP_TTL);
  const map: Record<number, string> = {};
  for (const t of data.teams || []) {
    map[t.id] = t.abbreviation || t.teamCode || t.name;
  }
  return map;
}

/**
 * Resolve MLB player IDs to their current team abbreviations.
 * Uses the shared SQLite cache (via mlbGetJson) — no separate JSON file needed.
 */
export async function warmMlbTeamCache(mlbIds: string[]): Promise<Record<string, string>> {
  if (mlbIds.length === 0) return {};

  const teamsMap = await fetchMlbTeamsMap();
  const result: Record<string, string> = {};
  const batches = chunk(mlbIds, 50);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const url = `${MLB_BASE}/people?personIds=${batch.join(",")}`;
    const data = await mlbGetJson(url, TEAM_MAP_TTL);

    for (const p of data.people || []) {
      const id = String(p.id);
      const teamId = p.currentTeam?.id;
      if (teamId && teamsMap[teamId]) {
        result[id] = teamsMap[teamId];
      }
    }

    if (batches.length > 1) {
      logger.info({ batch: i + 1, total: batches.length }, "Team cache progress");
    }
  }

  return result;
}

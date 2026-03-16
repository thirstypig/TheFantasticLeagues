// server/src/data/mlbTeamCache.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

type CacheFile = {
  createdAt: string;
  map: Record<string, string>; // mlb_id -> team abbr
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`MLB API ${resp.status} for ${url}`);
  return resp.json();
}

/**
 * Build a map of MLB teamId -> abbreviation (e.g. 119 -> "LAD").
 */
async function getTeamIdToAbbr(): Promise<Map<number, string>> {
  // sportId=1 is MLB
  const url = `${MLB_BASE}/teams?sportId=1`;
  const data = await fetchJson(url);

  const m = new Map<number, string>();
  const obj = data as Record<string, unknown>;
  const teams = (Array.isArray(obj?.teams) ? obj.teams : []) as Array<Record<string, unknown>>;
  for (const t of teams) {
    const id = Number(t?.id);
    const abbr = String(t?.abbreviation ?? "").trim();
    if (Number.isFinite(id) && abbr) m.set(id, abbr);
  }
  return m;
}

/**
 * Batch fetch people (many ids at once) and read currentTeam.id.
 * We convert team id to abbrev via teamIdToAbbr.
 */
async function fetchPeopleTeamAbbrBatch(
  personIds: string[],
  teamIdToAbbr: Map<number, string>
): Promise<Record<string, string>> {
  const ids = personIds.map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length) return {};

  // hydrate=currentTeam ensures currentTeam is included
  const url = `${MLB_BASE}/people?personIds=${encodeURIComponent(ids.join(","))}&hydrate=currentTeam`;
  const data = await fetchJson(url) as Record<string, unknown>;
  const people = (Array.isArray(data?.people) ? data.people : []) as Array<Record<string, unknown>>;

  const out: Record<string, string> = {};
  for (const p of people) {
    const mlbId = String(p?.id ?? "").trim();
    const ct = p?.currentTeam as Record<string, unknown> | undefined;
    const teamId = Number(ct?.id);
    const abbr = Number.isFinite(teamId) ? (teamIdToAbbr.get(teamId) ?? "") : "";
    if (mlbId) out[mlbId] = abbr;
  }
  return out;
}

export function defaultCachePath(): string {
  // Try default location first
  const primaryPath = path.join(__dirname, "mlb_team_cache.json");
  
  try {
    // Check if we can write here
    const testFile = path.join(__dirname, ".write_test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    return primaryPath;
  } catch (e) {
    // If not writable, use /tmp (common across systems)
    logger.warn({}, "[mlb_team_cache] Primary data directory is not writable. Using fallback /tmp/mlb_team_cache.json");
    return "/tmp/mlb_team_cache.json";
  }
}

export function loadTeamCache(cachePath = defaultCachePath()): Map<string, string> {
  try {
    if (!fs.existsSync(cachePath)) return new Map();
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as CacheFile;

    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed?.map ?? {})) {
      const id = String(k).trim();
      const abbr = String(v ?? "").trim();
      if (id) m.set(id, abbr);
    }
    return m;
  } catch (err: unknown) {
    logger.warn({ error: err instanceof Error ? err.message : "unknown error" }, "[mlb_team_cache] Load failed. Defaulting to empty map.");
    return new Map();
  }
}

export function saveTeamCache(map: Map<string, string>, cachePath = defaultCachePath()) {
  try {
    const obj: CacheFile = {
      createdAt: new Date().toISOString(),
      map: Object.fromEntries(map.entries()),
    };
    fs.writeFileSync(cachePath, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err: unknown) {
    logger.error({ error: String(err) }, `[mlb_team_cache] Save failed to ${cachePath}`);
  }
}

/**
 * Warm the cache ONCE.
 * - Loads existing cache from disk.
 * - Fetches missing ids in batches.
 * - Saves updated cache back to disk.
 */
export async function warmTeamCacheOnce(
  mlbIds: string[],
  cachePath = defaultCachePath()
): Promise<Map<string, string>> {
  const cache = loadTeamCache(cachePath);

  const uniq = Array.from(new Set(mlbIds.map((x) => String(x).trim()).filter(Boolean)));
  const missing = uniq.filter((id) => !cache.has(id));

  if (!missing.length) {
    return cache;
  }

  logger.info({ missingCount: missing.length }, "[mlb_team_cache] Warming cache for missing ids");

  const teamIdToAbbr = await getTeamIdToAbbr();

  // Keep batches modest to avoid URL length and throttling.
  const batches = chunk(missing, 50);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const map = await fetchPeopleTeamAbbrBatch(batch, teamIdToAbbr);
      for (const [id, abbr] of Object.entries(map)) cache.set(id, String(abbr ?? "").trim());

      logger.info({ batch: i + 1, total: batches.length }, "[mlb_team_cache] Batch done");
      // gentle spacing between batches
      await sleep(150);
    } catch (e: unknown) {
      logger.warn({ batch: i + 1, total: batches.length, error: e instanceof Error ? e.message : String(e) }, "[mlb_team_cache] Batch failed");
      // continue; worst case, some ids remain blank
    }
  }

  saveTeamCache(cache, cachePath);
  logger.info({ cachePath }, "[mlb_team_cache] Saved cache");

  return cache;
}

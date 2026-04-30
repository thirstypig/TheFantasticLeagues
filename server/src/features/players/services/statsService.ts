// server/src/features/players/services/statsService.ts
//
// Extracted from players/routes.ts (CR-15) — last-season MLB stats fetching,
// CSV fallback, player values loading, and two-way player expansion.

import fs from "fs";
import path from "path";
import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { logger } from "../../../lib/logger.js";
import { parseCsv, chunk, parseIP } from "../../../lib/utils.js";
import { TWO_WAY_PLAYERS } from "../../../lib/sportConfig.js";

// --- Last-Season Stats (2025) from MLB API ---

export type SeasonStatEntry = {
  G: number;
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number; AVG: number;
  GS_HR: number; // grand slams
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number; ERA: number; WHIP: number;
  SHO: number; // shutouts

  // Batting — extended (todo #114; surfaced for MVP/agent consumers)
  BB: number;   // walks (baseOnBalls)
  HBP: number;  // hit by pitch
  SF: number;   // sacrifice flies
  TB: number;   // total bases
  DBL: number;  // doubles
  TPL: number;  // triples
  SO: number;   // strikeouts (batting)
  OBP: number;  // on-base %
  SLG: number;  // slugging %
  OPS: number;  // OBP + SLG

  // Pitching — extended (todo #114; surfaced for Cy Young/agent consumers)
  L: number;    // losses
  GS: number;   // games started
  K9: number;   // strikeouts per 9 innings
  BB9: number;  // walks per 9 innings
  HR_A: number; // home runs allowed
  BF: number;   // batters faced
};

const LAST_SEASON = 2025;
let lastSeasonCache: Map<string, SeasonStatEntry> | null = null;
let lastSeasonPromise: Promise<Map<string, SeasonStatEntry>> | null = null;

/** Parse hitting/pitching stats from an MLB API person object into our flat format */
function emptySeasonStatEntry(): SeasonStatEntry {
  return {
    G: 0, R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, AVG: 0, GS_HR: 0,
    W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0, ERA: 0, WHIP: 0, SHO: 0,
    BB: 0, HBP: 0, SF: 0, TB: 0, DBL: 0, TPL: 0, SO: 0, OBP: 0, SLG: 0, OPS: 0,
    L: 0, GS: 0, K9: 0, BB9: 0, HR_A: 0, BF: 0,
  };
}

function parseSeasonStats(person: any): SeasonStatEntry {
  const entry: SeasonStatEntry = emptySeasonStatEntry();
  if (!person.stats) return entry;

  for (const statGroup of person.stats) {
    const groupName = statGroup.group?.displayName?.toLowerCase();
    const split = statGroup.splits?.[0]?.stat;
    if (!split) continue;

    if (groupName === "hitting") {
      entry.G = Math.max(entry.G, split.gamesPlayed || 0);
      entry.AB = split.atBats || 0;
      entry.H = split.hits || 0;
      entry.R = split.runs || 0;
      entry.HR = split.homeRuns || 0;
      entry.RBI = split.rbi || 0;
      entry.SB = split.stolenBases || 0;
      entry.AVG = entry.AB > 0 ? entry.H / entry.AB : 0;
      entry.GS_HR = split.grandSlams || 0;

      // Extended batting fields (todo #114)
      entry.BB = split.baseOnBalls || 0;
      entry.HBP = split.hitByPitch || 0;
      entry.SF = split.sacFlies || 0;
      entry.TB = split.totalBases || 0;
      entry.DBL = split.doubles || 0;
      entry.TPL = split.triples || 0;
      entry.SO = split.strikeOuts || 0;
      // MLB API can return OBP/SLG/OPS as strings (".342") — coerce safely
      const obp = Number(split.obp);
      const slg = Number(split.slg);
      const ops = Number(split.ops);
      entry.OBP = Number.isFinite(obp) ? obp : 0;
      entry.SLG = Number.isFinite(slg) ? slg : 0;
      entry.OPS = Number.isFinite(ops) ? ops : 0;
    } else if (groupName === "pitching") {
      entry.G = Math.max(entry.G, split.gamesPlayed || 0);
      entry.W = split.wins || 0;
      entry.SV = split.saves || 0;
      entry.K = split.strikeOuts || 0;
      const ip = split.inningsPitched ? parseIP(split.inningsPitched) : 0;
      const er = split.earnedRuns || 0;
      const bbH = (split.baseOnBalls || 0) + (split.hitsAllowed ?? split.hits ?? 0);
      entry.IP = ip;
      entry.ER = er;
      entry.BB_H = bbH;
      entry.ERA = ip > 0 ? (er / ip) * 9 : 0;
      entry.WHIP = ip > 0 ? bbH / ip : 0;
      entry.SHO = split.shutouts || 0;

      // Extended pitching fields (todo #114)
      entry.L = split.losses || 0;
      entry.GS = split.gamesStarted || 0;
      entry.HR_A = split.homeRuns || 0; // for pitching group, HR = HR allowed
      entry.BF = split.battersFaced || 0;
      // K/9 and BB/9: prefer MLB-provided fields, else compute from IP
      const k9 = Number(split.strikeoutsPer9Inn);
      const bb9 = Number(split.walksPer9Inn);
      entry.K9 = Number.isFinite(k9) ? k9 : (ip > 0 ? (entry.K * 9) / ip : 0);
      entry.BB9 = Number.isFinite(bb9) ? bb9 : (ip > 0 ? ((split.baseOnBalls || 0) * 9) / ip : 0);
    }
  }
  return entry;
}

/** Load 2025 stats from CSV as immediate fallback (covers ~139 rostered players) */
function loadCsvFallback(): Map<string, SeasonStatEntry> {
  const m = new Map<string, SeasonStatEntry>();
  const filePath = path.join(process.cwd(), "src", "data", "ogba_player_season_totals_2025.csv");
  if (!fs.existsSync(filePath)) return m;

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));
  for (const row of rows) {
    const r = row as Record<string, string>;
    const mlbId = (r["mlb_id"] ?? "").trim();
    if (!mlbId) continue;
    const entry = emptySeasonStatEntry();
    entry.G = Number(r["G"]) || 0;
    entry.R = Number(r["R"]) || 0; entry.HR = Number(r["HR"]) || 0; entry.RBI = Number(r["RBI"]) || 0;
    entry.SB = Number(r["SB"]) || 0; entry.H = Number(r["H"]) || 0; entry.AB = Number(r["AB"]) || 0;
    entry.AVG = Number(r["AVG"]) || 0; entry.GS_HR = Number(r["GS_HR"]) || 0;
    entry.W = Number(r["W"]) || 0; entry.SV = Number(r["SV"]) || 0;
    entry.K = Number(r["K"]) || 0; entry.IP = Number(r["IP"]) || 0; entry.ER = Number(r["ER"]) || 0;
    entry.BB_H = Number(r["BB_H"]) || 0;
    entry.ERA = Number(r["ERA"]) || 0; entry.WHIP = Number(r["WHIP"]) || 0; entry.SHO = Number(r["SHO"]) || 0;
    // Extended fields aren't in the legacy CSV — leave as 0 defaults from emptySeasonStatEntry()
    m.set(mlbId, entry);
  }
  return m;
}

/** 30-day TTL for historical stats (2025 won't change) */
const HISTORICAL_TTL = 30 * 24 * 3600;
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

/** Fetch 2025 season stats from MLB API for all players in DB. Uses 30-day SQLite cache. */
async function fetchLastSeasonFromApi(): Promise<Map<string, SeasonStatEntry>> {
  const allPlayers = await prisma.player.findMany({
    where: { mlbId: { not: null } },
    select: { mlbId: true },
  });

  const mlbIds = allPlayers.map((p) => String(p.mlbId!));
  logger.info({ playerCount: mlbIds.length, season: LAST_SEASON }, "Fetching last-season stats from MLB API");

  const batches = chunk(mlbIds, 50);
  const cache = new Map<string, SeasonStatEntry>();

  for (const batch of batches) {
    const url = `${MLB_BASE}/people?personIds=${batch.join(",")}&hydrate=stats(group=[hitting,pitching],type=[season],season=${LAST_SEASON})`;
    const data = await mlbGetJson(url, HISTORICAL_TTL);
    for (const person of (data.people || [])) {
      cache.set(String(person.id), parseSeasonStats(person));
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info({ fetched: cache.size, season: LAST_SEASON }, "Last-season stats loaded from MLB API");
  return cache;
}

/**
 * Get last-season stats map. Awaits the MLB API fetch if in progress.
 * Falls back to CSV only if the API fetch fails.
 */
export async function getLastSeasonStats(): Promise<Map<string, SeasonStatEntry>> {
  if (lastSeasonCache) return lastSeasonCache;

  if (!lastSeasonPromise) {
    lastSeasonPromise = fetchLastSeasonFromApi()
      .then((cache) => {
        lastSeasonCache = cache;
        return cache;
      })
      .catch((err) => {
        logger.error({ error: String(err) }, "Failed to fetch last-season stats from MLB API — using CSV fallback");
        lastSeasonPromise = null;
        lastSeasonCache = loadCsvFallback();
        return lastSeasonCache;
      });
  }

  return lastSeasonPromise;
}

// --- Current-Season Stats (live, short TTL) ---

const CURRENT_SEASON = new Date().getFullYear();
/** 2-hour TTL for current season stats — they change daily */
const CURRENT_SEASON_TTL = 2 * 3600;
let currentSeasonCache: Map<string, SeasonStatEntry> | null = null;
let currentSeasonCacheTs = 0;
let currentSeasonPromise: Promise<Map<string, SeasonStatEntry>> | null = null;

/** Fetch current-season stats from MLB API. Uses 2-hour SQLite cache. */
async function fetchCurrentSeasonFromApi(): Promise<Map<string, SeasonStatEntry>> {
  const allPlayers = await prisma.player.findMany({
    where: { mlbId: { not: null } },
    select: { mlbId: true },
  });

  const mlbIds = allPlayers.map((p) => String(p.mlbId!));
  logger.info({ playerCount: mlbIds.length, season: CURRENT_SEASON }, "Fetching current-season stats from MLB API");

  const batches = chunk(mlbIds, 50);
  const cache = new Map<string, SeasonStatEntry>();

  for (const batch of batches) {
    const url = `${MLB_BASE}/people?personIds=${batch.join(",")}&hydrate=stats(group=[hitting,pitching],type=[season],season=${CURRENT_SEASON})`;
    const data = await mlbGetJson(url, CURRENT_SEASON_TTL);
    for (const person of (data.people || [])) {
      cache.set(String(person.id), parseSeasonStats(person));
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  logger.info({ fetched: cache.size, season: CURRENT_SEASON }, "Current-season stats loaded from MLB API");
  return cache;
}

/**
 * Get current-season (2026) stats map. Uses 2-hour in-memory cache so that
 * the Players page always shows this year's stats once the season starts.
 * Returns empty stats for players who haven't played yet this year.
 */
export async function getCurrentSeasonStats(): Promise<Map<string, SeasonStatEntry>> {
  // Invalidate in-memory cache after 2 hours
  const now = Date.now();
  if (currentSeasonCache && now - currentSeasonCacheTs < CURRENT_SEASON_TTL * 1000) {
    return currentSeasonCache;
  }

  if (!currentSeasonPromise) {
    currentSeasonPromise = fetchCurrentSeasonFromApi()
      .then((cache) => {
        currentSeasonCache = cache;
        currentSeasonCacheTs = Date.now();
        currentSeasonPromise = null;
        return cache;
      })
      .catch((err) => {
        logger.error({ error: String(err) }, "Failed to fetch current-season stats from MLB API");
        currentSeasonPromise = null;
        // Return empty map — players just won't have stats yet
        return currentSeasonCache ?? new Map<string, SeasonStatEntry>();
      });
  }

  return currentSeasonPromise;
}

// --- Player Values Cache (from 2026 Player Values CSV) ---

export type PlayerValueEntry = { name: string; team: string; pos: string; value: number };
let playerValuesCache: Map<string, PlayerValueEntry> | null = null;

/** Normalize name for fuzzy matching: strip accents, standardize apostrophes/punctuation */
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, "'").replace(/\./g, "").toLowerCase();
}

export function loadPlayerValues(): Map<string, PlayerValueEntry> {
  if (playerValuesCache) return playerValuesCache;
  playerValuesCache = new Map();

  const filePath = path.join(process.cwd(), "src", "data", "player_values_2026.csv");
  if (!fs.existsSync(filePath)) {
    logger.warn({}, "player_values_2026.csv not found");
    return playerValuesCache;
  }

  const rows = parseCsv(fs.readFileSync(filePath, "utf-8"));
  for (const row of rows) {
    const r = row as Record<string, string>;
    const name = (r["Name"] ?? "").trim();
    if (!name) continue;
    const valStr = (r["$"] ?? "0").replace("$", "").replace(",", "").trim();
    const value = Number(valStr) || 0;
    const pos = (r["Pos"] ?? "").trim();
    const entry: PlayerValueEntry = {
      name,
      team: (r["Team"] ?? "").trim(),
      pos,
      value,
    };
    const lowerKey = name.toLowerCase();
    const normKey = normalizeName(name);
    if (playerValuesCache.has(lowerKey)) {
      playerValuesCache.set(`${lowerKey}::P`, entry);
      playerValuesCache.set(`${normKey}::P`, entry);
    } else {
      playerValuesCache.set(lowerKey, entry);
      playerValuesCache.set(normKey, entry);
    }
  }
  logger.info({ count: rows.length }, "Loaded player values from 2026 CSV");
  return playerValuesCache;
}

/**
 * Expand two-way players (e.g. Ohtani) into both a hitter row and a pitcher row.
 * The DB only stores one entry per player (typically with posPrimary: "DH"),
 * so we duplicate the row with pitcher-specific fields.
 */
export function expandTwoWayPlayers<T extends { mlb_id: string; is_pitcher: boolean; positions: string }>(
  players: T[]
): T[] {
  const result: T[] = [];
  for (const p of players) {
    const mlbId = Number(p.mlb_id);
    const twoWay = TWO_WAY_PLAYERS.get(mlbId);
    if (twoWay && !p.is_pitcher) {
      result.push({ ...p, positions: twoWay.hitterPos });
      result.push({ ...p, is_pitcher: true, positions: "P" });
    } else if (twoWay && p.is_pitcher) {
      result.push({ ...p, positions: "P" });
    } else {
      result.push(p);
    }
  }
  return result;
}

/**
 * Zero out cross-role stats for two-way players after expansion.
 * Pitcher rows get hitting stats zeroed; hitter rows get pitching stats zeroed.
 * Optionally applies pitcher-specific dollar values from a values map.
 *
 * WARNING: Mutates the input array elements in-place. Call on a cloned/spread
 * copy if the original objects must remain unchanged.
 */
export function splitTwoWayStats<T extends {
  mlb_id: string; is_pitcher: boolean; player_name: string;
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number; AVG: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number; ERA: number; WHIP: number;
  dollar_value?: number; value?: number;
  // Extended fields (todo #114) — typed as optional so existing callers don't break
  BB?: number; HBP?: number; SF?: number; TB?: number; DBL?: number; TPL?: number;
  SO?: number; OBP?: number; SLG?: number; OPS?: number;
  L?: number; GS?: number; K9?: number; BB9?: number; HR_A?: number; BF?: number;
}>(
  stats: T[],
  valuesMap?: Map<string, { value: number }>,
): T[] {
  for (const s of stats) {
    if (!TWO_WAY_PLAYERS.has(Number(s.mlb_id))) continue;
    if (s.is_pitcher) {
      // Zero hitting stats (incl. extended hitting fields)
      s.AB = 0; s.H = 0; s.R = 0; s.HR = 0; s.RBI = 0; s.SB = 0; s.AVG = 0;
      if (s.BB !== undefined) s.BB = 0;
      if (s.HBP !== undefined) s.HBP = 0;
      if (s.SF !== undefined) s.SF = 0;
      if (s.TB !== undefined) s.TB = 0;
      if (s.DBL !== undefined) s.DBL = 0;
      if (s.TPL !== undefined) s.TPL = 0;
      if (s.SO !== undefined) s.SO = 0;
      if (s.OBP !== undefined) s.OBP = 0;
      if (s.SLG !== undefined) s.SLG = 0;
      if (s.OPS !== undefined) s.OPS = 0;
      if (valuesMap) {
        const nameKey = s.player_name.toLowerCase();
        const normKey = normalizeName(s.player_name);
        const pitcherPv = valuesMap.get(`${nameKey}::P`) ?? valuesMap.get(`${normKey}::P`);
        if (pitcherPv) {
          s.dollar_value = pitcherPv.value;
          s.value = pitcherPv.value;
        }
      }
    } else {
      // Zero pitching stats (incl. extended pitching fields)
      s.W = 0; s.SV = 0; s.K = 0; s.IP = 0; s.ER = 0; s.BB_H = 0; s.ERA = 0; s.WHIP = 0;
      if (s.L !== undefined) s.L = 0;
      if (s.GS !== undefined) s.GS = 0;
      if (s.K9 !== undefined) s.K9 = 0;
      if (s.BB9 !== undefined) s.BB9 = 0;
      if (s.HR_A !== undefined) s.HR_A = 0;
      if (s.BF !== undefined) s.BF = 0;
    }
  }
  return stats;
}

/** Exclude synthetic filler players created by auction E2E tests */
export function isFillerPlayer(p: { mlbId?: number | null; name?: string }): boolean {
  if (p.mlbId !== null && p.mlbId !== undefined && p.mlbId >= 900000) return true;
  if (p.name?.startsWith("Filler Hitter")) return true;
  return false;
}

// server/src/features/players/services/statsService.ts
//
// Extracted from players/routes.ts (CR-15) — last-season MLB stats fetching,
// CSV fallback, player values loading, and two-way player expansion.

import fs from "fs";
import path from "path";
import { prisma } from "../../../db/prisma.js";
import { mlbGetJson } from "../../../lib/mlbApi.js";
import { logger } from "../../../lib/logger.js";
import { parseCsv, chunk } from "../../../lib/utils.js";
import { TWO_WAY_PLAYERS } from "../../../lib/sportConfig.js";

// --- Last-Season Stats (2025) from MLB API ---

export type SeasonStatEntry = {
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number; AVG: number;
  W: number; SV: number; K: number; ERA: number; WHIP: number;
};

const LAST_SEASON = 2025;
let lastSeasonCache: Map<string, SeasonStatEntry> | null = null;
let lastSeasonPromise: Promise<Map<string, SeasonStatEntry>> | null = null;

/** Parse hitting/pitching stats from an MLB API person object into our flat format */
function parseSeasonStats(person: any): SeasonStatEntry {
  const entry: SeasonStatEntry = { R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, AVG: 0, W: 0, SV: 0, K: 0, ERA: 0, WHIP: 0 };
  if (!person.stats) return entry;

  for (const statGroup of person.stats) {
    const groupName = statGroup.group?.displayName?.toLowerCase();
    const split = statGroup.splits?.[0]?.stat;
    if (!split) continue;

    if (groupName === "hitting") {
      entry.AB = split.atBats || 0;
      entry.H = split.hits || 0;
      entry.R = split.runs || 0;
      entry.HR = split.homeRuns || 0;
      entry.RBI = split.rbi || 0;
      entry.SB = split.stolenBases || 0;
      entry.AVG = entry.AB > 0 ? entry.H / entry.AB : 0;
    } else if (groupName === "pitching") {
      entry.W = split.wins || 0;
      entry.SV = split.saves || 0;
      entry.K = split.strikeOuts || 0;
      const ip = split.inningsPitched ? parseFloat(split.inningsPitched) : 0;
      const er = split.earnedRuns || 0;
      const bbH = (split.baseOnBalls || 0) + (split.hitsAllowed ?? split.hits ?? 0);
      entry.ERA = ip > 0 ? (er / ip) * 9 : 0;
      entry.WHIP = ip > 0 ? bbH / ip : 0;
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
    m.set(mlbId, {
      R: Number(r["R"]) || 0, HR: Number(r["HR"]) || 0, RBI: Number(r["RBI"]) || 0,
      SB: Number(r["SB"]) || 0, H: Number(r["H"]) || 0, AB: Number(r["AB"]) || 0,
      AVG: Number(r["AVG"]) || 0, W: Number(r["W"]) || 0, SV: Number(r["SV"]) || 0,
      K: Number(r["K"]) || 0, ERA: Number(r["ERA"]) || 0, WHIP: Number(r["WHIP"]) || 0,
    });
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
 */
export function splitTwoWayStats<T extends {
  mlb_id: string; is_pitcher: boolean; player_name: string;
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number; AVG: number;
  W: number; SV: number; K: number; ERA: number; WHIP: number;
  dollar_value?: number; value?: number;
}>(
  stats: T[],
  valuesMap?: Map<string, { value: number }>,
): T[] {
  for (const s of stats) {
    if (!TWO_WAY_PLAYERS.has(Number(s.mlb_id))) continue;
    if (s.is_pitcher) {
      s.AB = 0; s.H = 0; s.R = 0; s.HR = 0; s.RBI = 0; s.SB = 0; s.AVG = 0;
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
      s.W = 0; s.SV = 0; s.K = 0; s.ERA = 0; s.WHIP = 0;
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

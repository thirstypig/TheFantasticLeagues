// server/src/data/playerSeasonStats.ts
import fs from "fs";
import path from "path";
import { warmTeamCacheOnce, defaultCachePath } from "./mlbTeamCache.js";
import { logger } from "../lib/logger.js";

type AnyRow = Record<string, any>;

export type SeasonStatRow = {
  mlb_id: string;
  player_name?: string;
  ogba_team_code?: string;
  positions?: string;
  is_pitcher?: boolean;
  group?: "H" | "P";

  // hitters
  AB?: number;
  H?: number;
  R?: number;
  HR?: number;
  RBI?: number;
  SB?: number;
  AVG?: number;

  // pitchers
  W?: number;
  SV?: number;
  K?: number;
  IP?: string | number;
  ER?: number;
  ERA?: number;
  BB_H?: number;
  WHIP?: number;

  // MLB team abbr
  mlb_team?: string;
  mlbTeam?: string;

  [k: string]: any;
};

function splitCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === `"` && (i === 0 || line[i - 1] !== "\\")) {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  res.push(cur);
  return res.map((s) => s.replace(/\\"/g, `"`).trim());
}

function parseCsv(text: string): AnyRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const out: AnyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: AnyRow = {};
    headers.forEach((h, idx) => (row[h] = cols[idx] ?? ""));
    out.push(row);
  }
  return out;
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function resolveDataFile(filename: string): string {
  const candidates = [
    path.join(process.cwd(), filename),
    path.join(process.cwd(), "src", "data", filename),
    path.join(process.cwd(), "server", "src", "data", filename),
    path.join(process.cwd(), "data", filename),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

// Prefer the WITH_META file if present (you already have it).
const SEASON_FILE = "ogba_player_season_totals_2025_with_meta.csv";

let _loaded: Promise<SeasonStatRow[]> | null = null;

export async function loadPlayerSeasonStats(): Promise<SeasonStatRow[]> {
  if (_loaded) return _loaded;

  _loaded = (async () => {
    const seasonPath = resolveDataFile(SEASON_FILE);
    const raw = fs.readFileSync(seasonPath, "utf-8");
    const rowsRaw = parseCsv(raw);

    const rows: SeasonStatRow[] = rowsRaw.map((r: AnyRow) => {
      const mlb_id = String(r.mlb_id ?? r.mlbId ?? "").trim();

      const groupRaw = String(r.group ?? "").trim().toUpperCase();
      const group = groupRaw === "H" || groupRaw === "P" ? (groupRaw as "H" | "P") : undefined;

      const mlb_team = String(r.mlb_team ?? r.mlbTeam ?? "").trim();
      const mlbTeam = String(r.mlbTeam ?? r.mlb_team ?? "").trim();

      return {
        ...r,
        mlb_id,
        player_name: String(r.player_name ?? r.name ?? r.playerName ?? "").trim(),
        ogba_team_code: String(r.ogba_team_code ?? r.team ?? "").trim(),
        positions: String(r.positions ?? r.pos ?? "").trim(),
        is_pitcher: toBool(r.is_pitcher ?? r.isPitcher),
        group,

        AB: toNum(r.AB),
        H: toNum(r.H),
        R: toNum(r.R),
        HR: toNum(r.HR),
        RBI: toNum(r.RBI),
        SB: toNum(r.SB),
        AVG: toNum(r.AVG),

        W: toNum(r.W),
        SV: toNum(r.SV),
        K: toNum(r.K),
        IP: r.IP ?? r.inningsPitched ?? "0.0",
        ER: toNum(r.ER),
        ERA: toNum(r.ERA),
        BB_H: toNum(r.BB_H ?? r.BBplusH),
        WHIP: toNum(r.WHIP),

        mlb_team,
        mlbTeam,
      };
    });

    // Warm team cache once, then fill missing mlb_team fields
    const idsToWarm = rows
      .map((r) => r.mlb_id)
      .filter(Boolean);

    const cache = await warmTeamCacheOnce(idsToWarm, defaultCachePath());

    for (const r of rows) {
      const abbr = String(r.mlb_team ?? r.mlbTeam ?? "").trim() || (cache.get(r.mlb_id) ?? "");
      if (abbr) {
        r.mlb_team = abbr;
        r.mlbTeam = abbr;
      }
    }

    logger.info({ rowCount: rows.length, file: path.basename(seasonPath) }, "Loaded season stat rows (mlb_team warmed)");
    return rows;
  })();

  return _loaded;
}

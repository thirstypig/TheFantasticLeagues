// server/src/data/players.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Player = {
  [key: string]: any;
};

/**
 * Path to the players CSV.
 *
 * Make sure this file exists:
 *   server/src/data/ogba_player_season_totals_2025.csv
 *
 * If the file name is different, change the string below to match.
 */
const PLAYERS_FILE = path.join(
  __dirname,
  "ogba_player_season_totals_2025.csv"
);

/**
 * Very small CSV parser for our player data.
 * Assumes:
 *  - First line = header row
 *  - Comma-separated, no fancy quoting needed for our data
 */
function loadCsvPlayers(): Player[] {
  const raw = fs.readFileSync(PLAYERS_FILE, "utf-8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    console.warn("loadCsvPlayers: CSV file was empty");
    return [];
  }

  const header = lines[0].split(",");
  const rows: Player[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(",");

    const record: Player = {};
    header.forEach((key, idx) => {
      const rawValue = parts[idx] ?? "";

      // Try to coerce numeric fields to numbers,
      // otherwise keep as string.
      const num = Number(rawValue);
      if (rawValue !== "" && !Number.isNaN(num)) {
        record[key] = num;
      } else {
        record[key] = rawValue;
      }
    });

    rows.push(record);
  }

  return rows;
}

/**
 * Public accessor used by /api/players
 */
export function getPlayers(): Player[] {
  return loadCsvPlayers();
}

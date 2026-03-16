// server/src/data/seasonStandings.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type SeasonStandingRow = {
  [key: string]: any;
};

const SEASON_STANDINGS_FILE = path.join(
  __dirname,
  "ogba_season_standings_2025.json"
);

let cachedRows: SeasonStandingRow[] | null = null;

function loadAllSeasonStandings(): SeasonStandingRow[] {
  if (cachedRows) return cachedRows;

  const raw = fs.readFileSync(SEASON_STANDINGS_FILE, "utf-8");
  const json = JSON.parse(raw);

  let rows: SeasonStandingRow[] = [];

  if (Array.isArray(json)) {
    rows = json;
  } else if (Array.isArray((json as any).rows)) {
    rows = (json as any).rows;
  } else if (Array.isArray((json as any).standings)) {
    rows = (json as any).standings;
  }

  cachedRows = rows;
  logger.info(
    { rowCount: rows.length, file: SEASON_STANDINGS_FILE },
    "Loaded season standings rows"
  );
  return rows;
}

export function getSeasonStandings(): SeasonStandingRow[] {
  return loadAllSeasonStandings();
}

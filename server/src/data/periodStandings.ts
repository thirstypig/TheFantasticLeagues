// server/src/data/periodStandings.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type PeriodStandingsRow = {
  [key: string]: any;
};

export type PeriodStandingsSnapshot = {
  periodId: number;
  rows: PeriodStandingsRow[];
  [key: string]: any;
};

/**
 * Path to the period standings JSON.
 * Make sure this file exists:
 *   server/src/data/ogba_period_standings_2025.json
 */
const PERIOD_STANDINGS_FILE = path.join(
  __dirname,
  "ogba_period_standings_2025.json"
);

function loadAllSnapshots(): PeriodStandingsSnapshot[] {
  const raw = fs.readFileSync(PERIOD_STANDINGS_FILE, "utf-8");
  const json = JSON.parse(raw);

  // Support shapes:
  //   [ { periodId, rows, ... }, ... ]
  //   { snapshots: [ ... ] }
  //   { periods: [ ... ] }
  if (Array.isArray(json)) {
    return json;
  }
  if (Array.isArray((json as any).snapshots)) {
    return (json as any).snapshots;
  }
  if (Array.isArray((json as any).periods)) {
    return (json as any).periods;
  }

  console.warn(
    "loadAllSnapshots: JSON did not look like a snapshot array; returning []"
  );
  return [];
}

/**
 * Return the snapshot for a specific periodId.
 */
export function getPeriodStandingsSnapshot(
  periodId: number
): PeriodStandingsSnapshot | null {
  const all = loadAllSnapshots();
  const pid = Number(periodId);

  const snap =
    all.find((s) => Number((s as any).periodId) === pid) ?? null;

  return snap;
}

/**
 * Optional helper if you ever want ALL snapshots.
 */
export function getAllPeriodStandings(): PeriodStandingsSnapshot[] {
  return loadAllSnapshots();
}

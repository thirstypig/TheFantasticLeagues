/**
 * Turns one parsed season (seasonBuilder output, as written to <year>.json)
 * into rows for HistoricalTeam and HistoricalRosterEntry. Pure.
 */
import type { SeasonData } from "./seasonBuilder.js";
import type { RosterEntry } from "./workbookParser.js";

export type ParsedSeasonFile = SeasonData;

export interface TeamRow {
  code: string;
  name: string;
  ownerName: string | null;
  recordedPeriodPoints: number[];
  recordedTotal: number | null;
  note: string | null;
}

export type RosterKind = "SALARIES" | "DRAFT" | "PERIOD" | "FINAL";

export interface RosterRow {
  teamCode: string;
  kind: RosterKind;
  periodNumber: number | null;
  slot: string;
  playerName: string;
  salary: number | null;
  salaryNote: string | null;
  isKeeper: boolean;
}

function priced(e: RosterEntry): { salary: number | null; salaryNote: string | null } {
  if (typeof e.value === "number") return { salary: Math.round(e.value), salaryNote: null };
  if (typeof e.value === "string" && e.value) return { salary: null, salaryNote: e.value };
  return { salary: null, salaryNote: null };
}

/**
 * Notes come from the season's own failed checks that name a team, e.g. 2008:
 * "DDG: periods sum to 350, Total row says 350.5". The numbers are stored as
 * recorded; the note tells the reader they don't add up in the source.
 */
function teamNote(season: SeasonData, code: string): string | null {
  const msgs = season.checks
    .filter((c) => c.level === "error" && c.message.startsWith(`${code}: `))
    .map((c) => c.message.slice(code.length + 2));
  if (msgs.length === 0) return null;
  return `As recorded in the commissioner's workbook, which does not add up here: ${msgs.join("; ")}.`;
}

/**
 * Owners file: franchise code → one owner for every season, or a list of
 * owners by season range ("from"/"to" inclusive, either may be left open):
 *   "SKD": [{ "to": 2004, "from": 2004, "owner": "Tim Yuba & Jerrod Jue" }, { "owner": "Tim Yuba" }]
 * The first range covering the year wins; an entry with no range is the default.
 */
export type OwnerSpan = { from?: number; to?: number; owner: string };
export type OwnersFile = Record<string, string | OwnerSpan[]>;

export function ownerFor(owners: OwnersFile, code: string, year: number): string | null {
  const entry = owners[code];
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  const hit = entry.find((s) => (s.from == null || year >= s.from) && (s.to == null || year <= s.to));
  return hit?.owner ?? null;
}

export function buildArchiveRows(
  season: SeasonData, owners: OwnersFile,
): { teams: TeamRow[]; entries: RosterRow[] } {
  const teams: TeamRow[] = season.teams.map((t) => ({
    code: t.code,
    name: t.name,
    ownerName: ownerFor(owners, t.code, season.year),
    recordedPeriodPoints: season.recordedPoints.map((p) => p[t.code]).filter((v): v is number => typeof v === "number"),
    recordedTotal: season.recordedTotals[t.code] ?? null,
    note: teamNote(season, t.code),
  }));

  const entries: RosterRow[] = [];
  const push = (kind: RosterKind, periodNumber: number | null, rosters: Record<string, RosterEntry[]> | null, keepers?: Record<string, string[]> | null) => {
    if (!rosters) return;
    for (const [teamCode, list] of Object.entries(rosters)) {
      const kept = new Set(keepers?.[teamCode] ?? []);
      for (const e of list) {
        entries.push({ teamCode, kind, periodNumber, slot: e.slot, playerName: e.name, ...priced(e), isKeeper: kept.has(e.name) });
      }
    }
  };
  push("SALARIES", null, season.salaries);
  push("DRAFT", 1, season.draft, season.keepers);
  for (const p of season.periodRosters) if (p.period > 1) push("PERIOD", p.period, p.rosters);
  push("FINAL", null, season.finalRosters);
  return { teams, entries };
}

/**
 * Parser for the commissioner's season workbooks (Fantasy_Baseball_YYYY.xls).
 * Pure: works on cell grids so it can be tested without xlsx.
 *
 * Sheet layouts (verified against the 2004–2025 workbooks, 2026-11-20):
 *
 *   roster sheet  — row 0/1: team names (a name may wrap onto row 1).
 *                   col 0: slot label (OF, 1B, …, P, IL1). One column per team;
 *                   a repeated slot-label column splits the 8 teams into 4 + 4.
 *                   Below the roster: one points row per scoring period, keyed
 *                   in col 0 by an Excel date serial (the period's END date) or
 *                   "End" (the last period), then a "Total" row.
 *   priced sheet  — same, but each team has a name column and a value column
 *                   ($ salary, or "AL" for a player who left the NL).
 *
 * Period semantics (confirmed on 2024/2025 by watching points rows fill in):
 *   - a sheet named for date D holds the roster AFTER the meeting on D, i.e.
 *     the roster that played the period starting on D;
 *   - a points row labelled D is the period that ENDED on D;
 *   - P1 is played by the Draft roster.
 *
 * Row date labels can be stale copies from an earlier year (the 2018 file's
 * "End of Season 2017" sheet carries 2016 dates), so callers must take the
 * season from the manifest, never from these serials.
 */

export type Cell = string | number | boolean | null | undefined;
export type Grid = Cell[][];

export const SLOT_RE = /^(C|1B|2B|3B|SS|MI|CM|CO|CI|OF|DH|U|UT|R|P|SP|RP|IL\d?|DL\d?|BN|RES)$/;

export interface TeamColumn {
  /** Name as written in the sheet header (both rows joined). */
  rawName: string;
  nameCol: number;
  /** Present on priced sheets. */
  valueCol?: number;
}

export interface SheetHeader {
  /** Last row of the (possibly wrapped) header; data starts below it. */
  headerRow: number;
  teams: TeamColumn[];
  priced: boolean;
}

export interface RosterEntry {
  slot: string;
  name: string;
  /** Priced sheets only: dollar value, or a marker like "AL" / "IA". */
  value?: number | string;
}

export interface PointsRow {
  /** Excel serial of the period end, or null for the "End" row. */
  serial: number | null;
  /** team rawName → points; teams with a blank cell are omitted. */
  points: Record<string, number>;
}

export interface ParsedSheet {
  header: SheetHeader;
  rosters: Record<string, RosterEntry[]>;
  pointsRows: PointsRow[];
  totals: Record<string, number>;
  /**
   * The "2006 Standings" / "Final Standings:" block: team name → total, as
   * typed there (names can be truncated or misspelt, e.g. "Demolition Lumbe").
   * The only record of final points in years without period rows (2006).
   */
  standings: Record<string, number>;
}

const str = (v: Cell): string => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();
const isNum = (v: Cell): v is number => typeof v === "number" && Number.isFinite(v);
const isSerial = (v: Cell): v is number => isNum(v) && v > 36000 && v < 50000;

function isSlotCell(v: Cell): boolean {
  return SLOT_RE.test(str(v));
}

/**
 * Header = first row with at least 4 text cells right of col 0 that aren't
 * slot labels or numbers. The row below continues wrapped names ("Diamond" /
 * "Kings") when it has text in those same columns and no slot label in col 0.
 */
export function findHeader(grid: Grid): SheetHeader | null {
  const textCols = (row: Cell[]) => {
    const cols: number[] = [];
    row.forEach((v, c) => {
      const s = str(v);
      if (c > 0 && s && !isNum(v) && !isSlotCell(v) && !/^(salary cap|keepers)$/i.test(s)) cols.push(c);
    });
    return cols;
  };
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    if (textCols(grid[r] ?? []).length < 4) continue;
    // Names wrap onto up to two more rows ("Kent" / "Diamond" / "Kings"); a
    // team can be blank in the first of them (2005: no owner over VIP BALCOS).
    const rows = [grid[r] ?? []];
    for (let k = 1; k <= 2; k++) {
      const next = grid[r + k] ?? [];
      if (isSlotCell(next[0]) || textCols(next).length === 0) break;
      rows.push(next);
    }
    const all = [...new Set(rows.flatMap(textCols))].sort((a, b) => a - b);
    // Team columns are contiguous or two apart (plus one slot-label column);
    // a wider gap starts an unrelated side list (2008 "Keepers" sheet).
    const teamCols: number[] = [];
    for (const c of all) {
      if (teamCols.length && c - teamCols[teamCols.length - 1] > 3) break;
      teamCols.push(c);
    }
    if (teamCols.length < 4) continue;
    const teams: TeamColumn[] = teamCols.map((c) => ({
      rawName: rows.map((row) => (isNum(row[c]) ? "" : str(row[c]))).filter(Boolean).join(" "),
      nameCol: c,
    }));
    // Priced layout: team columns two apart with the gap column holding values.
    const gaps = teams.slice(1).map((t, i) => t.nameCol - teams[i].nameCol);
    const priced = gaps.filter((g) => g === 2).length >= gaps.length / 2 && gaps.every((g) => g >= 2);
    if (priced) teams.forEach((t) => (t.valueCol = t.nameCol + 1));
    return { headerRow: r + rows.length - 1, teams, priced };
  }
  return null;
}

export function parseSheet(grid: Grid): ParsedSheet | null {
  const header = findHeader(grid);
  if (!header) return null;
  const rosters: Record<string, RosterEntry[]> = {};
  const pointsRows: PointsRow[] = [];
  const totals: Record<string, number> = {};
  for (const t of header.teams) rosters[t.rawName] = [];

  for (let r = header.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const c0 = row[0];
    if (isSlotCell(c0)) {
      const slot = str(c0);
      for (const t of header.teams) {
        const name = str(row[t.nameCol]);
        if (!name) continue;
        const entry: RosterEntry = { slot, name };
        if (t.valueCol !== undefined) {
          const v = row[t.valueCol];
          if (isNum(v)) entry.value = v;
          else if (str(v)) entry.value = str(v);
        }
        rosters[t.rawName].push(entry);
      }
    } else if (isSerial(c0) || /^end$/i.test(str(c0))) {
      const points: Record<string, number> = {};
      for (const t of header.teams) {
        const v = row[t.nameCol];
        if (isNum(v)) points[t.rawName] = v;
      }
      pointsRows.push({ serial: isSerial(c0) ? c0 : null, points });
    } else if (/^total$/i.test(str(c0))) {
      for (const t of header.teams) {
        const v = row[t.nameCol];
        if (isNum(v)) totals[t.rawName] = v;
      }
    }
  }
  return { header, rosters, pointsRows, totals, standings: parseStandingsBlock(grid, header.headerRow + 1) };
}

/** Reads the left copy of the standings block: label cell, then name / total pairs down the rows. */
function parseStandingsBlock(grid: Grid, fromRow: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let r = fromRow; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const c = row.findIndex((v) => /standing/i.test(str(v)));
    if (c < 0) continue;
    for (let rr = r; rr < grid.length; rr++) {
      const name = str(grid[rr]?.[c + 1]);
      const total = grid[rr]?.[c + 2];
      if (!name || !isNum(total)) break;
      out[name] = total;
    }
    break;
  }
  return out;
}

// ─── Names ──────────────────────────────────────────────────────────────────

const SUFFIX_RE = /\b(jr|sr|ii|iii|iv)\b/g;

/**
 * Matching key for an abbreviated workbook name: "F. Tatis Jr." → "f|tatis".
 * Tolerates the sheet's typos in punctuation ("N, Hoerner", "J.Chisholm Jr.",
 * "L. Gurriel Jr,"). The initial is the first letter only, so "Wm." and
 * "Wilm." both give "w" — callers must not treat a key match as identity
 * across different teams without another signal.
 */
export function nameKey(raw: string): string {
  const s = raw.toLowerCase().replace(/[’']/g, "").replace(/[.,\-]/g, " ").replace(SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  const [first, ...rest] = s.split(" ");
  if (rest.length === 0) return `|${first}`;
  // Drop middle initials so "J.H. Lee", "J-H. Lee" and "J. Lee" share a key.
  const surname = rest.filter((t, i) => t.length > 1 || i === rest.length - 1).join(" ");
  return `${first[0]}|${surname}`;
}

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Same first initial and a surname within a small, length-scaled edit distance. */
export function likelySamePlayer(a: string, b: string): boolean {
  const [ia, sa] = nameKey(a).split("|");
  const [ib, sb] = nameKey(b).split("|");
  if (ia && ib && ia !== ib) return false;
  if (sa === sb) return true;
  // Allowed typo distance grows with surname length: "Asad"/"Assad" (4+, 1 edit),
  // "Alverez"/"Alvarez" (5+, 2 edits). Never across a 3-edit gap ("Castro"/"Castillo").
  const shorter = Math.min(sa.length, sb.length);
  const allowed = shorter >= 5 ? 2 : shorter >= 4 ? 1 : 0;
  return levenshtein(sa, sb) <= allowed;
}

// ─── Moves between two rosters ───────────────────────────────────────────────

export interface RosterDiff {
  added: RosterEntry[];
  dropped: RosterEntry[];
  /** Same player written differently in the two sheets — not a move. */
  respelled: { from: string; to: string }[];
}

/** Player-level diff of one team's roster between two consecutive sheets. Slot changes are not moves. */
export function diffRoster(before: RosterEntry[], after: RosterEntry[]): RosterDiff {
  const beforeKeys = new Map(before.map((e) => [nameKey(e.name), e]));
  const afterKeys = new Map(after.map((e) => [nameKey(e.name), e]));
  let dropped = before.filter((e) => !afterKeys.has(nameKey(e.name)));
  let added = after.filter((e) => !beforeKeys.has(nameKey(e.name)));
  const respelled: { from: string; to: string }[] = [];
  for (const d of [...dropped]) {
    const match = added.find((a) => likelySamePlayer(d.name, a.name));
    if (match) {
      respelled.push({ from: d.name, to: match.name });
      dropped = dropped.filter((x) => x !== d);
      added = added.filter((x) => x !== match);
    }
  }
  return { added, dropped, respelled };
}

// ─── Keepers ─────────────────────────────────────────────────────────────────

/**
 * Keepers aren't flagged in the workbooks. The "YYYY Salaries" sheet is the
 * prior season's final roster priced for this year; the "Draft" sheet is the
 * opening roster with prices. A keeper is on the same team in both, at the
 * same price.
 */
export function deriveKeepers(salaries: RosterEntry[], draft: RosterEntry[]): RosterEntry[] {
  return draft.filter((d) =>
    salaries.some((s) => likelySamePlayer(s.name, d.name) && isNum(s.value as Cell) && s.value === d.value),
  );
}

export function excelSerialToISO(serial: number): string {
  // Excel's 1900 date system; serial 25569 = 1970-01-01.
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
}

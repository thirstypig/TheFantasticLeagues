/**
 * Assembles one OGBA season from parsed workbook sheets and checks it against
 * itself. Pure — the caller supplies a sheet loader.
 */
import {
  deriveKeepers, diffRoster, likelySamePlayer, relabelSlots, type ParsedSheet, type RosterEntry,
} from "./workbookParser.js";

export interface SheetRef {
  file: string;
  sheet: string;
  /** Take the slot labels from this (correctly labelled) sheet instead — see relabelSlots. */
  slotLabelsFrom?: { file: string; sheet: string };
}

export interface SeasonSpec {
  year: number;
  draft?: SheetRef;
  salaries?: SheetRef;
  /** A sheet listing only each team's kept players. Wins over keepers derived from salaries. */
  keepers?: SheetRef;
  periods?: string[];
  periodsFile?: string;
  final?: SheetRef;
}

/** franchise code → every name that franchise has used (first = current). */
export type FranchiseMap = Record<string, string[]>;

export interface SeasonTeam { code: string; name: string }

export interface PeriodRoster {
  /** 1-based scoring period this roster played. */
  period: number;
  source: string;
  /** The day the period ended (the sheet's date, "2024-04-21"); its meeting set the next period's roster. */
  endDate: string | null;
  rosters: Record<string, RosterEntry[]>;
}

export interface PeriodMoves {
  /** Moves made at the meeting that started this period. Period 1: changes between the draft and the first sheet. */
  period: number;
  byTeam: Record<string, { added: string[]; dropped: string[]; respelled: { from: string; to: string }[] }>;
}

export interface Check { level: "ok" | "warn" | "error"; message: string }

export interface SeasonData {
  year: number;
  teams: SeasonTeam[];
  draft: Record<string, RosterEntry[]> | null;
  salaries: Record<string, RosterEntry[]> | null;
  keepers: Record<string, string[]> | null;
  /** "sheet": the workbook lists the keepers; "derived": same team + same price (possible keepers). */
  keepersSource: "sheet" | "derived" | null;
  /** One per dated sheet: sheet k is the roster that played period k. The final roster plays the last period. */
  periodRosters: PeriodRoster[];
  moves: PeriodMoves[];
  finalRosters: Record<string, RosterEntry[]> | null;
  /** Recorded points per period (index 0 = P1), from the final sheet. */
  recordedPoints: Record<string, number>[];
  recordedTotals: Record<string, number>;
  checks: Check[];
}

export type SheetLoader = (ref: SheetRef) => ParsedSheet | null;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A period sheet's tab name as a date: "April 21", " May 2", "Sept 09",
 * "Aug 27", "4-27". null when the name isn't a day of the year.
 */
export function sheetDate(name: string, year: number): string | null {
  const s = name.trim().toLowerCase();
  let month: number;
  let day: number;
  const numeric = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  const named = s.match(/^([a-z]+)\.?\s+(\d{1,2})$/);
  if (numeric) { month = Number(numeric[1]); day = Number(numeric[2]); }
  else if (named && named[1].length >= 3) { month = MONTHS.indexOf(named[1].slice(0, 3)) + 1; day = Number(named[2]); }
  else return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Exact alias match, else a known name (6+ chars) contained in the header,
 * which covers "Kent Diamond Kings" (owner prefix) and "Demolition Lumbe"
 * (truncated). Ambiguous containment returns null.
 */
export function resolveTeam(rawName: string, franchises: FranchiseMap): string | null {
  const n = norm(rawName);
  for (const [code, names] of Object.entries(franchises)) if (names.some((x) => norm(x) === n)) return code;
  const hits = new Set<string>();
  for (const [code, names] of Object.entries(franchises)) {
    if (names.some((x) => norm(x).length >= 6 && (n.includes(norm(x)) || norm(x).includes(n) && n.length >= 8))) hits.add(code);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/**
 * Re-key a sheet's per-team map from raw header names to franchise codes.
 * When names don't resolve but the sheet has the season's team count, fall
 * back to column order: sheets inside ONE workbook share the column order, so
 * this is safe within a season (never across seasons — a column can change
 * owner between years). The fallback is reported as a warning.
 */
function byCode<T>(
  map: Record<string, T>, franchises: FranchiseMap, where: string, checks: Check[], order?: string[],
): Record<string, T> {
  const entries = Object.entries(map);
  const codes = entries.map(([raw]) => resolveTeam(raw, franchises));
  // A header naming one team twice (2010's draft sheet has "Dodger Dawgs" in
  // the Devil Dawgs column) would silently overwrite that team's roster.
  const dup = new Set(codes.filter((c, i) => c && codes.indexOf(c) !== i));
  codes.forEach((c, i) => { if (c && dup.has(c)) codes[i] = null; });
  if (dup.size && !(order && entries.length === order.length)) {
    checks.push({ level: "error", message: `${where}: ${[...dup].join(", ")} named twice in the header` });
  }
  if (codes.some((c) => !c) && order && entries.length === order.length) {
    const positional = entries.map((_, i) => order[i]);
    const conflicts = codes.some((c, i) => c && c !== positional[i]);
    if (!conflicts) {
      const unresolved = entries.filter((_, i) => !codes[i]).map(([raw], i) => `"${raw}"→${positional[entries.findIndex(([r]) => r === raw)]}`);
      checks.push({ level: "warn", message: `${where}: matched by column order: ${unresolved.join(", ")}` });
      return Object.fromEntries(entries.map(([, v], i) => [positional[i], v]));
    }
  }
  const out: Record<string, T> = {};
  entries.forEach(([raw, v], i) => {
    if (!codes[i]) { checks.push({ level: "error", message: `${where}: unknown team "${raw}"` }); return; }
    out[codes[i]!] = v;
  });
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildSeason(spec: SeasonSpec, franchises: FranchiseMap, load: SheetLoader): SeasonData {
  const checks: Check[] = [];
  const get = (ref: SheetRef | undefined, label: string): ParsedSheet | null => {
    if (!ref) return null;
    const p = load(ref);
    if (!p) { checks.push({ level: "error", message: `${label}: sheet "${ref.sheet}" missing or unreadable in ${ref.file}` }); return null; }
    if (!ref.slotLabelsFrom) return p;
    const reference = load(ref.slotLabelsFrom);
    if (!reference) { checks.push({ level: "error", message: `${label}: label reference "${ref.slotLabelsFrom.sheet}" missing` }); return p; }
    try {
      checks.push({ level: "warn", message: `${label}: stale label column; slots taken from "${ref.slotLabelsFrom.sheet}"` });
      return relabelSlots(p, reference.slotLabels);
    } catch (e) {
      checks.push({ level: "error", message: `${label}: ${(e as Error).message}` });
      return p;
    }
  };

  const finalSheet = get(spec.final, "final");
  const draftSheet = get(spec.draft, "draft");
  const salarySheet = get(spec.salaries, "salaries");

  // Teams: the final sheet's header is the authority for names that year.
  const headerSource = finalSheet ?? draftSheet ?? salarySheet;
  const seenCodes = new Set<string>();
  const teams: SeasonTeam[] = (headerSource?.header.teams ?? []).flatMap((t) => {
    const code = resolveTeam(t.rawName, franchises);
    if (!code) { checks.push({ level: "error", message: `unknown team "${t.rawName}"` }); return []; }
    if (seenCodes.has(code)) { checks.push({ level: "error", message: `${code} named twice in the team header ("${t.rawName}")` }); return []; }
    seenCodes.add(code);
    return [{ code, name: t.rawName }];
  });
  if (teams.length !== 8) checks.push({ level: "warn", message: `${teams.length} teams (expected 8)` });

  const order = teams.map((t) => t.code);
  const draft = draftSheet ? byCode(draftSheet.rosters, franchises, "draft", checks, order) : null;
  const salaries = salarySheet ? byCode(salarySheet.rosters, franchises, "salaries", checks, order) : null;

  let keepers: Record<string, string[]> | null = null;
  let keepersSource: SeasonData["keepersSource"] = null;
  const keeperSheet = get(spec.keepers, "keepers");
  if (keeperSheet) {
    const listed = byCode(keeperSheet.rosters, franchises, "keepers", checks, order);
    keepers = {};
    for (const code of order) {
      // Use the draft roster's spelling, so a keeper matches his draft-day row.
      keepers[code] = (listed[code] ?? []).map((k) => draft?.[code]?.find((d) => likelySamePlayer(d.name, k.name))?.name ?? k.name);
      const missing = (listed[code] ?? []).filter((k) => draft && !draft[code]?.some((d) => likelySamePlayer(d.name, k.name)));
      if (missing.length) checks.push({ level: "warn", message: `${code}: keeper${missing.length > 1 ? "s" : ""} not on the draft roster: ${missing.map((m) => m.name).join(", ")}` });
    }
    keepersSource = "sheet";
    checks.push({ level: "ok", message: `keepers per team (from the Keepers sheet): ${order.map((c) => keepers![c].length).join(",")}` });
  } else if (draft && salaries) {
    keepersSource = "derived";
    keepers = {};
    for (const code of Object.keys(draft)) {
      keepers[code] = deriveKeepers(salaries[code] ?? [], draft[code]).map((e) => e.name);
    }
    const counts = Object.values(keepers).map((k) => k.length);
    checks.push({ level: "ok", message: `keepers per team: ${counts.join(",")}` });
  }

  // Period rosters. A dated sheet is the roster that played the period ending
  // on that date (the commissioner: "the April 21 meeting is always the first
  // period"), so sheet k = P(k); the meeting on that date set P(k+1), and the
  // final roster played the last period. In most seasons the first sheet
  // equals the draft, and the final roster is ~30 moves past the last sheet.
  const periodRosters: PeriodRoster[] = [];
  (spec.periods ?? []).forEach((sheet, i) => {
    const p = get({ file: spec.periodsFile!, sheet }, `period sheet`);
    if (!p) return;
    const rosters = byCode(p.rosters, franchises, `period ${i + 1}`, checks, order);
    const filled = Object.values(rosters).reduce((n, r) => n + r.length, 0);
    if (filled === 0) { checks.push({ level: "error", message: `period sheet "${sheet}" has no names` }); return; }
    const endDate = sheetDate(sheet, spec.year);
    if (!endDate) checks.push({ level: "warn", message: `period sheet "${sheet}" isn't a date` });
    periodRosters.push({ period: i + 1, source: sheet, endDate, rosters });
  });

  // Moves: draft → P1 (period 1), then each meeting, the last into the final roster.
  const finalRosters = finalSheet ? byCode(finalSheet.rosters, franchises, "final rosters", checks) : null;
  const chain: { period: number; rosters: Record<string, RosterEntry[]> }[] = [];
  if (draft) chain.push({ period: 0, rosters: draft });
  for (const p of periodRosters) chain.push(p);
  if (finalRosters && periodRosters.length > 0) chain.push({ period: periodRosters[periodRosters.length - 1].period + 1, rosters: finalRosters });
  const moves: PeriodMoves[] = [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const cur = chain[i];
    if (cur.period !== prev.period + 1) continue;
    const byTeam: PeriodMoves["byTeam"] = {};
    for (const t of teams) {
      const d = diffRoster(prev.rosters[t.code] ?? [], cur.rosters[t.code] ?? []);
      byTeam[t.code] = { added: d.added.map((e) => e.name), dropped: d.dropped.map((e) => e.name), respelled: d.respelled };
      if (d.added.length !== d.dropped.length) {
        checks.push({ level: "warn", message: `P${cur.period} ${t.code}: ${d.added.length} added vs ${d.dropped.length} dropped` });
      }
    }
    moves.push({ period: cur.period, byTeam });
  }

  // Recorded points and the self-consistency check: periods sum to the Total row.
  const recordedPoints: Record<string, number>[] = [];
  let recordedTotals: Record<string, number> = {};
  if (finalSheet) {
    for (const row of finalSheet.pointsRows) {
      const pts = byCode(row.points, franchises, "points", checks);
      if (Object.keys(pts).length > 0) recordedPoints.push(pts);
    }
    recordedTotals = byCode(finalSheet.totals, franchises, "totals", checks);
    const standings = byCode(finalSheet.standings, franchises, "standings block", checks);
    const totalsRecorded = Object.values(recordedTotals).some((v) => v !== 0);
    if (!totalsRecorded && Object.keys(standings).length > 0) {
      recordedTotals = standings;
      checks.push({ level: "warn", message: "no period points in this copy — final totals taken from the standings block" });
    } else if (totalsRecorded) {
      for (const [code, v] of Object.entries(standings)) {
        if (recordedTotals[code] !== undefined && round(recordedTotals[code]) !== round(v)) {
          checks.push({ level: "error", message: `${code}: Total row ${recordedTotals[code]} ≠ standings block ${v}` });
        }
      }
    }
    if (recordedPoints.length > 0) {
      for (const t of teams) {
        const sum = round(recordedPoints.reduce((s, p) => s + (p[t.code] ?? 0), 0));
        const total = recordedTotals[t.code];
        if (total === undefined) checks.push({ level: "warn", message: `${t.code}: no Total recorded` });
        else if (round(total) !== sum) checks.push({ level: "error", message: `${t.code}: periods sum to ${sum}, Total row says ${total}` });
      }
    }
    if (Object.values(recordedTotals).every((v) => v === 0)) {
      checks.push({ level: "error", message: "no recorded points or totals in this copy" });
    } else {
      checks.push({ level: "ok", message: `${recordedPoints.length} periods of recorded points` });
    }
  } else {
    checks.push({ level: "warn", message: "no final sheet — no recorded points or final rosters" });
  }

  return {
    year: spec.year,
    teams,
    draft,
    salaries,
    keepers,
    keepersSource,
    periodRosters,
    moves,
    finalRosters,
    recordedPoints,
    recordedTotals,
    checks,
  };
}

// Pure helpers for the archive season page.
import type { ArchiveRosterEntry } from "@shared/api/archiveSeason";

/** Points as the workbook writes them: 254.5, 275 — never 275.0. */
export const fmtPoints = (n: number | null) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The player's MLB name once the player check settled him, else the workbook spelling. */
export const playerName = (e: ArchiveRosterEntry) => e.mlbName ?? e.name;

export function priceLabel(e: ArchiveRosterEntry): string {
  if (e.price != null) return `$${e.price}`;
  if (e.priceNote === "AL") return "left the NL";
  return e.priceNote ?? "";
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "2006–2014" for a run of seasons, "2022, 2024–2025" when there are gaps. */
export function seasonRanges(years: number[]): string {
  const out: string[] = [];
  for (const y of [...years].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    const [a, b] = last ? last.split("–").map(Number) : [];
    if (last && (b ?? a) === y - 1) out[out.length - 1] = `${a}–${y}`;
    else out.push(String(y));
  }
  return out.join(", ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-04-21" → "Apr 21". Read as a calendar day, never through the viewer's time zone. */
export function shortDate(iso: string | null | undefined): string | null {
  const m = iso?.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : null;
}

/** What the workbook for this season is missing, for the season's "incomplete" note. */
export function seasonGaps(s: { periodCount: number; hasMoves: boolean; rosters: Record<string, { draft: unknown[]; final: unknown[] }> }): string[] {
  const out: string[] = [];
  const rosters = Object.values(s.rosters);
  if (s.periodCount === 0) out.push("points by period");
  if (rosters.every((r) => r.draft.length === 0)) out.push("the draft");
  if (!s.hasMoves) out.push("the moves at each meeting");
  if (rosters.every((r) => r.final.length === 0)) out.push("the final rosters");
  return out;
}

/**
 * Seasons whose workbook is missing a meeting's roster sheet, or holds one sheet twice, so
 * some meeting's moves show under the wrong meeting or not at all. Found by counting the
 * changes between consecutive sheets (a normal meeting has 20–50; the draft and the first
 * sheet match): a meeting with almost none right after one with about twice as many. Every
 * copy of these workbooks has the same gap, so it can't be fixed from the files. Seasons
 * with no meeting sheets at all (2003–2005, 2015) get the general note instead.
 * The archive holds OGBA only, so a note is keyed by year.
 */
export const MISSING_MEETING_NOTES: Record<number, string> = {
  2006: "The Apr 30 sheet already seems to include most of that meeting’s moves, so they show under “After the draft” and the Apr 30 meeting shows only a few.",
  2007: "The workbook has no roster for period 2: the May 20 sheet already includes that meeting’s moves. So the Apr 29 meeting shows the moves of both meetings, and the May 20 meeting almost none. The final roster is the same as the Aug 26 sheet, so moves made at the Aug 26 meeting aren’t known.",
  2009: "The workbook has no roster for period 1: the May 5 sheet already includes that meeting’s moves. So the May 5 meeting’s moves show under “After the draft”, and period 1 shows period 2’s rosters.",
  2018: "The workbook has no roster for period 1: the Apr 29 sheet already includes that meeting’s moves. So the Apr 29 meeting’s moves show under “After the draft”, and period 1 shows period 2’s rosters.",
  2020: "The Sept 23 sheet is empty in every copy of the workbook, so the Aug 23 meeting’s moves show under the Sept 23 meeting.",
};

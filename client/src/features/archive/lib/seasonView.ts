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

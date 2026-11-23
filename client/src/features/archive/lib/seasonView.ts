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

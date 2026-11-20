/**
 * Match the workbooks' abbreviated player names ("Wm. Contreras", "JT.
 * Realmuto", "F. Alverez") to exact MLB people. Pure: the caller supplies
 * the season's candidate pool (MLB full-season rosters).
 *
 * Signals, in order (James, 2026-11-20: "positions and those abbreviations
 * can help identify the exact player … there might be spelling mistakes"):
 *   1. surname — exact after normalising accents/suffixes/punctuation; else a
 *      length-scaled typo distance; else a prefix (the sheets truncate long
 *      names, "P. Crow-Armstron");
 *   2. first-name abbreviation — its letters must appear in order in the
 *      player's first name or the name he goes by ("Wm" ⊂ William but not
 *      Willson; "Wiln" ⊂ Willson; "Ra" ⊂ Ranger but not Robert);
 *   3. role — a P slot must be a pitcher, a hitter slot a non-pitcher
 *      (two-way players pass both);
 *   4. tie-breaks — exact surname over typo, abbreviation as a straight
 *      prefix over letters-in-order, NL over AL (NL-only league), catcher for
 *      a C slot.
 * Anything not narrowed to one person is returned as ambiguous/unmatched for
 * review — never guessed.
 */
import { levenshtein } from "./workbookParser.js";

export interface MlbCandidate {
  mlbId: number;
  fullName: string; // the name he goes by: "Rick Ankiel"
  firstName: string; // legal: "Richard"
  middleName?: string; // "Scott" — "A. S. Gonzalez" is Alexander Scott, not Álex Luis
  lastName: string;
  /** Primary position abbreviation from statsapi: P, C, 1B, …, TWP. */
  position: string;
  /** Played for an NL team that season. */
  nl: boolean;
}

export type MatchResult =
  | {
      status: "matched";
      candidate: MlbCandidate;
      how: string;
      /** Other real people a tie-break ruled out, and which rule did it. Review these. */
      beat?: { candidate: MlbCandidate; by: string }[];
    }
  | { status: "ambiguous"; candidates: MlbCandidate[] }
  | { status: "unmatched" };

const SUFFIX = /\b(jr|sr|ii|iii|iv)\b/g;

export function normalize(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’']/g, "").replace(/[.,]/g, " ").replace(SUFFIX, " ")
    .replace(/\s+/g, " ").trim();
}

/** Split a workbook name into its first-name abbreviation and surname. */
export function splitWorkbookName(raw: string): { abbr: string; surname: string } {
  const s = normalize(raw.replace(/-(?=[A-Z]\.)/, " ")); // "J-H. Lee" → "J H. Lee"
  const parts = s.split(" ");
  if (parts.length === 1) return { abbr: "", surname: parts[0] };
  // Leading short tokens are initials ("j h lee", "j d martinez"); the rest is the surname.
  let i = 0;
  const initials: string[] = [];
  while (i < parts.length - 1 && (i === 0 || parts[i].length === 1)) initials.push(parts[i++]);
  return { abbr: initials.join(""), surname: parts.slice(i).join(" ") };
}

/** Letters of `abbr` appear in order in `name`, starting at its first letter. */
export function isAbbreviationOf(abbr: string, name: string): boolean {
  const n = normalize(name).replace(/[^a-z]/g, "");
  const a = abbr.replace(/[^a-z]/g, "");
  if (!a) return true;
  if (!n || n[0] !== a[0]) return false;
  let j = 0;
  for (const ch of n) if (ch === a[j]) j++;
  return j >= a.length;
}

/**
 * The abbreviation fits the legal first name, the name he goes by, the given
 * names run together ("W.M." → "Wily Mo"), or first + middle initials
 * ("A. S." → Alexander Scott, "C. B." → Christopher Brandon).
 */
function abbreviationFits(abbr: string, c: MlbCandidate): boolean {
  const used = c.fullName.split(" ");
  const givenUsed = used.slice(0, Math.max(1, used.length - normalize(c.lastName).split(" ").length)).join(" ");
  const initials = [c.firstName, c.middleName].filter(Boolean).map((n) => normalize(n!)[0]).join("");
  return (
    isAbbreviationOf(abbr, c.firstName) ||
    isAbbreviationOf(abbr, used[0]) ||
    isAbbreviationOf(abbr, givenUsed) ||
    (abbr.length >= 2 && initials.startsWith(abbr))
  );
}

function surnameKey(s: string): string {
  return normalize(s).replace(/[^a-z]/g, "");
}

type SurnameHow = "exact" | "typo" | "truncated";

function surnameMatch(workbook: string, mlb: string): SurnameHow | null {
  const a = surnameKey(workbook);
  const b = surnameKey(mlb);
  if (!a || !b) return null;
  if (a === b) return "exact";
  const shorter = Math.min(a.length, b.length);
  const allowed = shorter >= 5 ? 2 : shorter >= 4 ? 1 : 0;
  if (allowed && levenshtein(a, b) <= allowed) return "typo";
  if (a.length >= 8 && b.startsWith(a)) return "truncated";
  return null;
}

const isPitcherSlot = (slot: string) => /^(P|SP|RP)$/.test(slot);
const isTwoWay = (c: MlbCandidate) => c.position === "TWP";

export function matchPlayer(raw: string, slot: string, pool: MlbCandidate[]): MatchResult {
  const { abbr, surname } = splitWorkbookName(raw);
  const scored = pool.flatMap((c) => {
    const how = surnameMatch(surname, c.lastName) ?? surnameMatch(surname, c.fullName.split(" ").slice(1).join(" "));
    if (!how) return [];
    if (!abbreviationFits(abbr, c)) return [];
    // IL/DL/R/BN slots can hold either role.
    if (!isTwoWay(c) && /^(P|SP|RP)$/.test(slot) && c.position !== "P") return [];
    if (!isTwoWay(c) && !isPitcherSlot(slot) && !/^(IL\d?|DL\d?|R|BN|RES)$/.test(slot) && c.position === "P") return [];
    return [{ c, how }];
  });
  if (scored.length === 0) return { status: "unmatched" };
  if (scored.length === 1) return { status: "matched", candidate: scored[0].c, how: scored[0].how };

  // Tie-breaks, each applied only if it leaves at least one candidate.
  let rest = scored;
  const beat: { candidate: MlbCandidate; by: string }[] = [];
  const narrow = (by: string, keep: (x: (typeof scored)[number]) => boolean) => {
    const k = rest.filter(keep);
    if (k.length === 0) return;
    for (const x of rest) if (!k.includes(x) && !k.some((y) => y.c.mlbId === x.c.mlbId)) beat.push({ candidate: x.c, by });
    rest = k;
  };
  narrow("exact surname", (x) => x.how === "exact");
  // A straight prefix beats letters-in-order: "Ad." is Adrián, not Alexander.
  narrow("first-name prefix", (x) => [x.c.firstName, x.c.fullName.split(" ")[0]].some((n) => normalize(n).replace(/[^a-z]/g, "").startsWith(abbr)));
  narrow("NL", (x) => x.c.nl);
  if (slot === "C") narrow("catcher slot", (x) => x.c.position === "C");
  // The same person can appear twice (traded mid-season → on two rosters).
  const unique = [...new Map(rest.map((x) => [x.c.mlbId, x])).values()];
  const dedupedBeat = [...new Map(beat.map((b) => [b.candidate.mlbId, b])).values()];
  if (unique.length === 1) {
    return dedupedBeat.length
      ? { status: "matched", candidate: unique[0].c, how: `${unique[0].how}+tiebreak`, beat: dedupedBeat }
      : { status: "matched", candidate: unique[0].c, how: unique[0].how };
  }
  return { status: "ambiguous", candidates: unique.map((x) => x.c) };
}

/** Role a roster slot implies: P = pitcher, H = hitter, X = either (IL, DL, rookie spot). */
export function slotRole(slot: string): "P" | "H" | "X" {
  const s = slot.trim().toUpperCase();
  if (/^(P|SP|RP)$/.test(s)) return "P";
  if (/^(IL\d?|DL\d?|R|BN|RES)$/.test(s)) return "X";
  return "H";
}

/**
 * Identity of "one player" inside a season's sheets: team + abbreviation +
 * surname + role. Role is part of it because one team can roster two people
 * with the same spelling at once — 2021 RGing Sluggers had Edwin Díaz (P) and
 * Elias Díaz (C) both written "E. Diaz".
 */
export function archivePlayerKey(team: string, name: string, slot: string): string {
  const { abbr, surname } = splitWorkbookName(name);
  return `${team}|${abbr}|${surname.replace(/[^a-z]/g, "")}|${slotRole(slot)}`;
}

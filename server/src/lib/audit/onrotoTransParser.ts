/**
 * Parser for OnRoto's year-to-date transaction log:
 *   display_trans.pl?OGBA+6+all+YTD+<season>&session_id=guest
 * The page is Cloudflare-gated (403 to curl) — save it from a real browser.
 *
 * Each transaction row has six cells:
 *   Eff. Date | League Team | Player | Tm | Transaction | Submitted
 *   "08.30"   | "Diamond Kings" | "DRushing" | "LAD" | "Release" | "08.30 @ 12:09"
 *
 * `Player` is OnRoto's alias — first initial + last name, no space. It is not
 * unique league-wide (two "LGarcia"s can exist); match it within one fantasy
 * team's roster, where it almost always is.
 */

/** Roster-membership effect of a transaction, or null when membership is unchanged. */
export type OnrotoMove = "ADD" | "DROP";

export interface OnrotoTransaction {
  /** YYYY-MM-DD — the first day the change is in effect. */
  effDate: string;
  team: string;
  alias: string;
  mlbTeam: string;
  /** OnRoto's own wording: "Release", "Add to Actives", "Trade", "Acquire", "Disable", … */
  raw: string;
  /** When it was entered, "MM.DD @ HH:MM" as OnRoto shows it (may precede effDate). */
  submitted: string;
  /** ADD / DROP for moves that change who owns the player; null for IL and position changes. */
  move: OnrotoMove | null;
}

/**
 * OnRoto wording → membership effect. "Disable" (to IL) and "Activate" (off IL)
 * keep the player on the same team; "Change Position to X" is a slot change.
 * Any wording not listed here is reported by the parser rather than guessed.
 */
const MOVES: Record<string, OnrotoMove | null> = {
  "add to actives": "ADD",
  acquire: "ADD",
  release: "DROP",
  trade: "DROP",
  disable: null,
  activate: null,
};

function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse every transaction row. `unknown` lists rows whose wording isn't
 * recognised — a non-empty list means OnRoto added a transaction type and the
 * caller must not treat the comparison as complete.
 */
export function parseOnrotoTransactions(
  rawHtml: string,
  season: number,
): { transactions: OnrotoTransaction[]; unknown: string[] } {
  const transactions: OnrotoTransaction[] = [];
  const unknown: string[] = [];
  for (const row of rawHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(cellText);
    if (cells.length !== 6 || !/^\d\d\.\d\d$/.test(cells[0]!)) continue; // header / layout rows
    const [date, team, alias, mlbTeam, raw, submitted] = cells as [string, string, string, string, string, string];
    const [mm, dd] = date.split(".");
    const key = raw.toLowerCase();
    let move: OnrotoMove | null;
    if (key in MOVES) move = MOVES[key]!;
    else if (key.startsWith("change position to")) move = null;
    else {
      unknown.push(`${date} ${team} ${alias} "${raw}"`);
      continue;
    }
    transactions.push({ effDate: `${season}-${mm}-${dd}`, team, alias, mlbTeam, raw, submitted, move });
  }
  return { transactions, unknown };
}

export interface BbrefGame {
  date: string; // ISO yyyy-mm-dd
  stats: Record<string, number>;
}

/**
 * Baseball Reference column keys. These are NOT the obvious names:
 * the date column is `date` (not `date_game`) and batting stats carry a
 * `b_` prefix. A wrong key silently matches nothing.
 */
const BATTING_KEYS: Record<string, string> = {
  R: "b_r", HR: "b_hr", RBI: "b_rbi", SB: "b_sb", AB: "b_ab", H: "b_h",
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function cellByStat(rowHtml: string, stat: string): string | null {
  const re = new RegExp(`data-stat="${stat}"[^>]*>([\\s\\S]*?)</t[dh]>`, "i");
  const m = rowHtml.match(re);
  return m ? m[1]!.replace(/<[^>]+>/g, "").trim() : null;
}

/**
 * Parses every `<tr>` that carries a `data-stat="date"` cell. Two kinds of
 * such rows are NOT games and are structurally recognized as such rather
 * than silently vanishing: table header rows (cell text literally "Date")
 * and blank separator rows (empty cell text). Rows without a `date`
 * data-stat cell at all belong to other tables on the page entirely (splits,
 * streaks, RBI-opportunity summaries, ...) and are not candidate game rows,
 * so they are not tracked in `skipped`.
 *
 * Every row that HAS a date cell but fails to yield a parseable ISO date is
 * pushed to `skipped` instead of disappearing through a bare `continue` —
 * see docs/solutions/integration-issues/html-parser-silent-row-drop-passes-its-own-tests.md.
 * A caller can inspect `skipped` and treat a non-empty list as grounds for
 * marking the audit run INCOMPLETE rather than trusting an unexplained drop.
 */
export function parseBbrefGameLog(rawHtml: string): { games: BbrefGame[]; skipped: string[] } {
  const html = unescapeHtml(rawHtml);
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]!);

  const games: BbrefGame[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const dateCell = cellByStat(row, "date");
    // Distinguish "no date-stat cell at all" (null, row belongs to another
    // table entirely) from "cell present but empty" (blank separator row,
    // a real candidate that must be tracked in `skipped`, not silently
    // dropped by `""` being falsy).
    if (dateCell === null) continue;
    const iso = dateCell.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!iso) {
      skipped.push(dateCell || "<blank>");
      continue;
    }

    const stats: Record<string, number> = {};
    for (const [out, key] of Object.entries(BATTING_KEYS)) {
      const v = cellByStat(row, key);
      const n = v === null || v === "" ? NaN : Number(v);
      stats[out] = Number.isFinite(n) ? n : 0;
    }
    games.push({ date: iso, stats });
  }
  return { games, skipped };
}

/**
 * Sum an inclusive date window. Throws on an empty match: a zeroed total is
 * indistinguishable from "player didn't play", and that ambiguity is exactly
 * how a wrong column name passes for a clean audit.
 */
export function sumWindow(
  games: BbrefGame[],
  startIso: string,
  endIso: string,
): { games: number; stats: Record<string, number> } {
  const inWindow = games.filter((g) => g.date >= startIso && g.date <= endIso);
  if (inWindow.length === 0) {
    throw new Error(`sumWindow: no games between ${startIso} and ${endIso}`);
  }
  const stats: Record<string, number> = {};
  for (const g of inWindow) {
    for (const [k, v] of Object.entries(g.stats)) stats[k] = (stats[k] ?? 0) + v;
  }
  return { games: inWindow.length, stats };
}

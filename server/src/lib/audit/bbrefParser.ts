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

export function parseBbrefGameLog(rawHtml: string): BbrefGame[] {
  const html = unescapeHtml(rawHtml);
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]!);

  const games: BbrefGame[] = [];
  for (const row of rows) {
    const dateCell = cellByStat(row, "date");
    if (!dateCell) continue;
    const iso = dateCell.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!iso) continue;

    const stats: Record<string, number> = {};
    for (const [out, key] of Object.entries(BATTING_KEYS)) {
      const v = cellByStat(row, key);
      const n = v === null || v === "" ? NaN : Number(v);
      stats[out] = Number.isFinite(n) ? n : 0;
    }
    games.push({ date: iso, stats });
  }
  return games;
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

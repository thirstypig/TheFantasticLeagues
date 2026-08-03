import type { CatKey } from "./types.js";

/**
 * Category order of the per-category breakdown blocks on display_stand.pl.
 * FG labels saves "SV" and strikeouts "SO"; we key them SV and K.
 */
const CAT_ORDER: CatKey[] = ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "ERA", "WHIP", "K"];

const TEAMS_PER_BLOCK = 8;
const FIELDS_PER_TEAM = 5; // name | seasonValue | weekValue | points | +/-

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function cells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => m[1]!.replace(/<[^>]+>/g, "").replace(/ /g, " ").trim())
    .filter((c) => c !== "");
}

export function parseFgStandings(rawHtml: string): {
  through: string | null;
  teams: Record<string, Record<CatKey, string>>;
} {
  const html = unescapeHtml(rawHtml);
  const through = (html.match(/through[^<\n]*/i)?.[0] ?? null)?.trim() ?? null;

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]!);

  // A breakdown block is a header row "Team|Year|Wk|PTS|+/-" followed by one
  // data row holding all 8 teams flattened. A trailing next-category label
  // ("HOME RUNS", ...) can ride along on the data row, so truncate to exactly
  // 8 teams x 5 fields.
  const blocks: string[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const c = cells(rows[i]!);
    if (c[0] === "Team" && c[1] === "Year") {
      const data = cells(rows[i + 1] ?? "");
      if (data.length >= TEAMS_PER_BLOCK * FIELDS_PER_TEAM) {
        blocks.push(data.slice(0, TEAMS_PER_BLOCK * FIELDS_PER_TEAM));
      }
    }
  }

  if (blocks.length !== CAT_ORDER.length) {
    throw new Error(
      `parseFgStandings: expected ${CAT_ORDER.length} breakdown blocks, got ${blocks.length}. ` +
        `FanGraphs markup likely changed — do not treat a partial parse as a clean audit.`,
    );
  }

  const teams: Record<string, Record<CatKey, string>> = {};
  blocks.forEach((data, blockIdx) => {
    const cat = CAT_ORDER[blockIdx]!;
    for (let j = 0; j < data.length; j += FIELDS_PER_TEAM) {
      const name = data[j]!;
      const seasonValue = data[j + 1]!;
      (teams[name] ??= {} as Record<CatKey, string>)[cat] = seasonValue;
    }
  });

  return { through, teams };
}

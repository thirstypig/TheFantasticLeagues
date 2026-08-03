export interface FgPlayerRow {
  name: string;
  pos: string;
  mlbTeam: string;
  status: string;
  reserved: boolean;
  stats: Record<string, string>;
}

/**
 * Stat column names, in document order, STARTING AT THE FIRST TWO-VALUE CELL.
 *
 * Positional indexing from the row start does NOT work: the header's
 * "2026 Games by Position" is one <th> but expands to SEVEN <td> cells on
 * hitter rows (games at each position), and to zero on pitcher rows. Verified
 * against the fixture 2026-08-03: a hitter row is 19 cells with stats at 11-18,
 * a pitcher row is 15 cells with stats at 4-14.
 *
 * The reliable anchor is that every stat cell holds "season\nweek" while all
 * leading cells are single-valued.
 */
const HITTER_STATS = ["AB", "H", "R", "HR", "RBI", "SB", "AVG", "GS"];
const PITCHER_STATS = ["IP", "ER", "H", "BB", "SO", "W", "SV", "ERA", "WHIP", "ShO", "NH"];

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function rawCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
    m[1]!
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/ /g, " ")
      .trim(),
  );
}

/** Each stat cell is "season\nweek"; we take the season half. */
function seasonHalf(cell: string): string {
  return cell.split("\n")[0]!.trim();
}

export function parseFgTeamPage(rawHtml: string): { players: FgPlayerRow[] } {
  const html = unescapeHtml(rawHtml);
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]!);

  const players: FgPlayerRow[] = [];
  let statNames: string[] | null = null;
  let reservedSection = false;

  for (const row of rows) {
    const c = rawCells(row);
    if (c.length === 0) continue;

    const joined = c.join(" ").toLowerCase();
    if (joined.includes("previously reserved")) {
      reservedSection = true;
      continue;
    }
    if (c[0] === "Pos" && c[1] === "Name") {
      statNames = c.includes("IP") ? PITCHER_STATS : HITTER_STATS;
      continue;
    }
    if (!statNames) continue;
    if (c[0] === "TOTAL:" || c.length < 5) continue;

    // Stats begin at the first two-value ("season\nweek") cell. See the
    // HITTER_STATS comment for why positional indexing from 0 is unsafe.
    const firstStatIdx = c.findIndex((cell) => cell.includes("\n"));
    if (firstStatIdx === -1) continue;

    const stats: Record<string, string> = {};
    statNames.forEach((name, i) => {
      const cell = c[firstStatIdx + i];
      if (cell !== undefined) stats[name] = seasonHalf(cell);
    });

    const status = (c[3] ?? "").trim();
    players.push({
      pos: c[0]!,
      name: c[1]!,
      mlbTeam: c[2] ?? "",
      status,
      reserved: reservedSection || status.toLowerCase() !== "act",
      stats,
    });
  }

  if (players.length === 0) {
    throw new Error(
      "parseFgTeamPage: zero players parsed. Fixture is probably a Cloudflare " +
        "interstitial, or the table markup changed. A silent empty parse must never " +
        "be reported as 'no divergences'.",
    );
  }

  return { players };
}

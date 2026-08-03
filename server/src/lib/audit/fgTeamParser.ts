export interface FgPlayerRow {
  name: string;
  pos: string;
  mlbTeam: string;
  status: string;
  reserved: boolean;
  stats: Record<string, string>;
}

/**
 * Stat column names, in document order, starting at the boundary computed by
 * `c.length - statNames.length`.
 *
 * Positional indexing from the row start does NOT work: the header's
 * "2026 Games by Position" is one <th> but expands to SEVEN <td> cells on
 * hitter rows (games at each position), and to zero on pitcher rows. Verified
 * against the fixture 2026-08-03: a hitter row is 19 cells with stats at 11-18,
 * a pitcher row is 15 cells with stats at 4-14.
 *
 * Anchoring on "the first two-value cell" (season\nweek) does NOT work either:
 * the "previously active" / "previously reserved" carryover subsections (a
 * player's stat line from an earlier stint on this team, shown after an
 * `-----> ` divider row) render every stat as a FLAT single value with no
 * week component, so no cell contains "\n" and that scan returns -1,
 * silently dropping real rostered players (e.g. Ronald Acuna, Andrew Vaughn
 * in the fixture). `c.length - statNames.length` is anchored on the row's
 * total cell count instead, which is fixed per row type regardless of
 * whether the trailing cells are split ("419\n3") or flat ("419") —
 * `seasonHalf()` degrades correctly on a flat cell since `split("\n")[0]`
 * on a value with no newline returns the whole value.
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

/** Each stat cell is "season\nweek" (or a flat "season" value on carryover
 * rows); we take the season half either way. */
function seasonHalf(cell: string): string {
  return cell.split("\n")[0]!.trim();
}

export function parseFgTeamPage(rawHtml: string): { players: FgPlayerRow[]; skipped: string[] } {
  const html = unescapeHtml(rawHtml);
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]!);

  const players: FgPlayerRow[] = [];
  const skipped: string[] = [];
  let statNames: string[] | null = null;
  let reservedSection = false;
  // Hitter tables render a rowspan="2" header split across two <tr> rows:
  // the first carries Pos/Name/Tm/Sta/stat labels, the second carries the
  // seven individual "games by position" column labels (DH/C/1B/2B/3B/SS/OF)
  // with no Pos/Name cells of its own. Pitcher tables use rowspan="1" (a
  // single header row), so this second row never appears there. Track it
  // structurally rather than guessing from content, so it's never mistaken
  // for a malformed player row.
  let pendingPositionSubheaderRow = false;

  for (const row of rows) {
    const c = rawCells(row);
    if (c.length === 0) continue;

    if (pendingPositionSubheaderRow) {
      pendingPositionSubheaderRow = false;
      continue;
    }

    const joined = c.join(" ").toLowerCase();
    if (joined.includes("previously reserved")) {
      reservedSection = true;
      continue;
    }
    if (c[0] === "Pos" && c[1] === "Name") {
      statNames = c.includes("IP") ? PITCHER_STATS : HITTER_STATS;
      // A new table has started (Active Hitters -> Reserved Hitters ->
      // Active Pitchers -> Reserved Pitchers, in document order). The
      // "previously reserved" flag is scoped to the table it was set in;
      // carrying it forward into the next table mislabels every row there
      // as reserved (e.g. an active, healthy Chris Sale).
      reservedSection = false;
      pendingPositionSubheaderRow = statNames === HITTER_STATS;
      continue;
    }
    if (!statNames) continue;
    if (c[0] === "TOTAL:" || c.length < 5) continue;

    const firstStatIdx = c.length - statNames.length;
    if (firstStatIdx < 4) {
      // Would overlap Pos/Name/Tm/Sta - not a parseable player row.
      skipped.push(c[1] ?? c.join("|"));
      continue;
    }

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

  return { players, skipped };
}

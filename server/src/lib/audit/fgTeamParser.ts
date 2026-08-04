/**
 * One stat line from an OnRoto per-team page.
 *
 * ⚠️ `name` IS NOT A KEY. A player who has had more than one stint on the
 * team appears on MULTIPLE rows — his current stint plus one carryover row
 * per prior stint (`carryover: true`). `players.find(p => p.name === X)`
 * returns an arbitrary stint and is always a bug; filter and aggregate
 * instead. Verified in the 2026-08-03 fixture: Ronald Acuna has an active
 * row (AB 199) and a reserved carryover row (AB 22); Andrew Vaughn has two
 * carryover rows (AB 50 active-table, AB 27 reserved-table). FanGraphs
 * publishes no player id on these pages, so there is no better key to offer.
 *
 * A team's category total is the sum over ALL rows in a table, carryover
 * included — confirmed against the page's own `TOTAL:` row: the Reserved
 * Hitters total (AB 49 / H 11 / R 10 / HR 3) is exactly Acuna's 22/3/5/2
 * plus Vaughn's 27/8/5/1.
 */
export interface FgPlayerRow {
  name: string;
  pos: string;
  mlbTeam: string;
  /** FanGraphs' own status string: "act", "rel", "min", … */
  status: string;
  /**
   * Table membership — is this row in the Reserved table? This is NOT
   * "is the player benched/inactive": a released player carried over in the
   * Active table has `status: "rel"` and `reserved: false`.
   */
  reserved: boolean;
  /**
   * True when the row sits in a "stats of previously active/reserved …"
   * subsection, i.e. it is a PRIOR stint, not the player's current line.
   */
  carryover: boolean;
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

/**
 * Table membership from the row's own class, e.g. `Active_Hitters_prev` or
 * `Reserved_Hitters_prev`. This is the authoritative signal and outranks the
 * divider-text tracking below: the "stats of previously reserved" divider
 * sits INSIDE the Reserved table, so any row above it would otherwise be
 * mislabelled. Returns null when the attribute is absent or unrecognised, in
 * which case the caller falls back to divider tracking.
 */
function reservedFromRowClass(attrs: string): boolean | null {
  const cls = (attrs.match(/class="([^"]+)"/) ?? [])[1];
  if (!cls) return null;
  if (/^Reserved_(Hitters|Pitchers)_prev$/.test(cls)) return true;
  if (/^Active_(Hitters|Pitchers)_prev$/.test(cls)) return false;
  return null;
}

export function parseFgTeamPage(rawHtml: string): { players: FgPlayerRow[]; skipped: string[] } {
  const html = unescapeHtml(rawHtml);
  const rows = [...html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)].map((m) => ({
    attrs: m[1]!,
    body: m[2]!,
  }));

  const players: FgPlayerRow[] = [];
  const skipped: string[] = [];
  let statNames: string[] | null = null;
  let reservedSection = false;
  // Set by any "stats of previously active/reserved <hitters|pitchers>"
  // divider. There are FOUR such subsections per page, one per table — an
  // earlier version tracked only "previously reserved" and so could not tell
  // a prior stint from a current one in the Active table.
  let carryoverSection = false;
  // Hitter tables render a rowspan="2" header split across two <tr> rows:
  // the first carries Pos/Name/Tm/Sta/stat labels, the second carries the
  // seven individual "games by position" column labels (DH/C/1B/2B/3B/SS/OF)
  // with no Pos/Name cells of its own. Pitcher tables use rowspan="1" (a
  // single header row), so this second row never appears there. Track it
  // structurally rather than guessing from content, so it's never mistaken
  // for a malformed player row.
  let pendingPositionSubheaderRow = false;

  for (const row of rows) {
    const c = rawCells(row.body);
    if (c.length === 0) continue;

    if (pendingPositionSubheaderRow) {
      pendingPositionSubheaderRow = false;
      continue;
    }

    const joined = c.join(" ").toLowerCase();
    if (/previously (active|reserved)/.test(joined)) {
      carryoverSection = true;
      if (joined.includes("previously reserved")) reservedSection = true;
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
      carryoverSection = false;
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
      // Table membership only. Deriving this from `status !== "act"` (as an
      // earlier version did) mislabels a released player carried over in the
      // Active table — Andrew Vaughn's Active_Hitters_prev row, status "rel",
      // is NOT in the Reserved table and must not be counted as though it were.
      reserved: reservedFromRowClass(row.attrs) ?? reservedSection,
      carryover: carryoverSection,
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

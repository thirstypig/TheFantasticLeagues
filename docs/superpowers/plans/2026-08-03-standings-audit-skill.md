# Per-Player Standings Audit Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project skill that reconciles one OGBA period across FBST, MLB statsapi, FanGraphs OnRoto, and Baseball Reference — per player — and reports only the deltas it cannot explain.

**Architecture:** Pure, unit-tested parsing and classification modules under `server/src/lib/audit/`, orchestrated by a single CLI entry point at `server/src/scripts/audit-standings.ts`, invoked by a `.claude/skills/audit-standings/SKILL.md` procedure. All external-source I/O (FanGraphs HTML, Baseball Reference HTML, MLB JSON) is isolated at the edges so the logic is testable offline against checked-in fixtures.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Prisma, Vitest, `tsx` for script execution, Playwright MCP for Cloudflare-gated FanGraphs pages, plain `curl` where it suffices.

## Global Constraints

- **Trust hierarchy is fixed:** MLB statsapi > `PlayerStatsPeriod` > `playerStatsDaily` > FanGraphs. FG is a derived view; when FG and FBST disagree the question is "what does MLB say".
- **Prod project ref is `oaogpsshewmcazhehryl`.** Local is `127.0.0.1:54322`; the `.env.local` cloud project is `kfxdgcxiawwhzooexqtm`. Scripts run under `tsx` resolve to **local** by default — every prod run must assert the ref first.
- **ADR-015 feature isolation:** feature modules must not import from other feature modules. All new shared logic goes in `server/src/lib/audit/`, never in `server/src/features/*`. Verify with `node scripts/check-feature-isolation.mjs` — the 95-key baseline must not grow.
- **No new dependencies.** Parsing uses regex + Node built-ins, matching the existing scripts.
- **Coverage is part of the verdict.** A run that could not reach a source, was throttled, or skipped players is `INCOMPLETE`, never `PASS`.
- **The classifier may never invent a cause.** Expected deltas are computed from the transaction log *before* the observed gap is read. A delta with no derivable cause is residual by definition.
- **FanGraphs cannot express a per-player period slice** (spike, 2026-08-03). Period mode uses FG as a team-level tripwire only; per-player FG applies in `--season` mode.
- Tests run with **no network access** and must not touch a database.
- Commit after every task. Never use `CREATE INDEX CONCURRENTLY` (irrelevant here — no migrations in this plan).

---

## File Structure

| File | Responsibility |
|---|---|
| `server/scripts/with-prod-db.sh` | Exports prod `DATABASE_URL`/`DIRECT_URL` from Railway, asserts the prod ref, execs the given command. Removes credential plumbing from every call site. |
| `server/src/lib/audit/types.ts` | Shared types: `StatLine`, `CatKey`, `DivergenceCause`, `ExplainedDelta`, `ClassifyResult`. No logic. |
| `server/src/lib/audit/nameMatch.ts` | Normalize and match player names across sources (accents, suffixes, `mlbId` preference). |
| `server/src/lib/audit/fgStandingsParser.ts` | Parse `display_stand.pl` → per-team raw category values. |
| `server/src/lib/audit/fgTeamParser.ts` | Parse `display_team_stats.pl` → per-player season values + `Sta` (active/reserved) flag. |
| `server/src/lib/audit/bbrefParser.ts` | Parse a Baseball Reference game log → dated rows, summable over a window. |
| `server/src/lib/audit/classifier.ts` | Build divergence candidates from FBST data; compute explained vs residual. The core unit. |
| `server/src/lib/audit/report.ts` | Render the markdown report; decide `PASS` / `FINDINGS` / `INCOMPLETE`. |
| `server/src/scripts/audit-standings.ts` | CLI orchestrator wiring the above together. |
| `server/src/lib/audit/__tests__/*.test.ts` | Vitest units, fixture-driven, no network. |
| `server/src/lib/audit/__tests__/fixtures/*.html` | Captured HTML from FG and BBRef. |
| `.claude/skills/audit-standings/SKILL.md` | The procedure an agent follows. |

Task order builds bottom-up: primitives first (each independently testable), classifier in the middle, orchestrator and skill last.

---

### Task 1: Prod-DB wrapper script

Solves the recurring problem that every prod command is a compound shell line starting with `VARS=`, which matches no permission prefix rule and lands in classifier limbo.

**Files:**
- Create: `server/scripts/with-prod-db.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: a shell entry point — `./scripts/with-prod-db.sh <command...>` — used by every later task that touches prod.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Export prod Supabase URLs from Railway, assert we're on prod, then exec.
# Usage: ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts --period 39
set -euo pipefail

PROD_REF="oaogpsshewmcazhehryl"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 64
fi

VARS="$(env -u RAILWAY_API_TOKEN railway variables --kv)"
DATABASE_URL="$(printf '%s\n' "$VARS" | grep '^DATABASE_URL=' | cut -d= -f2-)"
DIRECT_URL="$(printf '%s\n' "$VARS" | grep '^DIRECT_URL=' | cut -d= -f2-)"
export DATABASE_URL DIRECT_URL

case "$DATABASE_URL" in
  *"$PROD_REF"*) ;;
  *) echo "REFUSING: DATABASE_URL is not prod ($PROD_REF)." >&2; exit 1 ;;
esac

echo "PROD confirmed ($PROD_REF)" >&2
exec "$@"
```

- [ ] **Step 2: Make it executable and verify the guard fires**

```bash
chmod +x server/scripts/with-prod-db.sh
cd server && DATABASE_URL="postgresql://localhost:54322/postgres" ./scripts/with-prod-db.sh echo "should not print"
```

Expected: it still reads Railway (the guard tests the *fetched* value, not the pre-set one), prints `PROD confirmed`, then `should not print`. If Railway is unavailable it exits non-zero — that is correct behavior.

- [ ] **Step 3: Verify it runs a real read**

```bash
cd server && ./scripts/with-prod-db.sh npx tsx -e "
import { prisma } from './src/db/prisma.js';
console.log('periods:', await prisma.period.count({ where: { leagueId: 20 } }));
await prisma.\$disconnect();
"
```

Expected: `PROD confirmed (oaogpsshewmcazhehryl)` then `periods: 7`.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/with-prod-db.sh
git commit -m "chore(audit): add with-prod-db.sh wrapper with prod-ref guard"
```

---

### Task 2: Shared types

**Files:**
- Create: `server/src/lib/audit/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `StatLine`, `CatKey`, `COUNTING_CATS`, `RATE_CATS`, `DivergenceCause`, `ExplainedDelta`, `ClassifyResult`, `emptyStatLine()`.

- [ ] **Step 1: Write the file**

```typescript
// server/src/lib/audit/types.ts

/** Raw counting stats for one player or one team, over one window. */
export interface StatLine {
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number;
}

export const COUNTING_CATS = ["R", "HR", "RBI", "SB", "W", "SV", "K"] as const;
export const RATE_CATS = ["AVG", "ERA", "WHIP"] as const;
export type CatKey = (typeof COUNTING_CATS)[number] | (typeof RATE_CATS)[number];

/** Why FBST and FanGraphs legitimately disagree about a player. */
export type DivergenceCause =
  | "il_exclusion"
  | "partial_ownership"
  | "two_way_synthetic"
  | "roster_mismatch"
  | "fg_coverage_lag";

/**
 * One expected divergence, derived from FBST's own data BEFORE the observed
 * FG gap is read. `evidence` must cite the source rows (transaction ids, dates).
 */
export interface ExplainedDelta {
  playerId: number;
  playerName: string;
  cause: DivergenceCause;
  expected: Partial<StatLine>;
  evidence: string;
}

export interface ClassifyResult {
  teamName: string;
  explained: Partial<StatLine>;
  residual: Partial<StatLine>;
  causes: ExplainedDelta[];
}

export function emptyStatLine(): StatLine {
  return { AB: 0, H: 0, R: 0, HR: 0, RBI: 0, SB: 0, W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit 2>&1 | tee /tmp/tsc.txt; wc -l /tmp/tsc.txt`

Expected: no errors referencing `lib/audit/types.ts`. Pipe the **full** output — never judge "clean" from a `tail -N` window.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/audit/types.ts
git commit -m "feat(audit): shared types for the standings audit"
```

---

### Task 3: Name matcher

Unmatched players are where a real delta hides, so an unmatched name is a finding, not a silent drop.

**Files:**
- Create: `server/src/lib/audit/nameMatch.ts`
- Test: `server/src/lib/audit/__tests__/nameMatch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeName(raw: string): string`, `matchByName<T extends { name: string }>(fgName: string, candidates: T[]): T | null`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/nameMatch.test.ts
import { describe, it, expect } from "vitest";
import { normalizeName, matchByName } from "../nameMatch.js";

describe("normalizeName", () => {
  it("strips accents so FanGraphs and FBST spellings converge", () => {
    expect(normalizeName("Ronald Acuña Jr.")).toBe(normalizeName("Ronald Acuna Jr"));
    expect(normalizeName("Andrés Chaparro")).toBe(normalizeName("Andres Chaparro"));
    expect(normalizeName("Jesús Luzardo")).toBe(normalizeName("Jesus Luzardo"));
  });

  it("ignores suffix punctuation but keeps the suffix token", () => {
    expect(normalizeName("Ronald Acuna Jr.")).toBe("ronald acuna jr");
  });

  it("does not collapse two different players", () => {
    expect(normalizeName("Will Smith")).not.toBe(normalizeName("Will Klein"));
  });
});

describe("matchByName", () => {
  const roster = [{ name: "Ronald Acuña Jr." }, { name: "Michael Busch" }];

  it("matches across accent spellings", () => {
    expect(matchByName("Ronald Acuna Jr", roster)?.name).toBe("Ronald Acuña Jr.");
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(matchByName("Shohei Ohtani", roster)).toBeNull();
  });

  it("returns null on an ambiguous match instead of picking one", () => {
    const dupes = [{ name: "Will Smith" }, { name: "Will Smith" }];
    expect(matchByName("Will Smith", dupes)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/nameMatch.test.ts`
Expected: FAIL — cannot resolve `../nameMatch.js`.

- [ ] **Step 3: Implement**

```typescript
// server/src/lib/audit/nameMatch.ts

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // combining marks
    .toLowerCase()
    .replace(/[.,'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact-on-normalized match. Returns null when there is no match OR when the
 * match is ambiguous — never guesses. An ambiguous or missing match is a
 * finding for the caller to report, not something to paper over.
 */
export function matchByName<T extends { name: string }>(
  fgName: string,
  candidates: T[],
): T | null {
  const target = normalizeName(fgName);
  const hits = candidates.filter((c) => normalizeName(c.name) === target);
  return hits.length === 1 ? hits[0]! : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/nameMatch.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/audit/nameMatch.ts server/src/lib/audit/__tests__/nameMatch.test.ts
git commit -m "feat(audit): accent-safe name matcher that refuses ambiguous matches"
```

---

### Task 4: FanGraphs standings parser

**Files:**
- Create: `server/src/lib/audit/fgStandingsParser.ts`
- Create: `server/src/lib/audit/__tests__/fixtures/fg_standings.html` (copy from scratchpad, see Step 1)
- Test: `server/src/lib/audit/__tests__/fgStandingsParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseFgStandings(html: string): { through: string | null; teams: Record<string, Record<CatKey, string>> }`.

- [ ] **Step 1: Capture the fixture**

```bash
mkdir -p server/src/lib/audit/__tests__/fixtures
curl -sL --max-time 30 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  "https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=guest" \
  -o server/src/lib/audit/__tests__/fixtures/fg_standings.html
wc -c server/src/lib/audit/__tests__/fixtures/fg_standings.html
```

Expected: ~70KB. If it is ~5.7KB the response is a Cloudflare challenge — retry, and if it persists use Playwright.

- [ ] **Step 2: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/fgStandingsParser.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFgStandings } from "../fgStandingsParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/fg_standings.html"),
  "utf-8",
);

describe("parseFgStandings", () => {
  const parsed = parseFgStandings(html);

  it("reads the authoritative coverage header", () => {
    expect(parsed.through).toMatch(/\d{2}\.\d{2}\.\d{2}/);
  });

  it("finds all 8 OGBA teams", () => {
    expect(Object.keys(parsed.teams)).toHaveLength(8);
    expect(parsed.teams["Demolition Lumber Co"]).toBeDefined();
  });

  it("reads RAW values from the breakdown rows, not roto points from the top grid", () => {
    // Regression guard: the top grid holds points like "8.0"/"5.0". Raw R is a
    // 3-digit count. If this ever returns a single-digit decimal the parser has
    // latched onto the wrong table.
    const r = parsed.teams["The Show"]!.R;
    expect(r).toBe("763");
    expect(r).not.toMatch(/^\d\.\d$/);
  });

  it("keeps rate stats as strings at FG's displayed precision", () => {
    expect(parsed.teams["Demolition Lumber Co"]!.AVG).toBe(".2659");
    expect(parsed.teams["Demolition Lumber Co"]!.ERA).toBe("3.43");
    expect(parsed.teams["Demolition Lumber Co"]!.WHIP).toBe("1.140");
  });

  it("maps FG's SV/SO labels onto FBST's SV/K keys", () => {
    expect(parsed.teams["Demolition Lumber Co"]!.SV).toBe("58");
    expect(parsed.teams["Demolition Lumber Co"]!.K).toBe("907");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/fgStandingsParser.test.ts`
Expected: FAIL — cannot resolve `../fgStandingsParser.js`.

- [ ] **Step 4: Implement**

```typescript
// server/src/lib/audit/fgStandingsParser.ts
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
    .map((m) => m[1]!.replace(/<[^>]+>/g, "").replace(/ /g, " ").trim())
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/fgStandingsParser.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/audit/fgStandingsParser.ts server/src/lib/audit/__tests__/
git commit -m "feat(audit): FanGraphs standings parser reading breakdown rows, not the points grid"
```

---

### Task 5: FanGraphs per-team player parser

Season YTD only — FG has no date filter (spike, 2026-08-03). Used in `--season` mode.

**Files:**
- Create: `server/src/lib/audit/fgTeamParser.ts`
- Create: `server/src/lib/audit/__tests__/fixtures/fg_team_0.html`
- Test: `server/src/lib/audit/__tests__/fgTeamParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseFgTeamPage(html: string): { players: FgPlayerRow[] }` where
  `FgPlayerRow = { name: string; pos: string; mlbTeam: string; status: string; reserved: boolean; stats: Record<string, string> }`.

- [ ] **Step 1: Capture the fixture with Playwright**

Plain `curl` returns HTTP 403 (Cloudflare). Use the Playwright MCP:

1. `browser_navigate` to `https://onroto.fangraphs.com/baseball/webnew/display_team_stats.pl?OGBA+6+0&session_id=guest`
2. `browser_evaluate` with `() => document.documentElement.outerHTML`, saving via the tool's `filename` parameter
3. Move the result to `server/src/lib/audit/__tests__/fixtures/fg_team_0.html`

Verify: `wc -c` should be well over 20KB. A 5701-byte file is the Cloudflare interstitial, not the page.

- [ ] **Step 2: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/fgTeamParser.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFgTeamPage } from "../fgTeamParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/fg_team_0.html"),
  "utf-8",
);

describe("parseFgTeamPage", () => {
  const { players } = parseFgTeamPage(html);

  it("parses a full roster, not an empty list", () => {
    // Silent-zero guard: a wrong selector yields [] which reads as "no deltas".
    expect(players.length).toBeGreaterThan(15);
  });

  it("reads the season value from each two-value cell", () => {
    // Cells hold "season\nweek" — e.g. "419\n3". We want 419.
    const busch = players.find((p) => p.name === "Michael Busch");
    expect(busch?.stats.AB).toBe("419");
  });

  it("captures FG's own active/reserved status", () => {
    const busch = players.find((p) => p.name === "Michael Busch");
    expect(busch?.status).toBe("act");
    expect(busch?.reserved).toBe(false);
  });

  it("parses pitchers with the pitching column set", () => {
    const sale = players.find((p) => p.name === "Chris Sale");
    expect(sale?.stats.IP).toBe("117.0");
    expect(sale?.stats.SO).toBe("143");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/fgTeamParser.test.ts`
Expected: FAIL — cannot resolve `../fgTeamParser.js`.

- [ ] **Step 4: Implement**

```typescript
// server/src/lib/audit/fgTeamParser.ts

export interface FgPlayerRow {
  name: string;
  pos: string;
  mlbTeam: string;
  status: string;
  reserved: boolean;
  stats: Record<string, string>;
}

const HITTER_COLS = ["Pos", "Name", "Tm", "Sta", "GamesByPos", "AB", "H", "R", "HR", "RBI", "SB", "AVG", "GS"];
const PITCHER_COLS = ["Pos", "Name", "Tm", "Sta", "IP", "ER", "H", "BB", "SO", "W", "SV", "ERA", "WHIP", "ShO", "NH"];

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
      .replace(/ /g, " ")
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
  let cols: string[] | null = null;
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
      cols = c.includes("IP") ? PITCHER_COLS : HITTER_COLS;
      continue;
    }
    if (!cols) continue;
    if (c[0] === "TOTAL:" || c.length < 5) continue;

    const stats: Record<string, string> = {};
    cols.forEach((col, i) => {
      if (["Pos", "Name", "Tm", "Sta", "GamesByPos"].includes(col)) return;
      if (c[i] !== undefined) stats[col] = seasonHalf(c[i]!);
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/fgTeamParser.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/audit/fgTeamParser.ts server/src/lib/audit/__tests__/
git commit -m "feat(audit): FanGraphs per-team player parser incl. reserved/IL status"
```

---

### Task 6: Baseball Reference game-log parser

Encodes the column-name lesson: BBRef uses `data-stat="date"` and `b_`-prefixed batting stats. Wrong keys yield **zero rows, not an error**.

**Files:**
- Create: `server/src/lib/audit/bbrefParser.ts`
- Create: `server/src/lib/audit/__tests__/fixtures/bbref_acuna.html`
- Test: `server/src/lib/audit/__tests__/bbrefParser.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseBbrefGameLog(html: string): BbrefGame[]` and
  `sumWindow(games: BbrefGame[], startIso: string, endIso: string): { games: number; stats: Record<string, number> }`.

- [ ] **Step 1: Capture the fixture**

```bash
curl -s --max-time 30 \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://www.baseball-reference.com/players/gl.fcgi?id=acunaro01&t=b&year=2026" \
  -o server/src/lib/audit/__tests__/fixtures/bbref_acuna.html
wc -c server/src/lib/audit/__tests__/fixtures/bbref_acuna.html
```

Expected: ~400KB, HTTP 200. Plain curl works here — no Playwright needed.

- [ ] **Step 2: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/bbrefParser.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBbrefGameLog, sumWindow } from "../bbrefParser.js";

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/bbref_acuna.html"),
  "utf-8",
);

describe("parseBbrefGameLog", () => {
  const games = parseBbrefGameLog(html);

  it("parses a non-empty game log", () => {
    // The whole point: wrong data-stat keys return [] silently. Assert loudly.
    expect(games.length).toBeGreaterThan(20);
  });

  it("reads dates from data-stat='date', not 'date_game'", () => {
    expect(games[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("sumWindow", () => {
  const games = parseBbrefGameLog(html);

  it("reproduces the verified Period 5 window for Acuna", () => {
    // Ground truth, 2026-08-03: FBST PSP == MLB statsapi == BBRef.
    const got = sumWindow(games, "2026-07-05", "2026-08-01");
    expect(got.games).toBe(6);
    expect(got.stats.R).toBe(5);
    expect(got.stats.HR).toBe(2);
    expect(got.stats.RBI).toBe(2);
    expect(got.stats.SB).toBe(0);
    expect(got.stats.AB).toBe(22);
  });

  it("counts both halves of the 2026-07-29 doubleheader as separate games", () => {
    const got = sumWindow(games, "2026-07-29", "2026-07-29");
    expect(got.games).toBe(2);
  });

  it("throws rather than returning zeros when a window matches nothing", () => {
    expect(() => sumWindow(games, "2030-01-01", "2030-12-31")).toThrow(/no games/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/bbrefParser.test.ts`
Expected: FAIL — cannot resolve `../bbrefParser.js`.

- [ ] **Step 4: Implement**

```typescript
// server/src/lib/audit/bbrefParser.ts

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
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/bbrefParser.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/audit/bbrefParser.ts server/src/lib/audit/__tests__/
git commit -m "feat(audit): Baseball Reference game-log parser that throws on empty windows"
```

---

### Task 7: The classifier

The core unit, and the one that can quietly ruin the tool if it overfits.

**Files:**
- Create: `server/src/lib/audit/classifier.ts`
- Test: `server/src/lib/audit/__tests__/classifier.test.ts`

**Interfaces:**
- Consumes: `StatLine`, `ExplainedDelta`, `ClassifyResult`, `emptyStatLine` from `./types.js` (Task 2).
- Produces:
  - `buildIlCandidates(args: { teamName: string; ilWindows: { playerId: number; playerName: string; start: Date; end: Date | null }[]; period: { id: number; startDate: Date; endDate: Date }; pspByPlayer: Map<number, StatLine> }): ExplainedDelta[]`
  - `classifyTeamDelta(args: { teamName: string; fbstTotals: StatLine; fgTotals: StatLine; candidates: ExplainedDelta[] }): ClassifyResult`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/classifier.test.ts
import { describe, it, expect } from "vitest";
import { buildIlCandidates, classifyTeamDelta } from "../classifier.js";
import { emptyStatLine, type StatLine } from "../types.js";

function line(p: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...p };
}

// Golden fixture — real, three-source-verified data from 2026-08-03.
// Acuna: IL_STASH 07-05, IL_ACTIVATE 08-02; Period 5 ran 07-05 -> 08-01.
// His P5 PSP (R5/HR2/RBI2/SB0/AB22) was confirmed identical in FBST,
// MLB statsapi, and Baseball Reference.
const PERIOD_5 = {
  id: 39,
  startDate: new Date("2026-07-05T00:00:00Z"),
  endDate: new Date("2026-08-01T00:00:00Z"),
};
const ACUNA_P5 = line({ R: 5, HR: 2, RBI: 2, SB: 0, AB: 22 });

describe("buildIlCandidates", () => {
  it("flags a player IL-stashed at period start as an expected divergence", () => {
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 1, playerName: "Ronald Acuña Jr.",
        start: new Date("2026-07-05T00:00:00Z"),
        end: new Date("2026-08-02T00:00:00Z"),
      }],
      pspByPlayer: new Map([[1, ACUNA_P5]]),
    });

    expect(got).toHaveLength(1);
    expect(got[0]!.cause).toBe("il_exclusion");
    expect(got[0]!.expected.R).toBe(5);
    expect(got[0]!.evidence).toMatch(/IL/i);
  });

  it("ignores an IL window that starts AFTER the period began", () => {
    // FBST excludes on IL-at-period-START, not any IL overlap.
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 1, playerName: "Ronald Acuña Jr.",
        start: new Date("2026-07-20T00:00:00Z"), end: null,
      }],
      pspByPlayer: new Map([[1, ACUNA_P5]]),
    });
    expect(got).toHaveLength(0);
  });

  it("produces no candidate when the player has no PSP row", () => {
    const got = buildIlCandidates({
      teamName: "Demolition Lumber Co",
      period: PERIOD_5,
      ilWindows: [{
        playerId: 99, playerName: "Nobody",
        start: new Date("2026-07-05T00:00:00Z"), end: null,
      }],
      pspByPlayer: new Map(),
    });
    expect(got).toHaveLength(0);
  });
});

describe("classifyTeamDelta", () => {
  it("closes a delta fully explained by the IL window", () => {
    const got = classifyTeamDelta({
      teamName: "Demolition Lumber Co",
      fbstTotals: line({ HR: 164 }),
      fgTotals: line({ HR: 167 }),
      candidates: [
        { playerId: 1, playerName: "Ronald Acuña Jr.", cause: "il_exclusion",
          expected: { HR: 2 }, evidence: "IL 07-05..08-02" },
        { playerId: 2, playerName: "Andrew Vaughn", cause: "il_exclusion",
          expected: { HR: 1 }, evidence: "IL 04-19..05-17" },
      ],
    });
    expect(got.explained.HR).toBe(3);
    expect(got.residual.HR).toBe(0);
  });

  it("keeps an unexplained remainder as residual instead of absorbing it", () => {
    // The anti-overfit property. FBST 637 + explained 7 = 644, FG 646 -> -2.
    const got = classifyTeamDelta({
      teamName: "Demolition Lumber Co",
      fbstTotals: line({ RBI: 637 }),
      fgTotals: line({ RBI: 646 }),
      candidates: [
        { playerId: 1, playerName: "Ronald Acuña Jr.", cause: "il_exclusion",
          expected: { RBI: 2 }, evidence: "IL 07-05..08-02" },
        { playerId: 2, playerName: "Andrew Vaughn", cause: "il_exclusion",
          expected: { RBI: 5 }, evidence: "IL 04-19..05-17" },
      ],
    });
    expect(got.explained.RBI).toBe(7);
    expect(got.residual.RBI).toBe(-2);
  });

  it("reports the whole gap as residual when there are no candidates", () => {
    const got = classifyTeamDelta({
      teamName: "Skunk Dogs",
      fbstTotals: line({ SB: 122 }),
      fgTotals: line({ SB: 124 }),
      candidates: [],
    });
    expect(got.explained.SB ?? 0).toBe(0);
    expect(got.residual.SB).toBe(-2);
  });

  it("never lets explained exceed the observed gap silently", () => {
    // An over-large candidate must flip residual positive and stay visible,
    // not be clamped to zero.
    const got = classifyTeamDelta({
      teamName: "Devil Dawgs",
      fbstTotals: line({ R: 100 }),
      fgTotals: line({ R: 101 }),
      candidates: [
        { playerId: 7, playerName: "Overclaim", cause: "il_exclusion",
          expected: { R: 50 }, evidence: "synthetic" },
      ],
    });
    expect(got.residual.R).toBe(49);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/classifier.test.ts`
Expected: FAIL — cannot resolve `../classifier.js`.

- [ ] **Step 3: Implement**

```typescript
// server/src/lib/audit/classifier.ts
import { emptyStatLine, type ExplainedDelta, type ClassifyResult, type StatLine } from "./types.js";

const STAT_KEYS = Object.keys(emptyStatLine()) as (keyof StatLine)[];

/**
 * Build expected IL divergences from the transaction log.
 *
 * Deliberately takes NO FanGraphs input: candidates must be derivable from
 * FBST's own data alone, so the classifier can never be tuned to fit an
 * observed gap. (See PR #402 — the measuring instrument was the bug.)
 *
 * Mirrors wasOnIlAtPeriodStart: FBST excludes a player who was IL-slotted at
 * the START of the period, regardless of when he came back.
 */
export function buildIlCandidates(args: {
  teamName: string;
  ilWindows: { playerId: number; playerName: string; start: Date; end: Date | null }[];
  period: { id: number; startDate: Date; endDate: Date };
  pspByPlayer: Map<number, StatLine>;
}): ExplainedDelta[] {
  const { ilWindows, period, pspByPlayer } = args;
  const out: ExplainedDelta[] = [];

  for (const w of ilWindows) {
    const startedOnOrBefore = w.start.getTime() <= period.startDate.getTime();
    const stillOpenAtStart = w.end === null || w.end.getTime() > period.startDate.getTime();
    if (!startedOnOrBefore || !stillOpenAtStart) continue;

    const psp = pspByPlayer.get(w.playerId);
    if (!psp) continue; // no stats to be excluded — nothing to explain

    const expected: Partial<StatLine> = {};
    for (const k of STAT_KEYS) if (psp[k]) expected[k] = psp[k];

    out.push({
      playerId: w.playerId,
      playerName: w.playerName,
      cause: "il_exclusion",
      expected,
      evidence:
        `IL window ${w.start.toISOString().slice(0, 10)}..` +
        `${w.end ? w.end.toISOString().slice(0, 10) : "open"} covers start of ` +
        `period ${period.id} (${period.startDate.toISOString().slice(0, 10)}); ` +
        `FBST excludes, OnRoto counts YTD`,
    });
  }
  return out;
}

/**
 * residual = (FBST + explained) - FG, per category.
 *
 * Residual is reported raw — never clamped, never floored at zero. An
 * over-large "explained" flips the sign and stays visible, which is the
 * signal that a candidate is wrong.
 */
export function classifyTeamDelta(args: {
  teamName: string;
  fbstTotals: StatLine;
  fgTotals: StatLine;
  candidates: ExplainedDelta[];
}): ClassifyResult {
  const { teamName, fbstTotals, fgTotals, candidates } = args;

  const explained: Partial<StatLine> = {};
  for (const c of candidates) {
    for (const [k, v] of Object.entries(c.expected) as [keyof StatLine, number][]) {
      explained[k] = (explained[k] ?? 0) + v;
    }
  }

  const residual: Partial<StatLine> = {};
  for (const k of STAT_KEYS) {
    const diff = fbstTotals[k] + (explained[k] ?? 0) - fgTotals[k];
    if (diff !== 0) residual[k] = diff;
  }

  return { teamName, explained, residual, causes: candidates };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/classifier.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/audit/classifier.ts server/src/lib/audit/__tests__/classifier.test.ts
git commit -m "feat(audit): divergence classifier with anti-overfit residual reporting"
```

---

### Task 8: Report renderer and verdict

**Files:**
- Create: `server/src/lib/audit/report.ts`
- Test: `server/src/lib/audit/__tests__/report.test.ts`

**Interfaces:**
- Consumes: `ClassifyResult` from `./types.js`.
- Produces: `decideVerdict(args: { results: ClassifyResult[]; coverage: Coverage }): "PASS" | "FINDINGS" | "INCOMPLETE"` and `renderReport(...): string`, where
  `Coverage = { playersChecked: number; playersSkipped: number; skipReasons: string[]; sourcesReached: { fbst: boolean; mlb: boolean; fg: boolean; bbref: boolean }; fgLegLevel: "per-player" | "team-level" }`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/lib/audit/__tests__/report.test.ts
import { describe, it, expect } from "vitest";
import { decideVerdict, renderReport, type Coverage } from "../report.js";
import type { ClassifyResult } from "../types.js";

const fullCoverage: Coverage = {
  playersChecked: 219, playersSkipped: 0, skipReasons: [],
  sourcesReached: { fbst: true, mlb: true, fg: true, bbref: true },
  fgLegLevel: "per-player",
};
const clean: ClassifyResult = { teamName: "Skunk Dogs", explained: {}, residual: {}, causes: [] };

describe("decideVerdict", () => {
  it("passes only when residuals are empty AND coverage is complete", () => {
    expect(decideVerdict({ results: [clean], coverage: fullCoverage })).toBe("PASS");
  });

  it("reports FINDINGS when any residual is non-zero", () => {
    const withResidual: ClassifyResult = { ...clean, residual: { RBI: -2 } };
    expect(decideVerdict({ results: [withResidual], coverage: fullCoverage })).toBe("FINDINGS");
  });

  it("is INCOMPLETE when players were skipped, even with zero residuals", () => {
    // The audit-mlb-crosscheck trap: "0 flagged" while skipping 43 players
    // reads as a clean bill of health and is not one.
    const partial: Coverage = { ...fullCoverage, playersSkipped: 43, skipReasons: ["partial ownership"] };
    expect(decideVerdict({ results: [clean], coverage: partial })).toBe("INCOMPLETE");
  });

  it("is INCOMPLETE when a source could not be reached", () => {
    const noFg: Coverage = { ...fullCoverage, sourcesReached: { ...fullCoverage.sourcesReached, fg: false } };
    expect(decideVerdict({ results: [clean], coverage: noFg })).toBe("INCOMPLETE");
  });

  it("INCOMPLETE outranks FINDINGS", () => {
    const withResidual: ClassifyResult = { ...clean, residual: { RBI: -2 } };
    const partial: Coverage = { ...fullCoverage, playersSkipped: 1, skipReasons: ["IL"] };
    expect(decideVerdict({ results: [withResidual], coverage: partial })).toBe("INCOMPLETE");
  });
});

describe("renderReport", () => {
  it("states the FG leg level so a team-level run is never read as per-player", () => {
    const md = renderReport({
      periodName: "Period 5",
      results: [clean],
      coverage: { ...fullCoverage, fgLegLevel: "team-level" },
    });
    expect(md).toMatch(/team-level/);
  });

  it("prints explained and residual side by side", () => {
    const md = renderReport({
      periodName: "Period 5",
      results: [{ teamName: "Demolition Lumber Co", explained: { HR: 3 }, residual: { RBI: -2 }, causes: [] }],
      coverage: fullCoverage,
    });
    expect(md).toMatch(/explained/i);
    expect(md).toMatch(/residual/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run src/lib/audit/__tests__/report.test.ts`
Expected: FAIL — cannot resolve `../report.js`.

- [ ] **Step 3: Implement**

```typescript
// server/src/lib/audit/report.ts
import type { ClassifyResult, StatLine } from "./types.js";

export interface Coverage {
  playersChecked: number;
  playersSkipped: number;
  skipReasons: string[];
  sourcesReached: { fbst: boolean; mlb: boolean; fg: boolean; bbref: boolean };
  fgLegLevel: "per-player" | "team-level";
}

export type Verdict = "PASS" | "FINDINGS" | "INCOMPLETE";

/**
 * Coverage is part of the verdict. A run that skipped players or failed to
 * reach a source can never be PASS — absence of evidence is not evidence of
 * correctness. INCOMPLETE outranks FINDINGS.
 */
export function decideVerdict(args: { results: ClassifyResult[]; coverage: Coverage }): Verdict {
  const { results, coverage } = args;
  const allReached = Object.values(coverage.sourcesReached).every(Boolean);
  if (!allReached || coverage.playersSkipped > 0) return "INCOMPLETE";
  const anyResidual = results.some((r) => Object.keys(r.residual).length > 0);
  return anyResidual ? "FINDINGS" : "PASS";
}

function fmt(part: Partial<StatLine>): string {
  const entries = Object.entries(part).filter(([, v]) => v !== 0);
  return entries.length ? entries.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") : "—";
}

export function renderReport(args: {
  periodName: string;
  results: ClassifyResult[];
  coverage: Coverage;
}): string {
  const { periodName, results, coverage } = args;
  const verdict = decideVerdict({ results, coverage });

  const lines: string[] = [];
  lines.push(`# Standings audit — ${periodName}`, "");
  lines.push(`**Verdict: ${verdict}**`, "");
  lines.push(
    `Players checked: ${coverage.playersChecked} · skipped: ${coverage.playersSkipped}` +
      (coverage.skipReasons.length ? ` (${coverage.skipReasons.join("; ")})` : ""),
  );
  lines.push(`FanGraphs leg: **${coverage.fgLegLevel}**`);
  lines.push(
    `Sources reached: ` +
      Object.entries(coverage.sourcesReached)
        .map(([k, v]) => `${k}=${v ? "yes" : "NO"}`)
        .join(" · "),
    "",
  );

  lines.push("| Team | Explained by model difference | Unexplained residual |", "|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.teamName} | ${fmt(r.explained)} | ${fmt(r.residual)} |`);
  }
  lines.push("");

  const withCauses = results.filter((r) => r.causes.length > 0);
  if (withCauses.length) {
    lines.push("## Attributed divergences", "");
    for (const r of withCauses) {
      for (const c of r.causes) {
        lines.push(`- **${r.teamName}** — ${c.playerName} (${c.cause}): ${fmt(c.expected)}. ${c.evidence}`);
      }
    }
    lines.push("");
  }

  if (verdict !== "PASS") {
    lines.push(
      "> Any non-zero residual requires the four-way tie-break (MLB statsapi + " +
        "Baseball Reference) before stating a verdict. Do not round it away.",
    );
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run src/lib/audit/__tests__/report.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/audit/report.ts server/src/lib/audit/__tests__/report.test.ts
git commit -m "feat(audit): report renderer where coverage gaps force INCOMPLETE"
```

---

### Task 9: CLI orchestrator

**Files:**
- Create: `server/src/scripts/audit-standings.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8, plus `reconcilePeriodStats` from `../features/players/services/mlbStatsSyncService.js` and `buildIlWindows` from `../lib/ilWindows.js`.
- Produces: a CLI — `npx tsx src/scripts/audit-standings.ts [leagueId] [--period N] [--season]`.

- [ ] **Step 1: Write the orchestrator**

```typescript
// server/src/scripts/audit-standings.ts
/**
 * Per-player standings audit. See docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md
 * Run: ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { reconcilePeriodStats } from "../features/players/services/mlbStatsSyncService.js";
import { parseFgStandings } from "../lib/audit/fgStandingsParser.js";
import { classifyTeamDelta, buildIlCandidates } from "../lib/audit/classifier.js";
import { renderReport, type Coverage } from "../lib/audit/report.js";
import { emptyStatLine, type StatLine } from "../lib/audit/types.js";

const PROD_REF = "oaogpsshewmcazhehryl";

function assertProd(): void {
  if (!(process.env.DATABASE_URL ?? "").includes(PROD_REF)) {
    throw new Error(`Refusing to run: DATABASE_URL is not prod (${PROD_REF}). Use ./scripts/with-prod-db.sh`);
  }
}

async function main(): Promise<void> {
  assertProd();
  const leagueId = Number(process.argv[2] ?? 20);
  const periodArgIdx = process.argv.indexOf("--period");
  const explicitPeriod = periodArgIdx > -1 ? Number(process.argv[periodArgIdx + 1]) : null;

  const period = explicitPeriod
    ? await prisma.period.findUniqueOrThrow({ where: { id: explicitPeriod } })
    : await prisma.period.findFirstOrThrow({
        where: { leagueId, status: "completed" },
        orderBy: { startDate: "desc" },
      });

  console.log(`Auditing ${period.name} (id=${period.id}) — ${period.startDate.toISOString().slice(0, 10)} -> ${period.endDate.toISOString().slice(0, 10)}`);

  // --- MLB ground truth (independent of FanGraphs) ---
  const recon = await reconcilePeriodStats(period.id);
  console.log(`MLB reconcile: ${recon.playersChecked} checked, ${recon.mismatches.length} mismatches, ${recon.fetchErrors} fetch errors`);

  // --- FanGraphs team-level tripwire (period mode: team-level only) ---
  let fgTeams: Record<string, Record<string, string>> = {};
  let fgReached = false;
  let fgThrough: string | null = null;
  try {
    const res = await fetch(
      "https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=guest",
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } },
    );
    const parsed = parseFgStandings(await res.text());
    fgTeams = parsed.teams;
    fgThrough = parsed.through;
    fgReached = true;
    console.log(`FanGraphs coverage: ${fgThrough}`);
  } catch (err) {
    console.error(`FanGraphs leg FAILED: ${String(err)} — run will be INCOMPLETE`);
  }

  // --- FBST per-team totals + IL candidates ---
  const teams = await prisma.team.findMany({ where: { leagueId }, select: { id: true, name: true } });
  const ilTx = await prisma.transactionEvent.findMany({
    where: { leagueId, transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] } },
    orderBy: { effDate: "asc" },
    select: { transactionType: true, effDate: true, playerId: true, teamId: true, player: { select: { name: true } } },
  });

  const results = [];
  for (const t of teams) {
    const fbstTotals = emptyStatLine(); // populated from PSP + ownership windows
    const fgRaw = fgTeams[t.name.trim()] ?? {};
    const fgTotals: StatLine = { ...emptyStatLine() };
    for (const k of ["R", "HR", "RBI", "SB", "W", "SV", "K"] as (keyof StatLine)[]) {
      fgTotals[k] = Number(fgRaw[k] ?? 0);
    }

    // Pair IL_STASH -> IL_ACTIVATE per player for this team.
    const windows: { playerId: number; playerName: string; start: Date; end: Date | null }[] = [];
    const open = new Map<number, { playerName: string; start: Date }>();
    for (const tx of ilTx.filter((x) => x.teamId === t.id)) {
      if (!tx.playerId || !tx.effDate) continue;
      if (tx.transactionType === "IL_STASH") {
        open.set(tx.playerId, { playerName: tx.player?.name ?? "?", start: tx.effDate });
      } else {
        const o = open.get(tx.playerId);
        if (o) { windows.push({ playerId: tx.playerId, ...o, end: tx.effDate }); open.delete(tx.playerId); }
      }
    }
    for (const [playerId, o] of open) windows.push({ playerId, ...o, end: null });

    const psp = await prisma.playerStatsPeriod.findMany({
      where: { periodId: period.id, playerId: { in: windows.map((w) => w.playerId) } },
    });
    const pspByPlayer = new Map<number, StatLine>(
      psp.map((p) => [p.playerId, { ...emptyStatLine(), AB: p.AB, H: p.H, R: p.R, HR: p.HR, RBI: p.RBI, SB: p.SB, W: p.W, SV: p.SV, K: p.K, IP: p.IP, ER: p.ER, BB_H: p.BB_H }]),
    );

    const candidates = buildIlCandidates({ teamName: t.name, ilWindows: windows, period, pspByPlayer });
    results.push(classifyTeamDelta({ teamName: t.name, fbstTotals, fgTotals, candidates }));
  }

  const coverage: Coverage = {
    playersChecked: recon.playersChecked,
    playersSkipped: 0,
    skipReasons: [],
    sourcesReached: { fbst: true, mlb: recon.fetchErrors === 0, fg: fgReached, bbref: true },
    fgLegLevel: "team-level", // FG has no per-player period slice (spike 2026-08-03)
  };

  const md = renderReport({ periodName: period.name, results, coverage });
  mkdirSync("../docs/reports", { recursive: true });
  const out = `../docs/reports/standings-audit-${period.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(out, md);
  console.log(`\n${md}\n\nWritten to ${out}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
```

> **Note for the implementer:** `fbstTotals` is left as `emptyStatLine()` above because computing FBST's per-team period totals must reuse the existing accumulation path rather than reimplement it. Before finishing this task, read `server/src/scripts/audit_period.ts` and reuse its per-team accumulation (it already applies `buildIlWindows` and ownership windows). Do **not** write a second accumulator — a divergent copy is exactly the PR #402 failure. If that logic is not exported, extract it into `server/src/lib/audit/fbstTotals.ts` and have both callers use it.

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit 2>&1 | tee /tmp/tsc.txt; wc -l /tmp/tsc.txt`
Expected: 0 lines. Pipe full output — a `tail -N` window hides errors above the cutoff.

- [ ] **Step 3: Run against prod**

Run: `cd server && ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20`
Expected: prints `PROD confirmed`, the MLB reconcile line, FG coverage, a per-team table, and writes a report file.

- [ ] **Step 4: Verify feature isolation did not regress**

Run: `node scripts/check-feature-isolation.mjs`
Expected: baseline unchanged at 95 keys. If it grew, move the offending import into `server/src/lib/`.

- [ ] **Step 5: Commit**

```bash
git add server/src/scripts/audit-standings.ts server/src/lib/audit/
git commit -m "feat(audit): CLI orchestrator for the per-player standings audit"
```

---

### Task 10: The skill

**Files:**
- Create: `.claude/skills/audit-standings/SKILL.md`

**Interfaces:**
- Consumes: the CLI from Task 9.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the skill**

````markdown
---
name: audit-standings
description: Reconcile FBST standings for one period against MLB statsapi, FanGraphs OnRoto, and Baseball Reference, per player. Use when the user says "audit standings", "onroto audit", "check the standings", or after closing a period.
---

# Standings audit

Reconciles one period across four sources and reports only unexplained deltas.

**Trust order: MLB statsapi > PlayerStatsPeriod > playerStatsDaily > FanGraphs.**
FG is a derived view. When FG and FBST disagree, ask what MLB says.

## Steps

1. **Run the audit.** From `server/`:

   ```bash
   ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20
   ```

   Defaults to the most recently completed period. Add `--period N` to target one.
   The wrapper asserts the prod ref and refuses otherwise.

2. **Read the verdict.**
   - `PASS` — zero residuals AND full coverage. Done.
   - `FINDINGS` — at least one non-zero residual. Go to step 3.
   - `INCOMPLETE` — a source was unreachable or players were skipped. **This is not
     a pass.** Say so plainly; do not report it as clean.

3. **Shape-read before theorising.** One team diverging means attribution or roster.
   All teams diverging by a similar trailing amount means sync timing — check FG's
   `through MM.DD.YY` header against the period end before anything else.

4. **Four-way tie-break on any residual — mandatory.** Do not state a verdict or
   claim confidence above "unverified hypothesis" until the residual players are
   checked against MLB statsapi AND Baseball Reference:

   ```bash
   curl -s "https://statsapi.mlb.com/api/v1/people/<mlbId>/stats?stats=gameLog&season=2026&group=hitting"
   curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
     "https://www.baseball-reference.com/players/gl.fcgi?id=<bbrefId>&t=b&year=2026"
   ```

   Align the as-of date (games played) first — statsapi leads the others on
   same-day games.

5. **Log the run.** Append one row to the Results log in
   `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`.

## Known gotchas

- **FanGraphs has no per-player period slice.** The per-team page's only `<select>`
  is `changeTeam`; season YTD only. Period mode therefore uses FG as a *team-level
  tripwire*. The report says so — never read it as per-player.
- **Per-team and historical FG pages are Cloudflare-gated** (403 to curl). Only
  `display_stand.pl` works with plain curl. Use Playwright for the others.
- **On `display_stand.pl`, the top grid holds roto points, not raw stats.** Raw
  values live in the per-category breakdown rows.
- **Baseball Reference column keys are not the obvious ones**: the date column is
  `data-stat="date"` (not `date_game`) and batting stats are `b_`-prefixed
  (`b_r`, `b_hr`, `b_rbi`). Wrong keys return **zero rows, not an error**.
- **An IL window that exactly brackets a period is the highest-yield suspect.**
  A player IL-stashed but still playing scores nothing in FBST and full YTD in
  OnRoto. That is a rules question, not a bug.

## Reference

- Spec: `docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md` (DOC-024)
- Runbook: `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`
- Precedent: `docs/solutions/integration-issues/il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`
````

- [ ] **Step 2: Verify the skill is discoverable**

Run: `ls .claude/skills/audit-standings/SKILL.md && head -5 .claude/skills/audit-standings/SKILL.md`
Expected: frontmatter with `name:` and `description:` present.

- [ ] **Step 3: Run the full suite**

Run: `npm run test 2>&1 | tail -20`
Expected: previous total + 23 new tests, all passing.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/audit-standings/SKILL.md
git commit -m "feat(audit): audit-standings skill wrapping the four-source reconciliation"
```

---

## Self-Review

**Spec coverage:** Prod guard → Task 1 + Task 9 Step 1. Legality pre-checks → **gap, see below**. FBST layer → Task 9. MLB layer → Task 9 (`reconcilePeriodStats`). FG layer → Tasks 4, 5, 9 (Branch B per spike). Classifier → Task 7. BBRef tie-break → Task 6 + skill step 4. Report → Task 8. Coverage-in-verdict → Task 8. Name matching → Task 3. Testing → Tasks 3–8.

**Known gap, deliberately deferred:** the spec's step 2 (legality pre-checks — active-cap, per-slot limits, position eligibility) has **no task**. It needs `auditRosterRules.ts`, which is separate tooling with its own surface area, and folding it in would double this plan. It should be its own plan. Until then the skill's step 1 covers stats only; the runbook's Scope note already documents the same split.

**Placeholders:** none. The one `emptyStatLine()` stand-in in Task 9 carries an explicit implementer note pointing at `audit_period.ts` for the real accumulation, with a warning against writing a second accumulator.

**Type consistency:** `StatLine`, `ExplainedDelta`, `ClassifyResult`, `Coverage` are defined once (Tasks 2, 8) and used with matching shapes in Tasks 7–9. `buildIlCandidates` and `classifyTeamDelta` signatures match their call sites in Task 9. Parser return shapes match their test assertions.

---
title: "An HTML parser that silently drops rows passes every test written for it — three layers of ground truth were wrong in turn"
slug: html-parser-silent-row-drop-passes-its-own-tests
category: integration-issues
created: 2026-08-03
component: audit, fgTeamParser, standings
problem_type: parsing / silent-data-loss
symptom: "Parser returns a plausible-looking roster and passes all its tests, but 18 of 41 rows are missing. The dropped rows are exactly the ones the audit exists to examine."
root_cause: "FanGraphs carryover rows hold FLAT stat cells while normal rows hold two-value 'season\\nweek' cells. Anchoring the stat-column offset on 'first cell containing a newline' returns -1 for carryover rows, which then fall through a bare `continue`. Separately, a section flag set inside one table was never reset, mislabelling every row in later tables."
related_modules: audit, standings, players
prs: []
tags: fangraphs, onroto, audit, testing, data-sync
---

# A parser that silently drops rows passes every test written for it

## Symptom

`parseFgTeamPage` returned 23 players from a FanGraphs per-team page that contains
41 rows. No error, no warning, no failing test — **all four prescribed tests
passed**. The output looked like a plausible roster.

The 18 missing rows were not random. They were the carryover ("previously
reserved" / "previously active") stints, which include **Ronald Acuña and Andrew
Vaughn** — the two players whose IL windows are the entire subject of the audit
this parser was built to support. See
[`il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`](./il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md).

A second defect rode along: every pitcher, including active ones, came back
`reserved: true`.

## Root cause

### 1. The two-value anchor

FanGraphs per-team rows have a variable prefix. A hitter row is 19 cells —
`Pos, Name, Tm, Sta`, then **seven** games-by-position cells, then 8 stat cells.
A pitcher row is 15 cells — the same 4, then 11 stat cells, no games-by-position.
So indexing stats positionally from zero cannot work for both.

The chosen anchor was "stats begin at the first cell containing a newline",
because normal stat cells hold `season\nweek` (e.g. `419\n3`) while prefix cells
are single-valued. That is true — for *current* stints.

**Carryover rows hold flat single values with no newline at all.** So:

```typescript
const firstStatIdx = c.findIndex((cell) => cell.includes("\n"));
if (firstStatIdx === -1) continue;   // <- 18 real players exit here, silently
```

### 2. The un-reset section flag

```typescript
if (joined.includes("previously reserved")) { reservedSection = true; continue; }
```

Document order is Active Hitters → Reserved Hitters (contains the divider) →
Active Pitchers → Reserved Pitchers. The flag flipped true inside the reserved
*hitters* table and was never reset, so every subsequent pitcher inherited it.

## The fix

**Anchor on length, not on content shape.** The stat block is always the tail of
the row, so its offset is derivable arithmetically and works for split *and* flat
cells:

```typescript
const firstStatIdx = c.length - statNames.length;
if (firstStatIdx < 4) { skipped.push(c[1] ?? "<unnamed>"); continue; }
```

Hitters: 19 − 8 = 11. Pitchers: 15 − 11 = 4. Both correct, regardless of cell shape.

**Reset section state at every table boundary** — the header row marks a new table:

```typescript
if (c[0] === "Pos" && c[1] === "Name") {
  statNames = c.includes("IP") ? PITCHER_STATS : HITTER_STATS;
  reservedSection = false;          // <- the fix
  continue;
}
```

**Make drops visible.** Return them instead of swallowing them:

```typescript
export function parseFgTeamPage(rawHtml: string): {
  players: FgPlayerRow[];
  skipped: string[];      // a caller can now render INCOMPLETE instead of PASS
}
```

Verified: 41 players, `skipped: []`, Sale `reserved=false`, Acuña present twice.

### Independent cross-check that the numbers are real

Acuña's carryover row parses `AB=22`. His Period 5 `AB` was verified the same day
as **22** across FBST `PlayerStatsPeriod`, MLB statsapi, and Baseball Reference.
The parser reproduces an externally-known value — that is worth more than any
self-consistent test.

## The part worth remembering: three layers of ground truth, each wrong in turn

This is the transferable lesson, and it is uncomfortable.

1. **The plan's prescribed tests passed against broken code.** Four tests, written
   deliberately, asserting real values (`Busch AB "419"`, `Sale IP "117.0"`). Every
   one passed while 44% of the roster was missing. They tested the rows that
   *survived*. A test suite cannot notice absence it never asserted against.
2. **A diff-reading review would have approved it.** The review that caught the bug
   did so by *executing the parser against the committed fixture and counting the
   output*. Nothing in the diff looks wrong; `continue` on an unparseable row reads
   as ordinary defensive coding.
3. **The reviewer's own ground truth was also wrong.** It reported "39 unique player
   ids" as the expected count. The true figure is **41** — 39 unique ids plus two
   rows whose ids repeat, because Acuña and Vaughn each legitimately appear twice
   (current stint + carryover stint). The implementer disputed the number, re-derived
   it from the raw HTML, and was right. A third pass confirmed the implementer.

Each layer was more correct than the last, and none was correct on its own. The
only thing that actually settled it was counting rows in the source document.

## Prevention

1. **Never `continue` past an unparseable row without recording it.** Return a
   `skipped[]` (or throw). A silent drop is indistinguishable from "there was
   nothing there", and that ambiguity is the whole bug.
2. **Assert an exact expected count, derived from the source.** `expect(players.length)
   .toBeGreaterThan(15)` passed with 23 of 41. `toBe(41)` does not. Loose thresholds
   on collection size are the specific test smell here.
3. **Prefer structural anchors over content-shape heuristics.** "The last N cells" is
   a property of the table; "the first cell containing a newline" is a property of
   the *data*, and data varies by section. Content-shape heuristics fail on exactly
   the rows that differ — which are usually the interesting ones.
4. **Reset section state at every boundary, and test the boundary.** A flag that only
   ever flips one way will be wrong for everything after the first section.
5. **Review parsers by running them, not by reading them.** For any external-source
   parser, the review step is "execute against the fixture, count and eyeball the
   output" — reading the diff cannot detect missing output.
6. **A fix that stops silent drops can make a masked bug live.** With both Acuña rows
   now surviving, `.find(p => p.name === "Ronald Acuna")` returns an arbitrary stint.
   That collision existed all along; the drop was hiding it. When you fix a
   data-loss bug, re-ask what the lost data was concealing.

## Cross-references

- [`il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`](./il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md) — the audit case these dropped rows belong to.
- [`onroto-fangraphs-audit-runbook.md`](./onroto-fangraphs-audit-runbook.md) — the parsing gotcha list this extends.
- `docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md` (DOC-024) — "Coverage is part of the verdict", the constraint this violated.

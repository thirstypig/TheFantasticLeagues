---
title: "A parser boolean that answered two questions misfiled 50 AB into the wrong team total — and all 7 of its tests passed"
slug: parser-boolean-conflates-membership-with-status-misfiles-stat-total
category: integration-issues
created: 2026-08-04
updated: 2026-08-04
component: audit, fgTeamParser, standings
problem_type: parsing / silent-misattribution
symptom: "No error, no crash, no failing test. fgTeamParser labelled a released player's row `reserved: true` because FanGraphs' status cell read \"rel\", even though the row physically sat in the Active table. Summing parsed rows gave Active AB 4763 / Reserved AB 99; the page's own TOTAL: rows say 4813 / 49. Separately, only 1 of the page's 4 carryover-subsection dividers was detected, so prior stints were indistinguishable from current lines and multi-stint players collided on name."
root_cause: "Two defects. (1) `reserved` was computed as `reservedSection || status.toLowerCase() !== \"act\"`, conflating TABLE MEMBERSHIP (which HTML table is this row in?) with PLAYER STATUS (what does FG's status cell say?). The two agree in the common case, so the bug only fires on the rows where it matters. (2) OnRoto renders four carryover dividers (previously active/reserved x hitters/pitchers); only \"previously reserved\" was matched, so there was no way to tell a prior stint from a current line."
related_modules: audit, standings, players
prs: [431]
tags: fangraphs, onroto, audit, standings, parsing, scraping, testing, mutation-testing, external-invariant
---

# A parser boolean that answered two questions

`server/src/lib/audit/fgTeamParser.ts` turns an OnRoto per-team HTML page into
`FgPlayerRow[]` for the standings audit. It had two defects at once. Neither
produced an error, a crash, or a failing assertion — all seven of the parser's
tests passed the entire time.

## Defect 1: one name, two concepts

```ts
reserved: reservedSection || status.toLowerCase() !== "act",
```

The field is named for **table membership** — *is this row inside the Reserved
table?* The right-hand side also folds in **player status** — *does FanGraphs'
own status cell say `act`?*

Those two agree almost always, which is exactly what made this survive. They
diverge only on carried-over rows, where correctness matters most. Andrew Vaughn
sits in `Active_Hitters_prev` with status `rel` (released). The `||` forced
`reserved: true`, moving his 50 AB out of the Active total and into the Reserved
total. Both aggregates were wrong, in equal and opposite amounts, with nothing
to signal it.

> **The general shape:** when a boolean's name promises one concept but its
> expression reaches across two axes of meaning — *where a thing is* vs. *what a
> thing is* — every consumer that reads the name gets the other answer on the
> minority of rows where the two disagree. Split it into two named fields and
> let the caller combine them.

## Defect 2: one divider of four

```ts
if (joined.includes("previously reserved")) { reservedSection = true; continue; }
```

OnRoto renders **four** carryover subsections — `previously active hitters`,
`previously reserved hitters`, `previously active pitchers`, `previously
reserved pitchers`. Only one was matched, and there was no `carryover` concept
at all, so a prior stint was shaped identically to a current line. A player with
two stints produced two rows joinable only by `name`, which is not a key —
FanGraphs publishes no player id on these pages. Any `.find(p => p.name === X)`
returned an arbitrary stint.

There is a second, structural problem with divider-text tracking: the
`previously reserved` divider sits **inside** the Reserved table, not before it.
Any row above that divider would be misclassified. In this fixture no such row
existed, so the old code was correct by luck.

## The fix

Read the row's own class as the authoritative signal, and demote divider
tracking to a fallback:

```ts
function reservedFromRowClass(attrs: string): boolean | null {
  const cls = (attrs.match(/class="([^"]+)"/) ?? [])[1];
  if (!cls) return null;
  if (/^Reserved_(Hitters|Pitchers)_prev$/.test(cls)) return true;
  if (/^Active_(Hitters|Pitchers)_prev$/.test(cls)) return false;
  return null;
}
```

```ts
reserved: reservedFromRowClass(row.attrs) ?? reservedSection,
carryover: carryoverSection,
```

A per-row attribute is order-independent — each row self-declares. Stateful
section tracking requires every prior divider to have been seen and interpreted
correctly, and resets at the right boundaries. `carryover` still uses state
(there is no per-row marker for it), but it now matches all four dividers and
resets on every table header.

## What actually caught it — the transferable part

Not a cleverer assertion. **The source publishes its own aggregate.** Every
OnRoto table ends in a `TOTAL:` row, so summing the parser's output must
reproduce a number the parser never touches:

| | Active hitters | Reserved hitters |
|---|---|---|
| Page's own `TOTAL:` | AB 4813 | AB 49 |
| Parser, before fix | AB 4763 | AB 99 |
| Parser, after fix | **AB 4813** | **AB 49** |

Post-fix it matches exactly on all six hitting categories (Active
4813/1280/699/167/646/124; Reserved 49/11/10/3/7/0). The 50-AB shortfall and
matching surplus is Vaughn's row, visible as a signature.

> **Rule: when parsing a third-party source, find an aggregate the source
> publishes itself — a total row, a count, a checksum — and assert your parse
> reproduces it.** A hand-written expectation encodes the author's mental model,
> and the tests and the code share that model. An external invariant cannot be
> curve-fitted to match buggy code, because nothing in your parser produces it.

This is the same reason FanGraphs — bottom of the trust hierarchy
(`MLB > PSP > PSD > FG`) — was the only layer that caught the Curtis Mead trade
bug in PR #429. Trust ordering decides who *wins* a disagreement, not who is
allowed to *raise* one.

## Verification

Both fixes are mutation-verified — the fix was reverted and the suite re-run, to
confirm the tests fail on the *pre-fix* code rather than merely passing on the
post-fix code:

| Mutation | Tests reddened |
|---|---|
| `reserved` back to `reservedSection \|\| status !== "act"` | 2 — the multi-stint test and the `TOTAL:` test |
| Divider regex back to `"previously reserved"` only | 1 — the multi-stint test |

Note the second row: the row **count** is unaffected (still 41), because rows
are not dropped, only left unflagged. A count assertion would not have caught
defect 2. That distinction matters — the sibling defect in this same parser
*was* a row drop, and a count assertion is what caught it.

## Detection checklist for any new parser here

- Does the source publish a total/count/checksum? Is reproducing it a test?
- Any boolean assigned from a multi-clause `||`/`&&` across two different axes
  of meaning — does its name describe only one of them?
- Is there a real key, or is `name` being used as one? Is there a fixture case
  with a genuine duplicate?
- Are section boundaries matched by one narrow literal? Grep the fixture and
  count how many variants the source actually emits.
- Where a per-row attribute could answer a classification question, is it the
  primary signal, with loop state only as fallback?
- Does the parser **throw** on an unrecognised page rather than returning `[]`?
  A silent empty parse reads as "no divergences", not "broken".
- Prefer an exact expected count derived independently from the fixture (e.g.
  `grep -c` on the raw HTML) over a loose `> N` threshold.

## Related

- [`html-parser-silent-row-drop-passes-its-own-tests.md`](./html-parser-silent-row-drop-passes-its-own-tests.md)
  — the **immediately prior** defect in this same function: rows silently
  *dropped* rather than *misfiled*. Same file, same day, same "tests all green"
  signature. Read them as one pair.
- [`plan-sample-code-defects-and-mutation-review.md`](../test-failures/plan-sample-code-defects-and-mutation-review.md)
  — the methodology write-up; this is a second independent data point for it.
- [`il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`](./il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md)
  — the audit investigation that first surfaced the duplicate-stint finding.
- [`mlb-multi-team-split-zeroes-traded-player-stats.md`](../logic-errors/mlb-multi-team-split-zeroes-traded-player-stats.md)
  — PR #429, the data-layer bug found in the same audit session.
- [`onroto-fangraphs-audit-runbook.md`](./onroto-fangraphs-audit-runbook.md) — the
  runbook this parser serves.
- `.claude/skills/audit-standings/SKILL.md` — the skill; its "FanGraphs scraping"
  section carries the `name` is not a key warning.

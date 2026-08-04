---
title: "Eight defects came from the plan's own sample code and none from the implementers — only reviews that mutated the code caught them"
slug: plan-sample-code-defects-and-mutation-review
category: test-failures
created: 2026-08-03
component: docs/superpowers/plans, subagent-driven-development, audit
problem_type: methodology / test-efficacy
symptom: "Implementers transcribe a plan's prescribed code faithfully, every prescribed test passes, tsc is clean — and the unit is badly broken. One unit silently dropped 18 of 41 input rows while passing all four of its tests."
root_cause: "A written plan's sample code is code, but receives none of code's review. Implementers treat it as specification and reproduce its bugs verbatim. Prescribed tests are written from the same mental model as the prescribed code, so they assert the behaviour the author already believed."
related_modules: audit, standings, players
prs: []
tags: testing, docs-system, scoring, data-sync
---

# Plan sample code is code — and it shipped eight defects

## Symptom

Across a ten-task implementation plan executed by fresh subagents, **eight defects
reached committed code. Every one originated in the plan's own sample code. None
came from an implementer.**

Each time the signal was identical and misleading:

- the implementer transcribed the prescribed code faithfully
- every prescribed test passed
- `tsc --noEmit` was clean
- the implementer's self-review found nothing

The worst case: a parser that **silently dropped 18 of 41 rows** and passed all four
of its prescribed tests. The dropped rows were the exact players the tool existed to
analyse.

## The eight

| # | Defect | Why the tests missed it |
|---|---|---|
| 1 | Task 9 referenced an accumulator in a script that **exports nothing** — the stand-in would have emitted a confidently wrong report | No test; caught by reading the plan against the code it cited |
| 2 | Parser anchored on "first cell containing a newline"; carryover rows have flat cells → **18 of 41 rows dropped** via bare `continue` | The 4 tests asserted rows that *survived* |
| 3 | Second parser repeated the same bare `continue` + `toBeGreaterThan(20)` | A loose threshold passes at 23 of 41 |
| 4 | `residual[k]` written only when `diff !== 0` → exact-zero reconciliation returned `undefined` | The test asserting `toBe(0)` was the one that caught it |
| 5 | Cross-task fallout of #4: the verdict checked `Object.keys(residual).length > 0`, so a clean team's 12 zero-valued keys made **`PASS` unreachable** | No test covered a clean team's real residual shape |
| 6 | `decideVerdict` returned **`PASS` for `results: []`, `playersChecked: 0`** — an audit that examined nothing reporting clean | Nothing asserted the empty case |
| 7 | Render test matched header words hardcoded in the template — **vacuous** | Mutating `fmt()` to a constant left all 8 tests green |
| 8 | FanGraphs values are season-scoped; the plan compared them against **period** totals → residuals of −570 R, verdict permanently `FINDINGS` | Unit tests never ran the real comparison |

Two more were caught by implementers who disputed their instructions and were right:
`pspByPlayer` scoped to only IL-windowed players (which would have zeroed every other
rostered player), and five stat keys FanGraphs never publishes being compared against
its permanent zero (making `PASS` unreachable a second way).

## Root cause

**A plan's sample code is code that receives none of code's review.**

It gets written in one pass, at design time, before anything runs. Then:

1. **Implementers treat it as specification, not suggestion.** They transcribe it
   verbatim — correctly, since deviating from a plan is usually the error.
2. **The prescribed tests share the author's mental model.** They assert the behaviour
   the author already believed, so they cannot detect a wrong belief. Defects #2, #3, #6
   and #7 are all "the test asserted the case the author had in mind."
3. **Nothing executes until an implementer runs it**, by which point the design has
   been approved and reads as settled.

Defect #8 is the sharpest illustration: no unit test could catch it, because it was a
wrong premise about an external system, not a wrong line of code. It surfaced only on
the first production run.

## What actually caught them: mutation review

The reviews that found these did not read diffs. **They changed the code and confirmed
a test went red.** Every finding below came from an actual mutation, not an inspection:

| Mutation applied | Result | Conclusion |
|---|---|---|
| `fmt()` → `return "BROKEN"` | all 8 tests still green | the test was vacuous |
| revert the dedup guard | test fails, 24 vs 12 | the guard is real |
| flip `>` to `>=` on a period boundary | test fails | the boundary is guarded |
| shift `CAT_ORDER` by one | 2 tests fail | positional mapping is guarded |
| `Object.values(...)` → `Object.keys(...)` | regression test fails | the reachability guard is real |
| delete the causes-render block | exactly 1 test fails | coverage is real |
| execute the parser, count output rows | 23 returned, 41 expected | **18 rows silently dropped** |

The last row is the important one. **No amount of diff reading finds it.** A `continue`
on an unparseable row looks like ordinary defensive coding. Only running the parser and
counting its output reveals the loss.

Conversely, every defect that shipped got there past a reviewer who had read the diff.

## Prevention

1. **Review the plan's sample code as code.** Before execution, run the same passes you
   would on a PR: does every referenced function exist and is it exported? Does each
   prescribed test fail against a trivially wrong implementation? Is any assertion
   satisfiable by a constant?
2. **Mutate, don't read.** A review that cannot name a mutation it applied has not
   verified anything. Cheap and decisive: introduce the bug the test claims to guard,
   confirm red, restore.
3. **Assert exact counts on collections, never `toBeGreaterThan`.** `expect(rows.length)
   .toBeGreaterThan(15)` passed with 23 of 41. `toBe(41)` does not. Loose thresholds on
   collection size are the single highest-yield test smell here.
4. **Never `continue` past unparseable input without recording it.** Return a `skipped[]`
   and assert its exact contents. A silent drop is indistinguishable from "nothing was
   there."
5. **Absence of evidence must never render green.** Empty input, zero items checked, an
   unreachable source — all `INCOMPLETE`, never `PASS`.
6. **Run it against reality before believing the design.** Defect #8 was invisible to
   every unit test and obvious within one production run. Schedule that run *before* the
   plan is treated as settled.
7. **Cross-task fallout is the controller's job.** Defect #5 existed only because fixing
   #4 changed a shape a later task depended on. No single task's review could see it;
   only whoever holds the whole plan can.

## An uncomfortable corollary

The subagents were more reliable than the plan they were given. Two of them disputed
their own instructions and were right both times — one re-derived a disputed row count
from raw HTML and corrected the reviewer, the other found a scope bug outside its brief.

The lesson is not "trust agents less." It is **that authority in a plan is not evidence**,
and the artifact everyone treats as settled is the one nobody reviewed.

## Cross-references

- [`html-parser-silent-row-drop-passes-its-own-tests.md`](../integration-issues/html-parser-silent-row-drop-passes-its-own-tests.md) — defect #2 in full, with the three-layer ground-truth failure.
- [`mlb-multi-team-split-zeroes-traded-player-stats.md`](../logic-errors/mlb-multi-team-split-zeroes-traded-player-stats.md) — the production bug this tooling found, and the reconciler that could not see it.
- [`il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`](../integration-issues/il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md) — a root cause asserted and then falsified by its own tooling.
- `docs/superpowers/plans/2026-08-03-standings-audit-skill.md` — the plan, with each defect's correction committed in history.

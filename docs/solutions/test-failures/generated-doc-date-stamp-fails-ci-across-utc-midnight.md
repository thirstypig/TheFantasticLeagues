---
title: "A generated doc's date stamp fails CI across UTC midnight — the same error text as real staleness, opposite cause"
slug: generated-doc-date-stamp-fails-ci-across-utc-midnight
category: test-failures
problem_type: false-positive-triage / non-determinism
component: "scripts/refresh-docs.mjs, scripts/__tests__/refresh-docs.test.mjs, README.md, CLAUDE.md"
created: 2026-09-01
severity: medium
symptoms:
  - "CI fails with `AssertionError: README.md would change — run npm run docs:refresh` on a branch where docs:refresh WAS run and committed"
  - "Re-running docs:refresh locally produces a one-line diff and nothing else"
  - "The same error text appeared earlier in the same session as a genuine staleness failure, making the two indistinguishable from the log line alone"
root_cause: "The generated block embeds a UTC generation date captured at module load (`new Date().toISOString()`). A branch refreshed at 23:5x UTC and tested at 00:0x UTC regenerates a different date, so a strict `changed === false` idempotency assertion fails on that line alone."
related_files:
  - scripts/refresh-docs.mjs
  - scripts/__tests__/refresh-docs.test.mjs
  - docs/engineering/testing-strategy.md
  - docs/under-the-hood/runbook.md
tags:
  - ci
  - flaky-test
  - false-positive
  - docs-system
  - utc
  - date-boundaries
  - generated-files
  - idempotency
---

# A generated doc's date stamp fails CI across UTC midnight

## Symptom

CI's `test` job fails:

```
FAIL ../scripts/__tests__/refresh-docs.test.mjs > applyBlock — the README/CLAUDE
  marker block > is idempotent: re-applying a current block reports no change

AssertionError: README.md would change — run npm run docs:refresh:
  expected true to be false
```

The instruction in the failure message has already been followed. `npm run docs:refresh` was run, and the regenerated `README.md` and `CLAUDE.md` were committed on the branch.

## What makes this one dangerous

**The identical error text had appeared earlier the same session as a *real* failure.** Two red CI runs, same assertion, same message, opposite causes:

| Run | Cause | Correct fix |
|---|---|---|
| PR #458 | Genuine staleness — closing a todo changed the open count and `docs:refresh` had not been run | Run the generator, commit (`b314ff5`) |
| PR #461 | The clock — the UTC day rolled over between commit and CI | Fix the test (`23bacf4`) |

Applying the first fix to the second case makes CI go green **by accident**: re-running the generator stamps today's date, the branch passes, and the landmine stays armed for the next person. Nothing in the failure output distinguishes the two. **Read the diff, not the message.**

## Root cause

`scripts/refresh-docs.mjs:26`:

```js
const TODAY = new Date().toISOString().slice(0, 10);
```

`toISOString()` is always UTC, and `TODAY` is captured once at module load. It is emitted into every generated output:

- the `DOCS:STATUS` marker block in `README.md` and `CLAUDE.md` — `Generated <date> by npm run docs:refresh`
- `docs/under-the-hood/stats.md` — `*Generated <date> from N git-tracked files.*`
- `docs/under-the-hood/costs.md`
- `docs/under-the-hood/system-status.md` — which additionally embeds the **local HEAD SHA**

The test asserted strict idempotency:

```js
const r = applyBlock(f, block);
expect(r.changed, `${f} would change — run npm run docs:refresh`).toBe(false);
```

So the committed block and the CI-regenerated block must match **byte for byte**, date included.

The timeline that produced the failure:

```
16:5x PDT / 23:5x UTC   docs:refresh runs locally  → stamps "Generated 2026-08-31"
                        commit + push
17:0x PDT / 00:01 UTC   CI runs, regenerates       → stamps "Generated 2026-09-01"
                        assertion fails
```

The entire diff:

```diff
-<sub>Generated 2026-08-31 by `npm run docs:refresh` — do not edit between the markers.</sub>
+<sub>Generated 2026-09-01 by `npm run docs:refresh` — do not edit between the markers.</sub>
```

Nothing was stale. The day rolled over.

### Why the existing mitigation cannot help

`docs/under-the-hood/runbook.md` instructs "Refresh generated docs — **before every push**". That is good advice for real staleness and **irrelevant here**: the race is between *commit time* and *CI time*, not between source changes and the generator. Refreshing immediately before pushing near UTC midnight makes the window *tighter*, not safer — and it punishes precisely the person who followed the instruction.

For a Pacific-timezone author this window is open from 17:00 to 24:00 local, every day — roughly a third of a working evening.

### A stated invariant that needs qualifying

`docs/engineering/testing-strategy.md` (DOC-010) §5 "Generated-doc freshness" states:

> Re-running `docs:refresh` with no source changes produces **no diff**.

That is false across a UTC midnight, and it is the assumption the test encoded. The invariant holds only for *substantive* content; the date line is deliberately non-deterministic.

## Fix

Make the assertion ignore the generated date while still failing on everything else — `scripts/__tests__/refresh-docs.test.mjs`:

```js
it("is idempotent apart from its generated date", () => {
  // The block embeds a UTC generation date, so a strict `changed === false`
  // assertion fails on that line ALONE whenever a branch is refreshed just
  // before UTC midnight and tested just after. Still fail on any SUBSTANTIVE
  // staleness (a wrong open-todo count, a changed "Next 3" list), but do not
  // fail on the clock.
  const undate = (t) => t.replace(/Generated \d{4}-\d{2}-\d{2}/g, "Generated <date>");
  for (const f of ["README.md", "CLAUDE.md"]) {
    const { changed, next } = applyBlock(f, block);
    if (!changed) continue;
    expect(
      undate(next),
      `${f} would change beyond its generated date — run npm run docs:refresh`,
    ).toBe(undate(rd(f)));
  }
});
```

### Verify the relaxed assertion still bites

Relaxing a gate without re-proving it trades a flaky test for a dead one. Both directions were checked:

```bash
# 1. Substantive staleness must still fail.
#    Corrupt the count in README's block, then run the test:
#      **Next 3 to-dos** (4 open)  ->  **Next 3 to-dos** (999 open)
#    Result:
#      × is idempotent apart from its generated date
#      AssertionError: README.md would change beyond its generated date
#
# 2. A date-only diff must pass.
npm run docs:refresh   # restores the real count, may re-stamp the date
# Result: Tests 17 passed (17)
```

## Alternatives considered

| Option | Verdict |
|---|---|
| Stamp the date in local time instead of UTC | **No.** Does not fix it — it moves the race to local midnight and adds a machine-dependent value to a committed file. |
| Freeze the clock in the test | **No.** The mismatch is between two *real* runs at different wall-clock times; a frozen clock in the assertion cannot reconcile a value already committed. |
| Drop the date from the generated block entirely | Viable and simplest, but the stamp is genuinely useful when reading a generated page. Rejected in favour of keeping it and not asserting on it. |
| Re-run `docs:refresh` and push again | **This is the trap.** It goes green by accident and leaves the landmine armed. |

## Prevention

1. **Never assert byte-equality on generated content that embeds a clock or a machine identity.** Normalise the non-deterministic fields, then compare. The same file also embeds a local HEAD SHA in `system-status.md`, which is why that file is deliberately excluded from commits on feature branches — every branch regenerates a different value and they conflict with each other.
2. **When a failure message tells you what to do, check whether it was already done.** A prescriptive assertion message (`run npm run docs:refresh`) is a hypothesis, not a diagnosis.
3. **Two identical failures are not necessarily the same bug.** The tell here was that the fix for the first had already been applied. Diff the actual artifact before acting.
4. **Suspect the clock whenever a CI failure lands within minutes of 00:00 UTC.** The failing run's timestamp was `2026-09-01T00:01:22Z`.
5. **Generated files that change daily churn every branch.** `stats.md`, `costs.md` and `system-status.md` all carry `TODAY`. Expect date-only diffs on any branch that spans a day boundary, and do not treat them as content changes.

## Cross-references

- `docs/engineering/testing-strategy.md` (DOC-010) §5 — states the "no diff" invariant this qualifies; the docs-system test suite lives there.
- `docs/under-the-hood/runbook.md` (DOC-019) — the "refresh before every push" instruction that cannot mitigate this.
- `docs/solutions/test-failures/period-end-fixture-uses-noon-not-midnight-shape.md` — the sibling case: a test whose *date shape* differed from production's and passed anyway ("Approximate Constant Boundary Masking"). Here the shape is right and the *instant* is wrong.
- `docs/solutions/test-failures/plan-sample-code-defects-and-mutation-review.md` — green CI is not evidence; this is the mirror image, where red CI is not evidence either.
- `docs/solutions/integration-issues/statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date.md` — align the as-of date before declaring a discrepancy; the same false-positive triage discipline applied to data sources.
- `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md` — false-positive triage where the alarm, not the system, was wrong.
- `docs/solutions/integration-issues/synthetic-merge-conflicts-from-parallel-refactor-on-main.md` — conflicts that are artifacts of parallel work rather than real disagreement; same "the tool is reporting a difference that means nothing" family.
- `docs/solutions/logic-errors/period-date-timezone-shift.md` — the origin of the project's noon-UTC convention for date-only values.
- `docs/TESTING.md` — flake policy: "when a test fails once but passes on retry, log it. Flakes are bugs, not noise." This one never passes on retry within the same UTC day, which is what made it look like a real failure.

## Fixed in

- `23bacf4` — `test(docs): the idempotency check failed on the clock, not on staleness` (PR #461)
- Contrast with `b314ff5` (PR #458) — the genuine-staleness failure with identical error text.

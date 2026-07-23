---
title: A Documented Convention With No Automated Check Decays Monotonically — Fix It With a Ratchet, Not a Refactor
category: architecture
problem_type: convention_decay
component: server/src/features, client/src/features
date_documented: 2026-07-23
severity: medium
symptoms:
  - A documented architectural convention lists a handful of sanctioned exceptions while the codebase contains an order of magnitude more
  - Feature modules import directly from other feature modules instead of from shared locations
  - Circular dependencies between feature modules appear with no single commit responsible
  - Several modules have become de-facto shared infrastructure without ever being moved to a shared directory
  - No lint rule, test, or CI job fails when a new boundary violation is added
related_files:
  - docs/engineering/adrs/ADR-015-feature-module-boundaries.md
  - scripts/check-feature-isolation.mjs
  - scripts/feature-isolation-baseline.json
  - docs/guides/feature-modules.md
  - client/src/components/shared/StatsTables.tsx
tags:
  - module-boundaries
  - cross-feature-imports
  - circular-dependencies
  - architectural-drift
  - ci-enforcement
  - ratchet-pattern
  - technical-debt
# ── docs board fields (docs/README-DOCS.md) ──
id: DOC-021
description: "Feature-module boundaries decayed from 6 documented exceptions to 85 actual. Fixed with a grandfathered baseline + ratchet check rather than a mid-season refactor."
type: solution
status: active
phase: null
owner: james
links: [ADR-015, DOC-007, DOC-016]
updated: 2026-07-23
---

# A documented convention with no automated check decays monotonically

> **Note on frontmatter.** This doc carries **both** conventions — the existing
> `docs/solutions/` fields (`category`, `problem_type`, `symptoms`, `related_files`,
> `severity`) *and* the docs-board fields from `docs/README-DOCS.md` (`id`, `type`,
> `status`, `links`). It is the first retrofitted example. Adding the new fields alongside
> the old ones keeps the existing viewer working while making the doc board-indexable.

## Symptom

`docs/guides/feature-modules.md` documented the feature-module pattern and listed a
"Cross-Feature Dependencies" section with **6 sanctioned exceptions** on the server.

Nobody had checked that number in a long time. A full scan of every import across all 63
feature modules found:

| Measure | Value |
|---|---|
| Modules with **zero** outbound cross-feature imports | 34 of 63 (20/34 server, 14/29 client) |
| Production cross-feature imports | **85** (36 server, 49 client) |
| Same, in test files | 12 |
| **Circular** feature dependencies | **4** |
| Documented exceptions | **6** |
| Automated enforcement | **none** |

The cycles:

```
server: teams ↔ transactions
client: teams ↔ transactions
client: auction ↔ teams
client: commissioner ↔ roster
```

A cycle is the loud symptom — a boundary you can traverse in both directions is not a
boundary. But the quiet symptom was worse: **6 documented, 85 actual, and nothing anywhere
that would ever report the difference.**

## Investigation

**What didn't work, and why.**

1. **Reading the convention doc.** It described the intended pattern accurately and was
   confidently wrong about the current state. A doc describing a convention cannot tell you
   whether the convention holds.

2. **Grepping for `features/`.** Too noisy. It matches a module's own internal imports,
   which are correct and vastly outnumber the violations. The distinction that matters is
   *own feature vs. other feature*, which requires resolving each relative specifier against
   the importing file's location — not something grep can do.

3. **Looking for an existing lint rule to tighten.** There wasn't one to tighten. The
   client's `.eslintrc.cjs` has no import rules at all, and **the server has no ESLint
   configuration whatsoever.** `eslint-plugin-boundaries` would have been the textbook
   answer, but adopting it means standing up server linting first — a separate project.

**What worked:** a standalone AST-free scanner that, for every `.ts`/`.tsx` file under
`*/src/features/`, resolves every import specifier and reports the ones landing in a
*different* feature directory. Relative specifiers get `path.resolve`d; aliased ones
(`@/features/x`) get pattern-matched.

## Root cause

**Two causes, and the second is the generalizable one.**

### 1. Five modules became shared infrastructure without being promoted

| Module | Inbound imports | What it actually is |
|---|---|---|
| `transactions` | 12 client, 7 server | de-facto shared |
| `standings` | 8 server | de-facto shared |
| `teams` | 8 client | de-facto shared |
| `players` | 5 server | de-facto shared |
| `commissioner` | 5 server | de-facto shared |

These are not 85 arbitrary rule-breaks. They are five modules that everything legitimately
needs, still sitting in `features/` where only their own feature should reach them.

**The codebase already knew the fix and had applied it once**: `StatsTables` was *promoted
out of* `standings` into `client/src/components/shared/`. The pattern was established — it
just was not applied to the other five.

### 2. A convention with no automated check decays monotonically

Nobody defected. Every individual exception was locally reasonable — a deadline, a small
helper, "just this once." What was missing was any mechanism that made the **aggregate**
visible to anyone.

The doc stopped being updated because nothing forced it to be. Drift is the default state
of any rule enforced only by memory and good intentions. The decay is one-directional:
violations get added, never subtracted, because subtracting requires someone to go looking.

## Solution

**Do not refactor. Ratchet.**

85 imports across the roster, transaction, and scoring paths — mid-season, in an app with
real entry fees and payouts — is a risk wildly out of proportion to a benefit no user can
see. The correct move is to stop the bleeding and let the number decline naturally.

### 1. Snapshot the current state as a grandfathered baseline

```bash
node scripts/check-feature-isolation.mjs --update-baseline
# Baseline written: 97 entries → scripts/feature-isolation-baseline.json
```

97 = 85 production + 12 in test files (tests are held to the same rule).

### 2. Fail on anything not in the baseline

```bash
node scripts/check-feature-isolation.mjs             # exit 1 on any NEW violation
node scripts/check-feature-isolation.mjs --report    # full current graph
node scripts/check-feature-isolation.mjs --update-baseline   # after legitimately removing one
```

### 3. Three design decisions that make it survive contact with reality

**The baseline key deliberately excludes line numbers.**

```js
const keyOf = (v) => `${v.side}|${v.file}|${v.spec}`;
```

Moving code within a file must not invalidate the baseline. A checker that cries wolf on
unrelated refactors gets disabled within a week.

**Removals are reported as good news, not silently absorbed.**

```
✓ 3 grandfathered import(s) no longer present — nice.
  Run --update-baseline to lock in the improvement so they can't come back.
```

**The failure message ranks duplication above the escape hatch.**

```
Fix by promoting the shared code to a shared location:
  client/src/components/shared/ · client/src/hooks/ · client/src/lib/
  server/src/lib/ · shared/api/

Duplicating a small helper is also fine. If the coupling is genuinely
justified, add it to the baseline with a comment explaining why.
```

Two small similar functions in two modules beat one shared abstraction that fits neither.
The escape hatch exists, and using it should feel slightly bad.

### 4. Record the decision

`docs/engineering/adrs/ADR-015-feature-module-boundaries.md` — including the alternatives
that lost (refactor-now, ESLint boundaries, update-the-docs-to-list-85, do-nothing) and the
honest negative consequence: **85 known violations remain in the codebase indefinitely.**
This ADR stops the bleeding; it does not heal the wound.

## Verification

Confirming the check *passes* proves nothing — a script that always exits 0 also passes.
The test that matters is that it **fails correctly**:

```bash
# temporarily drop one known entry from the baseline
node -e "…filter out the DraftReportPage entry…"
node scripts/check-feature-isolation.mjs
```

```
✗ 1 NEW cross-feature import(s) — see ADR-015.

  client: features/ai → features/auction
     client/src/features/ai/pages/DraftReportPage.tsx
     imports "../../auction/components/PlayerExpandedRow"

exit code: 1
```

Restored, re-run, exit 0. Both directions verified.

## Prevention

| Practice | Why |
|---|---|
| **Wire the check into CI** | ⚠️ **Still open.** Until it runs in `.github/workflows/ci.yml` the ratchet is voluntary — and voluntary is precisely what produced 85 from 6. Tracked as `RISK-002`. |
| **New modules start at zero** | A module created after the ADR begins with no outbound cross-feature imports. `features/compare/` (PRD-001) is the first one this applies to. |
| **Promote, don't import** | Needed by 2+ features → move it to `shared/`. Precedent: `StatsTables`. |
| **Surface the number where it's seen** | The count is emitted into `docs/under-the-hood/stats.md` by `npm run docs:refresh`, so it is visible without anyone going to look for it. |
| **Cycles are risks, not projects** | The 4 cycles are `RISK-001`, `accepted`. Fixed opportunistically when already in those files — never as a big-bang refactor. |

### Suggested test

There is no test for this yet. The natural one:

```js
// Guard the guard: the baseline may shrink, never grow.
it("feature-isolation baseline never grows", () => {
  const baseline = JSON.parse(readFileSync("scripts/feature-isolation-baseline.json"));
  expect(baseline.count).toBeLessThanOrEqual(97); // ADR-015 high-water mark, 2026-07-23
});
```

Cheap, and it catches the specific failure of someone "fixing" a CI failure by regenerating
the baseline instead of fixing the import.

## The generalizable lesson

This is not really about feature modules.

> **Any convention enforced only by documentation and good intentions decays in one
> direction.** The rate varies; the sign does not. If you cannot name the mechanism that
> would report a violation, assume the convention is already broken and that you do not
> know by how much.

And when you discover accumulated debt that is too large or too risky to pay down at once:

> **Baseline it and ratchet.** Converting "we should fix this someday" into "this number
> can only go down" costs an afternoon, changes no running code, and works while you sleep.
> A refactor you are too scared to do is worth less than a gate you are willing to keep.

## Related

- `docs/engineering/adrs/ADR-015-feature-module-boundaries.md` — the decision record
- `docs/engineering/tech-spec.md` — the full dependency graph and shared-infrastructure map
- `docs/under-the-hood/risks-register.md` — `RISK-001` (cycles), `RISK-002` (unwired CI), `RISK-010` (no server linting)
- `docs/guides/feature-modules.md` — the original convention (its 6-exception list is now known to be incomplete)
- `docs/solutions/architecture/extract-singleton-state-before-splitting-route-files.md` — the adjacent failure: splitting a module without extracting shared state first
- `docs/solutions/integration-issues/synthetic-merge-conflicts-from-parallel-refactor-on-main.md` — why large mechanical refactors on a shared main branch are expensive

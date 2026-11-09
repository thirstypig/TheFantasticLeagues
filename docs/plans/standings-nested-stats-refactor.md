# Plan: TeamStatRow → nested `stats` (sport-agnostic standings end-state)

> Status: **DONE 2026-11-09** (branch `refactor/standings-nested-stats`) · Created 2026-06-29 · Risk: **HIGH (live real-money scoring path)**
> Closes: review todo #294's remaining debt (cast + MLB-pin). Does NOT complete Phase 3.5 — loading categories from `league.scoringSettings` and sport plumbing through the routes are still open (see `docs/WEEK2_PROGRESS.md`).
>
> **Outcome:** Gate run as a deterministic read-only dump of `computeTeamStatsFromDb` + standings + category rows + season totals for every period of league 20 against prod — byte-identical before/after (sha `ee0122c`, and re-confirmed against a fresh `main` run). The FanGraphs audit was not used as the gate (it fetches FG live, so it is not deterministic). The scope table below was incomplete: `standings/routes.ts`, `digestService.ts` and `routes/public.ts` also consume the rows, and five reads were tsc-invisible (`as any` / cast / spread). Four are pinned by tests that fail on the flat shape; the fifth (category daily snapshot) was a redundant re-read of a value `computeCategoryRows` already returns, so it was deleted rather than tested. `fangraphs-audit.ts` lives in `src/scripts`, which server tsc excludes — it was smoke-run against prod instead.

## Goal

Replace the hybrid `TeamStatRow` shape with a genuinely sport-agnostic nested form:

```ts
// FROM (current interim — pinned MLB members + index-signature escape hatch + cast):
interface TeamStatRow {
  team: { id: number; name: string; code: string };
  R: number; HR: number; /* …8 more MLB cats… */ WHIP: number;
  H?: number; AB?: number; ER?: number; IP?: number; BB_H?: number;
  [statKey: string]: number | { id: number; name: string; code: string } | undefined;
}

// TO:
interface TeamStatRow {
  team: { id: number; name: string; code: string };
  stats: Record<string, number>;   // all categories, any sport
}
```

Readers switch to `row.stats[key]` (dynamic) and `row.stats.R` (named arithmetic). This removes, in one move:
- the `[statKey: string]: … | {team} | undefined` index signature that widens every static access (the thing that broke server tsc in the first place),
- the `as TeamStatRow` cast in `aggregatePeriodStatsFromCsv` (todo #294),
- the re-pinned MLB members that re-couple the "sport-agnostic" engine to baseball (architecture-review P2).

## Why it's worth doing

The Week-2 refactor went halfway: it made the engine *read* categories dynamically (`computeCategoryRows` uses `s[dbField]`) but left the row *shape* pinned to MLB. That contradiction forces the cast and the type-lie, and blocks NFL/NBA standings from reusing the engine cleanly. Nesting resolves all of it.

## Why it's HIGH risk

This is the **live OGBA scoring computation** — real entry fees / payouts depend on it. The change touches the row shape consumed across the whole standings surface, so a subtle slip (a missed `.R` → `.stats.R`, a 0-vs-undefined difference) could silently change standings.

## Regression strategy (do this FIRST — it's the whole safety case)

1. **Baseline the FanGraphs audit** against prod BEFORE any change: `cd server && npx tsx src/scripts/fangraphs-audit.ts 20` (point at prod via Railway env — see [[shared_supabase_db]]). It currently reconciles with FanGraphs **exactly, all 8 teams**. Save the output.
2. **Lean on the differential test**: `server/src/features/standings/__tests__/standingsService.differential.test.ts` pins PSP-path vs daily-path behavior. Keep it green throughout.
3. **After the refactor**: full server suite green + tsc clean + re-run the audit → output must be **byte-identical** to the baseline. Same FanGraphs reconciliation = proof of zero behavior change.
4. **Browser-verify** `/season` on prod after deploy (real standings render correctly). Mandatory per project convention.

If the post-refactor audit diverges from the baseline at all, the refactor introduced a bug — do not merge.

## Scope — files touching `TeamStatRow` (9)

| File | Usage weight | Notes |
|------|--------------|-------|
| `features/standings/services/standingsService.ts` | core | Type def + all 3 constructors (`computeWithPeriodStats`, `computeWithDailyStats`, `mergeTeamStatRows`, `aggregatePeriodStatsFromCsv`) + `computeCategoryRows`/`getTeamStatValue` readers. ~36 named-access sites here + routes. |
| `features/teams/routes.ts` | heavy (16) | Consumer — `t.R += …` style accumulation. |
| `services/periodAwardsService.ts` | heavy (10) | Consumer. |
| `features/standings/services/scoringEngine.ts` | light (3) | Consumer. |
| `features/admin/routes/sync.ts` | light (3) | Consumer. |
| `features/standings/services/categoryDailySnapshotService.ts` | light (2) | Consumer + snapshot persistence — check serialized shape isn't stored anywhere. |
| `scripts/fangraphs-audit.ts` | audit | Builds its own row for `computeStandingsFromStats`/`computeCategoryRows` — must match new shape. |
| `features/standings/__tests__/standingsService.test.ts` | tests | Update fixtures to nested shape. |
| `features/standings/__tests__/standingsService.differential.test.ts` | tests | Update fixtures; keep assertions. |

Also: `routes.ts` season-total accumulation (`prev.R += t.R`) and `client/` standings consumers read the **API response**, not `TeamStatRow` directly — confirm the API serialization shape is unchanged (the route maps `TeamStatRow` → response DTO; if it spreads the row, the nested `stats` must be flattened in the DTO so the client contract doesn't change).

## Step-by-step

- [x] **0. Baseline**: ~~run + save the FanGraphs audit output (prod)~~ — replaced by the deterministic prod dump (see Outcome); FG audit NOT used as the gate. Differential test + full suite green on `main`.
- [x] **1. Type + constructors**: change `TeamStatRow` to `{ team, stats }`. Update the 4 constructors to build `stats: { R, HR, …, AVG, ERA, WHIP, H, AB, ER, IP, BB_H }` with explicit 0-fallbacks. Drop the index signature and the `as TeamStatRow` cast.
- [x] **2. Engine readers**: `computeCategoryRows` `s[dbField]` → `s.stats[dbField]`; `getTeamStatValue` likewise.
- [x] **3. Consumers**: migrate `teams/routes.ts`, `periodAwardsService.ts`, `scoringEngine.ts`, `admin/sync.ts`, `categoryDailySnapshotService.ts` — `row.R` → `row.stats.R`, accumulation loops accordingly.
- [x] **4. API DTO check**: ensure the standings route's response shape to the client is unchanged (flatten `stats` if the old DTO was flat). Add a contract assertion if missing.
- [x] **5. Audit script**: update `fangraphs-audit.ts`'s row build to nested shape.
- [x] **6. Tests**: update fixtures in both standings test files to nested shape; keep assertions.
- [x] **7. Verify**: server tsc clean; full suite green; differential test green; **prod dump → byte-identical to baseline** (the FG audit was smoke-run only, not diffed).
- [ ] **8. Ship**: single focused PR. After merge + deploy, browser-verify `/season` on prod and re-run the audit against prod one more time.

## Out of scope

- NFL/NBA standings wiring (this only unblocks it; dashboards stay mock-data until a separate effort).
- `categoryEngine.ts` (already built in Week-2; this plan consumes it, doesn't change it).

## Effort

Medium-large: ~9 files, ~36+ access sites, fixture updates. The mechanical edits are straightforward; the cost is in careful verification (the audit baseline diff is the gate). Estimate one focused session / PR.

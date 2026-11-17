---
id: DOC-043
title: "Phase 3.5: standings score each league's own categories — design"
description: "Every standings path scores the categories a league picked on its Rules page (any subset of the 10 scorable ones) instead of a hardcoded list; OGBA must come out identical."
type: tech-spec
status: draft
phase: "Phase 3.5"
owner: james
tags: [scoring, league-admin]
links: [DOC-026, DOC-040]
updated: 2026-11-17
---

# Phase 3.5: standings score each league's own categories

## Intent

Today every standings path scores the same hardcoded 10 categories (`CATEGORY_CONFIG`:
R HR RBI SB AVG / W SV K ERA WHIP). A league already picks its categories on the Rules page
(`LeagueRule` `scoring.hitting_stats` / `scoring.pitching_stats`), but nothing reads them, and the
editor offers 20+ options of which only those 10 can be computed. So the Rules page can say one
thing while standings do another.

After this change, standings score exactly the categories the league picked, limited to the 10 we
can compute, and the editor can only offer those 10. **Why now** (James, 2026-11-17): finish Phase
3.5 during the hardening phase so a second league can configure its own scoring. It has no visible
effect on OGBA, which picks exactly the 10.

## Goals

- One source of truth for a league's categories: its Rules settings.
- Every live standings path (list below) scores those categories.
- A league can pick any non-empty subset of the 10 scorable categories.
- The Rules editor offers, and the server accepts, only scorable categories.

## Non-goals

- New stats (OPS, QS, HLD, …). That changes the stat sync pipeline. It's a separate project.
- NFL/NBA scoring. Those pages are stubs; `sport` stays baseball.
- The historical archive (`features/archive`, 2025 spreadsheets). It has its own scoring and stays as is.
- The Phase 3 `ScoringSettings` / `ScoringRule` tables (points-based). Untouched.
- Changing categories mid-season. Rules lock when a season leaves SETUP; this change relies on that.

## Anti-goals (a failure even if it "works")

- **Any change to a number in any prod league the census below doesn't name.** In particular
  **any change to an OGBA number.** Points, ranks, category values, period awards, season totals:
  identical before and after, for every 2026 period. Real money is attached.
- A silent fallback that hides a misconfigured league: falling back to the 10 must log a warning.
- A standings path still using the hardcoded list after the change. This is the #469 failure
  mode: a read that tsc can't see.

## Constraints

- **ADR-015 feature isolation:** the category lookup is needed by `standings`, `teams`, `mlb-feed`
  (digest), `services/periodAwardsService` and `routes/public`, so it lives in `server/src/lib/`.
  No new cross-feature imports (`node scripts/check-feature-isolation.mjs` must stay at 0 new).
- **Stored key mismatch:** OGBA stores saves as `"S"` (`["W","S","ERA","WHIP","K"]`); the scoring
  code calls the category `"SV"` and maps it to the stat field `S` via `KEY_TO_DB_FIELD`.
  Normalization must turn `S` into `SV`.
- `server/tsconfig` EXCLUDES `src/scripts`; tsc says nothing about scripts.
- Prod reads through `railway run` are blocked by the auto-mode classifier for Claude; a prod
  dump either runs from James's terminal or goes through the app's own API from the browser.

## Approaches considered

| | How | Trade-off |
|---|---|---|
| **A (picked)** | Each standings path looks up the league's categories once per request (`getLeagueCategories(leagueId)`) and passes them into the scoring functions, which already accept a category list. | Scoring functions stay pure and synchronous; ~10 small, testable call-site edits; a missed site is findable by grep and (with the default removed) by tsc. |
| B | `computeTeamStatsFromDb` returns `{ rows, categories }`. | Fewer edits, but reshapes the hottest standings function, the same class of change that needed #469's careful gate. |
| C | Scoring functions look categories up themselves. | Makes pure functions async and DB-bound. Rejected. |

James picked A on 2026-11-17.

## Design

### 1. `server/src/lib/leagueCategories.ts` (new)

- `SCORABLE_CATEGORIES`: the 10 `CATEGORY_CONFIG` entries, in their canonical order.
- `resolveCategories(hittingJson: string | null, pitchingJson: string | null): { categories, dropped }`
  (pure):
  - Parse both JSON arrays. Bad JSON counts as missing.
  - Uppercase and trim each key; `S` → `SV`.
  - Keep only scorable keys, deduplicated, in canonical order.
  - **Per half (James, 2026-11-17):** a list that is missing, unparseable, or non-empty but with
    nothing scorable is misconfigured: that half falls back to its standard 5 (hitting R HR RBI SB AVG,
    pitching W SV K ERA WHIP) and a warning is logged. Only a deliberately empty list (`[]`) means
    "score none of this half".
  - If both halves end up empty (both stored as `[]`), return all 10 and warn.
  - `dropped` lists the unscorable keys so the caller can log them.
- `getLeagueCategories(leagueId): Promise<CategoryDef[]>`:
  - One indexed `leagueRule.findMany` for the two keys, then `resolveCategories`.
  - Logs a warning when it falls back to the 10 or drops keys.
  - Builder's call (from review): read through the existing 60-second `leagueRuleCache` if it fits,
    otherwise one indexed query per request. Season standings are already cached a level up.
- `CategoryDef` = `{ key, label, lowerIsBetter, group: "H" | "P" }`, same shape as `CATEGORY_CONFIG`.

### 2. Scoring functions

- `computeStandingsFromStats(stats, categories)`: **`categories` becomes required** (drop the
  `?? CATEGORY_CONFIG` default), so tsc lists every caller. `computeCategoryRows` already takes a key.

### 3. Call sites. Every one passes the league's categories

| Path | File |
|---|---|
| `/standings/period/current` | `features/standings/routes.ts` |
| `/standings/waiver-priority` | same |
| `/standings/period-category-standings` (current, previous, and its `categories` list, now from the league instead of `CATEGORY_CONFIG.map`) | same |
| `/standings/season` → `getSeasonStandings` (look categories up inside the uncached computation) | `features/standings/services/standingsService.ts` |
| `/standings/settlement/:leagueId` → `RotoScoringEngine` (2 sites) | `features/standings/services/scoringEngine.ts` |
| AI insights standings | `features/teams/routes.ts` |
| Weekly digest (standings + category loops, 3 sites) | `features/mlb-feed/services/digestService.ts` |
| Period awards (2 category loops) | `services/periodAwardsService.ts` |
| Daily category snapshots (`TeamStatsCategoryDaily`) | `features/standings/services/categoryDailySnapshotService.ts` |
| Public standings | `routes/public.ts` |

Not changed: `scripts/fangraphs-audit.ts` (an OGBA-only audit; pass `CATEGORY_CONFIG` explicitly)
and `scripts/verify_standings.ts` (pass it explicitly or delete it if dead).

**Delete** `features/standings/lib/categoryEngine.ts` and its tests. Its `getLeagueCategories` is
imported in `standingsService.ts` but never called; the new lib helper replaces it (review finding).

**Guard test:** outside `lib/sports/`, `lib/sportConfig.ts`, `lib/leagueCategories.ts`, scripts and
tests, no server file references `CATEGORY_CONFIG`. That includes dynamic `await import(...)`
destructuring and the re-export from `standingsService.ts` (digestService uses that form today), so
the guard matches the identifier, not just static imports. Remove the re-export.

### 4. Saving rules

Both rules write paths (`PUT /api/leagues/:id/rules` and `POST /api/commissioner/:leagueId/rules`)
go through the shared `assertValidRuleValue`; the check lives there. It rejects (400, plain message) a `hitting_stats` / `pitching_stats`
value that contains an unscorable key or isn't a JSON array, and rejects a save that would leave
both lists empty. `S` and `SV` are both accepted. Existing stored values are not rewritten.

### 5. Client

- Rules editor checkboxes: only the scorable 5 hitting (R HR RBI SB AVG) and 5 pitching
  (W SV K ERA WHIP). A new `SCORABLE_HITTING_CATS` / `SCORABLE_PITCHING_CATS` in
  `client/src/lib/sportConfig` (the broad `HITTING_CATS` lists may have other users; leave them).
  A stored `S` shows as SV checked.
- `mobile/pages/MobileStandings.tsx`: hardcoded hitting/pitching column lists → derived from the
  categories the server returns, split by group.
- Desktop Season "By Category" (`CategoryStandingsView`) already builds columns from the server's
  categories. Verify only.
- Anything that assumes 10 categories (e.g. a max of 80 points, 10 columns): the builder greps and
  fixes or confirms none exist.

### 6. Points

Each category still awards 1…N points to N teams (ties split). A league with K categories has a
per-period maximum of N×K. Nothing stores a 10-category assumption server-side.

## Verification

0. **Census, before building (James, 2026-11-17).** Leagues 1 (OGBA 2025) and 20 (OGBA 2026)
   are known to store the standard 5×5. The others couldn't be read from the API (every other ID
   returned 500), so James runs this read-only query in the Supabase SQL editor and pastes the result:

   ```sql
   SELECT l.id, l.name, l.season,
          MAX(CASE WHEN r.key = 'hitting_stats'  THEN r.value END) AS hitting,
          MAX(CASE WHEN r.key = 'pitching_stats' THEN r.value END) AS pitching
   FROM "League" l
   LEFT JOIN "LeagueRule" r
          ON r."leagueId" = l.id AND r.key IN ('hitting_stats', 'pitching_stats')
   GROUP BY l.id, l.name, l.season
   ORDER BY l.id;
   ```

   For each league, run its stored values through `resolveCategories`. Any league that does not
   resolve to the standard 10 is listed for James to decide on (accept the change, or fix its rules
   first) before merge. The gate in step 1 then covers every league that resolves to the standard 10
   (their numbers must not move) plus league 20 in full.

1. **OGBA identical (the gate):** a read-only dump for league 20 taken on main before and on the
   branch after. It covers, for every 2026 period: `computeTeamStatsFromDb`, standings, every
   category's rows, period awards, the snapshot rows the daily job would write (computed, not
   written), and `getSeasonStandings`. The two must be byte-identical. Because prod reads are blocked
   for Claude, either James runs the dump script from his terminal, or the builder compares the app's
   API JSON (`/api/standings/season`, `/period-category-standings?periodId=` for each period) before
   and after deploy. The builder picks; the script is preferable because it covers awards and
   snapshots too.
2. **Unit tests:**
   - `resolveCategories`: S alias, unknown keys dropped, bad JSON, empty → 10, ordering, dedupe.
   - A 4-category league scores only those 4: points, totals, and the category list the route returns.
   - Rules PUT validation.
   - The guard test above.
   - Query-arg assertions on `getLeagueCategories` (a mock can't catch a wrong WHERE clause).
3. tsc (server and client, full output), both suites, client `npm run build`, feature isolation 0 new.
4. **Browser:**
   - `/season` on prod after deploy: same numbers as before.
   - Locally, a test league with a 4-category subset: Season By Category, mobile standings and the
     Rules editor all show 4.

## Left to the builder

- Error message wording; whether to add a short-TTL cache (only if a measured hot path needs it).
- The dump mechanism (script vs API comparison) per Verification 1.
- Whether `scripts/verify_standings.ts` is dead (delete) or kept (pass the categories explicitly).

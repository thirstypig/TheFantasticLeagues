# Phase 3.5: League Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every live standings path scores the categories each league picked on its Rules page (any non-empty subset of the 10 scorable ones), and OGBA's numbers don't move.

**Architecture:**
- A new pure resolver plus a cached lookup in `server/src/lib/leagueCategories.ts` turn a league's `scoring.hitting_stats` / `scoring.pitching_stats` rules into a `CategoryDef[]`.
- Each standings path calls `getLeagueCategories(leagueId)` once and passes the result into `computeStandingsFromStats` (whose `categories` argument becomes required) and into its own `computeCategoryRows` loops.
- Rules saves reject unscorable keys; the client editor offers only the 10.

**Tech Stack:** Express 4, Prisma 6, TypeScript ESM, Vitest 4 + supertest, React 18.

**Spec:** `docs/superpowers/specs/2026-11-17-league-categories-design.md` (DOC-043, approved 2026-11-17). Read it first.

## Global Constraints

- The 10 scorable categories, in this canonical order (= `CATEGORY_CONFIG` in `server/src/lib/sports/baseball.ts`): `R HR RBI SB AVG W SV ERA WHIP K`. Hitting half: `R HR RBI SB AVG`. Pitching half: `W SV ERA WHIP K`.
- A stored `S` means `SV`. Keys are trimmed and uppercased before matching.
- Per-half fallback: a half whose stored list is missing, unparseable, or non-empty with nothing scorable falls back to that half's standard 5 and logs a warning. Only a stored `[]` means "score none of this half". Both halves `[]` → all 10, warn.
- No OGBA number may change: points, ranks, category values, period awards, season totals. The same holds for every census league that resolves to the standard 10.
- ADR-015: no new cross-feature imports. `node scripts/check-feature-isolation.mjs` must report 0 new.
- `server/tsconfig` excludes `src/scripts`: smoke-run any script you edit.
- Never claim "tsc clean" from a `tail` window; count `error TS` in the full output.
- Out of scope: new stats, NFL/NBA, `features/archive`, the `ScoringSettings` / `ScoringRule` tables.

## Before you start (James)

1. Run the census query from the spec's Verification step 0 in the Supabase SQL editor and paste the result into the PR description. Task 6 uses it.
2. Leagues 1 and 20 are known to store `["R","HR","RBI","SB","AVG"]` / `["W","S","ERA","WHIP","K"]`.

## Review Focus

1. **A league with no scoring rule rows at all** (created before the rules existed): it must score the standard 10 and log one warning, not 0 categories. Test in Task 1.
2. **Messy stored keys** (`" sv "`, `"k"`, duplicates, `"S"` and `"SV"` together): normalized and deduplicated, canonical order. Test in Task 1.
3. **A league that scores only hitting** (`pitching_stats = []`): standings, the category route and mobile standings all work. The mobile Pitching tab shows an empty state instead of crashing. Tests in Tasks 2 and 5.
4. **A commissioner changes categories during SETUP:** the rule cache is invalidated on save already. Standings may serve the old categories for up to 2 minutes (the season standings cache TTL). That's acceptable; Task 6 documents it in the PR, and nothing else should cache categories longer.
5. **The editor shows a stored `S`:** it must appear as SV checked, and toggling writes `SV`. Test in Task 5.

---

### Task 1: The category resolver and lookup

**Files:**
- Create: `server/src/lib/leagueCategories.ts`
- Test: `server/src/lib/__tests__/leagueCategories.test.ts`

**Interfaces:**
- Consumes: `CATEGORY_CONFIG` from `server/src/lib/sports/baseball.ts`; `getLeagueRules(client, leagueId): Promise<Record<string, Record<string, string>>>` from `server/src/lib/leagueRuleCache.ts`; `prisma` from `server/src/db/prisma.ts`; `logger` from `server/src/lib/logger.ts`.
- Produces:
  - `export type CategoryDef = { key: string; label: string; lowerIsBetter: boolean; group: "H" | "P" }`
  - `export const SCORABLE_CATEGORIES: readonly CategoryDef[]` (the 10, canonical order)
  - `export const SCORABLE_KEYS: ReadonlySet<string>`
  - `export function normalizeCategoryKey(raw: string): string` (trim, uppercase, `S` → `SV`)
  - `export function resolveCategories(hittingJson: string | null | undefined, pitchingJson: string | null | undefined): { categories: CategoryDef[]; dropped: string[]; fellBack: ("H" | "P" | "ALL")[] }`
  - `export async function getLeagueCategories(leagueId: number, client = prisma): Promise<CategoryDef[]>` (reads `rules.scoring.hitting_stats` / `rules.scoring.pitching_stats` via `getLeagueRules`; logs `logger.warn({ leagueId, dropped, fellBack }, ...)` when either is non-empty)

- [ ] **Step 1: Write the failing tests** in `leagueCategories.test.ts`:

```ts
const OGBA_H = '["R","HR","RBI","SB","AVG"]', OGBA_P = '["W","S","ERA","WHIP","K"]';
const keys = (r: { categories: { key: string }[] }) => r.categories.map((c) => c.key);

it("OGBA's stored lists resolve to the 10 in canonical order", () => {
  const r = resolveCategories(OGBA_H, OGBA_P);
  expect(keys(r)).toEqual(["R","HR","RBI","SB","AVG","W","SV","ERA","WHIP","K"]);
  expect(r.dropped).toEqual([]); expect(r.fellBack).toEqual([]);
});
it("the categories are the same objects' values as CATEGORY_CONFIG", () => {
  expect(resolveCategories(OGBA_H, OGBA_P).categories.map(({ key, label, lowerIsBetter }) => ({ key, label, lowerIsBetter })))
    .toEqual(CATEGORY_CONFIG.map(({ key, label, lowerIsBetter }) => ({ key, label, lowerIsBetter })));
});
it("normalizes case, whitespace, S alias and duplicates", () => {
  expect(keys(resolveCategories('[" hr ","r","R"]', '["sv","S"," k"]'))).toEqual(["R","HR","SV","K"]);
});
it("drops unscorable keys and reports them", () => {
  const r = resolveCategories('["R","OPS"]', '["W","QS"]');
  expect(keys(r)).toEqual(["R","W"]); expect(r.dropped).toEqual(["OPS","QS"]);
});
it("a half with nothing scorable falls back to its standard 5", () => {
  const r = resolveCategories('["R","HR"]', '["QS","HLD"]');
  expect(keys(r)).toEqual(["R","HR","W","SV","ERA","WHIP","K"]); expect(r.fellBack).toEqual(["P"]);
});
it("missing or unparseable halves fall back", () => {
  expect(resolveCategories(null, '["K"]').fellBack).toEqual(["H"]);
  expect(keys(resolveCategories("not json", '["K"]'))).toEqual(["R","HR","RBI","SB","AVG","K"]);
  expect(resolveCategories('{"a":1}', '["K"]').fellBack).toEqual(["H"]);
});
it("an explicit [] scores none of that half", () => {
  const r = resolveCategories('["R","AVG"]', "[]");
  expect(keys(r)).toEqual(["R","AVG"]); expect(r.fellBack).toEqual([]);
});
it("both halves [] fall back to all 10", () => {
  const r = resolveCategories("[]", "[]");
  expect(r.categories).toHaveLength(10); expect(r.fellBack).toEqual(["ALL"]);
});
it("a league with no rule rows scores the 10 (via getLeagueCategories)", async () => {
  const client = { leagueRule: { findMany: vi.fn().mockResolvedValue([]) } };
  invalidateLeagueRules(999);
  expect(await getLeagueCategories(999, client as any)).toHaveLength(10);
  expect(client.leagueRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { leagueId: 999 } }));
});
it("getLeagueCategories reads scoring.hitting_stats / pitching_stats for that league", async () => {
  const client = { leagueRule: { findMany: vi.fn().mockResolvedValue([
    { category: "scoring", key: "hitting_stats", value: '["HR"]' },
    { category: "scoring", key: "pitching_stats", value: "[]" },
    { category: "overview", key: "hitting_stats", value: '["R"]' }, // wrong category: ignored
  ]) } };
  invalidateLeagueRules(998);
  expect((await getLeagueCategories(998, client as any)).map((c) => c.key)).toEqual(["HR"]);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../leagueCategories.js'`): `cd server && npx vitest run src/lib/__tests__/leagueCategories.test.ts`
- [ ] **Step 3: Implement** `server/src/lib/leagueCategories.ts` with the Interfaces above. `group` comes from `CATEGORY_CONFIG[i].group`. Dropped keys are reported normalized and in input order, deduplicated.
- [ ] **Step 4: Run, expect PASS** (same command).
- [ ] **Step 5: Commit** `feat(standings): resolve a league's scoring categories from its Rules (Phase 3.5)`

---

### Task 2: Standings feature scores league categories

**Files:**
- Modify: `server/src/features/standings/routes.ts` (`/period/current`, `/waiver-priority`, `/period-category-standings`: current and previous standings plus the `categories` map at the `CATEGORY_CONFIG.map(...)` line)
- Modify: `server/src/features/standings/services/standingsService.ts` (`getSeasonStandingsUncached`: look the categories up once, pass them into every `computeStandingsFromStats`)
- Modify: `server/src/features/standings/services/scoringEngine.ts` (`RotoScoringEngine` and `H2HCategoryScoringEngine` `computePeriodStandings`, and any other `computeStandingsFromStats` call in the file)
- Modify: `server/src/features/standings/services/categoryDailySnapshotService.ts` (loop over the league's categories)
- Delete: `server/src/features/standings/lib/categoryEngine.ts` and its test file(s); remove its import from `standingsService.ts`
- Test: `server/src/features/standings/__tests__/routes.test.ts`, and `server/src/features/standings/__tests__/categoryDailySnapshotService.test.ts`

**Interfaces:**
- Consumes: `getLeagueCategories(leagueId)` and `CategoryDef` from Task 1 (import path `../../../lib/leagueCategories.js` from services, `../../lib/leagueCategories.js` from routes).
- Produces: `/period-category-standings` returns `categories` only for the league's categories, in canonical order (same JSON shape as today).

- [ ] **Step 1: Write the failing tests** in `standings/__tests__/routes.test.ts`, mocking `../../../lib/leagueCategories.js` so `getLeagueCategories` resolves to a 4-category subset `R, HR, W, SV`:

```ts
it("period-category-standings returns only the league's categories", async () => {
  // existing fixture setup for this describe block, with the 4-category mock
  const res = await get(`/period-category-standings?leagueId=${L}&periodId=${P}`);
  expect(res.body.categories.map((c: any) => c.key)).toEqual(["R", "HR", "W", "SV"]);
  expect(getLeagueCategories).toHaveBeenCalledWith(L);
});
it("period standings totals are summed over the league's categories only", async () => {
  // 2 teams, team A beats B in all 4 categories, B beats A in K/ERA (not scored)
  const res = await get(`/period/current?leagueId=${L}`);
  expect(res.body.standings.find((s: any) => s.teamId === A).points).toBe(8); // 4 cats × 2 pts
});
it("season standings use the league's categories", async () => {
  // as above via /season; total for A = 8 per period
});
```

  In the snapshot test: with the 4-category mock, `snapshotLeagueCategoryDaily` writes rows whose `category` values are exactly `R, HR, W, SV` (the snapshot stores the category key, as today).
- [ ] **Step 2: Run, expect FAIL:** `cd server && npx vitest run src/features/standings`
- [ ] **Step 3: Implement.** Each route and service calls `await getLeagueCategories(leagueId)` once and passes the array to every `computeStandingsFromStats(stats, categories)` and every category loop in it. In `getSeasonStandingsUncached`, look up once before the per-period map. In the engines, look up inside `computePeriodStandings`. Keep the response shape unchanged.
- [ ] **Step 4: Run, expect PASS** (same command). Existing tests whose mocks lack the new module: add `vi.mock("../../../lib/leagueCategories.js", ...)` returning the 10 (`SCORABLE_CATEGORIES`, via `vi.importActual`).
- [ ] **Step 5: Commit** `feat(standings): standings routes, season, engines and snapshots score league categories`

---

### Task 3: Every other consumer, then remove the hardcoded default

**Files:**
- Modify: `server/src/features/teams/routes.ts` (AI insights standings: `computeStandingsFromStats(teamStatRows, await getLeagueCategories(leagueId))`)
- Modify: `server/src/features/mlb-feed/services/digestService.ts` (both `CATEGORY_CONFIG` loops and the standings call; stop destructuring `CATEGORY_CONFIG` from the dynamic import)
- Modify: `server/src/services/periodAwardsService.ts` (`computeTotalRotoPoints(teamStats, categories)` gains a `categories` parameter; the Category Kings loop uses the league's categories; drop the `CATEGORY_CONFIG` import; keep `KEY_TO_DB_FIELD`)
- Modify: `server/src/routes/public.ts` (public standings)
- Modify: `server/src/features/standings/services/standingsService.ts`: `computeStandingsFromStats(stats: TeamStatRow[], categories: ReadonlyArray<{ key: string; lowerIsBetter: boolean }>)`, required, no default; delete `export { CATEGORY_CONFIG, KEY_TO_DB_FIELD }` re-export and fix the imports that relied on it (import `KEY_TO_DB_FIELD` from `lib/sportConfig.js` directly)
- Modify: `server/src/scripts/fangraphs-audit.ts` (pass `CATEGORY_CONFIG` explicitly) and `server/src/scripts/verify_standings.ts` (delete it if no `package.json` script or doc references it; otherwise pass `CATEGORY_CONFIG`)
- Create: `server/src/lib/__tests__/noHardcodedCategories.test.ts`
- Test: the existing test files for teams/digest/awards/public (update mocks; add the assertions below)

**Interfaces:**
- Consumes: Task 1's `getLeagueCategories`, `CategoryDef`.
- Produces: `computeStandingsFromStats` with a required second argument. Every caller passes it.

- [ ] **Step 1: Write the guard test** `noHardcodedCategories.test.ts`: walk `server/src/**/*.ts`, excluding `__tests__/`, `*.test.ts`, `src/scripts/`, `src/lib/sports/`, `src/lib/sportConfig.ts` and `src/lib/leagueCategories.ts`. Expect no line to match `/\bCATEGORY_CONFIG\b/`. Self-test in the same file: the regex matches `const { computeCategoryRows, CATEGORY_CONFIG } =` and does not match `SCORABLE_CATEGORIES`.
- [ ] **Step 2: Run, expect FAIL** listing digestService, periodAwardsService, standings/routes (if Task 2 left the import), standingsService re-export: `cd server && npx vitest run src/lib/__tests__/noHardcodedCategories.test.ts`
- [ ] **Step 3: Add a consumer test per file** (in its existing test file) with `getLeagueCategories` mocked to `R, HR` only:
  - awards: `categoryKings.map(k => k.category)` equals `["R","HR"]`;
  - digest: the context's `categoryRanks[teamId]` has exactly keys `R, HR`;
  - public: the standings total for a team that wins both categories is `2 × N` points for N teams;
  - teams AI insights: `computeStandingsFromStats` receives the mocked categories (assert the call args).
- [ ] **Step 4: Implement** the changes in the Files list. Run `cd server && npx tsc --noEmit` with output redirected to a file outside the repo, then `grep -c "error TS"` on that file. Expect 0. tsc now lists any caller missing categories.
- [ ] **Step 5: Smoke-run the scripts** (tsc doesn't check them): `cd server && npx tsx src/scripts/fangraphs-audit.ts --help` (or its no-arg usage path) exits without a module/type error. Do not run it against a database.
- [ ] **Step 6: Run** `cd server && npx vitest run` (expect all green) and `node scripts/check-feature-isolation.mjs` from the repo root (expect "0 new").
- [ ] **Step 7: Commit** `feat(standings): every consumer scores league categories; categories now required`

---

### Task 4: Rules saves accept only scorable categories

**Files:**
- Modify: `server/src/features/commissioner/services/CommissionerService.ts` (`assertValidRuleValue`)
- Test: the existing `CommissionerService` / rules tests (`server/src/features/leagues/__tests__/rulesPut.routes.test.ts` covers the PUT path; add a unit test for `assertValidRuleValue`)

**Interfaces:**
- Consumes: `SCORABLE_KEYS`, `normalizeCategoryKey` from Task 1 (`../../../lib/leagueCategories.js`).
- Produces: `assertValidRuleValue("scoring", "hitting_stats" | "pitching_stats", value)` throws `InvalidRuleValueError` (→ 400 on both write paths, which already map it).

- [ ] **Step 1: Write failing tests:**

```ts
it.each([
  ['["R","HR"]', "ok"], ['["S","WHIP"]', "ok"], ["[]", "ok"],
  ['["R","OPS"]', "Hitting/Pitching categories can only include R, HR, RBI, SB, AVG, W, SV, ERA, WHIP, K"],
  ['"R"', "must be a list"], ["not json", "must be a list"], ['[1,2]', "must be a list"],
])("hitting_stats %s → %s", (value, expected) => { /* ok → not.toThrow; else toThrow(InvalidRuleValueError) with message containing expected */ });
it("PUT /leagues/:id/rules with an unscorable category → 400", async () => { /* in rulesPut.routes.test.ts */ });
```

  The both-empty case (`hitting_stats` saved as `[]` while `pitching_stats` is already `[]`) is NOT validated here, because `assertValidRuleValue` sees one rule at a time. Both-empty falls back to the 10 at read time (Task 1), which is the safe outcome. Note this in the PR.
- [ ] **Step 2: Run, expect FAIL:** `cd server && npx vitest run src/features/commissioner src/features/leagues`
- [ ] **Step 3: Implement** in `assertValidRuleValue`: when `category === "scoring"` and the key is `hitting_stats` or `pitching_stats`, parse as a JSON array of strings (else throw `"<label> must be a list of categories"`), normalize each key, and throw if any key is not in `SCORABLE_KEYS`. Message: `"Hitting/Pitching categories can only include R, HR, RBI, SB, AVG, W, SV, ERA, WHIP, K"` (use "Hitting" or "Pitching" for the key being saved).
- [ ] **Step 4: Run, expect PASS** (same command).
- [ ] **Step 5: Commit** `feat(rules): category rules accept only scorable categories`

---

### Task 5: Client: Rules editor, Rules page, mobile standings

**Files:**
- Modify: `client/src/lib/sports/baseball.ts`: add `export const SCORABLE_HITTING_CATS = ["R","HR","RBI","SB","AVG"]`, `export const SCORABLE_PITCHING_CATS = ["W","SV","ERA","WHIP","K"]`, and `export function normalizeCategoryKey(k: string): string` (trim, uppercase, `S` → `SV`); re-export all three from `client/src/lib/sportConfig.ts`. Leave `HITTING_CATS` / `PITCHING_CATS` as they are.
- Modify: `client/src/features/leagues/components/RulesEditor.tsx`: `hitting_stats` / `pitching_stats` use the scorable lists. The `checkbox_list` renderer normalizes the stored list with `normalizeCategoryKey` before computing `checked` and before writing on toggle.
- Modify: `client/src/features/leagues/pages/Rules.tsx`: display categories through `normalizeCategoryKey` (shows `SV`, not `S`).
- Modify: `client/src/mobile/pages/MobileStandings.tsx`: the visible columns for each tab are `HIT_CATS` / `PITCH_CATS` filtered to keys present in `resp.categories`. A tab with no columns shows the text "This league doesn't score pitching categories." (or "hitting") and no table.
- Test: `RulesEditor` and `MobileStandings` tests (create `__tests__` files next to them if none exist).

**Interfaces:**
- Consumes: the server's existing `/period-category-standings` response (`categories: { key, ... }[]`), now possibly a subset.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write failing tests:**
  - RulesEditor: the hitting checkboxes are exactly `R HR RBI SB AVG`; with a stored pitching value `["W","S"]` the `SV` box is checked; clicking `ERA` calls `onChange` with `'["W","SV","ERA"]'`.
  - MobileStandings: with `categories` = R, HR only, the Hitting tab shows columns `HR, R` (in `HIT_CATS` order) and the Pitching tab shows the empty-state text and no table.
- [ ] **Step 2: Run, expect FAIL:** `cd client && npx vitest run src/features/leagues src/mobile`
- [ ] **Step 3: Implement** per the Files list.
- [ ] **Step 4: Run, expect PASS** (same command), then `cd client && npx tsc --noEmit` (count `error TS`, expect 0) and `npm run build` (expect exit 0).
- [ ] **Step 5: Commit** `feat(client): Rules editor offers scorable categories; mobile standings follow the league`

---

### Task 6: The OGBA-identical gate, verification, docs, PR

**Files:**
- Create: `server/src/scripts/dump-league-standings.ts` (read-only)
- Modify: `STATUS.md`, `CLAUDE.md` (status line), `docs/superpowers/specs/2026-11-17-league-categories-design.md` (`status: active`), generated docs via `npm run docs:refresh`

**Interfaces:**
- Consumes: `computeTeamStatsFromDb`, `computeStandingsFromStats`, `computeCategoryRows`, `getSeasonStandings` (standingsService), `computePeriodAwards` (periodAwardsService), `getLeagueCategories` (Task 1).
- Produces: `npx tsx src/scripts/dump-league-standings.ts --leagues 1,20[,...] --out <file.json>` writes, per league: categories, and per active/completed period, team stats, standings, category rows per category, and period awards; plus `getSeasonStandings` minus its `computedAt`. Keys are sorted and numbers written as-is, so two runs diff cleanly. It does no writes, and it refuses to run without `--out`.

- [ ] **Step 1: Write the script twice.** The baseline needs the code before Tasks 1–5. In a temporary worktree at the commit before Task 1 (`git worktree add ../tfl-baseline <base-sha>`), write a variant of the script that uses `CATEGORY_CONFIG` where the branch version uses `getLeagueCategories`; everything else is identical. Commit only the branch version.
- [ ] **Step 2: Hand James the two commands** (prod reads are blocked for Claude). Export prod `DATABASE_URL` / `DIRECT_URL` as CLAUDE.md shows, then run the baseline script from the worktree and the branch script from the main checkout, with `--leagues` = every census league that has periods. Then `diff before.json after.json` must print nothing. If James prefers not to, the fallback is the API comparison in the spec (Verification 1), done in the browser before and after deploy.
- [ ] **Step 3: Census outcome.** For every census league, run its two stored values through `resolveCategories` (a one-off `npx tsx -e`, no DB). List any league that does not resolve to the standard 10 in the PR for James to decide on before merge.
- [ ] **Step 4: Local browser check.** On the local stack (see memory `local_browser_check_setup`), set a seeded league's `pitching_stats` to `[]` and `hitting_stats` to `["R","HR"]`. Check that `/season` By Category shows 2 columns, mobile standings (375px) shows the Pitching empty state, and the Rules editor shows only the 10 options. Restore the league's values.
- [ ] **Step 5: Full verification:** server and client `tsc` (0 errors, full output), both suites green, client `npm run build`, feature isolation 0 new, `npm run docs:refresh`. Restore `docs/under-the-hood/system-status.md` before committing (it embeds local HEAD).
- [ ] **Step 6: Docs:** STATUS.md (In progress → this PR; Next phases: Phase 3.5 done after merge), CLAUDE.md status line, DOC-043 `status: active`. In the PR body, note the 2-minute standings cache staleness after a SETUP-time category change and the both-empty note from Task 4.
- [ ] **Step 7: Commit, push, open the PR.** Do not merge. After James merges: check `/api/health` reports the merge SHA, `gh run list --branch main` is green, and `/season` on prod shows the same numbers as before.

---
title: Rule 2 — 20-GP prior-year position eligibility fallback
type: fix
status: implemented
date: 2026-04-23
deepened: 2026-04-23
implemented: 2026-04-23
origin: Session 75. OGBA's position eligibility rule set has three layers; Rules 1 and 3 are implemented, Rule 2 (20-GP prior-year fallback) is not. Identified during pre-enforcement audit; became time-critical when `ENFORCE_ROSTER_RULES` flipped to `true` for OGBA on 2026-04-23 (see `memory/roster_rules_feature.md`).
blocks: None. This is a correctness patch that reduces false-positive `POSITION_INELIGIBLE` rejections now that the re-acquisition gates are live.
---

## Implementation notes (post-build)

Shipped as `fix/rule2-prior-year-position-eligibility` branch with 2 commits:
1. `fix(mlb-api): thread optional ttlSeconds through player batch fetch`
2. `fix(players): add Rule 2 prior-year fielding fallback + 5 tests`

### Deviations from plan

- **Mock migration was unnecessary.** Plan predicted 8 existing `syncPositionEligibility` tests would need conversion from `mockResolvedValue` to chained `mockResolvedValueOnce`. In practice, `mockResolvedValue` is sticky — returns the same value on every call — so the second fetch in Rule 2 just re-reads current-season data from the same mock. The merge is idempotent under set union, so no existing assertion changes. Saved ~12 lines of test churn. The 5 new Rule 2 tests use explicit `.mockResolvedValueOnce(current).mockResolvedValueOnce(prior)` to differentiate.
- **`TWO_WAY_PLAYERS` guard is inert in current production.** The `!isTwoWay` gate is coded but `TWO_WAY_PLAYERS` is an empty map (see `server/src/lib/sports/baseball.ts:130` — comment: "Empty — Ohtani split into separate player records"). The real Ohtani protection is the derived-ID filter (`mlbId < 1_000_000`), which excludes the synthetic pitcher row (1660271) from the prior-season fetch. Test #5 was rewritten mid-build to assert the derived-ID filter directly rather than the inert two-way branch.
- **Broadened skip gate.** Original plan called for `if (!hasCurrent && !hasPrior && !isTwoWay)` — implemented as-specified, but this replaced the pre-existing narrower `if ((!fielding || fielding.size === 0) && !isTwoWay)`. Rule 2 requires letting players with prior-only data through the skip.

# Rule 2 — Prior-year 20-GP position eligibility fallback

## Enhancement Summary

**Deepened:** 2026-04-23
**Sections enhanced:** 8 (Problem statement, Proposed solution, Data decisions, Scope, Test plan, Acceptance criteria, Risks, Follow-ups)
**Research agents used:** learnings-researcher, code-simplicity-reviewer, kieran-typescript-reviewer, architecture-strategist, performance-oracle, data-integrity-guardian, pattern-recognition-specialist, Explore (medium), best-practices-researcher

### Key improvements from deepening

1. **Dropped the `secondaryCount === 0` gate.** Three reviewers converged on this. Simplicity says the gate is redundant (set union is idempotent). Data-integrity says the gate is a *silent removal vector* — a player with prior-year `2B:40` and current-year `SS:5` loses 2B eligibility under the gate even though they're real-life-qualified at 2B. Industry research says Yahoo and ESPN both persist prior-year eligibility the full season; OGBA's Rule 2 aligns with that norm only without the gate. Removing it deletes two test cases and simplifies the merge to 4 lines.
2. **Explicit `!isTwoWay` guard on the fallback, pre-committed in the code block.** Originally deferred to "confirm in implementation" under Risks. Architecture reviewer flagged: for Ohtani, current fielding is empty (pitcher-only fielding group), which means any non-`isTwoWay` gate would merge prior-year OF into the pitcher row. Gate inverted to `if (!isTwoWay)`; two-way test case made concrete.
3. **Fail-closed on partial prior-season fetch.** Data-integrity flagged this as the biggest unaddressed risk. If the prior-season `fetchPlayerFieldingStats` rate-limits or 500s partway, the plan previously allowed a silently inconsistent `posList` state. Now: prior map is all-or-nothing; on any failure, skip the fallback for the whole tick, log a structured warning, rely on the 12:00 UTC cron re-run to self-heal. New test #4 covers this.
4. **30-day TTL on the prior-season fetch.** Perf-oracle finding: prior-season fielding is immutable once the year closes, but the existing `mlbGetJson` default TTL at `server/src/lib/mlbApi.ts:9` is 600 s. Once per day the cron always misses cache. A one-line TTL override collapses the second fetch's amortized cost to near zero.
5. **Derived-ID pre-filter (defense in depth).** Learnings #1 and #2 (`ohtani-two-way-player-split-architecture.md`, `ohtani-derived-id-api-resolution.md`): Ohtani's pitcher row has `mlbId=1660271` which MLB API 404s. Current-season fetch already hits this; doubling the call pattern doubles the failure surface. Filter `mlbId >= 1_000_000` from the prior-season call.
6. **TypeScript hygiene.** Narrow `player.mlbId` once at the top of the loop to eliminate four `!` assertions. Introduce `PRIOR_YEAR_GP_THRESHOLD = 20` module-level constant. Rename `prevFieldingByMlbId → priorFieldingByMlbId` to match the codebase's existing `priorLeague`/`priorSeason` vocabulary.
7. **Mock churn scope corrected.** Pattern-recognition review: 8 existing `syncPositionEligibility` tests use `mockResolvedValue` (singular). Each needs conversion to `.mockResolvedValueOnce(current).mockResolvedValueOnce(prior)`. Plan previously called this "Update existing mocks" — now specifies the mechanical churn (8 call-site edits, ~12 lines).
8. **Documented the industry convention alignment.** Best-practices research: Yahoo, ESPN, CBS all persist prior-year eligibility the full season with no sunset. OGBA's Rule 2 is this same norm. The original plan framed the fallback as a "narrow pre-season safety net" — that framing is wrong. It's a permanent additional rule; the current/prior-season dichotomy is orthogonal to time-of-year.

### New considerations discovered

- **`syncAllPlayers` guard interaction** (data-integrity): the `shouldOverwritePosList` guard at `mlbSyncService.ts:99` currently preserves enriched `posList` if `newPos === existing.posPrimary`. When `posPrimary` changes upstream (MLB reclassifies primary from 2B to SS), `posList` built via Rule 2 may have `posList[0] !== posPrimary` — violating an implicit invariant. Scope boundary: out of scope for this PR, tracked as a follow-up.
- **Advisory lock on the cron** (data-integrity): doubling sync duration grows the overlap window between the 12:00 UTC cron and any admin-triggered sync. Not blocking — existing code has this risk without visible problems — but noted for a future hardening pass.
- **Extract `mergeEligibility` pure helper** (architecture): with the gate removed and `!isTwoWay` inlined, the merge is ~6 lines. Extraction adds little and adds a new surface. Keep inline.

---

## Problem statement

OGBA's position eligibility rule set has three layers:

1. **Current season ≥3 GP at a position → eligible.** Implemented by the daily cron at `server/src/index.ts:256` calling `syncPositionEligibility(season, 3)`.
2. **Previous season ≥20 GP at a position → eligible.** Persists all season alongside Rule 1 (additively). **Not implemented.**
3. **Rookies / minors → MLB primary position only.** Works by accident: rookies have no fielding data, so `eligible = {posPrimary}` falls out of the existing implementation.

With `ENFORCE_ROSTER_RULES=true` (flipped 2026-04-23), the four re-acquisition gates — `/transactions/claim`, `/transactions/il-stash`, `/transactions/il-activate`, and commissioner `PATCH /roster/:rosterId` — all read `Player.posList` and reject with `POSITION_INELIGIBLE` if the target slot is missing.

**Failure mode:** In April, before a player crosses 3 GP at secondary positions, the daily sync rebuilds their `posList` as `[posPrimary]` alone. A player who legitimately qualifies at 2B via 40+ prior-year games gets dropped mid-April, and a claim to re-add him at 2B fails. The gap window is widest from opening day until roughly mid-May, but the fallback itself is permanent — once applied, a player's prior-year-qualified positions stay in `posList` all season, matching the Yahoo/ESPN industry norm.

### Industry alignment

Research on major fantasy platforms:
- **Yahoo**: 5 GS or 10 GP current season; prior-year eligibility carries over and **does not sunset**.
- **ESPN**: 5 GP current or 10 GP prior; prior-year eligibility persists all season.
- **CBS**: commissioner-configurable, default 5/10/20 GP with prior-year carryover.

OGBA's 3 GP current / 20 GP prior is inside this range. **The "prior-year persists all season" behavior is the industry default, not an exception.** The original draft of this plan framed the fallback as a "pre-season/early-season safety net" — that framing was incorrect. Rule 2 is a permanent additional rule that layers additively on top of Rule 1.

### Grandfathering is still intentional and still holds

- Daily sync never touches `Roster.assignedPosition` — a player sitting at 2B stays at 2B regardless of their `posList`.
- In-season UI lock on `Team.tsx` prevents owners from re-positioning in-season; commissioners retain override.

The grandfathering protects existing assignments. Rule 2 is specifically about the *re-acquisition* path — owner drops player X, another owner wants to claim X at a secondary position that's prior-year-qualified but not yet current-season-qualified.

---

## Current code (confirmed)

`server/src/features/players/services/mlbSyncService.ts:297–399` — `syncPositionEligibility(season, gpThreshold)`:

```ts
// Line 322: single-season fielding fetch
const mlbPlayers = await fetchPlayerFieldingStats(mlbIds, season);

// Line 326–328: positions-by-mlbId map
for (const mp of mlbPlayers) {
  fieldingByMlbId.set(mp.id, extractFieldingPositions(mp));
}

// Line 347–361: build eligible set
const eligible = new Set<string>();
eligible.add(normalizePos(player.posPrimary));
if (fielding) {
  for (const [pos, games] of fielding) {
    if (games >= gpThreshold) {
      eligible.add(normalizePos(pos));
    }
  }
}
if (isTwoWay) eligible.add("P");
```

Nothing in the function reads prior-season data. The primary-position safety at line 348 means `posList` never goes empty — it collapses to exactly `[posPrimary]`. That matches memory's Rule 2 failure mode.

---

## Proposed solution

Add a second fielding fetch for `season - 1`, build a `priorFieldingByMlbId` map the same way, and merge prior-season positions at ≥20 GP into `eligible` for all non-two-way players.

### Merge algorithm (deepened)

```ts
const PRIOR_YEAR_GP_THRESHOLD = 20; // module-level constant

// Narrow mlbId once at top of loop (TypeScript hygiene from review)
const { mlbId } = player;
if (mlbId == null) { unchanged++; continue; }

const fielding = fieldingByMlbId.get(mlbId);
const priorFielding = priorFieldingByMlbId?.get(mlbId);  // ?. because priorMap may be undefined on partial failure
const isTwoWay = TWO_WAY_PLAYERS.has(mlbId);

// ... existing current-season merge ...

// Rule 2 fallback: merge prior-year positions at ≥20 GP.
// Guarded behind !isTwoWay to prevent Ohtani's pitcher row from accidentally
// gaining OF from a prior-season hitter slot (Ohtani learnings, test case #3).
// Guarded behind priorFielding truthy to fail-closed on partial map (risk mitigation).
if (!isTwoWay && priorFielding) {
  for (const [pos, games] of priorFielding) {
    if (games >= PRIOR_YEAR_GP_THRESHOLD) {
      eligible.add(normalizePos(pos));
    }
  }
}
```

**No `secondaryCount === 0` gate.** Set union is idempotent; if Rule 1 already placed `2B` in `eligible`, re-adding from prior-year is a no-op. The gate would *subtract* from eligibility in the case where current-season has a different secondary than prior-year — e.g., prior-year `2B:40 SS:25` + current-year `SS:4` would lose the 2B qualification. That contradicts the Rule 2 spec ("persists additively alongside Rule 1") and the Yahoo/ESPN industry norm.

**No multi-season single-call.** Research-agent noted that MLB statsapi accepts `season=2025,2026`, but the codebase convention is separate calls batched via `fetchPlayerBatch` (chunks of 50, 100 ms delay). Adding multi-season parsing introduces split disambiguation complexity for zero wall-clock benefit once the prior-season cache has a proper TTL.

### TTL fix (performance-oracle)

Prior-season fielding is immutable once the year closes. Pass an explicit 30-day TTL at the call site:

```ts
// Second fetch — 30-day TTL because prior-season data doesn't change
const priorMlbIds = mlbIds.filter(id => id < 1_000_000); // derived-ID filter, below
const priorMlbPlayers = await fetchPlayerFieldingStats(
  priorMlbIds,
  season - 1,
  { ttlSeconds: 30 * 86400 }
);
```

Requires threading a `ttlSeconds` option through `fetchPlayerFieldingStats → fetchPlayerBatch → mlbGetJson`. One-line addition at each hop; default behavior unchanged for all other callers.

### Derived-ID pre-filter (learnings)

From `docs/solutions/logic-errors/ohtani-two-way-player-split-architecture.md`: Ohtani's pitcher row has `mlbId=1660271`. MLB API 404s on derived IDs ≥1,000,000. Current-season fetch already hits this; the prior-season fetch doubles the failure surface. Filter before the call:

```ts
const realMlbIds = mlbIds.filter(id => id < 1_000_000);
```

This is defense-in-depth — the existing single-season call should also handle 404 gracefully in `fetchPlayerBatch`, but pre-filtering is cheap and removes an entire class of ignored errors from logs.

### Fail-closed partial-failure semantics (data-integrity)

Wrap the prior-season fetch in try/catch. On any failure (rate limit, 5xx, network), set `priorFieldingByMlbId = undefined` and log a structured warning. The merge guard `if (!isTwoWay && priorFielding)` becomes the fail-closed path: no fallback applied this tick, existing `posList` preserved, next 12:00 UTC cron self-heals.

```ts
let priorFieldingByMlbId: Map<number, Map<string, number>> | undefined;
try {
  const realMlbIds = mlbIds.filter(id => id < 1_000_000);
  const priorMlbPlayers = await fetchPlayerFieldingStats(realMlbIds, season - 1, { ttlSeconds: 30 * 86400 });
  priorFieldingByMlbId = new Map();
  for (const mp of priorMlbPlayers) {
    priorFieldingByMlbId.set(mp.id, extractFieldingPositions(mp));
  }
} catch (err) {
  logger.warn({ error: String(err), season: season - 1 }, "Prior-season fielding fetch failed; Rule 2 fallback skipped this tick");
  priorFieldingByMlbId = undefined;
}
```

This aligns with the `syncAllPlayers` / `syncAAARosters` continue-on-failure convention already used in the same file (per pattern-recognition review).

### Why not alternatives

- **`HistoricalPlayerStat` as data source.** OGBA-specific table, narrower coverage, no fielding GP per position. Wrong source.
- **Make the 20-GP threshold a league rule now.** YAGNI — no other league adopts this yet. Tracked as a follow-up for when a second league needs it.
- **Pre-filter players who already have current-season secondaries.** Performance-oracle rejected this: MLB API batches 50 IDs per request and the filter rarely removes whole batches. Complexity for negligible gain.
- **Extract `mergeEligibility(...)` pure helper.** Architecture reviewer suggested this, but with the gate removed and `!isTwoWay` inlined, the merge is ~6 lines. Extraction adds little.
- **Advisory lock / `pg_advisory_lock`.** Data-integrity flagged concurrency concerns. Existing code already has the same risk without visible problems; tracked as a follow-up.

---

## Data model / API changes

None. Schema untouched. No new endpoints. No new env vars. The fix is entirely inside `syncPositionEligibility`, plus a `ttlSeconds?: number` optional parameter added to `fetchPlayerFieldingStats` → `fetchPlayerBatch` → `mlbGetJson`.

---

## Scope

### In scope

- `server/src/features/players/services/mlbSyncService.ts`:
  - Add `PRIOR_YEAR_GP_THRESHOLD = 20` module-level constant.
  - Add prior-season fetch with try/catch, derived-ID filter, 30-day TTL option, inside `syncPositionEligibility`.
  - Add merge logic inside the per-player loop, guarded `!isTwoWay && priorFielding`.
  - Narrow `player.mlbId` once at top of loop (cleanup).
  - ~40 net lines.
- `server/src/lib/mlbApi.ts` — add optional `ttlSeconds` parameter to `mlbGetJson`; default behavior unchanged. ~3 lines.
- `server/src/features/players/services/mlbSyncService.ts` — thread `ttlSeconds` through `fetchPlayerBatch` and `fetchPlayerFieldingStats` signatures. ~5 lines.
- `server/src/features/players/__tests__/mlbSyncService.test.ts`:
  - Convert existing 8 `mockResolvedValue` calls to `.mockResolvedValueOnce(current).mockResolvedValueOnce(prior)` — prior returns `{ people: [] }` to preserve behavior.
  - Add 5 new test cases (below).

### Out of scope

- No change to the cron invocation at `server/src/index.ts:256` (still calls `syncPositionEligibility(season, 3)`; the function computes `season - 1` internally).
- No change to the four re-acquisition gates or their error shapes. They already consume `posList` correctly.
- No retroactive re-write of historical `Player.posList` values beyond what the next cron tick will do. Self-healing via the daily 12:00 UTC sync.
- `shouldOverwritePosList` guard hardening for the `posPrimary`-changes edge case (follow-up).
- Advisory lock / concurrency hardening (follow-up).
- `PlayerEligibilityLog` audit trail (follow-up; separate plan).

---

## Test plan

Co-locate with existing `syncPositionEligibility` tests in `server/src/features/players/__tests__/mlbSyncService.test.ts`. Mock `fetchPlayerFieldingStats` to return per-season fixtures via chained `mockResolvedValueOnce`.

### New test cases (5 after deepening — was 6)

1. **Fallback fires when current is empty.** Current-season fielding map empty; prior-season has `2B: 40`, `SS: 22`. Expected: `posList` includes both `2B` and `SS` (plus primary).
2. **Fallback adds to current, does not replace.** Current has `2B: 5 GP` (≥ threshold 3); prior has `SS: 40`. Expected: `posList` includes `2B` AND `SS` — current + prior merged additively. (This is the test that changed most from deepening — previously asserted `SS` was *excluded*, now asserts it's *included*, matching the dropped-gate semantics and industry norm.)
3. **Threshold respected.** Current empty; prior has `2B: 15 GP` (below 20). Expected: `posList = [primary]`, `2B` not merged.
4. **Fail-closed on prior-season fetch error.** Mock prior-season fetch to reject. Expected: all players' `posList` computed from current-season only; no exceptions bubble; one `logger.warn` call; re-run with success mock produces correct merged state (self-heal).
5. **Two-way players don't leak prior-year positions.** Ohtani — current fielding P only, prior fielding `OF: 25` from a prior DH-eligible season. Expected: pitcher row's `posList = [P]`, hitter row's `posList = [DH]` via existing two-way split; prior-year OF must not bleed into either row because `!isTwoWay` guards the fallback. Also assert `fetchPlayerFieldingStats` is not called with derived IDs (Ohtani's pitcher `1660271` filtered out).

### Tests removed after deepening

- ~~"Fallback skipped when current is non-empty"~~ — removed. The gate being dropped means fallback runs regardless; "skipped" is no longer a valid state.
- ~~"Primary-only edge"~~ — removed. The `secondaryCount` computation it tested no longer exists.

### Regression guard for existing 8 tests

Convert every `mockResolvedValue(...)` call site to `.mockResolvedValueOnce(currentFixture).mockResolvedValueOnce({ people: [] })`. Comment at top of describe block:

```ts
// After Rule 2: syncPositionEligibility calls fetchPlayerFieldingStats twice
// per invocation (current + prior season). Mocks must chain with
// mockResolvedValueOnce or .mockResolvedValue(defaultEmpty) + .mockResolvedValueOnce(current).
// Returning empty for prior-season preserves pre-Rule-2 behavior in these
// tests; Rule-2-specific behavior is covered in the new describe block below.
```

---

## Acceptance criteria

- [ ] `syncPositionEligibility` fetches current and prior-season fielding for all non-derived-ID players (`mlbId < 1_000_000`).
- [ ] Prior-season positions at ≥20 GP are merged into `eligible` for non-two-way players, additively alongside current-season positions.
- [ ] Two-way players (Ohtani) do not receive prior-year positions from the fallback.
- [ ] On prior-season fetch failure, the fallback is skipped for the entire tick; existing `posList` is preserved; a `logger.warn` is emitted.
- [ ] Prior-season fetch uses a 30-day cache TTL via new `ttlSeconds` option.
- [ ] Existing three-layer grandfathering invariants unchanged: daily sync never touches `Roster.assignedPosition`; primary position always included; two-way handling unchanged.
- [ ] 5 new unit tests green. 8 existing `syncPositionEligibility` tests converted to chained `mockResolvedValueOnce` and still green.
- [ ] `cd server && npx tsc --noEmit` clean.
- [ ] `cd server && npx vitest run src/features/players/__tests__/mlbSyncService.test.ts` green.

---

## Verification plan

After merge + deploy:
1. Wait for the 12:00 UTC daily cron to run against prod (next occurrence after deploy).
2. Spot-check a handful of known multi-position OGBA players — e.g., players who played ≥20 games at a secondary position in 2025 but have <3 GP at it in 2026 so far. Confirm their `Player.posList` now includes the prior-year-qualified positions.
3. Grep logs for `"Prior-season fielding fetch failed"` — should be zero. If present, rate limit or MLB API outage; cron will retry next day.
4. Optional: run the `auditRosterRules.ts` script post-cron — any POSITION_INELIGIBLE issues surfaced in the audit should resolve after the first enriched sync.

Owner-facing signal: if any OGBA owner has hit `POSITION_INELIGIBLE` on a pre-deploy claim, they can retry after the next cron run. Document in the commissioner comms when flipping.

---

## Risks (after deepening)

- **Low: MLB API rate limit.** The second `fetchPlayerFieldingStats` call roughly doubles MLB fielding requests (40 → 80 HTTP requests per run; wall-clock ~12–20 s cold, <1 s warm). The 30-day TTL collapses amortized cost to near-zero within a day. Fail-closed semantics mean a transient rate-limit event skips the fallback for one tick rather than corrupting `posList`.
- **Low: two-way player bleed.** Mitigated by the explicit `!isTwoWay` guard on the fallback, test #5 covers it.
- **Low: derived-ID 404s.** Mitigated by the `mlbId < 1_000_000` pre-filter.
- **Low: partial-failure inconsistent state.** Mitigated by all-or-nothing prior map + fail-closed gate.
- **Medium: `shouldOverwritePosList` interaction when `posPrimary` itself changes.** Not addressed in this PR. If MLB reclassifies a player's primary position upstream, `posList` built via Rule 2 may have `posList[0] !== posPrimary` — violating an implicit ordering invariant. Downstream consumers that split `posList` and treat the first element as primary would misread. Tracked as a follow-up.
- **Low: cron self-overlap.** Doubling sync duration grows the overlap window with admin-triggered syncs. Existing risk in the current code; not worsened meaningfully. Tracked as a follow-up (advisory lock).

---

## PR plan

Single PR `fix(players): rule-2 prior-year position eligibility fallback`. Not stacked on anything. Target main. Feature-branch naming: `fix/rule2-prior-year-position-eligibility`.

Commit breakdown:
1. `fix(mlb-api): add optional ttlSeconds parameter to mlbGetJson + fetchPlayerBatch chain`
2. `fix(players): add prior-season fielding fetch to syncPositionEligibility with fail-closed semantics`
3. `test(players): cover Rule 2 fallback scenarios (5 cases) + migrate existing mocks to chained once()`

---

## Follow-ups

- **`shouldOverwritePosList` primary-change hardening.** When `posPrimary` changes upstream, enforce `posList[0] === posPrimary` invariant. Small; separate PR.
- **Advisory lock on `syncPositionEligibility`.** Use `pg_advisory_lock` keyed on a fixed string to guarantee single-writer semantics. Admin trigger + cron overlap is the symptom.
- **Parameterize the 20-GP threshold per league** when a second league adopts this fallback. Introduce `LeagueRule.position.prior_year_threshold` (default 20) and loop the merge per-league. Single-file change at that point.
- **`logger.debug` observability for Rule 2 fires.** Low priority — the existing `posList` change log at line 379 already covers the per-player delta. A dedicated fires-Rule-2 counter would be useful only if we start debugging whether the fallback is actually firing.
- **`PlayerEligibilityLog` audit trail.** Data-integrity reviewer suggested a per-mutation audit table (`player`, `old`, `new`, `source`, `syncRunId`). Useful when `ENFORCE_ROSTER_RULES=true` is live and a commissioner needs to explain a declined claim. Out of scope here — would be a separate feature plan.

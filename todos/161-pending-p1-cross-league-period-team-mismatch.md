---
status: pending
priority: p1
issue_id: "161"
tags: [code-review, wire-list, security, idor]
dependencies: []
---

# Wire List: cross-league period↔team mismatch on adds/drops endpoints

## Problem Statement

Four wire-list endpoints (GET adds, GET drops, POST adds, POST drops) do not verify that the `:periodId` route param belongs to the same league as the `teamId` body/query param before issuing DB queries. Today the data leak is bounded — cross-tenant queries return empty result sets — but the contract is fragile: the POSTs check league equality at L264-267 only AFTER `loadPendingPeriod`, `assertPlayerIsFA`, and other validators run, leaving a probe oracle that distinguishes `PERIOD_NOT_FOUND` vs `PERIOD_NOT_PENDING` vs cross-league mismatch via timing and error codes. An attacker can enumerate other leagues' period IDs and infer their state.

## Findings

`server/src/features/wire-list/routes.ts:223-245` — GET `/periods/:periodId/adds?teamId=`:
```ts
const teamId = Number(req.query.teamId);
const periodId = Number(req.params.periodId);
// no check that period.leagueId === team.leagueId
const adds = await prisma.waiverAddEntry.findMany({
  where: { periodId, teamId },
  ...
});
```
Cross-tenant returns `[]` silently — no 404, no 403. Probe-able.

`server/src/features/wire-list/routes.ts:376-397` — GET drops: identical pattern.

`server/src/features/wire-list/routes.ts:248-295` — POST adds:
```ts
const team = await loadTeam(teamId);                // L~255
const period = await loadPendingPeriod(periodId);   // L~258
await assertPlayerIsFA(period.leagueId, playerId);  // L~262 — uses period's leagueId
if (team.leagueId !== period.leagueId) throw ...;   // L~264 — finally
```
The order leaks: a cross-league probe with a valid same-league `playerId` hits `assertPlayerIsFA` first; if FA, takes path A; if rostered, takes path B. Different timing, different error codes.

`server/src/features/wire-list/routes.ts:401-459` — POST drops: same shape.

`requireTeamOwnerOrCommissioner` middleware verifies the user owns the team but does NOT verify the period is in the team's league.

## Proposed Solutions

### Option 1: League-equality precheck on all 4 endpoints (recommended)
Extract a helper:
```ts
async function loadPeriodForTeam(periodId: number, teamId: number) {
  const [period, team] = await Promise.all([
    prisma.waiverPeriod.findUnique({ where: { id: periodId }, select: { id: true, leagueId: true, status: true, deadlineAt: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, leagueId: true } }),
  ]);
  if (!period || !team || period.leagueId !== team.leagueId) {
    throw new ApiError(404, "PERIOD_NOT_FOUND"); // unified — no oracle
  }
  return { period, team };
}
```

Use it as the FIRST DB call in all 4 endpoints. All cross-league / not-found / wrong-team cases collapse into one 404 with one error code, eliminating the probe oracle.

**Effort:** Small (~2h). **Risk:** Low — strict tightening; no schema, no behavior change for legitimate users.

### Option 2: Schema-level constraint (composite FK)
Add a redundant `leagueId` column to `WaiverAddEntry` / `WaiverDropEntry` with a composite FK to `(League.id, Team.leagueId)`. Compiler-enforced, but heavy migration and entry creation has to set leagueId.

**Effort:** Large. **Risk:** Medium.

### Option 3: Middleware-level guard
Add `requirePeriodInLeague` middleware that pulls periodId from params and teamId from body/query. Cleaner if more endpoints land later.

**Effort:** Small-medium. **Risk:** Low.

## Recommended Action

**Option 1** for now (4 endpoints, one helper). Promote to **Option 3** if a 5th endpoint lands.

## Technical Details

Files:
- `server/src/features/wire-list/routes.ts:223-245, 248-295, 376-397, 401-459`
- `server/src/features/wire-list/processor.ts` — add `loadPeriodForTeam` helper (or new `routes/helpers.ts`).

Tests:
- Two leagues, two periods. User in league A submits POST `/periods/:leagueB_periodId/adds?teamId=:leagueA_teamId`. Expect 404 `PERIOD_NOT_FOUND`, no DB write.
- GET probe across leagues returns 404 (not empty array).
- Existing happy-path tests still pass.

## Acceptance Criteria

- [ ] All 4 endpoints call `loadPeriodForTeam` as their first DB-touching line.
- [ ] All cross-league / missing-period / missing-team cases return identical 404 `PERIOD_NOT_FOUND`.
- [ ] Server logs DO record the distinguishing reason (so admins can diagnose) but the response body does not.
- [ ] Cross-league probe test case added.

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `server/src/features/wire-list/routes.ts:223-245, 248-295, 376-397, 401-459`
- IDOR precedent: `server/src/middleware/__tests__/authExtended.test.ts` (cross-team IDOR matrix already validated for ownership; this todo extends that posture to cross-league period access).

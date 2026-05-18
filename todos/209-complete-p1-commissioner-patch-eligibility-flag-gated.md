---
status: pending
priority: p1
issue_id: "209"
tags: [code-review, security, commissioner, position-eligibility, correctness]
dependencies: []
---

# Commissioner PATCH eligibility check is feature-flag-gated — illegal slot assignments silently persist when flag is off

## Problem Statement

`PATCH /api/commissioner/:leagueId/roster/:rosterId` validates `assignedPosition` eligibility only when `enforceRosterRules()` returns true:

```typescript
// commissioner/routes.ts ~line 819
if (enforceRosterRules() && updates.assignedPosition !== undefined && ...) {
  const eligible = isEligibleForSlot(roster.player.posList, targetSlot);
  if (!eligible) return res.status(400).json({ code: "POSITION_INELIGIBLE", ... });
}
```

Meanwhile `PATCH /api/teams/:teamId/roster/:rosterId` validates unconditionally (teams/routes.ts line 621). The two paths have diverged: the commissioner-specific endpoint is weaker than the team endpoint when the flag is off.

`ENFORCE_ROSTER_RULES` was designed to gate fee enforcement and auto-resolve behavior — not to disable eligibility checks. If the flag is ever off (new league setup, staging, emergency toggle), a commissioner can assign a player to an ineligible slot via the commissioner endpoint and it persists silently.

Current production state: flag is `true` for OGBA, so both paths enforce today. The divergence is a latent production risk.

## Findings

- **File:** `server/src/features/commissioner/routes.ts` line ~819
- `enforceRosterRules()` returns the value of `process.env.ENFORCE_ROSTER_RULES === 'true'`
- The teams endpoint at `routes.ts:621` validates without the flag gate
- The RosterGrid component calls the teams endpoint (`PATCH /api/teams/:teamId/roster/:rosterId`), not the commissioner endpoint — so the RosterGrid path is already safe
- The commissioner endpoint is called directly from the commissioner panel when editing a roster entry (price, position, source)

## Proposed Solutions

### Option A — Remove `enforceRosterRules()` gate from eligibility check (Recommended)
```typescript
// Before
if (enforceRosterRules() && updates.assignedPosition !== undefined && ...) {

// After
if (updates.assignedPosition !== undefined && ...) {
```
The `ENFORCE_ROSTER_RULES` flag should remain where it gates fee enforcement and violation counts — not where it gates whether an illegal assignment is accepted at all.
- **Pros:** Consistent with teams endpoint; eliminates divergence; no behavior change when flag is on
- **Cons:** None
- **Effort:** 2 lines
- **Risk:** Low — only changes behavior when flag is off (currently always on)

### Option B — Add a separate `ALLOW_INELIGIBLE_ASSIGNMENTS` env var
Gate only the eligibility check on a distinct flag; keep fee enforcement on `ENFORCE_ROSTER_RULES`.
- **Pros:** More fine-grained control
- **Cons:** More env vars; over-engineered for the use case
- **Effort:** Medium

## Recommended Action

Option A. The flag was never intended to gate assignment legality.

## Acceptance Criteria
- [ ] `enforceRosterRules()` call removed from the `assignedPosition` eligibility check in `commissioner/routes.ts`
- [ ] Eligibility check runs unconditionally when `updates.assignedPosition !== undefined`
- [ ] `ENFORCE_ROSTER_RULES` flag still gates fee enforcement and auto-resolve (not changed)
- [ ] Server tests pass

## Work Log
- 2026-05-18: Identified by Security Sentinel + Architecture Strategist. Divergence with teams endpoint. Flag is on in prod so no current regression.

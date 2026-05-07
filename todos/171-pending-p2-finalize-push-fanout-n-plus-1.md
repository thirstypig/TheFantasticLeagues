---
status: pending
priority: p2
issue_id: "171"
tags: [code-review, wire-list, performance, architecture]
dependencies: []
---

# Wire List finalize: push fan-out is N+1 + re-queries data already in scope

## Problem Statement

The `/finalize` push-fanout block re-queries data that is already in scope and runs `prisma.teamOwnership.findMany` inside a per-team for-loop — a textbook N+1. On a 12-team league that's ~12 extra round-trips per finalize, and the IIFE also re-fetches `waiverAddEntry` rows that were just produced by the reducer. Push delivery silently swallows missing subscriptions with no per-team observability.

## Findings

`server/src/features/wire-list/processor.ts:326-368` — fan-out IIFE:
- Re-runs `prisma.waiverAddEntry.findMany({ where: { periodId }, include: { player: true } })` even though `succeededAdds` is already constructed earlier in the same handler scope.
- Inside the for-loop over teams, calls `prisma.teamOwnership.findMany({ where: { teamId } })` per iteration — should be batched.
- Push delivery has no per-team success/failure counter; failures are silent.

## Proposed Solutions

### Option 1: Batch + reuse (recommended)
- Pass `succeededAdds` (already computed) into the fan-out instead of re-querying.
- Single `prisma.teamOwnership.findMany({ where: { teamId: { in: [...byTeam.keys()] } } })`, then group in memory.
- Add a count metric per finalize: `{ teamsNotified, subscriptionsHit, subscriptionsMissing }` logged via `logger.info`.

**Effort:** Small (~1.5h). **Risk:** Low.

### Option 2: Move push fan-out to a queue
Decouples finalize latency from push latency. Overkill at current scale (12 teams, infrequent finalize).

**Effort:** Medium-large. **Risk:** Medium.

### Option 3: Defer
Current latency acceptable for OGBA. Will bite at multi-league scale.

## Recommended Action

**Option 1** — minimum diff, addresses both N+1 and the silent-failure observability gap.

## Technical Details

- File: `server/src/features/wire-list/processor.ts:326-368`
- Imports already include `lib/pushService`
- No schema changes

## Acceptance Criteria

- [ ] Finalize executes exactly one `teamOwnership.findMany` regardless of team count
- [ ] No re-query of `waiverAddEntry` inside the fan-out
- [ ] Per-finalize log line includes `{ teamsNotified, subscriptionsHit, subscriptionsMissing }`
- [ ] Existing finalize tests still pass

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- File: `server/src/features/wire-list/processor.ts:326-368`
- `server/src/lib/pushService.ts`
- Related: todo #168 (reducer tests cover finalize path)

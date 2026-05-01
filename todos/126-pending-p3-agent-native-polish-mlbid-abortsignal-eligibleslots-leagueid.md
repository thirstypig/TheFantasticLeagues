---
status: pending
priority: p3
issue_id: "126"
tags: [code-review, agent-native, hardening]
dependencies: []
---

# Agent-native polish — `appliedReassignments.mlbId` + `fetchJsonPublic` AbortSignal + eligible-slots reserved leagueId

## Problem Statement

Three small hardening items aimed at agent UX and resource-leak prevention:

**1. `appliedReassignments` carries no `mlbId`.** Agents that track world state by MLB ID (the natural cross-system identifier) have to re-query Player by `playerId` to correlate after a roster mutation. The UI doesn't need this because it has the local DB id already.

**2. `fetchJsonPublic` doesn't accept/propagate AbortSignal from caller.** PR #179 added `signal: AbortSignal.timeout(30000)` to mirror `fetchJsonApi`. Good for hung public fetches, but the function signature is `fetchJsonPublic<T>(url: string)` — no `init` parameter, so callers can't merge their own abort signal (e.g., for unmount). Minor resource-leak / state-update-after-unmount foot-gun on slow networks.

**3. eligible-slots `?leagueId=` is documented but unused — a future-author trap.** When a future engineer wires per-league position-policy variations into this endpoint, they'll need to remember `requireLeagueMember("leagueId")`. No reminder in code.

## Findings

- `server/src/features/transactions/lib/autoResolveLineup.ts:25-31` — `AppliedReassignment` interface
- `server/src/features/transactions/routes.ts:415, 791, 1014` — response sites
- `client/src/api/base.ts:161-170` — `fetchJsonPublic` signature
- `server/src/features/players/routes.ts:217-219` — eligible-slots route doc

## Proposed Solutions

### Option 1: Bundle into one polish PR

**Approach:**
- Add `mlbId: number | null` to `AppliedReassignment`. Populate from the `tx.player.findMany` already feeding `playerNames`.
- Add `init?: RequestInit` parameter to `fetchJsonPublic`; merge signals like `fetchJsonApi` does.
- Add a TODO comment in eligible-slots route at the line that reads `req.query.leagueId`: `// TODO: when this becomes load-bearing, add requireLeagueMember("leagueId") guard above`. OR: drop the doc-line until used.

**Pros:**
- Three tiny, related hardening items in ~30 min
- All low-risk

**Cons:**
- None

**Effort:** Small (~30 min)

**Risk:** None

## Recommended Action

Option 1.

## Technical Details

**Affected files:**
- `server/src/features/transactions/lib/autoResolveLineup.ts:25-31` — interface
- `server/src/features/transactions/routes.ts:415, 791, 1014` — response builders
- `client/src/api/base.ts:161-170` — `fetchJsonPublic`
- `server/src/features/players/routes.ts:217-219` — eligible-slots route doc

## Acceptance Criteria

- [ ] `AppliedReassignment` has `mlbId` populated from existing tx
- [ ] `fetchJsonPublic` accepts `init?: RequestInit`; signal merge tested
- [ ] eligible-slots route has a TODO marker (or doc-line removed) at the unused `leagueId` read

## Resources

- **Source:** Agent-native P3 #1, security-sentinel P3 #2, security-sentinel P3 (eligible-slots)

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review (3 reviewers, 3 small items)

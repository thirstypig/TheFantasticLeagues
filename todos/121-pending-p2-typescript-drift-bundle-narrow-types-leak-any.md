---
status: pending
priority: p2
issue_id: "121"
tags: [code-review, drift, typescript, contracts]
dependencies: []
---

# TypeScript drift bundle — narrow types + `any` leaks across 5 client-side surfaces

## Problem Statement

Six related drift instances surfaced in review. All are the same class as the bug PR #183 fixed: client TypeScript types declared narrower than the wire shape (or as `any`), papered over with casts at consumer sites. Each one defeats the static checking that should catch field-name changes.

## Findings

1. **`getPeriodStandings(periodId?, leagueId?): Promise<any>`** — `client/src/features/standings/api.ts:4` — `periodId` param is unused; return type is `any`. Worst offender of the bunch.

2. **`getTeams(): Promise<any[]>`** — `client/src/features/teams/api.ts:10-14` — server returns `{ teams: { id, name, code, ownerUserId?, owner? }[] }`. There's already a `LeagueTeam` type in `client/src/api/types.ts`.

3. **`PeriodRosterEntry.periodStats: any | null`** — `client/src/features/teams/api.ts:39` — Team.tsx then does `Number(ps.AB)`/`Number(ps.H)` on every field. PR #183 added a typed `periodStats` shape on `TeamDetailResponse.currentRoster` — that shape can be reused.

4. **11 `(stat as any)` casts in Team.tsx** — `client/src/features/teams/pages/Team.tsx:227,242,243,245-254` — `stat` is `PlayerSeasonStat` (z-inferred from `shared/api/playerSeasonStats.ts`). Every field accessed via `as any` (`AVG`, `HR`, `R`, `RBI`, `SB`, `W`, `SV`, `K`, `ERA`, `WHIP`, `mlb_team`, `mlbTeam`, `assignedPosition`, `isKeeper`) IS declared on the schema. The casts are dead weight that defeats PR #178's schema expansion.

5. **`Home.tsx` activity row local intersection** — `client/src/pages/Home.tsx:364-377` — PR #179 cleaned up `(a as any)` accesses with a once-cast to `TransactionEvent & { effectiveDate?, createdAt?, transactionType? }`. Better than before, but the canonical `TransactionEvent` type doesn't declare those fields even though server augments rows with them. Same drift class as #183.

6. **`updateRosterPosition(): Promise<any>`** — `client/src/features/teams/api.ts:16-21` — same as #1.

## Proposed Solutions

### Option 1: Bundle as one cleanup PR

**Approach:** Single PR that:
- Types `getPeriodStandings`, `getTeams`, `updateRosterPosition` against the actual server response shapes
- Reuses `TeamDetailResponse.currentRoster[number].periodStats` as `PeriodStatsShape` for `PeriodRosterEntry.periodStats`
- Drops every `(stat as any)?.X` to `stat?.X` in Team.tsx — let compiler verify
- Adds `effectiveDate`, `createdAt`, `transactionType` to canonical `TransactionEvent` type (these ARE on the wire); drop the local once-cast in Home.tsx

**Pros:**
- Closes drift class systematically
- ~14 sites fixed in one mechanical pass
- Tests will catch any genuine missing fields

**Cons:**
- Bigger diff to review
- May surface previously-hidden bugs (which is the point)

**Effort:** Medium (~2-3 hours)

**Risk:** Low — compiler tells you immediately if any field is genuinely missing

### Option 2: Split into per-feature PRs

**Approach:** standings/api fixes one PR; teams/api another; Team.tsx casts a third; etc.

**Pros:**
- Smaller diffs

**Cons:**
- Same total effort spread across 4 PRs
- Loses thematic coherence

**Effort:** Medium (~3 hours total spread out)

**Risk:** Low

## Recommended Action

Option 1.

## Technical Details

**Affected files:**
- `client/src/features/standings/api.ts:4`
- `client/src/features/teams/api.ts:10-14, 16-21, 39`
- `client/src/features/teams/pages/Team.tsx:227, 242-254`
- `client/src/pages/Home.tsx:364-377`
- `client/src/types.ts` or `client/src/features/transactions/api.ts` (wherever `TransactionEvent` lives)
- `client/src/api/types.ts` (`LeagueTeam` type to reuse)

## Acceptance Criteria

- [ ] No `Promise<any>` or `Promise<any[]>` in any `client/src/features/**/api.ts`
- [ ] No `(stat as any)?.X` accesses in `Team.tsx`
- [ ] `TransactionEvent` declares augmented fields
- [ ] `PeriodRosterEntry.periodStats` typed (not `any | null`)
- [ ] `cd client && npx tsc --noEmit` clean
- [ ] All tests pass

## Resources

- **Source:** Kieran-typescript-reviewer P1 #1, P1 #3, P2 #5, P2 #6, P2 #8, P3 #14
- **Solution doc precedent:** `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review kieran-typescript-reviewer agent
- **Learnings:** Six independent drift sites all sharing one root cause justifies one bundled cleanup PR over fragmented per-file fixes.

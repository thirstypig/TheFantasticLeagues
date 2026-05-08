---
status: complete
priority: p3
issue_id: "146"
tags: [code-review, shared-api, drift, type-safety]
dependencies: []
---

# Promote remaining hand-written client types to `shared/api/` Zod schemas

## Problem Statement

Several client-side hand-written types overlap with server response shapes that have no Zod contract. Each is a future #131-style cast cluster waiting to happen:

1. **`TeamDetailResponse`** (`client/src/api/types.ts:68-111`) — actively driving Team.tsx, TeamLegacy.tsx, v3 hub. Highest priority.
2. **`SeasonStandingRow = Record<string, unknown>`** and **`PeriodStatRow`** (`client/src/api/types.ts:144-145`) — escape hatches that force every consumer to cast.
3. **`server/src/features/standings/routes.ts:213-282`** — six `(row as any).pointsDelta = …` mutations widening the response without any client type acknowledging the new fields.
4. **MVP/Cy Young weights** (`server/src/features/mlb-feed/services/awardsService.ts:231-310`) — magic numbers that should be a `MVP_WEIGHTS: Record<StatKey, number>` constant.

## Findings

- `client/src/api/types.ts:68-111, 144-145` — hand-written types
- `server/src/features/standings/routes.ts:213-282` — silent response widening
- `server/src/features/mlb-feed/services/awardsService.ts:231-310` — inline weights

## Proposed Solutions

### Option 1: Schema sweep in one PR (recommended)

- New `shared/api/teamDetail.ts` with `TeamDetailResponseSchema`
- New `shared/api/standings.ts` with `SeasonStandingRowSchema`, `PeriodStatRowSchema`, `EnrichedCategoryRowSchema`
- Move awards weights to a named constant in `awardsService.ts`
- Update consumers to use inferred types

**Effort:** Medium (~half day). **Risk:** Low — additive, type-only.

## Recommended Action

Option 1. Pairs naturally with #133 (awards relocation) since the awards Zod schema (#118) lives in the same area.

## Technical Details

- New `shared/api/teamDetail.ts`, `shared/api/standings.ts`
- Update `client/src/api/types.ts` to re-export from shared
- Update `server/src/features/standings/routes.ts` to type the enriched rows explicitly

## Acceptance Criteria

- [ ] `Record<string, unknown>` types eliminated from `client/src/api/types.ts`
- [ ] `(row as any).pointsDelta = …` patterns replaced with typed object construction
- [ ] Awards weights named constants
- [ ] Type checks pass; no runtime change

## Resources

- kieran-typescript-reviewer + architecture review under /ce:review 2026-04-30
- Todo #118 (awards Zod), #131 (cast cluster), #144 (schema unions)

## Work Log

### 2026-04-30 — Initial Discovery
- Multiple agents flagged overlapping issues; bundled into one sweep.

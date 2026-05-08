---
status: pending
priority: p1
issue_id: "131"
tags: [code-review, type-safety, drift, teams, v3-hub]
dependencies: []
---

# Team.tsx `as any` cluster reintroduces the very drift bug PR #185 was meant to prevent

## Problem Statement

`client/src/features/teams/pages/Team.tsx` (lines 218, 227, 242–254) contains 12 `as any` / `as unknown as { id?: number }` casts reading fields off `PlayerSeasonStat` — but `shared/api/playerSeasonStats.ts` already declares every single one of those fields (`id`, `assignedPosition`, `mlb_team`, `mlbTeam`, `isKeeper`, `AVG`, `HR`, `R`, `RBI`, `SB`, `W`, `SV`, `K`, `ERA`, `WHIP`).

This is a textbook recurrence of the bug class documented in `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` — added in PR #185 in the same stack. The contract pattern works only if every consumer uses the inferred type without escape hatches. PR #185 wrote the lesson; PR #182 wrote the regression.

## Findings

- `client/src/features/teams/pages/Team.tsx:218` — `(s as unknown as { id?: number }).id` — `id` is on the schema
- `client/src/features/teams/pages/Team.tsx:227` — `(stat as any)?.assignedPosition || row.posPrimary` — declared optional on schema
- `client/src/features/teams/pages/Team.tsx:242–254` — 10× `(stat as any)?.<FIELD>` for AVG/HR/R/RBI/SB/W/SV/K/ERA/WHIP/mlb_team/isKeeper

## Proposed Solutions

### Option 1: Drop every cast; type `statsByPid` properly (recommended)

`statsByPid: Map<number, PlayerSeasonStat>`. The lookup is `s.id`. Each field access is `stat?.HR` directly. Zero behavior change.

**Effort:** Small (~30 min). **Risk:** None — types are already correct on the schema.

### Option 2: Schema audit first, then drop casts

Walk every field in the casts, confirm presence on `PlayerSeasonStatSchema`, add any missing ones, then drop casts. Catches the case where a field is genuinely missing.

**Effort:** Small (~1h). **Risk:** None.

## Recommended Action

Option 1. The schema fields exist (verified during review).

## Technical Details

- `client/src/features/teams/pages/Team.tsx:218,227,242–254`
- `shared/api/playerSeasonStats.ts` — source of truth, no changes expected

## Acceptance Criteria

- [ ] Zero `as any` / `as unknown as` casts remain in `Team.tsx` for stat field access
- [ ] `tsc --noEmit` clean on client
- [ ] Browser smoke `/teams/<code>` — stats render identically pre/post

## Resources

- `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` (the lesson this finding violates)
- Todo #116 (related: enrichment fields `_dbPlayerId` etc. — different cast cluster)

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review re-run on stack #176-#185
- **Actions:** kieran-typescript-reviewer flagged 12 casts; cross-checked against `playerSeasonStats.ts` schema — all fields present.

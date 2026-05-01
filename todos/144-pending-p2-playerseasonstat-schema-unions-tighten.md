---
status: pending
priority: p2
issue_id: "144"
tags: [code-review, type-safety, shared-api, drift]
dependencies: []
---

# Tighten `PlayerSeasonStatSchema` unions: `is_pitcher` and rate stats accept multiple wire types

## Problem Statement

`shared/api/playerSeasonStats.ts` is the contract pilot, but several fields are loose unions that force defensive coercion on every consumer:

- `is_pitcher: z.union([z.boolean(), z.number()]).optional()` (`:36`) — server in `players/routes.ts:105` writes a real boolean now; the number variant is CSV-import legacy that should be coerced at the boundary.
- Eleven fields are `z.union([z.number(), z.string()])` (`:52, 63-65, 71-75, 83-84`): AVG, ERA, WHIP, IP, OBP, SLG, OPS, K9, BB9. The `dataRouter` at `players/routes.ts:435-441` emits numbers directly. Every consumer ends up calling `Number(stat.AVG)` defensively.

These unions aren't technically wrong — they accommodate legacy data — but they push the coercion burden onto every caller and undermine the contract pattern. The Zod schema should reflect what the *current* server emits.

## Findings

- `shared/api/playerSeasonStats.ts:36, 52, 63-65, 71-75, 83-84`
- `server/src/features/players/routes.ts:105, 435-441` — current emission shape
- Consumers cast or coerce defensively (e.g. Team.tsx — see #131)

## Proposed Solutions

### Option 1: Narrow to what the server actually emits + handle legacy at the import boundary (recommended)

- `is_pitcher: z.boolean().optional()`
- All rate stats: `z.number().nullable().optional()`
- If CSV-import paths still produce strings/numbers-as-bools, add a one-time coercion layer in the import script (not in the wire contract)

**Effort:** Small (~2h, including fixing any direct consumers). **Risk:** Low — server already emits the narrower shape per route audit.

### Option 2: Add a transform layer (`z.coerce.number()`) keeping the union

Tightens behavior without breaking import paths.

**Effort:** Small. **Risk:** Low.

## Recommended Action

Option 1. Coerce at the boundary, type narrowly on the wire.

## Technical Details

- `shared/api/playerSeasonStats.ts` — schema narrowing
- `server/src/features/players/routes.ts` — verify all paths emit narrowed shapes
- `server/scripts/` — any CSV import paths get coercion at the boundary
- Run client + server type checks; fix any consumer that depended on the loose union

## Acceptance Criteria

- [ ] `is_pitcher: z.boolean().optional()`
- [ ] Rate stats all `z.number().nullable().optional()`
- [ ] All consumers updated to drop defensive `Number(...)` calls
- [ ] CSV import paths still work (regression test)

## Resources

- kieran-typescript-reviewer report under /ce:review 2026-04-30
- Todo #131 (cast cluster — may shrink as schema narrows)

## Work Log

### 2026-04-30 — Initial Discovery
- kieran-typescript-reviewer flagged during /ce:review re-run.

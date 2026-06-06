---
status: complete
priority: p1
issue_id: 262
tags: [code-review, type-safety, posGames, standings, hub]
dependencies: []
---

## Problem Statement

`r.player.posGames as Record<string, number> | null` in `teamService.ts` is an unsafe TypeScript cast on a Prisma `Json?` column. Prisma's `Json` type resolves to `Prisma.JsonValue` (wide union: string | number | boolean | null | JsonObject | JsonArray). The cast silences the compiler but provides zero runtime protection. If the MLB Stats API returns `{"OF": "12"}` (string value instead of number — possible from a bad sync or API change), every downstream consumer that does arithmetic on `gamesByPos` will silently produce `NaN` for all GP chips with no error thrown. Both the TypeScript reviewer and architecture reviewer flagged this independently.

## Findings

From `server/src/features/teams/services/teamService.ts` (PR #378):
```typescript
// Two call sites with identical pattern:
gamesByPos: TeamService.buildGamesByPos(
  r.player.posPrimary,
  r.player.posList,
  r.player.posGames as Record<string, number> | null,  // ← unsafe cast
),
```

- `buildGamesByPos`'s `Object.keys(posGames).length > 0` guard checks key count but not value types.
- Architecture reviewer: "similar to the shared/api package.json type-vs-runtime import gap (masked for weeks by type-only usage)"
- Learnings researcher: `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` — same pattern

## Proposed Solutions

### Option A — Type guard function (Recommended)
```typescript
function isPosGamesRecord(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    val => typeof val === 'number' && Number.isFinite(val)
  );
}

// At call site:
gamesByPos: TeamService.buildGamesByPos(
  r.player.posPrimary,
  r.player.posList,
  isPosGamesRecord(r.player.posGames) ? r.player.posGames : null,
),
```
**Pros:** Runtime-safe; validates shape AND value types; converts corrupt data to null (fallback to synthetic). **Cons:** Small runtime cost (~40 checks per hub request). **Effort:** Small. **Risk:** None.

### Option B — Zod safeParse at the boundary
```typescript
const PosGamesSchema = z.record(z.string(), z.number());
// ...
const parsed = PosGamesSchema.safeParse(r.player.posGames);
gamesByPos: TeamService.buildGamesByPos(
  r.player.posPrimary, r.player.posList,
  parsed.success ? parsed.data : null,
),
```
**Pros:** Matches the Zod schema the client already uses (`z.record(z.string(), z.number())`). **Cons:** Requires zod import in teamService; one additional dependency. **Effort:** Small. **Risk:** None.

## Recommended Action

Option A — type guard without adding a Zod dependency to teamService. Place the guard in `server/src/lib/typeGuards.ts` (or similar) for reuse.

## Technical Details

- **Files:** `server/src/features/teams/services/teamService.ts` lines ~198, ~211
- **Related:** `shared/api/teams.ts` already has `gamesByPos: z.record(z.string(), z.number()).optional()` on the client side — the guard mirrors this contract server-side

## Acceptance Criteria

- [ ] Both call sites use a runtime type guard or Zod safeParse instead of `as` cast
- [ ] Guard validates both shape (object, not array) and value types (finite numbers)
- [ ] Invalid posGames data falls through to synthetic fallback (returns null)
- [ ] `cd server && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by kieran-typescript-reviewer and architecture-strategist during session review

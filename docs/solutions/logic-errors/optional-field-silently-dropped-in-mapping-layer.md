---
title: "Optional Field Silently Dropped When Mapping Between Service and Public API Layer"
problem_type:
  - logic-errors
symptoms:
  - "API response field is undefined for every row despite service computing it"
  - "No runtime error, no TypeScript error, no test failure — silent data loss"
  - "Bug only surfaced via network inspector during browser verification"
components_affected:
  - "server/src/features/teams/services/teamService.ts"
tags:
  - field-forwarding
  - object-mapping
  - silent-undefined
  - api-response
  - roster-hub
  - teamService
  - explicit-enumeration
  - optional-fields
severity: medium
detection_method: "Live browser verification — network tab inspection of /api/teams/:teamId/roster-hub showed posGamesSource missing from every row"
related_patterns:
  - internal-mapper-must-forward-new-fields
  - explicit-enumeration-vs-object-spread
  - optional-field-masks-absent-key
---

# Optional Field Silently Dropped When Mapping Between Service and Public API Layer

## Problem

`TeamService` has two public methods:
- `getTeamSummary()` — internal workhorse; builds the full roster data shape
- `getTeamRosterHub()` — public API handler; calls `getTeamSummary()` then maps each row into a hub-specific object by **explicit field enumeration**

When `posGamesSource: "real" | "synthetic"` was added to `getTeamSummary()`'s `currentRoster` rows, it was not forwarded in `getTeamRosterHub()`'s mapping. The API response returned `posGamesSource: undefined` silently on every row.

## Root Cause

Two independent factors combined to suppress any compiler or test signal:

**1. Explicit field enumeration (not a spread)**

The hub row mapping enumerates every field by name:

```typescript
return {
  rosterId: row.id,
  playerName: row.name,
  // ... 20+ more fields ...
  gamesByPos: row.gamesByPos,
  // posGamesSource was missing here
  mlbStatus: row.mlbStatus,
};
```

With an object spread (`{ ...row }`), a new field on the source type propagates automatically. With explicit enumeration, every field must be manually added to the mapping site.

**2. `.optional()` in the Zod schema / return type**

`shared/api/teams.ts` declared the field as:

```typescript
posGamesSource: z.enum(["real", "synthetic"]).optional(),
```

This makes `posGamesSource?: "real" | "synthetic"` in the inferred TypeScript type. An object literal that omits the key entirely is assignable to a type with an optional field — TypeScript sees "key absent" and "key present with value `undefined`" as indistinguishable for optional fields. So the mapping compiled clean even with the field missing.

**The combination:** optional field → absence is structurally valid → no compile error → no test failure → silent runtime omission.

## Fix

**Commit:** `0f1c203` — Add one line to the hub row mapping in `getTeamRosterHub()`.

**Before:**
```typescript
gamesByPos: row.gamesByPos,
// posGamesSource was missing
mlbStatus: row.mlbStatus,
```

**After:**
```typescript
gamesByPos: row.gamesByPos,
posGamesSource: row.posGamesSource,  // forward through hub row mapping
mlbStatus: row.mlbStatus,
```

## Investigation Steps

1. Added `posGamesSource` to `getTeamSummary()` and the Zod schema — confirmed field appeared in summary rows via log.
2. Checked the hub endpoint response via browser DevTools network tab — field was absent.
3. Traced the call chain: `getTeamRosterHub()` → `getTeamSummary()` → field present on inner rows.
4. Searched the hub row mapping for `posGamesSource` — not found. `gamesByPos` and `mlbStatus` (neighbors in the object literal) were both there. One line was missing.

## Prevention

### Structural fix (eliminates the entire class)

Restructure `getTeamRosterHub()` to spread the summary row and only add hub-specific overrides:

```typescript
return summaryRows.map(row => ({
  ...row,                          // all summary fields forwarded automatically
  rosterId: row.id,                // rename
  isPitcher: PITCHER_POS.has(...), // computed field specific to hub
}));
```

With a spread, adding a new field to `getTeamSummary()` flows through to the hub response without touching `getTeamRosterHub()`. The class of bug disappears.

### Make new fields required until all mapping sites are confirmed

When first adding a field, declare it as **required** (not `.optional()`) in the Zod schema:

```typescript
posGamesSource: z.enum(["real", "synthetic"]),  // required initially
```

A required field omitted from an explicit-enumeration mapping site causes a TypeScript error at that site. Once all mapping sites forward the field, flip to `.optional()` if the domain genuinely requires it.

### Test: pin the field-forwarding contract

Add a test that verifies the field flows end-to-end — not just that the source computes it, but that it appears in the API response:

```typescript
it("posGamesSource is forwarded from summary row to hub row", async () => {
  // arrange: player with real MLB posGames data
  mockPrisma.roster.findMany.mockImplementation((args) => {
    if (args?.where?.releasedAt === null) {
      return [{ ...playerRow, player: { ...player, posGames: { C: 48 } } }];
    }
    return [];
  });

  const result = await service.getTeamRosterHub(teamId);

  // hub row must have the field, not just the summary row
  expect(result.hitters[0].posGamesSource).toBe("real");
});
```

This test was added in `server/src/features/teams/__tests__/teamService.test.ts` after the bug was found.

## Related Docs

- [`under-declared-ts-type-hid-server-fields.md`](under-declared-ts-type-hid-server-fields.md) — same family: client type declared as `optional` masked that the server was not sending the field at all
- [`prisma-select-omission-silent-ui-fallback.md`](prisma-select-omission-silent-ui-fallback.md) — Prisma `select` block omitting a field; same "optional masks absence" root cause at the DB layer
- [`zod-typed-body-silently-strips-undeclared-fields.md`](../runtime-errors/zod-typed-body-silently-strips-undeclared-fields.md) — bidirectional contract: field not in schema is stripped in both directions without error

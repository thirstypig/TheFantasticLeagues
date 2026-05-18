---
title: "Prisma select missing field causes silent UI fallback to permissive default"
problem_type: logic-error
component: server/src/features/commissioner/routes.ts
symptom: "Commissioner All Teams Quick View position dropdown always showed all 9 hitter slots instead of filtering to each player's eligible positions"
root_cause: "Prisma player select block at GET /:leagueId/rosters omitted `posList: true`, so the field was never returned and the client-side slotsFor() filter always received undefined, triggering the unfiltered fallback"
tags:
  - prisma-select
  - missing-field
  - roster-grid
  - commissioner
  - position-eligibility
  - posList
  - dropdown-filter
  - silent-fallback
  - optional-typescript-field
date: 2026-05-18
severity: medium
time_to_solve: 30m
---

# Prisma Select Omission → Silent UI Fallback

## Symptom

The commissioner's "All Teams Quick View" roster grid had a position dropdown
(`canEditPosition` mode) that was supposed to filter to each player's eligible
roster slots. A pure shortstop should show only `SS`, `MI`, `DH`. Instead,
every player showed all 9 hitter slots regardless of eligibility.

No error was thrown — the UI silently degraded to its permissive fallback.

## Root Cause

`server/src/features/commissioner/routes.ts` — the `GET /:leagueId/rosters`
endpoint had an incomplete Prisma player select:

```typescript
// BROKEN — missing posList
include: {
  team: { select: { id: true, code: true, name: true } },
  player: { select: { id: true, name: true, posPrimary: true, mlbId: true } },
},
```

The client-side filter in `RosterGrid.tsx` guards on `r.player.posList`:

```tsx
const eligible = r.player.posList ? slotsFor(r.player.posList) : null;
if (!eligible) return [...all]; // ← fallback: show everything
```

Because `posList` was never returned by the server, `eligible` was always
`null`, and every player fell through to the "show all" branch.

## The Fix

One-line change in `server/src/features/commissioner/routes.ts`:

```typescript
// FIXED — posList added
include: {
  team: { select: { id: true, code: true, name: true } },
  player: { select: { id: true, name: true, posPrimary: true, posList: true, mlbId: true } },
},
```

## How the Root Cause Was Found

Instead of stepping through component rendering, an API call directly from the
browser console proved the server was the culprit in under 10 seconds:

```javascript
fetch('/api/commissioner/20/rosters', {
  headers: { Authorization: 'Bearer <token>' }
})
.then(r => r.json())
.then(d => console.log('hasPosList:', !!d.rosters[0]?.player?.posList))
// Output: hasPosList: false  ← server never returned the field
```

`false` ruled out any client-side bug and pinpointed the omission at the API
boundary. If the result had been `true`, the investigation would have shifted
to `slotsFor()` or the filter IIFE.

## Secondary Issue: Stale Dev Processes

After applying the server fix, the dropdown still showed 9 options. Cause:

1. The `tsx --watch` server process had not picked up the file change.
2. An old Vite process (started earlier in the week) was still bound to
   port 3010, intercepting requests ahead of the newly started one.

```bash
ps aux | grep -E "(vite|tsx)" | grep -v grep
# Shows duplicate PIDs — kill the old ones
kill <stale-tsx-pid> <stale-vite-pid>
# Restart both servers, then hard-refresh browser (Cmd+Shift+R)
```

Always check for duplicate dev-server processes before concluding a fix didn't
take.

## Prevention

### 1. The Optional Field Trap

`posList?: string` tells TypeScript "this field may be absent" — which is
exactly what a Prisma `select` omission produces. The type system cannot
distinguish "intentionally optional" from "accidentally omitted." Consequently,
defensive client code like `r.player.posList ? slotsFor(...) : fallback` hides
the server bug rather than surfacing it.

**Rule:** Reserve `?` for genuinely optional domain concepts. For fields the
server *always* returns on a given endpoint, use a non-optional type so a
missing select throws immediately rather than silently degrading.

### 2. Prisma Select Checklist

Any time you write client logic that reads `r.player.<field>`:

1. Find the endpoint that serves this data.
2. Locate the `include: { player: { select: { ... } } }` block.
3. Confirm `<field>: true` is present.
4. For nested relations, verify every level of the chain.

Do this trace *before* writing the client code.

### 3. API Boundary Verification (fastest debug technique)

Before inspecting client code, confirm what the server actually returns:

```javascript
fetch('/api/<endpoint>').then(r => r.json()).then(d => console.log(d))
```

If the field is absent from the logged object, stop reading client code — the
bug is in the server select.

### 4. Test the Options Array, Not Just the Render

The five tests added to `RosterGrid` each assert the *rendered options array*:

```tsx
const getOptions = (select: HTMLElement) =>
  Array.from((select as HTMLSelectElement).options).map(o => o.value);

// e.g., SS player should only see SS, MI, DH
expect(getOptions(screen.getByRole("combobox"))).toEqual(["SS", "MI", "DH"]);
```

They cover all three filter branches:

| Scenario | Expected options |
|----------|-----------------|
| Pitcher (`assignedPosition="P"`) | `["P"]` |
| No `posList` (undefined) | All 9 hitter slots |
| `posList="SS"` | `["SS", "MI", "DH"]` |
| `posList="2B,SS"` | `["2B", "SS", "MI", "DH"]` |
| Grandfathered assigned pos not in eligibility | `displayPos` + eligible + DH |

Testing the options array rather than internal state means a regression in
*either* the server select *or* the client filter fails the same test.

## Related Documentation

| Doc | Relevance |
|-----|-----------|
| [`logic-errors/under-declared-ts-type-hid-server-fields.md`](under-declared-ts-type-hid-server-fields.md) | Closest precedent — server returned `posList` but client type stopped at `price`; same invisible-field pattern |
| [`runtime-errors/zod-typed-body-silently-strips-undeclared-fields.md`](../runtime-errors/zod-typed-body-silently-strips-undeclared-fields.md) | Adjacent class — Zod schema as a stripper omitting fields; same silent-omission outcome |
| [`runtime-errors/prisma-client-stale-after-migration.md`](../runtime-errors/prisma-client-stale-after-migration.md) | Stale Prisma codegen caused a field to arrive as `null` everywhere; same symptom, different mechanism |
| [`logic-errors/pairwise-slot-constraint-bipartite-matching.md`](pairwise-slot-constraint-bipartite-matching.md) | Full architecture of `posList`-driven slot eligibility; context for what `posList: true` unlocks |
| [`ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md`](../ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md) | Earlier position-dropdown bug driven by missing `posList` data |
| [`docs/learnings/roster-position-management.md`](../../learnings/roster-position-management.md) | Golden rule: `posList` is the authoritative source for eligibility display, not `posPrimary` |
| [`docs/CONTRACT_TESTING.md`](../../CONTRACT_TESTING.md) | Zod shared-schema pattern that makes missing-field bugs compile errors instead of silent fallbacks |

---
title: "Under-Declared Client TS Type Hid Server Fields, Masking Multi-Position Eligibility"
category: logic-errors
tags: [typescript, type-safety, api-contract, roster-hub, posList, teams, react, contract-drift]
module: client/api, features/teams
symptom: "v3 roster hub showed only single-chip eligibility (e.g. 'OF') for multi-position players (e.g. 'OF,2B'); design preview at /design/roster-hub-v3 showed multi-chip with same component family"
root_cause: "Server's TeamService.getTeamDetails returns posList, mlbTeam, gamesByPos, isKeeper on every roster row, but client's TeamDetailResponse TS type only declared {id, playerId, name, posPrimary, price}. The field exists at runtime; the type didn't acknowledge it. toHubPlayer's posList fell back to posPrimary as if the field were genuinely absent."
severity: medium
session: 84
date: 2026-04-30
---

# Under-Declared Client TS Type Hid Server Fields, Masking Multi-Position Eligibility

## Symptom

After wiring `RosterHubV3` into the live `Team.tsx` (PR #182), the consolidated roster table rendered correctly — but the merged Position+Eligibility column showed only a **single chip** for every player. The design preview at `/design/roster-hub-v3` (admin-only mock data) had been showing multi-chip eligibility (e.g. "OF · 2B · MI" for Mookie Betts) for weeks, locked in via §0.5 user feedback. On the live route, every row collapsed to a single chip — `OF` for Betts, `2B` for Brandon Lowe, etc.

```
Design preview (mock data):     Mookie Betts    [OF] [2B] [MI]
Live route (real data):         Mookie Betts    [OF]
```

No console errors. No runtime exceptions. TypeScript compile was clean. Tests passed.

## Investigation

### What didn't work / dead ends

1. **Suspected cron sync issue.** Initial guess was that `syncPositionEligibility` had stopped writing `posList` to the database. Direct DB query against shared Supabase showed `Player.posList = "OF,2B"` for Betts — the data is there.

2. **Suspected stat-row enrichment race.** Team.tsx's data-load effect joins `getTeamDetails` against `getPlayerSeasonStats` to populate stats. Suspected the join was dropping `posList`. Traced through — the join only carries stat fields (HR, AVG, etc.), never claimed to carry `posList`.

3. **Suspected RosterHubV3 component bug.** Re-rendered the design preview side-by-side with the live page. Same component, same props shape, different output. Confirmed the component was fine — the bug was upstream.

### What worked: read the actual server response

Curled `/api/teams/:teamId` directly (via authenticated browser session). Response included:

```json
{
  "currentRoster": [{
    "id": 12345,
    "playerId": 500,
    "name": "Mookie Betts",
    "posPrimary": "OF",
    "posList": "OF,2B",      // ← present at runtime
    "mlbTeam": "LAD",        // ← present at runtime
    "gamesByPos": {"OF": 12, "2B": 8},  // ← present at runtime
    "isKeeper": false,       // ← present at runtime
    "price": 35
  }]
}
```

Then read the client TS type at `client/src/api/types.ts`:

```typescript
export type TeamDetailResponse = {
  team: { id: number; name: string; owner: string; budget: number };
  currentRoster: Array<{
    id: number;
    playerId: number;
    name: string;
    posPrimary: string;
    price: number;          // ← stops here
  }>;
};
```

The server was sending `posList`, `mlbTeam`, `gamesByPos`, `isKeeper`. The TS type acknowledged none of them. `toHubPlayer` read `row.posList` and got `undefined` (TypeScript happily inferred the access as `undefined`), then fell back to `posPrimary`.

## Root Cause

**Contract drift between server response shape and client TypeScript type.** This is a *logic error* not a runtime error: the data is present, the code "compiles", but the consumer behaves as if the field doesn't exist.

The server-side mapper at `server/src/features/teams/services/teamService.ts:175` builds:

```typescript
const currentRoster = rosterRows.map((r) => ({
  id: r.id,
  playerId: r.playerId,
  mlbId: r.player.mlbId,
  name: r.player.name,
  posPrimary: r.player.posPrimary,
  posList: r.player.posList,           // ← server includes
  mlbTeam: r.player.mlbTeam,           // ← server includes
  gamesByPos: TeamService.buildGamesByPos(...), // ← server includes
  acquiredAt: r.acquiredAt,
  price: r.price,
  assignedPosition: r.assignedPosition,
  isKeeper: r.isKeeper,                // ← server includes
  periodStats: ...,
}));
```

But the client `TeamDetailResponse` type stopped at `price`, evidently last edited when those fields didn't exist server-side. The server kept getting richer over time (probably across PRs that touched roster surfaces); the client type was never re-synced. Each new field worked silently for any consumer that knew to read it via `(row as any).posList`, but TypeScript-pure consumers read `undefined`.

`toHubPlayer` was a TypeScript-pure consumer (added in PR #182), so it never saw the field.

## Solution

PR #183. Three changes:

### 1. Expand the client TS type

`client/src/api/types.ts`:

```typescript
export type TeamDetailResponse = {
  team: { id: number; name: string; owner: string; budget: number };
  currentRoster: Array<{
    id: number;
    playerId: number;
    mlbId?: number | null;
    name: string;
    posPrimary: string;
    posList?: string | null;
    mlbTeam?: string | null;
    acquiredAt?: string;
    price: number;
    assignedPosition?: string | null;
    isKeeper?: boolean;
    gamesByPos?: Record<string, number>;
    periodStats?: { /* ...full shape... */ } | null;
  }>;
};
```

Pure type change — no runtime behavior added. The fields existed at runtime all along.

### 2. Thread the new fields through `RosterPlayer` in `Team.tsx`

```typescript
interface RosterPlayer {
  rosterId: number;
  playerId: number;
  playerName: string;
  posPrimary?: string;
  posList?: string;       // ← added
  // ...
  gamesByPos?: Record<string, number>;  // ← added
  // ...
}

// In the data-load effect:
const players: RosterPlayer[] = raw.map((row) => ({
  rosterId: row.id,
  playerId: row.playerId,
  playerName: row.name,
  posPrimary: row.posPrimary,
  posList: row.posList || row.posPrimary,  // ← fallback when null
  gamesByPos: row.gamesByPos,
  // ...
}));
```

### 3. Use `posList` in `toHubPlayer`

```typescript
function toHubPlayer(p: RosterPlayer): RosterHubPlayer {
  return {
    // ...
    posList: p.posList || p.posPrimary || "",  // ← was just posPrimary
    gamesPlayedByPosition: p.gamesByPos as RosterHubPlayer["gamesPlayedByPosition"],
    // ...
  };
}
```

Result: Mookie Betts' row now renders `[OF] [2B] [MI]` matching the design preview.

## Prevention

### Detect this class of bug earlier

1. **Use the `shared/api/` Zod-source-of-truth pattern** for any new API contract. The pilot at `shared/api/playerSeasonStats.ts` (and `shared/api/rosterMoves.ts` from PR #181) defines the schema once; both server and client `z.infer` from it. Drift becomes a TypeScript compile error, not a silent runtime fallback. See `docs/CONTRACT_TESTING.md` for the pattern.

2. **Add contract tests** when an existing endpoint grows. A test like:
   ```typescript
   it("server response includes all fields the client type declares", () => {
     const response = await getTeamDetails(testTeamId);
     const expected = ["id", "playerId", "name", "posPrimary", "posList",
                       "mlbTeam", "gamesByPos", "isKeeper", "price"];
     for (const key of expected) {
       expect(response.currentRoster[0]).toHaveProperty(key);
     }
   });
   ```
   would have caught this before any feature wired off the new fields.

3. **When wiring a UI off API data, curl the endpoint first.** TypeScript types reflect what someone *thinks* the API returns. `curl | jq` reflects what it actually returns. The two diverge silently across PRs.

### Don't trust the TS type as authoritative for cross-process data

TypeScript types are local-process invariants. The client's `TeamDetailResponse` is a *claim* about the server's response, not an enforcement. Any time you're about to add a field-access that depends on a field being present, check both:
- The server-side response builder (the *actual* shape)
- The client-side type (the *acknowledged* shape)

If they diverge, fix the type before relying on the field.

### Test for it

The `toHubPlayer` extraction in PR2.B6 (PR #185) added a test specifically pinning down the `posList` passthrough + posPrimary fallback. Future refactors that drop the field from the input type will break those tests:

```typescript
it("passes posList through unchanged for multi-position players", () => {
  const result = toHubPlayer(makeInput({ posList: "OF,2B", posPrimary: "OF" }));
  expect(result.posList).toBe("OF,2B");
});

it("falls back to posPrimary when posList is undefined", () => {
  const result = toHubPlayer(makeInput({ posList: undefined, posPrimary: "C" }));
  expect(result.posList).toBe("C");
});
```

## Cross-References

- **PR #182** — wired `RosterHubV3` into `Team.tsx`, surfaced the bug
- **PR #183** — the type-expansion fix described above
- **PR #185** — `toHubPlayer` extraction with regression tests
- **`docs/CONTRACT_TESTING.md`** — Zod-source-of-truth pattern that prevents this class
- **`shared/api/playerSeasonStats.ts`** — pilot of the source-of-truth pattern (Session 69)
- **Plan**: `docs/archive/plans/2026-04-29-yahoo-style-roster-moves-plan.md` §0.5 refinement #3
- **Related symptom**: anywhere a client `as any` cast accesses a field on a server response, the field exists at runtime but isn't typed. Search for `(row as any)` or `(row as unknown as ...)` in client code — each is a candidate for this bug class.

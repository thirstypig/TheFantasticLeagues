# Contract Testing — Shared Zod Schemas

Owner: engineering
Last updated: 2026-04-19 (Session 69)
Status: **Pilot — 1 of 234 endpoints covered**

## Why this exists

The client and server agree on wire format *by convention* — you write a TypeScript type on one side, a shape on the other, and hope they stay in sync. They drift:

- Session 69 shipped the `normalizeTwoWayRow` bug. Server returned `id`. Client had `id?: number` in its hand-written type but normalization silently dropped the field. No runtime error. No test failure. The watchlist star button rendered `null` for every row until we noticed in the browser a week later.

Contract testing removes the drift: **one schema. Both sides import it. Any change to the shape is a compile error on the side that doesn't match.**

## The pattern

```
shared/
├── api/
│   ├── index.ts                   # barrel export
│   └── playerSeasonStats.ts       # Zod schema + inferred type (pilot)
```

Each schema file:

1. Declares a **Zod schema** for the exact wire shape.
2. Exports an **inferred TypeScript type** via `z.infer<typeof Schema>`.
3. Is imported by **both** the client consumer and the server handler.
4. Has doc comments on fields that are required, plus *why* (e.g. "required for watchlist API").

Example structure (see `shared/api/playerSeasonStats.ts` for the real thing):

```ts
import { z } from "zod";

export const PlayerSeasonStatSchema = z.object({
  id: z.number(),          // REQUIRED. Dropping this must be a compile error.
  mlb_id: z.string(),
  // ... optional fields with z.X().optional()
});

export const PlayerSeasonStatsResponseSchema = z.object({
  stats: z.array(PlayerSeasonStatSchema),
});

export type PlayerSeasonStat = z.infer<typeof PlayerSeasonStatSchema>;
export type PlayerSeasonStatsResponse = z.infer<typeof PlayerSeasonStatsResponseSchema>;
```

## How the two sides import it

### Client (Vite)
Via the `@shared/*` path alias configured in both `client/tsconfig.json` and `client/vite.config.ts`:

```ts
import type { PlayerSeasonStat } from "@shared/api/playerSeasonStats";
```

### Server (Node + NodeNext ESM)
Via a **relative path with `.js` extension** — NodeNext module resolution doesn't honor tsconfig path aliases at runtime, so we use relative imports:

```ts
import type { PlayerSeasonStatsResponse } from "../../../../shared/api/playerSeasonStats.js";
```

Yes, the `.js` extension is required even though the file is `.ts` — that's how NodeNext ESM works. TypeScript resolves it at compile time; Node's ESM loader resolves it at runtime.

### Server handler — constrain the response type

```ts
const body: PlayerSeasonStatsResponse = { stats: expandedStats };
res.json(body);
```

By annotating the body with the shared type, any mismatch between what the handler builds and what the contract declares is a compile error.

## Adding a new shared schema

1. Create `shared/api/<endpoint>.ts` with the Zod schema + inferred types, following the pilot file as a template.
2. Re-export from `shared/api/index.ts`.
3. **Server side:** change the handler to build a typed object, import the response type, annotate the return.
4. **Client side:** find the hand-written type in `client/src/api/types.ts` (or wherever it lives), replace with `export type { X } from "@shared/api/<endpoint>"`.
5. Run `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit`. Fix any drift the schema now catches.
6. Run `npm run test` — if the schema is right, tests should still pass. If they don't, the schema found a real mismatch.
7. Update this doc's status line ("N of 234 endpoints covered").

## What this pattern does NOT do

- **Runtime validation.** The inferred types catch shape drift at compile time; they don't `.parse()` the response at runtime. If you want runtime validation too (e.g. for defense against a misbehaving upstream or malformed DB data), call `PlayerSeasonStatsResponseSchema.parse(body)` before returning — it costs a few microseconds and catches genuinely broken data.
- **Request validation.** The server already validates request bodies with Zod via `validateBody(schema)`. The pilot schema here is for responses only. For a truly contracted endpoint, the request schema should also live in `shared/` and be imported by both sides (client for form validation, server for `validateBody`).
- **Documentation of endpoints.** It doesn't replace API docs or OpenAPI. It replaces the *types*, not the discoverability.

## Priorities for the next endpoints

Roughly the order worth doing, by frequency-of-bugs:

1. `/api/watchlist` — GET + POST + DELETE. Uses `playerId` and `teamId`. Bug magnet.
2. `/api/teams/:id` and `/api/leagues/:id` — everything downstream of these two breaks when they drift.
3. `/api/transactions/claim` + `/api/transactions/drop` — write endpoints. High-value, low-surface.
4. `/api/seasons/current` — response shape has changed three times this year.
5. `/api/standings/season` and `/api/standings/period` — big payloads, many consumers.

Don't try to do them all in one session. Each new schema is ~30 minutes if the contract is already clear, 1–2 hours if the shape needs negotiation. Track progress in the status line above.

## When to break the pattern

- **One-off internal endpoints** (admin-only, not consumed by regular client code) are lower priority — the bug class doesn't affect regular users.
- **Endpoints that return Prisma models directly** (without a transform layer) are already reasonably safe because the types flow from Prisma → server. Don't add ceremony unless there's a real consumer mismatch.
- **During rapid prototyping**, writing the schema first can slow you down. Note the endpoint in this doc's "uncontracted" list, ship the feature, add the schema when things stabilize.

---
*Pilot status: 1 endpoint. Session 69 proof: removing the `id` field from `normalizeTwoWayRow()` produced the compile error `Property 'id' is missing in type '{...}' but required in type '{ id: number; ... }'` — the exact bug class that silently shipped in Session 69.*

---
id: DOC-008
title: "API documentation"
description: "Route inventory and per-route reference. Populate from the actual code — never from memory."
type: api-docs
status: draft
phase: null
owner: james
tags: [auth, database]
links: [DOC-007, ADR-015]
updated: 2026-07-23
---

# API documentation

> **Populate from the actual code.** Every row below must be read out of the route
> definition in `server/src/features/<feature>/routes.ts`, not from memory or from another
> doc. An API doc that drifts from the code is worse than no API doc — it gets trusted.

**291 routes across 33 feature routers** (counted 2026-07-23). Documenting all of them by
hand is not realistic and would rot immediately; the practical approach is to document the
routes that are **public, money-adjacent, or easy to get wrong**, and leave the rest to the
code.

---

## Router mount table

Read from `server/src/index.ts`. Mount order matters — the first match wins, and the SPA
catch-all is last.

| Mount | Router | Routes | Notes |
|---|---|---|---|
| `/api/auth` | auth | 5 | Tighter `authLimiter` applies |
| `/api` | public | — | Unauthenticated endpoints |
| `/api/public` | subscribers | — | **No auth.** Marketing signup. |
| `/` | subscriberPages | — | `/confirm`, `/unsubscribe` — server-rendered, mounted **before** the SPA catch-all |
| `/api` | leagues | 15 | |
| `/api` | admin | 24 | |
| `/api` | commissioner | 35 | Largest router |
| `/api/trades` | trades | 9 | |
| `/api/waivers` | waivers | 5 | **Legacy** — retirement tracked in todo `303` |
| `/api/wire-list` | wire-list | 19 | Current waiver model |
| `/api` | transactions | 9 | Roster mutations |
| `/api` | standings | 5 | |
| `/api` | archive | 22 | |
| `/api/leagues` | rules, awards, scoring | 15+1+4 | Three routers share this prefix |
| `/api/auction` | auction | 21 | |
| `/api/draft` | draft | 12 | |
| `/api/matchups` | matchups | 5 | |
| `/api/teams` | teams | 12 | |
| *(root)* | roster | 6 | Mounted with **no prefix** — unusual, worth knowing |
| `/api/roster` | rosterImport | — | |
| `/api` | keeperPrep | 11 | |
| `/api/periods` | periods | 5 | |
| `/api/seasons` | seasons | 4 | |
| `/api/players` | players | 6 | |
| `/api` | playerData | — | |
| `/api` | franchises | 3 | |
| `/api/mlb` | mlb-feed | 18 | |
| `/api` | reports | 1 | Client UI removed; endpoints still live |
| `/api/ai` | ai | 2 | |
| `/api/watchlist` | watchlist | 4 | |
| `/api/trading-block` | tradingBlock | 5 | |
| `/api/board` | board | 6 | |
| `/api/notifications` | notifications | 5 | |
| `/api` | profiles | 3 | |
| `/api/sessions` | sessions | 3 | |
| `/api/chat` | chat | 4 | **Commented out** in `index.ts` — chat runs over WebSocket |

<!-- TODO(james): the chat router being commented out while the chat feature is live is
     worth a one-line note in decision-log.md — is the REST surface dead code, or a
     deliberate WebSocket-only choice? -->

---

## Per-route template

Copy this block for each documented route.

```markdown
### `METHOD /api/path/:param`

| | |
|---|---|
| **Auth** | requireAuth · requireLeagueMember("leagueId") · … |
| **Season gate** | requireSeasonStatus([...]) or — |
| **Rate limit** | global · authLimiter · rateLimitPerUser(n/min) |
| **Inputs** | query / body params, with types and clamps |
| **Outputs** | success shape, status code |
| **Errors** | notable non-200s and what causes them |
| **Source** | server/src/features/<feature>/routes.ts:LINE |
```

---

## Worked examples

*Both read directly from the source on 2026-07-23.*

### `GET /api/transactions`

| | |
|---|---|
| **Auth** | `requireAuth` · `requireLeagueMember("leagueId")` |
| **Season gate** | — |
| **Inputs** | `leagueId` (query, required) · `teamId` (query, optional) · `skip` (clamped **0–100,000**, default 0) · `take` (clamped **1–200**, default 50) |
| **Outputs** | Paged `TransactionEvent[]` |
| **Note** | The clamps are a **deliberate DoS guard** — without them `take=999999` forces Prisma to materialize a league's entire `TransactionEvent` table. Same shape as the bug in #187. Do not remove. |
| **Source** | `server/src/features/transactions/routes.ts:279` |

### `POST /api/transactions/claim`

| | |
|---|---|
| **Auth** | `requireAuth` · `requireTeamOwnerOrCommissioner()` |
| **Season gate** | `requireSeasonStatus(["IN_SEASON"])` |
| **Validation** | `validateBody(ClaimRequestSchema)` — from `shared/api/` |
| **Inputs** | `leagueId` · `teamId` · `dropPlayerId?` · `ilStashPlayerId?` · `effectiveDate?` · `slotChanges?` |
| **Behaviour** | Add + optional IL-stash + optional drop in **one `$transaction`**. The stash fires *before* the roster-cap check. Uses `assertRosterLimit`, not `assertRosterAtExactCap`. |
| **Money-adjacent** | Yes — can trigger contested IL fees |
| **Companion** | `POST /api/transactions/claim/preview` — same middleware chain, no mutation |
| **Source** | `server/src/features/transactions/routes.ts:313` |

---

## Routes worth documenting next

Ranked by "damage if someone misunderstands it":

1. `POST /api/public/subscribe` — **the only unauthenticated write in the app.** Per-IP rate limit, honeypot, DB cooldown, no-enumeration response.
2. The rest of `/api/transactions/*` — `drop`, `il-stash`, `il-activate`, `sync-il-status`.
3. `/api/wire-list/*` — the commissioner consume/free reducer and atomic finalize.
4. Commissioner period-close endpoints — closing a period **auto-bills contested IL fees**.
5. `/api/leagues/:leagueId/scoring` — scoring settings.

<!-- TODO(james): decide whether this file is hand-maintained or generated. 291 routes
     will not stay accurate by hand. A generator that walks the route definitions and emits
     method/path/middleware would stay true automatically; the prose columns (behaviour,
     gotchas) would stay hand-written. That's a real piece of work, not a footnote. -->

---

## Conventions

- **Auth is opt-in per route.** `attachUser` runs globally but does not reject. A route with no `requireAuth` is **public**. Check twice.
- **Validation** uses Zod via `validateBody`. Cross-side schemas live in `shared/api/` so client and server share one definition.
- **Errors** carry a request ID; the client surfaces an `ERR-` code the user can copy.
- **Async handlers** are wrapped in `asyncHandler` so rejections reach the error middleware.
- **Pagination** should always clamp `take`. See the `GET /api/transactions` note above.

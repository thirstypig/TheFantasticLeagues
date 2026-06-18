---
title: Shared In-Memory State Breaks When Splitting a Large Route File Into Sub-Modules
problem_type: architecture
component: auction/routes
symptoms:
  - Splitting a monolithic routes file causes each sub-router module to instantiate its own copy of shared Maps
  - auctionStates, autoFinishTimers, nominationTimers, and finishLocks become independent per-module singletons
  - Auction state mutations in one sub-router are invisible to other sub-routers
  - Race conditions and missing timers appear with no obvious cause after a refactor
tags:
  - module-singleton
  - shared-state
  - sub-router
  - auction
  - refactor
  - esm
related_files:
  - server/src/features/auction/routes.ts
  - server/src/features/auction/lib/auctionStateManager.ts
severity: critical
pr: 401
---

## Problem

`server/src/features/auction/routes.ts` grew to 2017 lines and needed to be split into focused sub-router files. The file contained four module-level in-memory Maps declared as singletons:

```typescript
const auctionStates = new Map<string, AuctionState>();
const autoFinishTimers = new Map<string, NodeJS.Timeout>();
const nominationTimers = new Map<string, NodeJS.Timeout>();
const finishLocks = new Map<string, boolean>();
```

The naive approach — moving each group of handlers to its own file and copying the Map declarations — would silently create **independent Map instances per sub-router file**. A bid recorded in `biddingRoutes.ts` would be invisible to a state query in `stateRoutes.ts`. Race conditions and missing timers would appear with no obvious cause.

## Root Cause

Node.js module caching is path-keyed: the first `import` of a path executes the module and stores the result; every subsequent `import` from anywhere else returns the **same cached exports** — the same object references. This is the mechanism that makes module-level singletons work.

When a file is split and each new file re-declares `const auctionStates = new Map()`, each declaration creates a brand-new Map at the moment its module is first evaluated. There is no shared state between them — they are entirely independent objects that happen to share a name.

The bug is silent because:
- Tests hit individual routes in isolation (each test process gets its own module graph)
- The split routes all respond to requests correctly
- Only cross-handler state reads — where one route writes and a different route reads — are broken

## Solution

**Step 1: Extract all shared state into a single manager module — before touching the routes.**

Move all four Maps and every function that references them into `lib/auctionStateManager.ts`. Export everything. Node's module cache guarantees that any file importing from this path gets the same Map instances.

**Step 2: Create sub-router files that import from the shared manager.**

Each sub-router (`routes/stateRoutes.ts`, `routes/biddingRoutes.ts`, `routes/lifecycleRoutes.ts`, `routes/analyticsRoutes.ts`) imports only what it needs from the manager. No Map is ever redeclared in a sub-router.

**Step 3: Replace the original routes file with a thin composition layer.**

The original `routes.ts` becomes an 18-line file that mounts the sub-routers and re-exports all previously-exported symbols for backwards compatibility.

## Code Examples

**BAD — breaks shared state (each file gets its own Map instance):**

```typescript
// biddingRoutes.ts — WRONG
const auctionStates = new Map<string, AuctionState>(); // ← separate instance!
const autoFinishTimers = new Map<string, NodeJS.Timeout>(); // ← also separate!

// biddingRoutes and stateRoutes now operate on completely different Maps.
// A bid recorded here is invisible to state queries in stateRoutes.ts.
```

**GOOD — single source of truth via the manager module:**

```typescript
// lib/auctionStateManager.ts
export const auctionStates = new Map<string, AuctionState>();
export const autoFinishTimers = new Map<string, NodeJS.Timeout>();
export const nominationTimers = new Map<string, NodeJS.Timeout>();
export const finishLocks = new Map<string, boolean>();

// All functions that read/write these Maps live here too:
export function finishCurrentLot(leagueId: string, io: Server) { ... }
export function scheduleAutoFinish(leagueId: string, io: Server) { ... }
// etc.
```

```typescript
// biddingRoutes.ts — CORRECT
import { auctionStates, finishCurrentLot } from "../lib/auctionStateManager.js";
// Same Map instance as every other sub-router. State is shared correctly.
```

**Thin composition file (routes.ts, was 2017 lines → 18 lines):**

```typescript
import { Router } from "express";
import stateRouter from "./routes/stateRoutes.js";
import biddingRouter from "./routes/biddingRoutes.js";
import lifecycleRouter from "./routes/lifecycleRoutes.js";
import analyticsRouter from "./routes/analyticsRoutes.js";

// Backward-compat re-exports so tests + external consumers keep working
// without import path changes.
export type { AuctionStatus, AuctionTeam, NominationState, AuctionLogEvent, AuctionState } from "./types.js";
export { createDefaultState, calculateMaxBid, checkPositionLimit } from "./lib/auctionStateManager.js";

const router = Router();
router.use(stateRouter);
router.use(biddingRouter);
router.use(lifecycleRouter);
router.use(analyticsRouter);

export const auctionRouter = router;
export default auctionRouter;
```

**Key insight:** You do not need a class, a singleton wrapper, or any other pattern. A plain module with exported `const` Maps is sufficient — Node's module cache is the singleton mechanism.

## Prevention Checklist

Before splitting any Express routes file into sub-routers:

1. **Inventory all module-level declarations** — scan for `const`, `let`, or `var` at the top level (outside any function or class) that are mutable: `Map`, `Set`, `Array`, `{}`, counters, timers, or any object that accumulates state over time.

2. **Trace every write site** — for each mutable binding found, identify every handler or middleware that calls `.set()`, `.add()`, `.push()`, `.delete()`, assignment, or increment on it.

3. **Trace every read site** — identify every handler that reads or queries the same binding. If reads and writes land in different sub-router files, they will silently diverge.

4. **Check for timer cleanup tied to the same state** — timers that evict cache entries or flush queues are easy to miss and will silently stop working if the Map they reference moves to a different module.

5. **Decide on the ownership model before touching any file** — extract state to a dedicated singleton module. Do not copy-paste and discover the bug in prod.

6. **Verify the shared module lives at a stable, canonical path** — in a monorepo with `shared/` directories, confirm `"type": "module"` is set in the relevant `package.json`. A missing `"type"` causes ESM to fall back to CJS evaluation and can create a second module instance (see [[mixed-zod-versions-mcp-sdk-tool-registration]]).

## Red Flags

These patterns in a routes file signal singleton state that will break on a naive split:

```typescript
// Top-level mutable Map / Set / Array — RED FLAG
const rateLimitMap = new Map<string, number>();
const activeConnections = new Set<string>();
const pendingQueue: Job[] = [];

// Top-level counter or accumulator — RED FLAG
let requestCount = 0;

// Timer that references any of the above — RED FLAG
const flushTimer = setInterval(() => {
  pendingQueue.forEach(flush);
  pendingQueue.length = 0;
}, 5000);

// Handler writes — will be in sub-router A
router.post('/action', (req, res) => {
  rateLimitMap.set(req.ip, Date.now()); // WRITE
});

// Handler reads — will be in sub-router B — SPLIT WILL BREAK THIS
router.get('/check', (req, res) => {
  const last = rateLimitMap.get(req.ip); // READ from same Map
});
```

## Pre-split Audit Script

Run this from the repo root on the target file before any refactor:

```bash
TARGET="server/src/features/auction/routes.ts"

echo "=== Top-level mutable bindings ==="
grep -n '^\(export \)\?\(const\|let\|var\) ' "$TARGET" \
  | grep -v ': Router\b\|= Router()\|= express.Router()'

echo ""
echo "=== Map / Set / Array / object literals at module scope ==="
grep -n 'new Map\|new Set\|new Array\|\[\]\|= {' "$TARGET"

echo ""
echo "=== Timer registrations ==="
grep -n 'setInterval\|setTimeout' "$TARGET"

echo ""
echo "=== Write sites ==="
grep -n '\.\(set\|add\|push\|delete\|splice\|clear\)(.*)\|++\|--\|+=' "$TARGET" \
  | grep -v 'res\.set\|router\.\|app\.'
```

Any binding appearing in both the "mutable bindings" and "write sites" output must be extracted to a shared singleton module before the split.

## Test Strategy

Route-level tests (supertest in isolation) will pass even with broken state sharing because each test process has its own module graph. You need **cross-handler state tests**:

**1. In-process integration test — write then read across the split boundary:**

```typescript
it('state is visible across sub-routers after split', async () => {
  const app = buildApp(); // must wire ALL sub-routers onto one Express instance

  // Write via route in sub-router A
  await request(app).post('/api/auction/nominate').send({ leagueId: 'x', ... });

  // Read via route in sub-router B
  const res = await request(app).get('/api/auction/state?leagueId=x');

  // If Maps were duplicated, state query returns empty/stale
  expect(res.body.currentLot).toBeDefined();
});
```

**2. Module-identity assertion — confirm only one instance:**

```typescript
import { auctionStates as a } from '../../lib/auctionStateManager';
import { auctionStates as b } from '../../lib/auctionStateManager';

it('both imports resolve to the same Map', () => {
  expect(a).toBe(b); // Object.is — fails if two instances exist
  a.set('league-1', fakeState);
  expect(b.get('league-1')).toBeDefined(); // cross-reference
});
```

**3. Build smoke check:**

```bash
cd server && npm run build 2>&1 | grep -i 'cannot find module\|is not a module\|ERR_REQUIRE_ESM'
```

A clean build combined with the in-process integration test is the minimum bar. Route-level happy-path tests alone cannot detect a duplicated Map.

## Related Documentation

- [[mixed-zod-versions-mcp-sdk-tool-registration]] — same root cause family: two instances of a module in one process due to npm workspace version drift
- [[auction-production-outage-api-routing-player-ids]] — auction in-memory state management; merging HTTP fetch + WebSocket state
- [[auction-results-reads-current-rosters-not-snapshot]] — prior auction route split: adding `GET /api/auction/results` as a separate endpoint

## Related PRs

| PR | Description |
|---|---|
| **#401** | Auction module split — the incident that surfaced this pattern |
| **#296** | MCP fbst-app CI; mixed-Zod-version crash from workspace module duplication |
| **#213** | `fix(shared): add package.json with type=module` — Node ESM hoisting |
| **#283** | MCP fbst-app scaffold — 1037-line tools.ts, predecessor to later extraction |

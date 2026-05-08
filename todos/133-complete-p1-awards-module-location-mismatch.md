---
status: pending
priority: p1
issue_id: "133"
tags: [code-review, architecture, mlb-feed, awards]
dependencies: []
---

# Awards router lives in `mlb-feed/` but is mounted at `/api/leagues/:leagueId/awards`

## Problem Statement

`server/src/features/mlb-feed/awardsRoutes.ts` and `services/awardsService.ts` are placed under the `mlb-feed` feature module, but mounted at `/api/leagues/:leagueId/awards` (`server/src/index.ts:233-235`). `mlb-feed` is documented in CLAUDE.md as "Live MLB scores, transactions, my-players-today, weekly league digest, depth charts, news feeds." Awards rankings are a pure-DB computation over fantasy `PlayerStatsPeriod`/`TeamStatsPeriod` — nothing to do with the MLB API.

This is tech debt frozen in place by PR #178's extraction (awards was previously inline in `digestService.ts` and got hoisted out without relocating). The placement creates two long-term hazards:

- The cross-feature dependency table in CLAUDE.md cannot honestly describe the relationship — `mlb-feed/awardsRoutes.ts` mounted under `/api/leagues/...` is a category error.
- Future awards features (MVP race UI, Cy Young pace widget) will pile onto `mlb-feed/`, deepening the misnomer.

## Findings

- `server/src/features/mlb-feed/awardsRoutes.ts` — router export
- `server/src/features/mlb-feed/services/awardsService.ts` — service
- `server/src/features/mlb-feed/index.ts:2` — barrel re-export
- `server/src/index.ts:233-235` — mounted at `/api/leagues/:leagueId/awards`
- `server/src/features/mlb-feed/services/digestService.ts:376` — dynamic-imports awardsService (no longer needed after extraction; see related #149)

## Proposed Solutions

### Option 1: Move to a new `awards/` feature module (recommended)

Create `server/src/features/awards/` with `routes.ts` (current `awardsRoutes.ts`) and `services/awardsService.ts`. Mount router from `server/src/index.ts`. Update CLAUDE.md feature module table from 27 → 28. Add cross-feature dependency note: `mlb-feed/digestService` imports `awards/services/awardsService` (statics, not dynamic).

**Pros:** Clean module boundary; URL prefix matches feature.
**Cons:** Adds a single-route feature module — borderline justification.
**Effort:** Small (~1h). **Risk:** Low.

### Option 2: Move into existing `players/` feature

Awards are about player rankings; `players/` already hosts the auction-values router and hot stats endpoints.

**Pros:** No new module needed.
**Cons:** `players/` is already large; awards is league-scoped not player-scoped.
**Effort:** Small. **Risk:** Low.

### Option 3: Move into `leagues/`

URL path matches.

**Pros:** Trivial alignment with mount path.
**Cons:** `leagues/` is currently auth/CRUD-shaped, not analytics-shaped.
**Effort:** Small. **Risk:** Low.

## Recommended Action

Option 1 (new `awards/` feature). Best-fitting boundary; future MVP/Cy Young UI tools land there cleanly.

## Technical Details

- Move `server/src/features/mlb-feed/awardsRoutes.ts` → `server/src/features/awards/routes.ts`
- Move `server/src/features/mlb-feed/services/awardsService.ts` → `server/src/features/awards/services/awardsService.ts`
- Update `server/src/features/mlb-feed/index.ts` (remove awardsRouter export)
- Add `server/src/features/awards/index.ts`
- Update `server/src/index.ts:233-235` import path
- Update `server/src/features/mlb-feed/services/digestService.ts:376-378` to static import from new path
- Update CLAUDE.md "Feature Modules" table + "Cross-Feature Dependencies"
- Update `awardsRoutes.test.ts` + `awardsService.test.ts` import paths
- See also #149 (mlb-feed continued extraction)

## Acceptance Criteria

- [ ] New `awards/` feature module with routes + service
- [ ] Mount at `/api/leagues/:leagueId/awards` unchanged (URL stable)
- [ ] All existing awards tests pass at new paths
- [ ] CLAUDE.md updated
- [ ] `digestService` uses static import

## Resources

- Todo #118 (`shared/api/awards.ts` — landing the schema during the move is a natural pairing)
- Architecture review under /ce:review on 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- architecture-strategist flagged location mismatch during /ce:review re-run.

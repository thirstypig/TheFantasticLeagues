---
status: complete
priority: p2
issue_id: 263
tags: [code-review, security, idor, standings, api]
dependencies: []
---

## Problem Statement

The `/api/standings/period-category-standings` endpoint accepts a `periodId` query parameter and resolves it via `prisma.period.findUnique({ where: { id: pid } })` — a lookup that is not scoped to the authenticated `leagueId`. `requireLeagueMember` validates the caller belongs to the requested league, but does nothing to verify the supplied `periodId` belongs to that same league. An authenticated member of League A can pass a `periodId` from League B (integer ID guessable by brute-force), learning whether that period exists and potentially receiving cross-league stats data. PR #375 added an MCP tool (`standings_get_period` with optional `periodId`) that amplifies this attack surface since MCP tools run with service-account-level auth.

## Findings

From `server/src/features/standings/routes.ts` (GET /period-category-standings, pre-existing):
```typescript
// line ~121: period resolved without leagueId constraint
const selectedPeriod = await prisma.period.findUnique({ where: { id: pid } });
// line ~143: period used for season-to-date computation even if from different league
```

- `requireLeagueMember("leagueId")` runs but only validates caller's league membership, not period ownership.
- Period IDs are sequential integers — trivially enumerable.
- `computeTeamStatsFromDb(leagueId, pid)` correctly filters rosters by `leagueId`, so team-level data won't leak, but the period object itself (dates, existence) is exposed across leagues.

## Proposed Solutions

### Option A — findFirst with leagueId constraint (Recommended)
```typescript
// Replace findUnique with findFirst scoped to both id AND leagueId:
const selectedPeriod = pid
  ? await prisma.period.findFirst({ where: { id: pid, leagueId } })
  : null;
if (pid && !selectedPeriod) {
  return res.status(403).json({ error: "Period not found in this league" });
}
```
**Pros:** Zero information leak; prevents cross-league period probing; one-line change. **Cons:** None. **Effort:** Trivial. **Risk:** None.

### Option B — Validate after findUnique
```typescript
const selectedPeriod = await prisma.period.findUnique({ where: { id: pid } });
if (selectedPeriod && selectedPeriod.leagueId !== leagueId) {
  return res.status(403).json({ error: "Period not found in this league" });
}
```
**Pros:** Same security outcome. **Cons:** Leaks period existence timing (404 vs 403 timing side-channel). **Effort:** Trivial. **Risk:** Minor timing oracle.

## Recommended Action

Option A. Use `findFirst` with scoped lookup so non-existent and cross-league periods both return 403 with no timing difference.

## Technical Details

- **File:** `server/src/features/standings/routes.ts` ~line 117–145
- **Also update:** `mcp-servers/fbst-app/src/tools/standings.ts` — document that `periodId` must belong to the specified `leagueId`
- **Period model:** Check if `Period` has a `leagueId` field in `prisma/schema.prisma`

## Acceptance Criteria

- [ ] `prisma.period.findFirst({ where: { id: pid, leagueId } })` — or equivalent scope constraint
- [ ] Returns 403 when `periodId` doesn't belong to the authenticated league
- [ ] Existing period standings tests still pass
- [ ] MCP tool description notes `periodId` must belong to the same `leagueId`

## Work Log

### 2026-06-05 — Surfaced by security-sentinel during session review

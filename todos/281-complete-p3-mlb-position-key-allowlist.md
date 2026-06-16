---
status: pending
priority: p3
issue_id: 281
tags: [code-review, security, posGames, mlbSyncService]
dependencies: []
---

## Problem Statement

`extractFieldingPositions` in `mlbSyncService.ts` stores MLB API position abbreviations as JSONB keys without validating them against a known allowlist. The MLB API occasionally returns sub-position codes like `"LF"`, `"CF"`, `"RF"` that are not in the OGBA slot vocabulary. While `narrowGamesByPos` in `toHubPlayer.ts` filters these before rendering, they are stored verbatim in `Player.posGames` and emitted raw in the `gamesByPos` wire field before `toHubPlayer` narrows it.

Security-sentinel reviewed `__proto__` prototype pollution risk and found it NOT exploitable via `Object.fromEntries(Map)` in Node 18+. The practical concern is data integrity (unexpected keys in DB) not security.

## Proposed Solutions

Add a `KNOWN_FIELD_POSITIONS` allowlist to `extractFieldingPositions`:
```typescript
const KNOWN_FIELD_POSITIONS = new Set(["C","1B","2B","3B","SS","OF","LF","CF","RF","P","DH"]);
if (pos && games > 0 && KNOWN_FIELD_POSITIONS.has(pos)) {
  posMap.set(pos, (posMap.get(pos) ?? 0) + games);
}
```

This is additive to the existing `pos && games > 0` guard and produces cleaner DB data.

## Technical Details

- **File:** `server/src/features/players/services/mlbSyncService.ts` — `extractFieldingPositions` function (~line 301)

## Acceptance Criteria

- [ ] `extractFieldingPositions` validates position keys against an allowlist before adding to the Map
- [ ] Allowlist includes known MLB position abbreviations including sub-positions (LF, CF, RF) that the API returns

## Work Log

### 2026-06-05 — Flagged by security-sentinel (PR #378 review)

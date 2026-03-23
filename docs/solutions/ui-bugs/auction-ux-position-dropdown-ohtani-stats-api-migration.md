---
title: "Auction UX Fixes: Position Dropdown, Two-Way Player Stats, and API_BASE Sweep"
category: ui-bugs
severity: medium
component: auction
environment: production
date_solved: 2026-03-22
related_prs: [79, 80]
related_commits: [6afcf22, 155a972, 25a2b26, cb0bd28]
symptoms:
  - Position dropdown showed BN and UTIL instead of MI/CI roster slots
  - Ohtani pitcher row displayed hitting stats (HR, RBI, AVG) instead of pitching stats
  - Position matrix used red for full slots (felt like an error) instead of green (feels correct)
  - 28 additional hardcoded /api/ paths found beyond initial PR #79 fix
  - Server AuctionTeam type definition drifted from actual runtime shape
  - Duplicate O(n) player lookups in TeamListTab roster rendering
tags: [auction, position-dropdown, ohtani, two-way-player, api-routing, code-quality]
---

# Auction UX Fixes: Position Dropdown, Two-Way Player Stats, and API_BASE Sweep

## Context

After the critical auction outage (PRs #79-80, documented in `runtime-errors/auction-production-outage-api-routing-player-ids.md`), several UX and code quality issues were discovered during the live auction draft on 2026-03-22. These were fixed in rapid succession while the auction was running.

## Problems & Solutions

### 1. Position Dropdown: BN/UTIL Instead of MI/CI

**Symptom:** When expanding a team roster in the Teams tab, the position dropdown for each player showed BN (Bench) and UTIL (Utility) as options. These are not valid roster slots in OGBA. Players at 2B/SS should see MI (Middle Infield), and players at 1B/3B should see CI (Corner Infield).

**Root Cause:** The dropdown was built from raw position strings with hardcoded fallback options:
```typescript
// BEFORE — hardcoded BN, UTIL, P as always-present
const distinct = Array.from(new Set([...opts, 'BN', 'UTIL', 'P']));
```

**Fix:** Import `positionToSlots()` from `sportConfig.ts` and derive eligible roster slots from each player's positions:
```typescript
import { positionToSlots } from '../../../lib/sportConfig';

// Derive eligible roster slots from each position (includes MI, CI)
const slots = new Set<string>();
for (const pos of positions) {
    for (const slot of positionToSlots(pos)) slots.add(slot);
}
if (!isPitcher && slots.size > 0) slots.add('DH');
if (isPitcher) slots.add('P');
const sorted = MATRIX_POSITIONS.filter(s => slots.has(s));
```

**Key insight:** `positionToSlots()` already maps 2B→[2B, MI], SS→[SS, MI], 1B→[1B, CI], 3B→[3B, CI]. The infrastructure existed — the dropdown just wasn't using it.

### 2. Ohtani Pitcher Row Showed Hitting Stats

**Symptom:** Ohtani on Skunk Dogs (assigned as P) showed AB, HR, RBI, AVG instead of W, SV, K, ERA, WHIP.

**Root Cause:** `expandTwoWayPlayers()` clones the player row and sets `is_pitcher: true`, but the clone carries ALL stats from the original hitter row. Both rows had identical stats.

**Fix:** After expansion, zero out the wrong stat category for each two-way player:
```typescript
// server/src/features/players/routes.ts
for (const s of expandedStats) {
    if (!TWO_WAY_PLAYERS.has(Number(s.mlb_id))) continue;
    if (s.is_pitcher) {
        s.AB = 0; s.H = 0; s.R = 0; s.HR = 0; s.RBI = 0; s.SB = 0; s.AVG = 0;
    } else {
        s.W = 0; s.SV = 0; s.K = 0; s.ERA = 0; s.WHIP = 0;
    }
}
```

### 3. Position Matrix Color Semantics

**Symptom:** The position needs matrix in the Teams tab used red for fully-filled position slots. Users interpreted red as "something is wrong" when it actually meant "position is complete."

**Fix:** Reversed the color semantics:
- **Green** (emerald) = position fully filled (correct, complete)
- **Neutral text** = partially filled (in progress)
- **Muted/faded** = empty slot (needs players)

### 4. Complete API_BASE Migration (28 More Paths)

**Symptom:** The 5-agent code review after PR #79 discovered 28 additional hardcoded `/api/` paths across 15 files that were missed in the initial sweep.

**Fix:** Swept all remaining files, adding `API_BASE` import and converting paths. Final verification:
```bash
grep -rn "fetchJsonApi\|fetchWithAuth" client/src/ --include="*.tsx" --include="*.ts" | grep "'/api/\|\"\/api\/\|\`\/api\/"
# Returns 0 results (excluding Tech.tsx display strings and Login.tsx dev endpoint)
```

### 5. Code Quality Fixes (from 5-Agent Review)

- **Server type drift:** `AuctionTeam.roster` in `types.ts` was missing `id`, `mlbId`, `playerName` fields that `refreshTeams` actually emits. Updated to match runtime shape.
- **Duplicate `players.find()`:** TeamListTab attached `stat` via `.find()` at line 182, then did the SAME lookup again at line 272. Removed the redundant second scan — now uses `entry.stat`.
- **`(entry as any).playerName`:** Unnecessary `as any` cast removed — `RosterEntry` interface already declared `playerName`.
- **`||` → `??`:** Changed `r.mlbId || r.playerId` to `r.mlbId ?? r.playerId` in 3 locations. The `||` operator treats `0` as falsy; `??` correctly handles null/undefined.
- **Duplicate constant:** Inline `slotOrder` array replaced with existing `MATRIX_POSITIONS` constant defined in the same file.

## Prevention

### Position Dropdown
- Position slot derivation should always use `positionToSlots()` from `sportConfig.ts` — never hardcode position lists in components.
- The `MATRIX_POSITIONS` constant defines the canonical slot order for display.

### Two-Way Player Stats
- When `expandTwoWayPlayers()` creates split rows, stat zeroing MUST follow. Consider extracting a combined `expandAndSplitTwoWayStats()` helper to prevent future callers from forgetting the zeroing step (currently tracked as a P3 architectural improvement).

### API_BASE Consistency
- CI grep check prevents regressions: `grep -rn "fetchJsonApi.*'/api/" client/src/` must return 0
- See `docs/solutions/deployment/hardcoded-api-paths-cloudflare-cache-bypass.md` for the full prevention checklist

### Code Review Cadence
- Running a multi-agent review (`/ce:review`) after hot-fixing production issues catches quality gaps that time pressure creates. This session's review found 8 issues across 5 agents, all resolved in one commit.

## Related Documentation

- [Auction Production Outage](../runtime-errors/auction-production-outage-api-routing-player-ids.md) — the initial outage that preceded these fixes
- [Deployment Checklist](../deployment/DEPLOYMENT-CHECKLIST.md) — pre/post-deploy validation
- [Hardcoded API Paths](../deployment/hardcoded-api-paths-cloudflare-cache-bypass.md) — API_BASE routing architecture
- Memory: [feedback_predeploy_audit.md](../../../.claude/projects/-Users-jameschang-Projects-fbst/memory/feedback_predeploy_audit.md)

## Files Modified

| Commit | Files | Description |
|--------|-------|-------------|
| `6afcf22` | TeamListTab.tsx | Position dropdown: MI/CI via positionToSlots() |
| `155a972` | players/routes.ts | Ohtani stat split (pitcher/hitter) |
| `25a2b26` | 18 files | Complete API_BASE sweep + type fixes + code quality |
| `cb0bd28` | TeamListTab.tsx | Position matrix: green=full, neutral=partial |

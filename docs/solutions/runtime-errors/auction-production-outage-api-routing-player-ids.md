---
title: "Auction Production Outage: API Routing, Player Names, and Force-Assign Availability"
category: runtime-errors
severity: critical
component: auction
environment: production
date_solved: 2026-03-22
related_prs: [79, 80]
related_commits: [a510daf, a2e1509, b8f69c2]
symptoms:
  - Teams tab displayed 0 teams despite active auction
  - Player names showed as "Player #XXX" instead of actual names
  - Force-assigned players remained available in player pool
  - API requests routed through Cloudflare instead of direct to Render
tags: [api-routing, cloudflare, player-ids, real-time-state, websocket, auction]
---

# Auction Production Outage: API Routing, Player Names, and Force-Assign Availability

## Problem Summary

During a live auction draft on 2026-03-22, three distinct bugs rendered the auction feature non-functional:

1. **0 teams** — Auction state returned empty teams array via Cloudflare-cached response
2. **"Player #XXX"** — Team rosters showed internal DB IDs instead of player names
3. **Stale availability** — Force-assigned players still appeared as "available" in the player pool

All three bugs were invisible in local development and only manifested in the production deployment architecture (Cloudflare → Render).

## Root Causes

### Bug 1: Hardcoded API Paths Bypass `API_BASE`

**The smoking gun:** Network log showed API calls splitting across two origins:
```
[GET] https://fbst-api.onrender.com/api/auth/me => [200]         ← API_BASE (direct to Render)
[GET] https://thefantasticleagues.com/api/auction/state => [200]  ← hardcoded /api/ (through Cloudflare!)
```

`useAuctionState.ts` was the **only** client module using hardcoded `/api/` paths instead of `${API_BASE}`. In production:
- `VITE_API_BASE` is set to `https://fbst-api.onrender.com` → `API_BASE = https://fbst-api.onrender.com/api`
- All other features correctly used `${API_BASE}/endpoint` → requests went **direct to Render**
- Auction used `/api/auction/state` (relative) → resolved to `thefantasticleagues.com` → went through **Cloudflare**
- Cloudflare had cached stale/HTML responses (SPA catch-all) for API endpoints

**Why invisible in dev:** Vite proxies ALL `/api` requests to Express on port 4010, so hardcoded and `API_BASE` paths behave identically.

### Bug 2: Internal DB ID vs MLB API ID Mismatch

Server's `refreshTeams()` sent roster entries with only `{ id, playerId, price, assignedPosition }`. The `playerId` is the internal Prisma auto-increment ID. Client tried to match this against `mlb_id` (MLB Stats API ID, e.g., 660271 for Ohtani). Different ID namespaces → lookup always failed → fell back to `Player #${playerId}`.

### Bug 3: Player Pool Not Enriched from Real-Time State

Player pool fetched once at page load via `getPlayerSeasonStats()`. When force-assign created a roster entry server-side, the auction state updated via WebSocket, but the player pool remained stale. Two separate data sources never merged:
1. Initial player fetch (stale after mutations)
2. Live auction state (current via WebSocket)

## Solution

### Fix 1: Replace All Hardcoded Paths with `API_BASE` (PR #79)

```typescript
// BEFORE — 21 instances across 7 files
import { fetchJsonApi } from '../../../api/base';
await fetchJsonApi('/api/auction/state?leagueId=${lid}');

// AFTER
import { fetchJsonApi, API_BASE } from '../../../api/base';
await fetchJsonApi(`${API_BASE}/auction/state?leagueId=${lid}`);
```

**Files fixed:** `useAuctionState.ts` (15 paths), `TeamListTab.tsx` (3), `TransactionsPage.tsx` (1), `RosterManagementForm.tsx` (2), `RosterGrid.tsx` (1), `RosterControls.tsx` (1).

**Safety net:** Added `fetchState()` on WebSocket connect so if the initial HTTP fetch fails, the client re-fetches when WS establishes:
```typescript
ws.onopen = () => {
    stopPolling();
    fetchState(); // Re-fetch state on connect to ensure we have latest
};
```

### Fix 2: Include Player Name and MLB ID in Roster Data (PR #80)

```typescript
// server/src/features/auction/routes.ts — refreshTeams()

// BEFORE
roster: t.rosters.map(r => ({
    id: r.id,
    playerId: r.playerId,
    price: Number(r.price),
    assignedPosition: r.assignedPosition
}))

// AFTER
roster: t.rosters.map(r => ({
    id: r.id,
    playerId: r.playerId,
    mlbId: r.player?.mlbId ?? null,       // MLB API ID for lookups
    playerName: r.player?.name ?? null,    // Player name from DB
    price: Number(r.price),
    assignedPosition: r.assignedPosition
}))
```

### Fix 3: Enrich Player Pool from Real-Time Auction State (PR #80)

```typescript
// client/src/features/auction/pages/Auction.tsx

const enrichedPlayers = useMemo(() => {
  if (!auctionState?.teams || auctionState.teams.length === 0) return players;
  const draftedMap = new Map<string, string>();
  for (const team of auctionState.teams) {
    for (const r of team.roster) {
      const mlbId = String(r.mlbId || r.playerId);
      draftedMap.set(mlbId, team.code);
    }
  }
  if (draftedMap.size === 0) return players;
  return players.map(p => {
    const teamCode = draftedMap.get(String(p.mlb_id));
    if (teamCode && !p.ogba_team_code) {
      return { ...p, ogba_team_code: teamCode, team: teamCode };
    }
    return p;
  });
}, [players, auctionState?.teams]);
```

`enrichedPlayers` is passed to `PlayerPoolTab`, `TeamListTab`, and `MyNominationQueue` instead of the stale `players` array.

## Investigation Steps

1. Navigated to production auction page — saw "Awaiting Nomination" with 0 teams
2. Checked browser network tab — discovered API routing split (Cloudflare vs Render)
3. Examined `useAuctionState.ts` — found hardcoded `/api/` paths (only module not using `API_BASE`)
4. Checked `API_BASE` resolution — confirmed `VITE_API_BASE` set in Render dashboard
5. Fixed routing → teams appeared → discovered "Player #XXX" display issue
6. Traced roster data shape — found `playerId` vs `mlbId` mismatch
7. Added `mlbId` and `playerName` to server response → names displayed correctly
8. User reported force-assigned players still "available" → added `enrichedPlayers` memo

## Prevention

### Automated Detection (Add to CI)

```yaml
# .github/workflows/ci.yml — after TypeScript checks
- name: Audit hardcoded API paths
  run: |
    FOUND=$(grep -rn "fetchJsonApi\s*(\s*['\"\`]\/api\/" client/src --include="*.ts" --include="*.tsx" | grep -v test | wc -l)
    if [ "$FOUND" -gt 0 ]; then
      echo "ERROR: Found $FOUND hardcoded /api/ paths. Use \${API_BASE} instead."
      grep -rn "fetchJsonApi\s*(\s*['\"\`]\/api\/" client/src --include="*.ts" --include="*.tsx" | grep -v test
      exit 1
    fi
```

### Pre-Deploy Checklist

1. `grep -rn "fetchJsonApi.*'/api/" client/src/` — must return 0 results
2. Run production smoke test after every deploy (not optional)
3. Purge Cloudflare cache after deploy
4. Verify API responses are JSON (not HTML) via `curl -I`
5. Load auction page on production URL and verify Teams tab

### Key Principles

- **All `fetchJsonApi` calls MUST use `${API_BASE}/...`** — never hardcode `/api/`
- **Player IDs**: `playerId` = internal DB ID, `mlbId` = MLB Stats API ID — never interchange
- **Real-time enrichment**: When UI has both initial fetch + live WebSocket state, merge them via `useMemo`
- **Environment parity**: Bugs invisible in dev (Vite proxy) can break production (Cloudflare + separate domains)

## Related Documentation

- [Deployment Checklist](../deployment/DEPLOYMENT-CHECKLIST.md)
- [Hardcoded API Paths](../deployment/hardcoded-api-paths-cloudflare-cache-bypass.md)
- [CSP & WebSocket Issues](../deployment/csp-websocket-and-cdn-issues.md)
- Memory: [feedback_predeploy_audit.md](../../../.claude/projects/-Users-jameschang-Projects-fbst/memory/feedback_predeploy_audit.md)

## Affected Files

| File | Change |
|------|--------|
| `client/src/features/auction/hooks/useAuctionState.ts` | 15 paths → `API_BASE`, fetchState on WS connect |
| `client/src/features/auction/components/TeamListTab.tsx` | 3 paths → `API_BASE`, use `mlbId`/`playerName` |
| `client/src/features/auction/pages/Auction.tsx` | `enrichedPlayers` memo, pass to child components |
| `server/src/features/auction/routes.ts` | Include `mlbId`, `playerName` in roster data |
| `client/src/features/roster/components/*` | 4 paths → `API_BASE` |
| `client/src/features/transactions/pages/TransactionsPage.tsx` | 1 path → `API_BASE` |

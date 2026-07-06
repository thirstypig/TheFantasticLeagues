---
title: "IL eligibility check blocked freshly-injured players via a 6-hour MLB status cache"
category: integration-issues
date: 2026-07-05
severity: high
prs: [414]
components:
  - server/src/lib/ilSlotGuard.ts (checkMlbIlEligibility)
  - server/src/lib/mlbApi.ts (getMlbPlayerStatus, mlbGetJson, ROSTER_STATUS_TTL)
  - MLB StatsAPI 40-man roster feed
symptoms:
  - "A player placed on the real MLB IL today cannot be placed on a fantasy IL slot — the tool reports \"not eligible for an IL slot\" even though the player IS on the injured list"
  - "The block clears by itself hours later with no code change, making it look intermittent / unreproducible"
  - "Commissioner cannot execute an 'IL player + pick up a replacement' transaction on the day of the injury"
tags:
  - il-stash
  - il-eligibility
  - mlb-api
  - statsapi
  - 40-man
  - cache-staleness
  - write-path-freshness
  - forceFresh
  - ROSTER_STATUS_TTL
  - checkMlbIlEligibility
  - ilSlotGuard
  - roster-rules
---

# IL eligibility check blocked freshly-injured players via a 6-hour MLB status cache

## Problem Statement

A commissioner tried to place a player who had **just** been put on the MLB
injured list into a fantasy IL slot (and pick up a replacement in the same
transaction). The move was rejected as "not eligible for an IL slot" even
though the player was genuinely on the MLB 10-Day IL that same day.

Concrete case (2026-07-05): team DLC tried to IL Ronald Acuña Jr. (ATL) the day
he hit the 10-Day IL and pick up a free agent. The transaction would not go
through. By the time it was investigated later the same day, the exact same
eligibility check **passed** — which is the tell-tale signature of a
time-expiring cache, not a logic bug.

## Root Cause

The IL eligibility gate is a **write-path** check that reads the player's live
MLB status:

```
checkMlbIlEligibility(playerId)            // ilSlotGuard.ts
  └─ getMlbPlayerStatus(mlbId, mlbTeam)    // mlbApi.ts
       └─ mlbGetJson(url, ROSTER_STATUS_TTL)   // 40-man roster feed, TTL = 21600s (6h)
```

`mlbGetJson` is **cache-read-first**: if a cached copy of the team's 40-man
roster exists (TTL 6 hours), it returns it without hitting MLB. So immediately
after a real IL move, the cached roster still showed the player's *pre-injury*
`"Active"` status. `checkMlbIlEligibility` requires the status to match
`/^Injured (List )?\d+-Day$/`; `"Active"` fails, so the stash was rejected —
until the 6-hour cache entry expired and the next fetch returned
`"Injured 10-Day"`, after which it silently started working.

The cache is correct and desirable for **read/display** paths (e.g. ghost-IL
detection, UI badges) — those tolerate a few hours of lag. It is wrong for a
**write-path gate** that decides whether a user action is allowed *right now*.

### Also investigated — NOT a bug (recorded to prevent re-investigation)

A parallel hypothesis was that 60-Day-IL players get dropped from MLB's 40-man
roster and would therefore fail `getMlbPlayerStatus` (which reads the 40-man
feed) with a spurious "not on the 40-man roster" error. **Verified false against
live data:** MLB's `rosterType=40Man` feed *includes* 60-day-IL players with
status `"Injured 60-Day"`, which already matches the eligibility regex. No fix
was needed; the empirical check saved a pointless change.

## Solution (PR #414)

Add an opt-in cache **bypass** and use it only on the write-path eligibility
check. Read/display callers are untouched and keep the 6-hour cache.

### Fix 1 — `mlbGetJson` gains a `forceFresh` option

File: `server/src/lib/mlbApi.ts`

```ts
// Before:
export async function mlbGetJson<T = any>(url: string, ttlSeconds = DEFAULT_TTL): Promise<T> {
  const cached = cacheGet(url);
  if (cached !== null) return cached as T;
  const res = await fetchWithRetry(url);
  const data = await res.json() as T;
  cacheSet(url, data, ttlSeconds);
  return data;
}

// After:
export async function mlbGetJson<T = any>(
  url: string,
  ttlSeconds = DEFAULT_TTL,
  opts?: { forceFresh?: boolean },
): Promise<T> {
  // forceFresh skips the cache READ; the fresh result is still cached for reads.
  if (!opts?.forceFresh) {
    const cached = cacheGet(url);
    if (cached !== null) return cached as T;
  }
  const res = await fetchWithRetry(url);
  const data = await res.json() as T;
  cacheSet(url, data, ttlSeconds);
  return data;
}
```

### Fix 2 — thread it through `getMlbPlayerStatus`

File: `server/src/lib/mlbApi.ts`

```ts
export async function getMlbPlayerStatus(
  mlbId: number,
  mlbTeamAbbr: string,
  opts?: { forceFresh?: boolean },   // added
): Promise<MlbRosterStatus | null> {
  ...
  const data = await mlbGetJson<FortyManResponse>(url, ROSTER_STATUS_TTL, opts); // pass through
  ...
}
```

### Fix 3 — the write-path check forces a fresh fetch

File: `server/src/lib/ilSlotGuard.ts`

```ts
// checkMlbIlEligibility — a WRITE-path gate:
result = await getMlbPlayerStatus(player.mlbId, player.mlbTeam, { forceFresh: true });
```

> **Important:** the 6-hour cache is intentionally preserved everywhere else.
> `listGhostIlPlayersForTeam` / ghost-IL detection and any UI/display reads
> still call `getMlbPlayerStatus` *without* `forceFresh` — a few hours of lag is
> fine for detection, and forcing fresh there would hammer StatsAPI on every
> roster render. Only the stash-eligibility decision bypasses the cache.

## Prevention & Testing

### Patterns to watch for
- **Write-path gates must read fresh; caches are for read/display.** Any time a
  cached external value decides whether a user action is *allowed right now*,
  the cache read is a latent "works intermittently" bug. Grep for
  `mlbGetJson(url, TTL)` (or any cache-first helper) reached from inside a
  transaction/eligibility check and confirm it can force-refresh.
- **"It fixed itself" == a TTL.** A block that clears hours later with no deploy
  is almost always a time-expiring cache, not a heisenbug. Reproduce by checking
  the *cache TTL*, not just the logic.
- **Verify external-API assumptions empirically before coding a fix.** The
  "60-day IL not on the 40-man" theory was plausible and wrong; one live
  `curl` of the 40-man feed disproved it and avoided a needless change.

### Unit tests to add / added
- Assert `checkMlbIlEligibility` calls `getMlbPlayerStatus` with
  `{ forceFresh: true }` (regression guard in
  `server/src/lib/__tests__/ilSlotGuard.test.ts`).
- Keep the existing `isMlbIlStatus` cases that lock in `"Injured 60-Day"` as a
  valid IL status (documents that 60-day IL is handled).

### Verification recipe
Run the exact gate against production for the affected player:
```
export DATABASE_URL=... DIRECT_URL=...   # prod (Railway)
# call getMlbPlayerStatus(mlbId, team, { forceFresh:true }) and isMlbIlStatus(status)
# then checkMlbIlEligibility(playerId) — expect the MlbStatusCheck, no throw
```

## Related Documentation
- `docs/solutions/logic-errors/add-drop-ghost-il-blocker-and-slot-filter-indirect-eligibility.md` — the *inverse* problem (a ghost-IL player whose MLB status is no longer injured blocks add/drop); confirms `assertNoGhostIl` is intentionally kept on the IL-stash/activate flows.
- `docs/solutions/runtime-errors/prisma-client-stale-after-migration.md` — same failure *class* ("MLB status wrong at the decision point"), different cause (stale Prisma client vs. stale API cache).
- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — canonical IL-slot roster/history doc (IL_STASH / IL_ACTIVATE window reconstruction).
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — sibling MLB-StatsAPI integration bug; establishes the MLB-feed data conventions this gate depends on.

## Work Log
- 2026-07-05: Reported (DLC could not IL Ronald Acuña on injury day). Reproduced the gate against prod (passed by then — cache had expired), traced to `ROSTER_STATUS_TTL=21600` cache-read-first in `mlbGetJson`. Ruled out the 60-day-IL/40-man theory empirically. Fixed via `forceFresh` bypass on the write path in PR #414 (tsc clean, 184 IL/transaction tests pass).

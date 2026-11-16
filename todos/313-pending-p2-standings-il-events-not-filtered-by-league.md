---
priority: p2
issue_id: 313
tags: [standings, scoring, il, transactions, multi-league]
dependencies: []
---

> **Possibly money-affecting, pre-existing, found in the #305 review.** Not caused by #305;
> #305 kept the existing filter unchanged so its output stayed byte-identical.

## Problem Statement
IL events are not filtered by league in standings. The standings IL query selects events by
`playerId IN (...)` only. `TransactionEvent` has a `leagueId`, and players are shared across
leagues, so an IL stash a different league's owner made for the same MLB player excludes that
player's stats from THIS league's standings, for whichever team rosters him here. With one live
league (OGBA) this is latent, but local/test leagues already roster the same players, and any
second real league turns it into a scoring bug.

## Evidence
- `server/src/features/standings/services/standingsService.ts:459-470` — `loadIlEvents(playerIds)`
  filters `playerId: { in: playerIds }` (line 462) with no `leagueId`. Called from the
  single-period path (`:620`) and the batched season path (`:936`).
- `server/src/features/teams/services/teamService.ts:306` — the team page filters
  `leagueId: summary.team.leagueId`.
- `server/src/features/transactions/services/ilFeeService.ts:134-140` — IL fee billing reads a
  different table (`RosterSlotEvent`), filtered by `leagueId`. So billing and the team page are
  league-scoped while standings are not: they can disagree.
- The same unscoped filter is in the audit scripts (`server/src/scripts/audit-standings.ts:146`,
  `fangraphs-audit.ts:173`, `audit_period.ts:36`, `audit-mlb-crosscheck.ts:186`,
  `spot_check_team.ts:37`).

## Proposed Fix
1. Run the sizing check below against prod (read-only). Rows mean a standings change today.
2. Add a `leagueId` parameter to `loadIlEvents` and filter on it in both standings paths (the
   batched path loads one league, so it stays one query), and the same in the audit scripts.
3. Test: same player rostered in two leagues, IL stash only in league B; league A standings must
   count him. Assert on the query args too (a mock that returns fixed rows can't catch a missing
   WHERE clause).
4. Ship together with #312 so DROP events are league-scoped from the day they start closing stints.

## Sizing check (read-only SQL)
Run inside `BEGIN READ ONLY; ... ROLLBACK;`. Each row is a (roster league, event league) pair where
IL events from the other league reach players rostered here in a scored period.
Returned 0 rows on the local DB (2026-11-15).

```sql
-- Read-only. IL events recorded in one league for players rostered in another
-- league during a scored period: standings (playerId-only filter) applies them.
SELECT t."leagueId" AS roster_league, e."leagueId" AS event_league,
       count(DISTINCT e."playerId") AS players, count(DISTINCT e.id) AS events,
       min(e."effDate") AS first_event, max(e."effDate") AS last_event
FROM "TransactionEvent" e
JOIN "Roster" r ON r."playerId" = e."playerId"
JOIN "Team"   t ON t.id = r."teamId"
WHERE e."transactionType" IN ('IL_STASH', 'IL_ACTIVATE')
  AND e."effDate" IS NOT NULL
  AND e."leagueId" <> t."leagueId"
  AND EXISTS (
    SELECT 1 FROM "Period" p
    WHERE p."leagueId" = t."leagueId" AND p.status IN ('active', 'completed')
      AND r."acquiredAt" <= p."endDate"
      AND (r."releasedAt" IS NULL OR r."releasedAt" >= p."startDate")
  )
GROUP BY 1, 2
ORDER BY 1, 2;
```

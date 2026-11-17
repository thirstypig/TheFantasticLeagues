---
priority: p2
issue_id: 312
tags: [standings, scoring, il, transactions]
dependencies: []
---

> **Possibly money-affecting, pre-existing, found in the #305 review.** Not caused by #305;
> #305 kept the existing event set unchanged so its output stayed byte-identical.

## Problem Statement
Standings never close an IL stint on DROP or IL_RELEASE. The standings IL query loads only
`IL_STASH` / `IL_ACTIVATE`, while `buildIlWindows` closes a stint on `IL_RELEASE` or `DROP` too
and the shared constant `IL_WINDOW_EVENT_TYPES` includes both. A player who is stashed on IL and
then dropped (never activated) keeps an OPEN stint in standings. If any team later rosters him,
`wasOnIlAtPeriodStart` is true for every later period, so his stats are excluded from every
later period's standings for the team that picked him up. That changes category totals and
roto points.

## Evidence
- `server/src/features/standings/services/standingsService.ts:459-470` — `loadIlEvents` filters
  `transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] }` (line 463). Used by both the single-period
  path (`:620`) and the batched season path (`:936`).
- `server/src/lib/ilWindows.ts:9` — `IL_WINDOW_EVENT_TYPES = ["IL_STASH", "IL_ACTIVATE", "IL_RELEASE", "DROP"]`,
  documented as "DROP and IL_RELEASE close windows exactly like IL_ACTIVATE does".
- `server/src/lib/ilWindows.ts:35` — `buildIlWindows` closes on `IL_RELEASE` / `DROP`, but only if
  the caller loads them.
- `server/src/features/teams/services/teamService.ts:308` — the team page uses the full
  `IL_WINDOW_EVENT_TYPES` set, so the team page and standings can disagree about whether a player
  is on IL.
- The same two-type filter is copied into the audit scripts (`server/src/scripts/audit-standings.ts:146`,
  `fangraphs-audit.ts:173`, `audit_period.ts:36`, `audit-mlb-crosscheck.ts:186`,
  `spot_check_team.ts:37`), so the audits share the blind spot and can't flag it.

## Proposed Fix
1. Run the sizing check below against prod (read-only). If it returns 0 rows, the fix changes no
   scored result and can ship on its own; if it returns rows, each is a standings change the
   commissioner has to sign off (IL fees are billed from `RosterSlotEvent`, not this table, so
   billing is unaffected, but re-check those players' fees anyway).
2. Load `[...IL_WINDOW_EVENT_TYPES]` in `loadIlEvents` and in the five audit scripts (one change
   each; keep the `effDate asc, id asc` order).
3. Test: stash → drop → re-rostered by another team two periods later; the later periods must
   count his stats. Mutation-check by reverting to the two-type filter.
4. Pair with #313 (league filter): DROP events from another league would otherwise start closing
   this league's stints.

## Sizing check (read-only SQL)
Run inside `BEGIN READ ONLY; ... ROLLBACK;`. Each row is a (player, roster row, scored period)
that standings scores with the player excluded, but that the full event set would count.
Returned 0 rows on the local DB (2026-11-15), which has almost no transactions.

```sql
-- Read-only. IL stints the full event set closes on DROP / IL_RELEASE, but the
-- standings query (IL_STASH / IL_ACTIVATE only) leaves open, and the scored
-- periods that would therefore exclude the player's stats.
WITH ev AS (
  SELECT "leagueId", "playerId", "transactionType", "effDate", id,
         LEAD("transactionType") OVER w AS next_type,
         LEAD("effDate")         OVER w AS next_date
  FROM "TransactionEvent"
  WHERE "effDate" IS NOT NULL AND "playerId" IS NOT NULL
    AND "transactionType" IN ('IL_STASH', 'IL_ACTIVATE', 'IL_RELEASE', 'DROP')
  WINDOW w AS (PARTITION BY "playerId" ORDER BY "effDate", id)
),
closed_by_drop AS (
  SELECT "leagueId" AS event_league, "playerId", "effDate" AS stash_date,
         next_type AS closed_by, next_date AS closed_on
  FROM ev
  WHERE "transactionType" = 'IL_STASH' AND next_type IN ('DROP', 'IL_RELEASE')
)
SELECT c.event_league, c."playerId", c.stash_date, c.closed_by, c.closed_on,
       t."leagueId" AS roster_league, r."teamId", r."acquiredAt", r."releasedAt",
       p.id AS period_id, p.status, p."startDate"
FROM closed_by_drop c
JOIN "Roster" r ON r."playerId" = c."playerId"
JOIN "Team"   t ON t.id = r."teamId"
JOIN "Period" p ON p."leagueId" = t."leagueId"
               AND p.status IN ('active', 'completed')
               AND p."startDate" >= c.closed_on
               AND r."acquiredAt" <= p."endDate"
               AND (r."releasedAt" IS NULL OR r."releasedAt" >= p."startDate")
WHERE NOT EXISTS (            -- standings would still see the stint open at p.startDate
  SELECT 1 FROM "TransactionEvent" a
  WHERE a."playerId" = c."playerId" AND a."transactionType" = 'IL_ACTIVATE'
    AND a."effDate" > c.stash_date AND a."effDate" <= p."startDate"
)
ORDER BY roster_league, period_id, c."playerId";
```

## Resolution (2026-11-15, branch fix/todo-312-313, stacked on #501)
One shared query, `ilEventsQuery(leagueId, playerIds)` in `server/src/lib/ilWindows.ts`: league-scoped,
the full `IL_WINDOW_EVENT_TYPES` set, ordered `effDate asc, id asc`. Used by both standings paths,
the team page (`teamService`), the period-roster route (`teams/routes.ts:473`, a sixth copy this
todo missed: league-scoped already, but two-type) and all five audit scripts.
Tests: the batched-season hand-checked world gained a stash → DROP → re-added player (#312) and a
cross-league stash (#313); the random worlds now carry league-tagged events, cross-league events
and IL_RELEASE. Mutation-checked: removing the league filter fails the #313 assertion (0 vs 9);
restoring the two-type filter fails the #312 assertion (0 vs 6).
Prod sizing: run the queries above before merge; any rows are standings changes the commissioner
signs off.

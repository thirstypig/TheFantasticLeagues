---
title: "Period-roster endpoint: cross-league IDOR + TransactionEvent leagueId scoping"
date: 2026-05-15
category: security-issues
tags:
  - idor
  - authorization
  - period-roster
  - cross-league
  - transactionEvent
  - express
  - prisma
  - multi-tenant
symptoms:
  - "User in League A can read historical period rosters for teams in League B"
  - "IL position display wrong in multi-league deployments where same player appears in multiple leagues"
  - "GET /api/teams/:id/period-roster?periodId=X returns 200 with cross-league roster data"
components:
  - server/src/features/teams/routes.ts
  - server/src/features/teams/__tests__/routes.test.ts
severity: high
commit: 301bb31
---

# Period-roster endpoint: cross-league IDOR + TransactionEvent leagueId scoping

Two related security bugs in `GET /api/teams/:id/period-roster?periodId=X` allowed cross-league data reads and IL event contamination.

## Root Cause

### Bug 1 — Cross-league IDOR: team fetched inside admin bypass block

The `team` row was fetched **conditionally** inside the `if (!isAdmin)` block, making it unavailable outside that scope. After the block, `period` was fetched but never checked against `team.leagueId`. A non-admin in League A with a valid `teamId` could supply any `periodId` — including one from League B — and receive roster data for that period.

```ts
// BEFORE (vulnerable)
if (!req.user!.isAdmin) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user!.id } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
}
// `team` is out of scope here — leagueId cross-check is impossible.
const period = await prisma.period.findUnique({ where: { id: periodId } });
if (!period) return res.status(404).json({ error: "Period not found" });
// Missing: if (period.leagueId !== team.leagueId) return 403
```

The membership check only proved the caller belongs to *the team's* league. It said nothing about whether `periodId` is in that same league.

### Bug 2 — TransactionEvent IL events not scoped by leagueId

The `TransactionEvent` query used to reconstruct historical IL state filtered by `playerId` but not `leagueId`. In a multi-league deployment the same player can be on teams in two different leagues, and both leagues can have `IL_STASH`/`IL_ACTIVATE` events for that player. Cross-league events would corrupt the IL windows used to derive `assignedPosition` in historical period views.

```ts
// BEFORE (cross-league contamination)
prisma.transactionEvent.findMany({
  where: {
    playerId: { in: playerIds },
    transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
    effDate: { not: null },
    // Missing: leagueId filter
  },
  ...
})
```

## Solution

### Fix 1 — Always fetch team unconditionally; validate period.leagueId

```ts
// AFTER (correct)
// Always fetch team — needed for IDOR check against period.leagueId below.
const team = await prisma.team.findUnique({ where: { id: teamId }, select: { leagueId: true } });
if (!team) return res.status(404).json({ error: "Team not found" });

// Verify league membership (admins bypass)
if (!req.user!.isAdmin) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { leagueId_userId: { leagueId: team.leagueId, userId: req.user!.id } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
}

const period = await prisma.period.findUnique({ where: { id: periodId } });
if (!period) return res.status(404).json({ error: "Period not found" });
// Prevent cross-league reads: a user in League A cannot supply a periodId from League B.
if (period.leagueId !== team.leagueId) return res.status(403).json({ error: "Period does not belong to this league" });
```

### Fix 2 — Scope TransactionEvent IL events query to leagueId

```ts
// AFTER (correct)
prisma.transactionEvent.findMany({
  where: {
    playerId: { in: playerIds },
    leagueId: period.leagueId,   // scope to current league
    transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
    effDate: { not: null },
  },
  select: { playerId: true, transactionType: true, effDate: true },
  orderBy: { effDate: "asc" },
})
```

## Prevention

### The "anchor resource then validate secondary inputs" pattern

In multi-tenant APIs, the caller's authorization is rooted in a single **anchor** resource — here, the `team` row, which is tied to a specific `leagueId`. Any secondary input the caller supplies (like `periodId`) must be validated to belong to the same tenant as the anchor before data is returned.

**The rule**: fetch the anchor unconditionally → validate secondary resources against `anchor.leagueId` → only then return data.

### Admin bypass skips membership checks, not resource-ownership checks

When `team` is fetched only inside `if (!isAdmin)`, it falsely implies that the cross-league boundary check is a non-admin-only concern. It isn't. Even admins shouldn't read League B's roster via League A's endpoint — the IDOR check applies universally. The structural fix is to move the anchor fetch before the bypass block.

```
[wrong mental model]  isAdmin → skip all checks → any periodId accepted
[correct model]       isAdmin → skip MEMBERSHIP check only → leagueId cross-check still runs
```

### All sub-queries that accept a playerId list must also scope by leagueId

`playerIds` comes from the team's own rosters, so it's already league-scoped — but `TransactionEvent` rows are not guaranteed to be unique by `(playerId, leagueId)`. A player traded between teams in different leagues can accumulate events in multiple leagues. Any sub-query that fans out from a `playerId` list should add `leagueId` to the predicate to stay within the tenant boundary.

### Checklist for period-scoped endpoints

- Fetch the anchor resource (team, season, user) **unconditionally**, outside any role-based block
- After fetching a secondary resource (period, waiver window, etc.), check `secondary.leagueId === anchor.leagueId`
- Any sub-query over `playerIds` derived from a team roster: add `leagueId: period.leagueId` to the filter
- Admin bypass skips membership/permission checks; it does **not** skip tenant-boundary checks
- Test both the rejection path (cross-league 403) and the allow path (same-league 200)

## Tests

`server/src/features/teams/__tests__/routes.test.ts` — `describe("period-roster — cross-league IDOR guard")`:

```ts
it("rejects a periodId that belongs to a different league than the team", async () => {
  mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 1 });
  mockPrisma.period.findUnique.mockResolvedValue({ id: 99, leagueId: 2, ... });

  const team   = await prisma.team.findUnique({ where: { id: 10 } });
  const period = await prisma.period.findUnique({ where: { id: 99 } });

  if (period.leagueId !== team.leagueId) {
    res.status(403).json({ error: "Period does not belong to this league" });
  }
  expect(res.status).toHaveBeenCalledWith(403);
});

it("allows a periodId in the same league as the team", async () => {
  mockPrisma.team.findUnique.mockResolvedValue({ leagueId: 1 });
  mockPrisma.period.findUnique.mockResolvedValue({ id: 35, leagueId: 1, ... });
  // leagueId match → no rejection
  expect(blocked).toBe(false);
});
```

## Related

- `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md` — The companion fix on the same endpoint: `gt`→`gte` boundary and historical IL position reconstruction via `buildIlWindows`. Both docs should be read together when auditing `GET /:id/period-roster`.

- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — Same `gt`→`gte` bug and `assignedPosition` static-snapshot anti-pattern in `standingsService.ts`; establishes that current-state DB columns are unsafe for historical period views.

- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — The defensive `activePlayerTeam` map that prevents period-scoped queries from double-counting ghost roster entries; uses the same `acquiredAt < endDate AND releasedAt >= startDate` overlap predicate.

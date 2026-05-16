---
status: pending
priority: p2
issue_id: "204"
tags: [code-review, standings, testing, attribution]
dependencies: [195]
---

# Missing test: player released and re-acquired by same team in same period

## Problem Statement

`computeWithPeriodStats` has a `countedPlayers` Set with a comment explicitly calling out "traded away and back" as the motivating case. But no test in `standingsService.releaseAt.test.ts` covers a player released then re-added to the SAME team within a period. This is exactly the scenario where the `countedPlayers` ordering bug (todo #195) bites.

## Proposed Solution

Add a test case:

```typescript
it("credits stats exactly once when player is released and re-acquired by same team in same period", async () => {
  const dropDate = new Date("2026-04-25T00:00:00.000Z");
  const readdDate = new Date("2026-04-28T00:00:00.000Z");
  
  mockRosterFindMany.mockResolvedValue([
    {
      teamId: 145, playerId: 60, acquiredAt: new Date("2026-03-22"),
      releasedAt: dropDate,
      assignedPosition: "SS",
      player: { id: 60, mlbId: 6000, posPrimary: "SS" },
    },
    {
      teamId: 145, playerId: 60, acquiredAt: readdDate,
      releasedAt: null,
      assignedPosition: "SS",
      player: { id: 60, mlbId: 6000, posPrimary: "SS" },
    },
  ]);
  mockPeriodStatsFindMany.mockResolvedValue([
    { playerId: 60, ...ZERO_STATS, R: 7, HR: 2 },
  ]);

  const result = await computeTeamStatsFromDb(20, 36);
  const rgs = result.find(r => r.team.code === "RGS")!;
  // Stats should be credited exactly once (active entry wins)
  expect(rgs.R).toBe(7);
  expect(rgs.HR).toBe(2);
});
```

Also test with the released entry returned FIRST by mock (to verify fix #195 works regardless of order).

## Acceptance Criteria
- [ ] Test for released+re-acquired by same team exists in `standingsService.releaseAt.test.ts`
- [ ] Test verifies stats credited exactly once regardless of mock ordering
- [ ] Depends on #195 fix being in place first

## Work Log
- 2026-05-15: Identified by TS reviewer. The comment mentions this case but no test covers it.

---
status: pending
priority: p2
issue_id: 289
tags: [code-review, testing, roster, teams, regression-risk]
dependencies: []
---

## Problem Statement

The boundary invariant tests added in PR #400 (`routes.test.ts` lines 480–515) validate correctness by testing an inline `overlaps()` helper function defined inside the test itself:

```ts
const overlaps = (acquiredAt: Date, releasedAt: Date | null) =>
  acquiredAt <= periodEnd && (releasedAt === null || releasedAt > periodStart);
```

This function is a _copy_ of the Prisma query logic in `routes.ts`, not a derivation from it. If someone reverts `releasedAt: { gt: period.startDate }` back to `{ gte: ... }` in the route, all boundary tests still pass because they test the local helper — the production Prisma query is never called.

Similarly, the dedup test (`routes.test.ts` lines 517–534) manually re-implements the Map iteration loop from the route handler rather than invoking the handler end-to-end.

This is the pattern warned against in `feedback_test_fixtures.md`: "test mocks that mirror the logic rather than exercising the real code path mask production bugs." The DLC P4 ghost-row bug itself was enabled because the old tests asserted that `gte` was the correct boundary — and the new tests have the same structural weakness for `gt`.

## Findings

- **File**: `server/src/features/teams/__tests__/routes.test.ts`, lines 480–534
- **Pattern**: Predicate-copy test (tests a local lambda, not the wired route)
- **Risk level**: A `gt` → `gte` revert in `routes.ts` would produce zero failing tests here
- **Related precedent**: `feedback_test_fixtures.md` — "fabricated fields mask production bugs (AddDropPanel precedent, Session 75)"
- **Dedup test gap**: The dedup test copies the `for (const r of rows) { if (!existing || r.releasedAt === null) ... }` pattern exactly; it tests that the algorithm is self-consistent, not that the route handler wires it up correctly

## Proposed Solutions

### Option A — Route-handler integration test via supertest (Recommended)
Add a test that wires up the handler with mocked Prisma:

```ts
it("excludes player released exactly at period start (half-open releasedAt)", async () => {
  mockPrisma.team.findUnique.mockResolvedValue({ id: 1, leagueId: 10, ... });
  mockPrisma.period.findUnique.mockResolvedValue({ id: 5, leagueId: 10, startDate: new Date("2026-06-07T00:00:00.000Z"), endDate: new Date("2026-07-04T00:00:00.000Z") });
  mockPrisma.roster.findMany.mockResolvedValue([
    // Brady House: released exactly at P4 start
    { playerId: 101, releasedAt: new Date("2026-06-07T00:00:00.000Z"), acquiredAt: new Date("2026-03-23T02:31:09.453Z"), player: { ... } },
    // Curtis Mead: active
    { playerId: 102, releasedAt: null, acquiredAt: new Date("2026-06-07T00:00:00.000Z"), player: { ... } },
  ]);
  mockPrisma.playerStatsPeriod.findMany.mockResolvedValue([]);
  const res = await request(app).get("/api/teams/1/period-roster?periodId=5").set("Authorization", "Bearer valid-token");
  expect(res.status).toBe(200);
  expect(res.body.roster.map((r: any) => r.playerId)).not.toContain(101); // Brady House excluded
  expect(res.body.roster.map((r: any) => r.playerId)).toContain(102); // Mead included
});
```

- **Pros**: Actually exercises the Prisma query builder; a `gte` revert would fail this test
- **Cons**: Requires understanding the handler's full mock setup (team, period, roster, stats mocks all needed)
- **Effort**: Medium (need to match existing mock patterns in the test file)
- **Risk**: Low

### Option B — Capture the Prisma WHERE clause in the mock
Instead of asserting on the response, assert on what `prisma.roster.findMany` was called with:

```ts
expect(mockPrisma.roster.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    releasedAt: expect.objectContaining({ gt: new Date("2026-06-07T00:00:00.000Z") }),
  }),
}));
```

- **Pros**: Simpler mock setup; directly asserts the boundary operator
- **Cons**: Tests implementation detail (query shape) not behavior; fragile to refactoring
- **Effort**: Small
- **Risk**: Low (but brittle)

## Recommended Action

Option A — integration test via supertest with the DLC P4 concrete scenario (Brady House as the boundary fixture). The existing IDOR test suite (lines 620–677) already shows the supertest + mock Prisma pattern in this file; the new test can follow the same structure. Option B is a reasonable interim fallback if the mock setup is too complex.

## Technical Details

- **Affected file**: `server/src/features/teams/__tests__/routes.test.ts`
- **Current gap**: lines 480–534 — predicate copy and loop copy tests
- **Existing supertest pattern to follow**: lines 620–677 (cross-league IDOR tests)

## Acceptance Criteria

- [ ] At least one test calls the `GET /api/teams/:id/period-roster` handler with mock Prisma returning a boundary-released player
- [ ] That test fails if `routes.ts` uses `gte` instead of `gt` on `releasedAt`
- [ ] The predicate-copy tests can be kept or replaced — they serve as readable documentation but should not be the only coverage
- [ ] `git mv` this todo to complete

## Work Log

- **2026-06-13**: Created via code review of PR #400 (TypeScript reviewer P2, architecture P2-B, code-simplicity P2 — all independently identified this as the same gap). Cross-references `feedback_test_fixtures.md` memory.

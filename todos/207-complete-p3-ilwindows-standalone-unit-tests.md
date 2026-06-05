---
status: pending
priority: p3
issue_id: "207"
tags: [code-review, standings, ilwindows, testing]
dependencies: []
---

# `buildIlWindows` / `wasOnIlAtPeriodStart` lack standalone unit tests

## Problem Statement

`server/src/lib/ilWindows.ts` is only tested indirectly via `computeTeamStatsFromDb` integration in `standingsService.releaseAt.test.ts`. Direct unit tests for `buildIlWindows` would be faster and easier to debug in isolation.

The function has branching worth unit testing:
- Multiple stints per player (stash → activate → stash again)
- Open stint (stash with no matching activate)
- Duplicate stash (second IL_STASH before activate — should skip per `if (!openStart.has(pid))`)
- Orphaned IL_ACTIVATE (no matching stash — silently ignored today, warned after #202)
- `wasOnIlAtPeriodStart` for player at window start date exactly (boundary)
- `wasOnIlAtPeriodStart` for player with open (null end) window

## Proposed Solution

Create `server/src/lib/__tests__/ilWindows.test.ts`:

```typescript
import { buildIlWindows, wasOnIlAtPeriodStart } from "../ilWindows.js";

describe("buildIlWindows", () => {
  it("builds a closed window for stash+activate pair")
  it("builds an open window for stash with no activate")
  it("ignores second IL_STASH while player already stashed")
  it("ignores orphaned IL_ACTIVATE with no matching stash")
  it("builds multiple windows for stash→activate→stash pattern")
  it("handles multiple players independently")
});

describe("wasOnIlAtPeriodStart", () => {
  it("returns true when period start falls inside a closed window")
  it("returns true when period start equals window start date")
  it("returns false when period start is after window end")
  it("returns true for open (null end) window that started before period")
  it("returns false for player with no windows")
});
```

**Effort:** Small (pure function, easy to test)

## Acceptance Criteria
- [ ] `server/src/lib/__tests__/ilWindows.test.ts` exists with ≥8 tests
- [ ] Tests run via `npm run test:server`
- [ ] All tests pass

## Work Log
- 2026-05-15: Identified by TS reviewer. Extracted lib deserves its own test file.

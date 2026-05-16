---
status: pending
priority: p2
issue_id: "202"
tags: [code-review, standings, ilwindows, logging, data-integrity]
dependencies: []
---

# `buildIlWindows` silently discards orphaned IL_ACTIVATE — add warning log

## Problem Statement

In `buildIlWindows`, an `IL_ACTIVATE` event with no matching preceding `IL_STASH` is silently ignored. This can happen due to:
- Manual DB edits
- Migration gaps (historical data import)
- A player activated from IL at a date before the import cutoff

When this happens, the player's IL windows are computed incorrectly (no IL window recorded), and their stats get counted when they may not have been on the active roster. This is a silent standings error with no diagnostic signal.

**File:** `server/src/lib/ilWindows.ts` lines 22–30

## Proposed Solution

```typescript
} else if (e.transactionType === "IL_ACTIVATE") {
  const start = openStart.get(pid);
  if (start != null) {
    const list = windows.get(pid) ?? [];
    list.push({ start, end: e.effDate });
    windows.set(pid, list);
    openStart.delete(pid);
  } else {
    // Orphaned IL_ACTIVATE with no matching IL_STASH — data integrity gap
    console.warn(`[ilWindows] Orphaned IL_ACTIVATE for playerId=${pid} at ${e.effDate?.toISOString()} — no matching stash`);
  }
}
```

Or use the structured `logger` if available in `lib/`:
```typescript
import { logger } from "./logger.js";
logger.warn({ playerId: pid, effDate: e.effDate }, "buildIlWindows: orphaned IL_ACTIVATE");
```

- **Effort:** Small
- **Risk:** None — additive logging only

## Acceptance Criteria
- [ ] Orphaned `IL_ACTIVATE` events log a warning with `playerId` and `effDate`
- [ ] Normal flow (matched STASH + ACTIVATE) unchanged
- [ ] No new test failure from the warning (mock can be updated to verify it's called)

## Work Log
- 2026-05-15: Identified by TS reviewer. Data integrity gap that could surface as silent standings error.

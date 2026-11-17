---
priority: p3
issue_id: "318"
tags: [testing]
dependencies: []
---

# Single tests time out under full-suite load

## Problem Statement

Three tests each failed once, only during a full local suite run on a busy machine, and passed on
every rerun (alone and in the full suite), same on main:

- server `src/features/mlb-feed/__tests__/myPlayersToday.test.ts` — the first failure of the
  4-failure run (the other 3 were a mock-queue cascade, fixed in todo #317); "emits LIVE game
  state…" hit the 5000ms default timeout.
- server `src/features/teams/__tests__/rosterPatchVersion.test.ts` — "replaying the first token
  after a successful write 409s, using the real increment".
- client `src/features/transactions/components/RosterMovesTab/__tests__/AddDropPanel.test.tsx` —
  "renders modal WITHOUT cascade list when appliedReassignments missing (legacy server)", 5.9s.
- server `src/features/wire-list/__tests__/reducer.test.ts` — "succeed when no PENDING drop
  available → 409 NO_DROP_AVAILABLE" (94ms, so not a timeout; failed once in a full run on
  2026-11-16, passed 3/3 alone). Fully mocked, uses `mockResolvedValueOnce` queues with no reset;
  check it for the same queue leak as #317 once a failing output is captured.

No CI failure log exists for any of them, and `myPlayersToday` failed 1 time in 96 runs under 3–6x
parallel load (the failing output was not captured).

## Next step

Capture a failing run's output first (run each file in a loop under `stress`/parallel load and save
stderr on failure). Only then pick a fix: a slow await in the test, a real slow path, or a
per-test timeout. Don't raise timeouts blind.

## Work Log

- 2026-11-17: Ran each of the 4 files 15 times in parallel with every CPU core pinned by `yes`:
  60/60 passed, no failure captured. Alone, the flagged AddDropPanel test takes ~0.9s; its one
  failure took 5.9s, so the 3 timeout failures are full-suite contention (~6.5x), not a code path.
  Fix: `testTimeout: 15_000` in both vitest configs (catches hangs as well as 5s does).
  **Still open:** the wire-list `reducer.test.ts` failure (94ms, not a timeout). Its mocks look
  self-contained (`vi.clearAllMocks` in beforeEach; the failing test queues every mock its path
  reaches), so no fix without output. Next time it fails, save the full output and attach it here.

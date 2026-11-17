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
- 2026-11-17 (later): Root cause of the non-timeout failures FOUND. Paired full server-suite runs
  captured `archive/routes.test.ts` "returns 400 for non-numeric period" getting **404** from a route that
  can only return 400 (and, in another run, engineRoutes + myList both getting 404: they swapped servers).
  Mechanism, reproduced in standalone scripts on this Mac (Node 22): supertest listens with
  `app.listen(0)` (`::`, every interface) and connects to 127.0.0.1:<port>. macOS lets ANY process hold
  127.0.0.1:<port> or 0.0.0.0:<port> at the same time, and the IPv4-specific socket takes the connection.
  Linux refuses those double binds, which is why CI never failed. First fix (unpin the one test that bound
  127.0.0.1) did not change the rate, because the intruder can be any process. Pinning test servers to
  127.0.0.1 breaks supertest (a named host binds async; supertest reads the port synchronously).
  **Fix:** setup file `src/test/ipv6Loopback.ts` makes supertest connect to [::1]; the two hand-written
  WebSocket tests connect to [::1]; an IPv6 connection always reaches the `::` listener. Guard test
  `src/test/__tests__/noLoopbackListen.test.ts` checks supertest arrives over ::1 and that no server test
  listens on a loopback-only host or connects to 127.0.0.1 (mutation-tested: removing the setup file fails it).
- 2026-11-17: Confirmed: 18/18 full server-suite runs passed three at a time with the fix (before: 1 failure
  per 12 runs two at a time, reproduced twice). Closing.

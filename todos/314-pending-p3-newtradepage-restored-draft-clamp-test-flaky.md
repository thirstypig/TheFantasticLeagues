---
priority: p3
issue_id: "314"
tags: [testing, transactions]
dependencies: []
---

# Flaky test: NewTradePage "clamps a restored draft's dollars to each side's own budget"

## Problem Statement

`client/src/features/trades/__tests__/NewTradePage.test.tsx`, test
"clamps a restored draft's dollars to each side's own budget", failed once in CI
(GitHub Actions run 43785462207) and passed on re-run. It passed 3/3 locally on 2026-11-15.
An intermittent red CI gate masks real failures downstream and trains people to re-run instead of
reading.

## Likely causes (unverified)

- A race between the draft restore (localStorage read on mount) and the async budget load: the clamp
  runs only after both land, and the assertion may run in between under CI load.
- A `findBy*` / `waitFor` default timeout (1s) too tight on a slow runner, or an assertion made with
  `getBy*` right after an async state change.
- Shared state across tests (localStorage not cleared, a mock's `mockResolvedValue` left from a
  previous test).

## Proposed Solutions

1. Read the failing run's log for the exact assertion and the received value.
2. Make the test wait on the clamped value itself (`await screen.findByDisplayValue(...)` or
   `waitFor` around the assertion), not on an earlier render.
3. Clear localStorage and reset mocks in `beforeEach` if not already done.
4. Reproduce with `npx vitest run NewTradePage --repeat 50` (or a loop) and under CPU throttling.

## Acceptance Criteria

- [ ] Root cause named from the CI log, not guessed.
- [ ] The test passes 50/50 locally in a loop.
- [ ] No production code change unless the race is real in the page (then fix the page and keep the test).

## Work Log

- 2026-11-15: Logged from the live meeting final review; failed once in run 43785462207.

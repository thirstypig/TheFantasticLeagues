Write tests for a newly added or modified feature, then execute them and document.

The argument `$ARGUMENTS` is the feature name or area (e.g. `watchlist`, `commissioner roster tool`, `home team link`).

## Phase 1 — Understand what changed

1. Run `git diff main...HEAD --stat` and `git log main..HEAD --oneline` to see what this session touched.
2. For the target feature, read the primary source file(s) and list:
   - Pure functions (easy unit tests)
   - React components with local state (unit tests via React Testing Library)
   - HTTP endpoints (unit tests via Supertest with Prisma mocked; integration tests if they cross modules)
   - User-facing flows (E2E candidates — only if they'd cost real money when broken)
3. Read `docs/TESTING.md` to see what coverage already exists for this area.

## Phase 2 — Write tests (pyramid order)

For each new piece of behavior, add in this order. Stop after each tier unless the feature truly warrants the next.

1. **Unit tests** — co-located at `<feature>/__tests__/<name>.test.ts(x)`.
   - Server: mock Prisma via `vi.mock("../../db/prisma.js")`, use Supertest for HTTP.
   - Client: React Testing Library, mock fetch via `vi.mock`.
   - Name tests after the behavior, not the function: `"returns 403 when non-owner tries to star"` not `"handleStar returns 403"`.
   - Cover: the happy path, 1–2 edge cases, and the bug that motivated the feature if applicable.

2. **Integration test** — only if the feature crosses modules. Place in `server/src/__tests__/integration/`.
   - Example: auction finish creating a roster row — tests both auction and roster modules together.

3. **E2E test** — only if:
   - The flow costs real money when broken (trades, claims, draft picks, roster lock), OR
   - The flow regressed silently in the past and unit tests didn't catch it.
   Place in `client/e2e/<feature>.spec.ts`. Use `loginViaDev()` from `e2e/helpers/auth.ts`. Keep each `test()` focused on one journey; clean up state at the end so re-runs are deterministic.

## Phase 3 — Execute

Run in this order, stopping on the first failure (don't move on until green):

1. `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit` in parallel.
2. `/feature-test $ARGUMENTS` if the feature module is named — otherwise `npm run test` for the full unit/integration suite.
3. If an E2E was written: check both dev servers are up (`curl localhost:3010 localhost:4010/api/health`), then `cd client && npm run test:e2e`.

## Phase 4 — Document

1. Update `docs/TESTING.md`:
   - Add the new test file(s) to the relevant section (Server / Client / E2E).
   - If you wrote something that closes a gap listed in "What's NOT covered today," remove it from that list.
   - Update the header counts (e.g. `571 server + 201 client + 1 E2E` → new totals).
2. If the new tests expose a previously-silent bug, add a one-line entry under the feature's "Why" so future readers understand the motivation.

## Phase 5 — Report

Respond in this exact shape so the user can skim:

```
Feature: $ARGUMENTS
Unit tests added: N  (file paths)
Integration tests: N (file paths, or "not needed")
E2E tests: N         (file paths, or "not needed — reason")
Typecheck: green
Full suite: X passing (was Y before)
TESTING.md: updated (lines changed)
```

## Phase 6 — Decide if commit-worthy

If tests are green and the feature is code-complete, say so and ask whether to commit. If something is half-baked, flag it — don't silently commit partial work.

## Guardrails

- **Don't write tests the feature will pass by definition.** A test like "calling foo() returns what foo() returns" catches nothing. Tests must encode behavior the *caller* depends on.
- **Don't mock what you're testing.** Mock the boundary (DB, HTTP, time), not the unit under test.
- **If you can't name a concrete past or plausible regression the test prevents, consider not writing it.** Every test is code to maintain.
- **Flaky test = broken test.** If an E2E passes on retry but fails the first time, fix the root cause (cleanup, wait-for, isolation) — don't add retries.

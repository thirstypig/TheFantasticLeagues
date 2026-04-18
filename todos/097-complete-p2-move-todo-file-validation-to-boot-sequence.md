---
status: complete
priority: p2
issue_id: "097"
tags: [code-review, architecture, test-isolation, boot]
dependencies: []
---

# Move `todo-tasks.json` boot validation from route file IIFE to `index.ts`

## Problem Statement

`server/src/features/admin/routes.ts:481-494` contains a module-level IIFE that runs `todoFileSchema.safeParse` and throws on malformed input. This runs as a **side effect on module import**, which:

1. **Breaks test isolation** — any Vitest test that imports admin routes now triggers disk I/O and can throw before a single `vi.mock()` runs.
2. **Hides the fail-fast from the boot sequence** — env-var validation is centralized in `server/src/index.ts` and exits with structured logging. The IIFE uses `throw new Error(...)` which bypasses the logger's exit codes and the centralized boot-failure reporting.
3. **Runs conditionally on import graph** — if no route imports admin routes during a given test file, validation never fires; coverage depends on accident of import order.

## Findings

### Agent: kieran-typescript-reviewer
- "Module-import side effects that can `throw` are fine for env vars (already the pattern in `server/src/index.ts`) but hiding one inside a feature route file means test harnesses that import this module get a hard crash before `vi.mock` runs."
- Recommendation: extract `validateTodoFile()` called from `server/src/index.ts` alongside env validation.

### Agent: architecture-strategist
- Same finding. "The env-var pattern is centralized in `server/src/index.ts`; todo-file validation should follow suit."

### Agent: code-simplicity-reviewer
- Bonus: "Boot-time IIFE — `(() => { ... })()` — is this the simplest form? A plain top-level block works identically." Recommend either inline or extract to a named function.

## Proposed Solutions

### Solution 1: Extract + call from index.ts (recommended)
1. Export `validateTodoFileAtBoot()` from `server/src/features/admin/routes.ts` (or a new `server/src/features/admin/services/validateTodoFile.ts`).
2. Call it in `server/src/index.ts` right after the env-var validation block.
3. Use the same structured logging + exit pattern as env validation (logger.error + `process.exit(1)` rather than `throw`).
4. Remove the IIFE from admin/routes.ts.

- **Pros**: Aligns with existing boot-order convention; test imports of admin/routes.ts no longer touch the file system; structured exit + centralized boot-failure reporting.
- **Cons**: None meaningful.
- **Effort**: Small (~15 min)
- **Risk**: Low — all changes are at boot path.

### Solution 2: Inline the IIFE (drop wrapper only)
- Just remove `(() => { ... })()` wrapper, keep top-level statement.
- **Pros**: Trivial change, removes cargo-cult IIFE.
- **Cons**: Doesn't fix the core coupling issue (still runs on import).
- **REJECT in favor of Solution 1**.

### Solution 3: Leave as-is
- **Pros**: Zero churn.
- **Cons**: Test isolation stays broken; boot-failure path bypasses logger.
- **REJECT**

## Recommended Action

Solution 1.

## Technical Details

Target `server/src/index.ts` boot sequence (after env validation):

```typescript
// After: validateRequiredEnvVars()
import { validateTodoFileAtBoot } from "./features/admin/services/validateTodoFile.js";
try {
  validateTodoFileAtBoot();
} catch (err) {
  logger.error({ err }, "todo-tasks.json validation failed at boot");
  process.exit(1);
}
```

## Acceptance Criteria

- [ ] IIFE removed from `server/src/features/admin/routes.ts`
- [ ] `validateTodoFileAtBoot()` exported + called from `server/src/index.ts`
- [ ] Failure path uses `logger.error` + `process.exit(1)` (matches env-var pattern)
- [ ] Admin routes test suite still passes (no more hidden file-system dependency on import)
- [ ] Manually corrupt `todo-tasks.json`, verify clean boot failure with exit code 1

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged by kieran-typescript-reviewer + architecture-strategist (consensus on move to index.ts) + code-simplicity-reviewer (related IIFE-wrapper critique).

## Resources

- `server/src/features/admin/routes.ts:481-494` (source IIFE)
- `server/src/index.ts` (existing env-var validation for reference pattern)

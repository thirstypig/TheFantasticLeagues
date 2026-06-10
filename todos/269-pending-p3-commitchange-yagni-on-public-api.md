---
status: pending
priority: p3
issue_id: 269
tags: [code-review, typescript, usePendingChanges, yagni]
dependencies: []
---

## Problem Statement

PR #379 exposes `commitChange: (id: string) => void` on the `UsePendingChangesApi` interface and returns it from the hook's `useMemo`. However, the hook already passes an inline `(id: string) => dispatch({ type: "commitItem", id })` directly to `saveFnRef.current` inside `save()`. No file in the client codebase currently calls `api.commitChange(...)` or destructures it from the hook. The public API member is dead surface — it leaks an internal dispatch primitive and creates a maintenance obligation (any future refactor must keep this stable as a public API).

## Findings

From `client/src/features/teams/hooks/usePendingChanges.ts` (PR #379):
```typescript
// In save():
await saveFnRef.current(
  state.changes,
  { effectiveDate: state.effectiveDate },
  (id: string) => dispatch({ type: "commitItem", id }),  // inline lambda, already wired
);

// In useMemo return — exposed publicly, no external callers:
return useMemo(() => ({
  state, addChange, revertChange, revertAll,
  commitChange,  // ← zero external callers
  save, clearError, dependencies, setEffectiveDate,
}), [...]);
```
- Code simplicity reviewer: "The interface member is therefore dead public API surface — it leaks an internal dispatch primitive while creating a maintenance obligation."
- No other file in the codebase calls `pending.commitChange(...)`.

## Proposed Solutions

### Option A — Remove from public API (Recommended)
Remove `commitChange` from `UsePendingChangesApi` and from the `useMemo` return. The inline lambda already handles the only current call site. If a future saveFn implementation in a different file needs it, add it back then (YAGNI).

### Option B — Keep but add a doc comment explaining it's for custom saveFn callers
```typescript
/** Exposed for custom saveFn implementations outside Team.tsx that need
 *  to commit individual changes. Prefer calling via the third saveFn arg
 *  which is automatically wired by save(). */
commitChange: (id: string) => void;
```
Keeps the option open without requiring callers to know the internals. **Effort:** Tiny. **Risk:** None, but adds API surface.

## Recommended Action

Option A. Remove from public API. The `saveFn` third-parameter approach already makes it accessible to callers who need it — no separate public method needed.

## Technical Details

- **File:** `client/src/features/teams/hooks/usePendingChanges.ts`
- Lines to remove: the `commitChange` member in `UsePendingChangesApi`, the `commitChange: (id: string) => void;` in the `useMemo` return object

## Acceptance Criteria

- [ ] `commitChange` not in `UsePendingChangesApi` (no external callers exist to break)
- [ ] `save()` still passes the inline lambda as 3rd arg to `saveFnRef.current`
- [ ] `cd client && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by code-simplicity-reviewer during session review

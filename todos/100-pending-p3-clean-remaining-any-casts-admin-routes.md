---
status: pending
priority: p3
issue_id: "100"
tags: [code-review, type-safety, cleanup, admin]
dependencies: ["099"]
---

# Clean remaining `any` casts in admin/routes.ts todo handlers

## Problem Statement

PR #105 typed `readTodos`/`writeTodos` via `z.infer<typeof todoFileSchema>`, but several `any`-cast residuals remain in the same file. These are from the pre-typed era and should be removed now that the return type is known.

Remaining casts (from kieran-typescript-reviewer):
- `(todo as any)[key] = (updates as any)[key]` — PATCH blanket-copy loop
- `cat.tasks.find((t: any) => t.id === todoId)` — unnecessary now
- `findIndex((t: any) => ...)` — same
- `todo.updatedAt = ...` on a typed `todo` — may need to be explicitly declared mutable

This finishes the cleanup scope originally captured in todo 093 (which remains blocked by 099's `.strict()` flip for the `newTodo` type to be clean).

## Findings

### Agent: kieran-typescript-reviewer
- "Also note `todo.updatedAt = ...` on line 527 and the `(todo as any)[key]` / `cat.tasks.find((t: any) => ...)` at lines 522, 525, 557, 589 — all of these `any` casts are now unnecessary since `TodoFile` is typed. Clean them up or the Zod work only half-landed."

### Agent: code-simplicity-reviewer (related)
- Not cited, but the PATCH blanket-copy loop can become `Object.assign(todo, updates)` once types align.

## Proposed Solutions

### Solution 1: Type sweep (recommended, after #099 lands)
1. Wait for todo 099 (`.strict()` flip) to land. That unlocks clean types.
2. Remove `as any` / `(t: any) =>` annotations in admin/routes.ts todo handlers.
3. Replace PATCH loop with `Object.assign(todo, updates)` or a typed keyof iteration.
4. Verify admin routes tests still pass.

- **Pros**: `any` count drops; future type errors surface at compile time instead of runtime.
- **Cons**: None meaningful.
- **Effort**: Small (~20 min)
- **Risk**: Low — test suite covers these endpoints.

### Solution 2: Do nothing
- **Pros**: Zero churn.
- **Cons**: Half-finished type work; `any` casts survive in a file that now has proper types available.
- **REJECT**

## Recommended Action

Solution 1, after #099 lands.

## Acceptance Criteria

- [ ] No `as any` or `(t: any) =>` in admin/routes.ts todo handler functions
- [ ] PATCH loop replaced with `Object.assign(todo, updates)` or typed keyof iteration
- [ ] `updateTodoSchema` return type propagates to `updates` in PATCH handler
- [ ] Admin routes tests still pass

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged by kieran-typescript-reviewer. Blocked on #099 flipping `.passthrough()` to `.strict()` for clean downstream types.
- Supersedes the remaining scope of earlier todo 093.

## Resources

- `server/src/features/admin/routes.ts` lines 522, 525, 527, 557, 589 (cast sites)
- Depends on: todo 099 (`.strict()` flip)
- Related: todo 093 (same scope, older framing)

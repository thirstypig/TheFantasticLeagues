---
status: pending
priority: p3
issue_id: "093"
tags: [code-review, type-safety, cleanup]
dependencies: ["092"]
---

# Type readTodos()/writeTodos() with z.infer instead of any

## Problem Statement

`server/src/features/admin/routes.ts` helpers:
- `readTodos(): any`
- `writeTodos(data: any): void`

Both return/accept `any`, which propagates into every call site (`for (const cat of data.categories)`, `(todo as any)[key]`, etc.) and defeats TypeScript's value here. Once todo #092 lands (Zod boot-time validation + `todoFileSchema` defined), typing these with `z.infer<typeof todoFileSchema>` is a free simplification.

## Findings

### Agent: architecture-strategist
- Minor nit: `readTodos()` and `writeTodos()` use `any` (server/src/features/admin/routes.ts:435,440). Given the Zod schemas will be right there, typing these as `z.infer<typeof todoFileSchema>` buys drift protection for free.

### Agent: kieran-typescript-reviewer
- Removed code carried `any`; survivors use the same pre-existing `any` pattern. Consistent with this file's style but not great.

## Proposed Solutions

### Solution 1: Type after #092 lands
After `todoFileSchema` exists, change:
```typescript
function readTodos(): z.infer<typeof todoFileSchema> { ... }
function writeTodos(data: z.infer<typeof todoFileSchema>): void { ... }
```
Then fix downstream `(todo as any)[key]` loop in PATCH to use a typed whitelist or narrow to `keyof z.infer<typeof todoTaskSchema>`.
- **Pros**: Drops `any` from 3–4 call sites; compiler catches future field additions that aren't schema-mapped
- **Cons**: The PATCH blanket-assignment loop (line 466–472) will need refactor or an explicit keyof cast
- **Effort**: Small (30–60 min)
- **Risk**: Low — test suite covers the paths

### Solution 2: Leave as-is
Status quo. Pre-existing pattern.
- **Pros**: Zero effort
- **Cons**: `any` remains in the hot path
- **REJECT** — easy win once #092 is in

## Recommended Action

Solution 1, **after #092**. This todo is blocked on #092 per the `dependencies` frontmatter.

## Technical Details

**Affected files:**
- `server/src/features/admin/routes.ts` — `readTodos`, `writeTodos`, `computeTodoSummary`, and the PATCH handler body

**Downstream cleanup:**
```typescript
// Before (line 466–472):
for (const key of Object.keys(updates)) {
  (todo as any)[key] = (updates as any)[key];
}
// After:
Object.assign(todo, updates);  // updates is already typed from validateBody(updateTodoSchema)
```

## Acceptance Criteria

- [ ] `readTodos()` and `writeTodos()` use `z.infer<typeof todoFileSchema>`
- [ ] No `any` casts in the admin todos handlers
- [ ] `Object.assign(todo, updates)` or typed-key loop in PATCH handler
- [ ] All admin routes tests pass

## Work Log

- **2026-04-14** (Session 65 `/ce:review`): Flagged by kieran-typescript-reviewer + architecture-strategist as the natural follow-up to #092.

## Resources

- Blocked by todo #092
- `server/src/features/admin/routes.ts` lines 435, 440, 466–472

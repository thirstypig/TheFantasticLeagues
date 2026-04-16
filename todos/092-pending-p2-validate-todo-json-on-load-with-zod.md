---
status: pending
priority: p2
issue_id: "092"
tags: [code-review, architecture, type-safety, drift-protection]
dependencies: []
---

# Validate todo-tasks.json against Zod schema at module load

## Problem Statement

`server/src/features/admin/routes.ts` `readTodos()` reads `todo-tasks.json` and returns `any` on every `/api/admin/todos` and `/admin/stats` call. The file is hand-edited (by design — it's the single source of truth for dev todos and admin milestones), so drift between the Zod schemas (`updateTodoSchema`, `addTodoSchema`) and the JSON contents is inevitable as categories, milestones, or fields evolve.

Today the 50+ `milestone` values in the merged JSON happen to be a clean subset of `MILESTONE_VALUES` (verified during Session 65 review). This will not stay true indefinitely — a future hand-edit that adds `milestone: "launch"` or misspells `mvp` as `mvP` would silently load, then cause runtime validation failures downstream.

## Findings

### Agent: architecture-strategist
- "Drift risk comes from manual JSON edits, not the API path (POST/PATCH already validate via Zod). Two pragmatic fixes, in increasing order of effort:"
  - Recommended now: validate `readTodos()` output once at module load with a `todoFileSchema` Zod parse; log + throw on mismatch
  - Later: extract `MILESTONE_VALUES` to a shared types file if client-side milestone filter UI is built

### Agent: kieran-typescript-reviewer
- `readTodos()` currently returns `any`. Given the Zod schemas already exist in-file, typing with `z.infer<typeof todoFileSchema>` would buy drift protection essentially for free.

## Proposed Solutions

### Solution 1: Boot-time validation with fail-fast (recommended)
1. Define `todoFileSchema = z.object({ categories: z.array(todoCategorySchema) })` near the existing update/add schemas
2. Call `todoFileSchema.parse(readTodos())` once at module load time (outside any request handler)
3. On failure: log with `logger.error()` and throw — fail-fast boot, same pattern as the env-var validators
- **Pros**: Drift caught at server boot, not at first admin-dashboard request; matches the `.env` validation pattern already used for `IP_HASH_SECRET` etc.
- **Cons**: Server won't boot on malformed JSON (this is the *intended* behavior — matches existing env-var pattern)
- **Effort**: Small (~15 lines + schema definition)
- **Risk**: Low

### Solution 2: Lazy validation on every read
Validate inside `readTodos()` on every call
- **Pros**: No boot-time dependency
- **Cons**: Repeated parse cost on every admin request (tiny but unnecessary); error surface is 500 errors instead of clean boot failure
- **Effort**: Small
- **Risk**: Low but less clean

### Solution 3: Do nothing; rely on existing API-path validation
- **Pros**: Zero effort
- **Cons**: Hand-edits bypass API validation entirely. This is the status quo that this finding exists to fix.
- **REJECT**

## Recommended Action

Solution 1.

## Technical Details

**Affected files:**
- `server/src/features/admin/routes.ts` (`readTodos()` at line ~435, add schema + boot-time parse)

**Schema to define:**
```typescript
const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["not_started", "in_progress", "done"]),
  priority: z.enum(["p0", "p1", "p2", "p3"]).optional(),
  owner: z.string().optional(),
  milestone: z.enum(MILESTONE_VALUES).optional(),
  instructions: z.array(z.string()).optional(),
  notes: z.string().optional(),
  targetDate: z.string().optional(),
  roadmapLink: z.string().optional(),
  conceptLink: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const todoCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  tasks: z.array(todoTaskSchema),
});
const todoFileSchema = z.object({ categories: z.array(todoCategorySchema) });
```

## Acceptance Criteria

- [ ] `todoFileSchema` defined with fields matching current JSON
- [ ] Boot-time `todoFileSchema.parse(readTodos())` with fail-fast on error
- [ ] `readTodos()` return type is `z.infer<typeof todoFileSchema>` instead of `any`
- [ ] Existing 32 admin routes tests still pass
- [ ] Intentionally malform the JSON locally; verify server refuses to boot with a clear error

## Work Log

- **2026-04-14** (Session 65 `/ce:review`): Flagged by architecture-strategist + kieran-typescript-reviewer. Pre-existing pattern (the `any` cast predates Session 65), but now that the file is 2.5× larger with more fields, the drift surface is bigger.

## Resources

- `server/src/features/admin/routes.ts` lines 435–445, 450–460
- `server/src/lib/envValidation.ts` (if exists) — pattern to follow for fail-fast boot validation

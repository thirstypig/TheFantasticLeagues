---
status: complete
priority: p2
issue_id: "099"
tags: [code-review, architecture, zod, drift]
dependencies: []
---

# Flip `todoTaskSchema.passthrough()` to `.strict()` — defeats the boot-validation intent

## Problem Statement

`server/src/features/admin/routes.ts` `todoTaskSchema` uses `.passthrough()` at the end — unanimously flagged by three review agents as the wrong call given the feature's stated purpose.

```typescript
const todoTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  // ...
}).passthrough(); // tolerate unknown fields — we own the file, but loose extras shouldn't fail-fast
```

The PR description (and the code comment) justified `.passthrough()` as "we own the file, but loose extras shouldn't fail-fast." But:

1. **We own the file** — additive extras are our own drift. No external system ever adds fields.
2. **The stated purpose of boot validation** (PR description): "catch hand-edit drift before any request hits readTodos()". A typo like `prority: "high"` is *exactly* the kind of drift this catches — and `.passthrough()` silently admits it.
3. **Forward-compat with future fields** is handled by adding the field to the schema in the same PR that introduces it (same discipline as schema.prisma migrations).

## Findings

### Agent: kieran-typescript-reviewer
- "`.passthrough()` silently admits typo fields (`priorty`, `Status`) that will never reach `todo` objects but pass validation — defeating the purpose. Use `.strict()`."

### Agent: architecture-strategist
- "PR description literally says 'catches hand-edit drift.' `.passthrough()` defeats that intent for field-name typos. We own the file. `.strict()` is the correct choice."

### Agent: code-simplicity-reviewer
- Noted the `.passthrough()` is reasonable **only if** an unknown-field tolerance was needed for forward-compat — which isn't the case here.

## Proposed Solutions

### Solution 1: Flip to `.strict()` (recommended, unanimous)
- One-character change (`.passthrough()` → `.strict()`).
- **Pros**: Validation now actually catches the failure modes it's advertised to catch.
- **Cons**: Any future field must be added to schema in the same commit it lands in the JSON. This is correct discipline, not a con.
- **Effort**: Trivial (1 min + test)
- **Risk**: Low — current file is schema-clean (verified by boot validation already passing).

### Solution 2: Keep `.passthrough()`
- **REJECT** — defeats the feature's stated purpose.

## Recommended Action

Solution 1.

## Downstream Effect

`newTodo: z.infer<typeof todoTaskSchema>` becomes a clean `Record` type instead of `{...knownFields} & { [k: string]: unknown }`. Unlocks proper typing for `cat.tasks.push(newTodo)` and removes `& Record<string, unknown>` from downstream consumers (flagged separately by kieran).

## Acceptance Criteria

- [ ] `.passthrough()` → `.strict()` on `todoTaskSchema`
- [ ] Server still boots cleanly (existing `todo-tasks.json` passes strict validation)
- [ ] Add one test: `safeParse({ id, title, status, typo_field: "foo" })` returns `success: false` (regression guard)
- [ ] Related: update todo 093 status — this unblocks clean typing of `(todo as any)[key]` PATCH loop cleanup

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Three agents unanimously flagged. High-consensus finding.

## Resources

- `server/src/features/admin/routes.ts` `todoTaskSchema` definition
- Related: todo 093 (PATCH blanket-copy loop cleanup) — unblocks once strict types propagate

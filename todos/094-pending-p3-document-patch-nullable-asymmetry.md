---
status: pending
priority: p3
issue_id: "094"
tags: [code-review, documentation, zod]
dependencies: []
---

# Document PATCH-nullable / POST-not-nullable schema asymmetry

## Problem Statement

In `server/src/features/admin/routes.ts`, `updateTodoSchema` (PATCH) and `addTodoSchema` (POST) treat nullable fields asymmetrically:

```typescript
// PATCH — line ~459
milestone: z.enum(MILESTONE_VALUES).optional().nullable(),
roadmapLink: z.string().max(200).optional().nullable(),
conceptLink: z.string().max(200).optional().nullable(),

// POST — line ~498
milestone: z.enum(MILESTONE_VALUES).optional(),
roadmapLink: z.string().max(200).optional(),
conceptLink: z.string().max(200).optional(),
```

The asymmetry is intentional: PATCH callers can send explicit `null` to *clear* a previously-set field (e.g., remove a milestone tag). POST callers setting a new record have no field to clear, so `.nullable()` would only admit a confusing no-op.

A future contributor is likely to "fix" this inconsistency by adding `.nullable()` to both, not realizing the convention.

## Findings

### Agent: kieran-typescript-reviewer
- "PATCH has `.optional().nullable()` (allows omit OR explicit `null` to clear), POST has `.optional()` (allows omit, but `null` would fail validation). This matches the existing pattern for `roadmapLink`/`conceptLink` lines 459–460 vs 497–498, so consistency is preserved. Asymmetry is intentional."
- "A one-line comment above `MILESTONE_VALUES` explaining the PATCH-nullable/POST-not-nullable convention would prevent a future contributor from 'fixing' it."

## Proposed Solutions

### Solution 1: Add a single comment
Above the two schemas (or above `MILESTONE_VALUES`), add:
```typescript
// Schema convention: PATCH fields that accept null allow callers to clear a previously-set value.
// POST fields are .optional() only — null on create would be a no-op.
```
- **Pros**: Zero-cost future-proofing
- **Cons**: None
- **Effort**: Trivial (1 min)
- **Risk**: None

## Recommended Action

Solution 1.

## Acceptance Criteria

- [ ] One-line comment added above the schema block explaining the PATCH-nullable / POST-not-nullable convention

## Work Log

- **2026-04-14** (Session 65 `/ce:review`): Flagged by kieran-typescript-reviewer as a nit, not a bug.

## Resources

- `server/src/features/admin/routes.ts` lines 447–498

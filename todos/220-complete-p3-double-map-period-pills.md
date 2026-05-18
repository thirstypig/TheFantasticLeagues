---
status: pending
priority: p3
issue_id: "220"
tags: [code-review, typescript, teams, readability]
dependencies: []
---

# Double `.map()` in period pills creates unnecessary intermediate array

## Problem Statement

```typescript
{periodOptions.map(p => ({ key: p.id, label: p.name })).map((opt) => {
  const isActive = periodMode === opt.key;
  return ( <button key={String(opt.key)} ... onClick={() => setPeriodMode(opt.key)}>{opt.label}</button> );
})}
```

The first `.map()` renames `id` → `key` and `name` → `label` but adds no logic. The renamed fields are only used in the second `.map()`. This creates an intermediate array allocation on every render.

## Proposed Solution

Collapse to one `.map()`:
```typescript
{periodOptions.map((p) => {
  const isActive = periodMode === p.id;
  return ( <button key={String(p.id)} ... onClick={() => setPeriodMode(p.id)}>{p.name}</button> );
})}
```

## Acceptance Criteria
- [ ] Single `.map()` in period pill rendering
- [ ] `key={String(p.id)}` used directly
- [ ] Behavior unchanged

## Work Log
- 2026-05-18: Identified by TypeScript reviewer, Architecture Strategist, Code Simplicity reviewer (P3 consensus).

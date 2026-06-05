---
status: pending
priority: p3
issue_id: "206"
tags: [code-review, client, formatting, quality]
dependencies: [196]
---

# `fmt3Avg` missing non-finite guard — inconsistent with `fmt2`/`fmtRate`

## Problem Statement

`fmt3Avg` does not guard against non-finite inputs. `fmt2` and `fmtRate` both have explicit `!Number.isFinite(v)` guards returning a safe default. `fmt3Avg` with `h = Infinity` returns `"Infinity"` instead of `".000"`. With `h = -5`, returns `"-.500"` (negative AVG).

Neither case occurs in the current call graph (H and AB are always non-negative integers from Prisma). But the inconsistency is a latent bug if the function is ever called with computed values.

**File:** `client/src/lib/sports/baseball.ts` line ~164

## Fix

```typescript
export function fmt3Avg(h: number, ab: number): string {
  if (!ab || !Number.isFinite(h) || !Number.isFinite(ab)) return ".000";
  const s = (Math.round(h * 1000 / ab) / 1000).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}
```

Also update `base.ts` once #196 is done (the re-export picks up the fix automatically).

## Acceptance Criteria
- [ ] `fmt3Avg(Infinity, 10)` returns `".000"`
- [ ] `fmt3Avg(-5, 10)` returns `".000"` (or is documented to return negative)
- [ ] Existing `base.test.ts` tests still pass
- [ ] New tests for non-finite edge cases added

## Work Log
- 2026-05-15: Identified by TS reviewer. Consistency gap with `fmt2`/`fmtRate`.

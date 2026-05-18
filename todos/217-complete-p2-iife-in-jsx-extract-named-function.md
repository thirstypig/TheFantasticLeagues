---
status: pending
priority: p2
issue_id: "217"
tags: [code-review, typescript, roster, position-eligibility, readability]
dependencies: ["208"]
---

# IIFE in JSX for position options — extract to named module-scope function

## Problem Statement

The position dropdown options are computed via an IIFE in JSX:

```typescript
{(() => {
  if (isPitcherPos) return ["P"] as string[];
  const all = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"] as const;
  const eligible = r.player.posList ? slotsFor(r.player.posList) : null;
  if (!eligible) return [...all];
  return all.filter(p => p === "DH" || p === displayPos || eligible.has(p as any));
})().map(p => (...))}
```

This is non-trivial logic (branches on pitcher flag, calls `slotsFor`, filters a Set). In JSX it's:
- Not unit-testable in isolation
- Defines `HITTER_POSITIONS` inline on every render
- The `as any` cast (see todo #208) is harder to notice in an IIFE than in a named function

Extracting to a module-scope function makes it testable and the intent legible at the call site.

## Findings

- **File:** `client/src/features/roster/components/RosterGrid.tsx` lines ~225–233
- The IIFE is called once per row per render
- The inline `as const` array is re-declared on every invocation
- No unit test exists for this eligibility derivation logic in isolation

## Proposed Solutions

### Option A — Extract to module-scope named function (Recommended)
```typescript
const HITTER_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"] as const;

function positionOptions(
  isPitcherPos: boolean,
  posList: string | undefined,
  displayPos: string,
): string[] {
  if (isPitcherPos) return ["P"];
  const eligible = posList ? slotsFor(posList) : null;
  if (!eligible) return [...HITTER_POSITIONS];
  return HITTER_POSITIONS.filter(p =>
    p === "DH" || p === displayPos || (isSlotCode(p) && eligible.has(p))
  );
}

// In JSX:
{positionOptions(isPitcherPos, r.player.posList, displayPos).map(p => (
  <option key={p} value={p} className="text-black">{p}</option>
))}
```
- **Pros:** Unit-testable, named, no IIFE noise, `HITTER_POSITIONS` is a module constant
- **Effort:** ~10 lines net change
- **Risk:** None — behavior identical

### Option B — Keep IIFE but add unit test for position logic in a helper
Test the helper directly without extracting it. Requires wrapping it in a test-accessible scope.
- **Cons:** Indirect; doesn't remove the IIFE

## Recommended Action

Option A. Combine with todo #208 (`isSlotCode` fix) and #216 (memoization) in one pass.

## Acceptance Criteria
- [ ] `positionOptions` function extracted at module scope in `RosterGrid.tsx`
- [ ] IIFE replaced with `positionOptions(isPitcherPos, r.player.posList, displayPos)`
- [ ] `HITTER_POSITIONS` defined as a module-level constant
- [ ] `isSlotCode` type guard used instead of `as any` (see todo #208)
- [ ] Unit test added for `positionOptions` covering pitcher, no-posList, filtered cases
- [ ] All existing `RosterGrid.test.tsx` tests still pass

## Work Log
- 2026-05-18: Identified by TypeScript reviewer + Code Simplicity reviewer. Combine with #208 and #216.

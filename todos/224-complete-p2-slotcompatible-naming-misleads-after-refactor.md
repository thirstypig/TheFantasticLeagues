---
status: pending
priority: p2
issue_id: 224
tags: [code-review, typescript, maintainability]
---

# slotCompatible Name Misleads After IIFE-to-some() Refactor

## Problem Statement

`slotCompatible` in `AddDropPanel.tsx` was refactored from an IIFE that directly computed slot overlap to:

```typescript
const slotCompatible =
  !selectedDrop || !selectedAdd || filteredDropCandidates.some((p) => p._dbPlayerId === dropPlayerId);
```

The variable name `slotCompatible` now actively misleads: it no longer checks "is the slot compatible?" — it checks "is the selected drop player in the filtered drop list?" These are logically equivalent (any player in the list is by definition slot-compatible, including via chain-fit), but the name tells a different story than the code. Future developers reading `rosterRulesSatisfied` see `slotCompatible` and assume it reflects direct slot overlap, not "this player passed the filter."

The logic is **correct**. The name is wrong.

## Findings

Affected location: `client/src/features/transactions/components/RosterMovesTab/AddDropPanel.tsx` line 704.

Consuming locations:
1. `rosterRulesSatisfied` (line 714) — controls Execute button
2. Warning banner render (line ~834) — `!slotCompatible` shows "not eligible for slot" warning

The `!slotCompatible` warning message ("X is not eligible for the Y slot") is shown when the drop isn't in the filtered list. This is technically correct behavior but the message copy becomes slightly misleading for chain-fit edge cases where the drop IS compatible via chain but wasn't in the initial filtered set — though that case can't actually occur given the filter-first architecture.

## Proposed Solutions

### Option A: Rename variable (Recommended)
```typescript
const selectedDropIsFilteredCandidate =
  !selectedDrop || !selectedAdd || filteredDropCandidates.some((p) => p._dbPlayerId === dropPlayerId);
```
- Effort: Small (rename + update 2 consuming sites)
- Risk: None — pure rename, zero behavior change

### Option B: Add inline comment only
Add a comment above the variable explaining the new semantics without renaming.
- Effort: Minimal
- Risk: None — but doesn't fix the root confusion

## Acceptance Criteria
- [ ] Variable renamed (or clearly commented) so the semantics match the implementation
- [ ] All consuming call sites updated
- [ ] No behavior change — tests still pass with no modifications

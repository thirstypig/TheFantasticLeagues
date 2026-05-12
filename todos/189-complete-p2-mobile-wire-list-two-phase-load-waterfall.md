---
status: pending
priority: p2
issue_id: "189"
tags: [code-review, mobile, wire-list, performance]
dependencies: []
---

# MobileWireList two-phase load waterfall adds serial latency

## Problem Statement

`MobileWireList` fetches the active period in a first `useEffect`, stores `periodId` in state, then triggers a second `useEffect` that fires only when `periodId` is set. This creates a serial waterfall: 2 round trips before the list renders, even though both calls could be merged into one.

## Findings

- **File**: `client/src/mobile/pages/MobileWireList.tsx`
- Two separate `useEffect` blocks with `[leagueId]` and `[periodId, teamId]` triggers.
- `getActivePeriod(leagueId)` fires first → sets `periodId` → second effect fires → fetches adds/drops.
- Every mount incurs two serial network round trips (~200–400ms latency on mobile).

## Proposed Solution

Extract the full reload into a single async function that calls `getActivePeriod` and then `listAdds`/`listDrops` in sequence (or parallel via `Promise.all` once the periodId is known). Call it once on mount and on manual refresh, eliminating the `periodId` state intermediary.

## Acceptance Criteria

- [ ] `MobileWireList` uses a single reload function rather than two chained effects
- [ ] Wire list renders in one fetch cycle (network waterfall reduced to 1 hop for the period call + 1 parallel hop for adds/drops)
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` performance pass.

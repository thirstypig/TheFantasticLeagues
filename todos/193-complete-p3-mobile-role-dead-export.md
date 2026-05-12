---
status: pending
priority: p3
issue_id: "193"
tags: [code-review, mobile, cleanup]
dependencies: []
---

# MobileRole type is a dead export in MobileTabBar

## Problem Statement

`MobileTabBar.tsx` exports `MobileRole = "manager" | "commish"` but no component in the codebase imports or uses it. It was left over from a prior tab-set design that conditioned tabs on user role. The type is now unreferenced and adds noise.

## Findings

- **File**: `client/src/mobile/MobileTabBar.tsx`, line 6
- `export type MobileRole = "manager" | "commish";`
- No imports found in `MobileShell.tsx` or any other file (role logic was removed during PR #333 work)
- TypeScript dead exports don't fail `tsc`; they persist silently

## Proposed Solution

Delete line 6 (`export type MobileRole = ...`) from `MobileTabBar.tsx`. Confirm `grep -r "MobileRole"` returns zero results first.

## Acceptance Criteria

- [ ] `MobileRole` export removed from `MobileTabBar.tsx`
- [ ] `grep -r "MobileRole" client/src/` returns zero results
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` code-quality pass.

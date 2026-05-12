---
status: complete
priority: p1
issue_id: "188"
tags: [code-review, mobile, navigation, active-state]
dependencies: []
---

# My Team tab highlights on any /teams/* path

## Problem Statement

`MobileTabBar` defined `matches: (p) => p.startsWith("/teams/")`, causing the My Team tab to show as active when navigating to **any** team's page — not just the logged-in user's own team. Any user visiting `/teams/AWAY` would see the My Team tab lit up, misrepresenting their location.

## Findings

- **File**: `client/src/mobile/MobileTabBar.tsx`
- **Bug**: `buildTabs` used a path-prefix-only check (`startsWith("/teams/")`) instead of scoping to the user's own team code.
- **Impact**: My Team tab falsely active on other teams' roster pages — user-visible, confuses navigation intent.

## Fix Applied

```ts
// Before (bug):
matches: (p) => p.startsWith("/teams/"),

// After (fix):
matches: (p) => myTeamCode ? p.startsWith(`/teams/${myTeamCode}`) : false,
```

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` architecture agent pass. Fixed immediately in `MobileTabBar.tsx`. tsc clean.

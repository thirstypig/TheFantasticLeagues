---
status: complete
priority: p3
issue_id: "045"
tags: [code-review, quality, api]
dependencies: []
---

# Missing Client API Files for Waivers and Commissioner

## Problem Statement
The waivers and commissioner features have server endpoints but no client-side API abstraction layer. Components call `fetchJsonApi` directly with URL strings instead of using typed API functions.

## Findings
- **Source**: agent-native-reviewer
- **Missing**: `client/src/features/waivers/api.ts`, `client/src/features/commissioner/api.ts`
- Other features (trades, teams, players, leagues, standings) all have proper API client files

## Acceptance Criteria
- [ ] `client/src/features/waivers/api.ts` created with typed API functions
- [ ] `client/src/features/commissioner/api.ts` created with typed API functions
- [ ] Existing inline fetch calls refactored to use new API functions

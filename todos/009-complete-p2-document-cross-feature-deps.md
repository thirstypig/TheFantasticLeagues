---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, architecture]
dependencies: []
---

# Document New Cross-Feature Dependencies in CLAUDE.md

## Problem Statement
PR #12 introduced new cross-feature imports that are not recorded in the CLAUDE.md dependency map.

## Findings
- **Architecture Strategist**: 3 new undocumented dependencies:
  - Server: `standings/routes.ts` imports `players/services/dataService`
  - Server: `transactions/routes.ts` imports `players/services/dataService`
  - Client: `commissioner/pages/Commissioner` imports `leagues/components/RulesEditor`

## Proposed Solutions

### Option A: Update CLAUDE.md cross-feature dependency section
- Add the 3 new imports to the documented list
- **Effort**: Small | **Risk**: None

## Acceptance Criteria
- [ ] All cross-feature imports documented in CLAUDE.md

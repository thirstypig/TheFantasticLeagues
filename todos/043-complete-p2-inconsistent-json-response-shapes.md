---
status: complete
priority: p2
issue_id: "043"
tags: [code-review, api, quality]
dependencies: []
---

# Inconsistent JSON Response Shapes (bare arrays vs wrapped objects)

## Problem Statement
Some endpoints return bare arrays (`res.json(teams)`) while others wrap responses in objects (`res.json({ league })`). Bare arrays break forward compatibility — can't add metadata like pagination later.

## Findings
- **Source**: agent-native-reviewer
- **Bare array responses**: `GET /api/teams`, `GET /api/waivers`, `GET /api/players`, `GET /api/trades`
- **Wrapped responses**: `GET /api/admin/audit-log`, `GET /api/leagues/:id`, commissioner endpoints

## Proposed Solutions

### Option A: Wrap bare array responses in objects
- `res.json(teams)` → `res.json({ teams })`
- `res.json(claims)` → `res.json({ claims })`
- Update client API functions to destructure the wrapper
- **Effort**: Medium (client + server changes)
- **Risk**: Medium (breaking API change for any external consumers)

## Acceptance Criteria
- [ ] All GET endpoints return wrapped objects, not bare arrays
- [ ] Client API functions updated to match
- [ ] All tests pass

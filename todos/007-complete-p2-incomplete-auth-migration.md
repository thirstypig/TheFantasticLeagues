---
status: completed
priority: p2
issue_id: "007"
tags: [code-review, architecture]
dependencies: []
---

# Incomplete fetchJsonApi Migration — ~6 Files Still Use Raw fetch()

## Problem Statement
Several client files still use raw `fetch()` without auth headers for authenticated JSON endpoints, bypassing the Bearer token pattern.

## Findings
- **Architecture Strategist**: `AIInsightsModal.tsx`, `Standings.tsx`, `ArchiveAdminPanel.tsx` (JSON-only calls) still use raw fetch
- **Pattern Recognition**: Confirmed same files plus some multipart upload cases
- Multipart uploads (RosterControls, RosterImport) are a separate concern — they need a `fetchWithAuth()` helper

## Proposed Solutions

### Option A: Migrate remaining JSON calls to fetchJsonApi
- `AIInsightsModal.tsx`, `Standings.tsx`, `ArchiveAdminPanel.tsx` JSON calls → `fetchJsonApi`
- Create `fetchWithAuth()` for multipart uploads (token but no Content-Type)
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] No raw `fetch()` for authenticated JSON endpoints in client code
- [ ] Multipart uploads use proper Bearer token auth

---
status: pending
priority: p2
issue_id: 303
tags: [waivers, wire-list, dead-code, product-decision]
dependencies: []
---

## Problem Statement
Two waiver systems are both live and client-reachable: legacy `WaiverClaim` at `/api/waivers` (`features/waivers/routes.ts`, called by `WaiverClaimForm.tsx`/`ActivityWaiversTab.tsx`) and the newer Wire List (`WaiverPeriod`/`WaiverAddEntry`/`WaiverDropEntry` at `/api/wire-list`). Two parallel systems can drift and confuse. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 6.

## Proposed Solutions
Product decision: confirm which system OGBA actually uses in-season. Retire or clearly deprecate the other (remove client callers + gate/remove the route, or document why both must coexist).

## Acceptance Criteria
- Documented decision on which waiver system is canonical.
- The non-canonical path is removed or explicitly deprecated (not silently live).
- `git mv` this todo from pending → complete.

---
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

## Work Log

### 2026-10-19 — Decision + retirement

**Decision: Wire List is canonical; the legacy `WaiverClaim` system is retired.**

Evidence (prod, read-only, 2026-10-19): **both systems have zero rows, ever** —
`WaiverClaim` 0, `WaiverPeriod` 0, `WaiverAddEntry` 0, `WaiverDropEntry` 0. OGBA ran the whole
2026 season through `/transactions/claim` (Roster Moves). So the choice could not break anything
in use; Wire List wins on being the newer, hardened system (v1.1, 14 PRs, MCP tools).

Removed:
- `/api/waivers` route + `server/src/features/waivers/` (and its tests)
- client `features/waivers/` (`WaiverClaimForm`, api), `ActivityWaiversTab`, the Activity page
  "Waivers" tab (default tab is now Roster Moves) and its standings fetch (which existed only to
  order the waiver list — it was a full season-standings compute on every Activity page load)
- the commissioner-only fallback form → replaced with a link to the viewer's own Wire List. The old
  fallback also rendered a claim form on `NOT_OWN_TEAM`, i.e. for someone else's team.
- `aiAnalysisService.analyzeWaiverClaim` (only caller was the route)
- simulated-waiver tests in `transaction-claims.test.ts` + `waiver-roster.test.ts` — they exercised
  a hand-copied simulation, never production code
- 4 entries from the ADR-015 baseline (95 → 91)

**Kept on purpose:** the `WaiverClaim` table/model. Commissioner league-delete, the admin dashboard
and AI analysis still reference `prisma.waiverClaim`, and dropping a table is a migration (P3009
risk) for zero gain while it holds 0 rows. Drop it in a dedicated migration PR if ever wanted.

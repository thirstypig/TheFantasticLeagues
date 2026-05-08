---
status: complete
priority: p2
issue_id: "122"
tags: [code-review, docs, agent-native, discoverability]
dependencies: []
---

# CLAUDE.md + `docs/SECURITY.md` are stale w.r.t. 5 endpoints that landed today

## Problem Statement

PRs #178, #181, and the existing `/api/transactions/{il-stash,il-activate}` endpoints (referenced in #182) all shipped without entries in either:
- CLAUDE.md's feature module table (the human-and-agent feature catalog)
- `docs/SECURITY.md`'s endpoint table (the only structured endpoint registry)

Effect on agent-native discoverability: an agent (or a future Claude session) reading CLAUDE.md to understand "what endpoints exist" will not see `/awards` or `/eligible-slots`. SECURITY.md table has rows for `/api/transactions` and `/api/transactions/claim` but NONE for `/il-stash`, `/il-activate`, `/awards`, or `/eligible-slots`.

The endpoints exist and are well-designed — they're just undiscoverable without grepping source.

## Findings

- `CLAUDE.md` `mlb-feed` row mentions weekly digest but not `/awards`
- `CLAUDE.md` `players` row says "Player search, stats, detail modals" — no `/eligible-slots` or `/fielding`
- `CLAUDE.md` `transactions` row doesn't list `/il-stash` or `/il-activate`
- `docs/SECURITY.md:37-38` has `/api/transactions` rows but not the new ones
- Session 86 status paragraph in CLAUDE.md is prose-level, not stable reference

## Proposed Solutions

### Option 1: Targeted updates to both files (recommended)

**Approach:**
- `mlb-feed` row → append "`GET /api/leagues/:id/awards` (top-3 MVP/Cy Young with z-scores)"
- `players` row → append "`GET /api/players/:mlbId/eligible-slots` (slot-eligibility per `posList`), `GET /api/players/:mlbId/fielding`"
- `transactions` row → append "`POST /transactions/{il-stash,il-activate}` (atomic IL stash+add and activate+drop)"
- `docs/SECURITY.md:37-38` table → add 4 rows for new write endpoints (`requireAuth + requireTeamOwnerOrCommissioner`) + 2 read endpoints (`requireAuth` + `requireLeagueMember`)

**Pros:**
- Closes discoverability gap; matches existing convention
- ~20 minutes of work

**Cons:**
- Manual sync; will drift again on the next endpoint addition

**Effort:** Small (~20 min)

**Risk:** None

### Option 2: Auto-generate endpoint catalog from Express router introspection

**Approach:** Build script that walks `app._router.stack` and outputs a markdown table at build time. CLAUDE.md and SECURITY.md include the generated section.

**Pros:**
- Drift-proof
- Reusable for other docs

**Cons:**
- Significant tooling investment
- Express middleware introspection is awkward

**Effort:** Large (~1 day)

**Risk:** Medium

## Recommended Action

Option 1 now; consider Option 2 if endpoint count keeps growing past 50.

## Technical Details

**Affected files:**
- `CLAUDE.md` — feature module table rows for `mlb-feed`, `players`, `transactions`
- `docs/SECURITY.md:37-38` — endpoint table

## Acceptance Criteria

- [ ] CLAUDE.md feature table mentions all 5 new endpoints
- [ ] SECURITY.md table has rows for all 5 with correct middleware chain
- [ ] Run `git diff CLAUDE.md` against the 9-PR-stack status paragraph and verify session-86 references are still accurate

## Resources

- **Source:** Agent-native-reviewer P2 finding
- **PRs:** #178, #181, #182

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review agent-native-reviewer
- **Learnings:** "Agent-native by intent" requires "agent-native by discoverability." Endpoints undiscoverable in the catalog might as well not exist for cross-session agents.

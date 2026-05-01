---
status: pending
priority: p3
issue_id: "128"
tags: [code-review, planning, v3-hub, deferred]
dependencies: []
---

# Consolidate the 4 deferred roster-hub-v3 follow-ups in one tracking todo

## Problem Statement

Four post-v3-hub items are deferred and scattered across inline comments + memory:

1. **Real per-position GP** via `Player.posGames` JSON column + `syncPositionEligibility` cron update — replaces synthetic 60/40 GP distribution
2. **`rosterVersion` etag** for cross-tab safety on roster PATCH — needs schema decision (existing `updatedAt` vs computed hash vs Team-level counter)
3. **Drag-to-mutate** via dnd-kit — already installed; v3 cells accept `dragSim` props; needs optimistic-update + revert design
4. **Pending-changes save/revert flow** — UX TBD; `<PendingChangeBar>` wired in v3 components but per-row PATCH semantics need finalizing

Items 1, 3, 4 have inline comments scattered across `Team.tsx`, `toHubPlayer.ts`, `shared/api/rosterMoves.ts`. Item 2 lives only in memory. No `todos/` consolidation, no GitHub issue.

This is the start of TODO-rot. The next session will have less context than this one.

## Proposed Solutions

### Option 1: One tracking todo per deferred item

**Approach:** Create todos #129-#132 (one each) with: rationale, current workaround, surfaces affected, design decisions still open, blocking dependencies. Cross-link from inline comments via `// see todos/129 §rosterVersion` etc.

**Pros:**
- Each item is independently scopable
- Cross-link from inline comments creates a discoverable trail

**Cons:**
- 4 file creations

**Effort:** Small (~30 min)

**Risk:** None

### Option 2: One consolidated tracking todo (recommended for now)

**Approach:** This file IS the tracking doc. List all 4. When one is picked up, split it into its own todo file at that point.

**Pros:**
- Keeps the queue small until items are actively being worked on
- Reduces file count noise in `todos/`

**Cons:**
- Less granular for triage

**Effort:** Already done (this file)

## Recommended Action

Option 2 — this file is the index. If/when one item gets prioritized for next session, create a dedicated todo at that point with full design notes.

## Technical Details

For each deferred item, see:
- **Player.posGames**: `Team.tsx:74` JSDoc, `toHubPlayer.ts:29` comment, `shared/api/rosterMoves.ts:60` comment
- **rosterVersion etag**: only `MEMORY.md` `roster_hub_v3_shipped.md`
- **Drag-to-mutate**: dnd-kit already installed at `TeamRosterManager.tsx`
- **Pending-changes**: `<PendingChangeBar>` wired in v3 components

## Acceptance Criteria

- [ ] When one deferred item is picked up, split into its own todo with design notes before code
- [ ] Inline comments cross-link to this todo file

## Resources

- **Source:** Architecture-strategist P3 (TODO-rot warning)
- **Memory:** `roster_hub_v3_shipped.md` "What's deferred" section

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review architecture-strategist agent

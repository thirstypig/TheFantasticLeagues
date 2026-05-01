---
status: pending
priority: p2
issue_id: "141"
tags: [code-review, architecture, teams, transactions, drift, conventions]
dependencies: []
---

# Deprecate the leading-underscore enrichment convention; rename `_dbId` to align

## Problem Statement

Two parallel leading-underscore conventions for the same concept now exist on the wire:

- `_dbPlayerId` / `_dbTeamId` / `_rosterId` / `_posList` — produced by `TeamLegacy.tsx:222, 244-246` for the legacy roster panel join. Read across `AddDropPanel.tsx`, `PlaceOnIlPanel.tsx`, `ActivateFromIlPanel.tsx` via `as any` casts. Captured by todo #116.
- `_dbId` — newly added in this stack at `server/src/features/players/routes.ts:99` for the `GET /players` endpoint. Sibling field, slightly different name, same meaning.

Two undocumented conventions for "Prisma `Player.id` smuggled onto the response" will not converge naturally. Every `as any` cast site pays the cognitive tax forever.

## Findings

- `server/src/features/players/routes.ts:99` — `_dbId: p.id` (new in stack)
- `client/src/features/teams/pages/TeamLegacy.tsx:222, 244-246, 1047-1048` — `_dbPlayerId`/`_dbTeamId`/`_rosterId`/`_posList`
- `client/src/features/transactions/components/RosterMovesTab/{AddDropPanel,PlaceOnIlPanel,ActivateFromIlPanel}.tsx` — read via `as any`
- `client/src/features/transactions/pages/ActivityPage.tsx:351` — has a `_dbTeamId` fallback
- No docs in CLAUDE.md "Conventions" describe the pattern

## Proposed Solutions

### Option 1: Document deprecation + rename `_dbId` to `_dbPlayerId` immediately (recommended interim)

- Add a "Player row enrichment (deprecated)" subsection in CLAUDE.md describing the leading-underscore convention as legacy, scheduled for removal when v3 ships everywhere.
- Rename `_dbId` → `_dbPlayerId` for consistency.
- Track full removal as part of #140 (server-side hub roster) which obviates the convention.

**Effort:** Small (~1h). **Risk:** Low — tightens an existing pattern.

### Option 2: Promote to public field `playerId` immediately

Less consistent with TeamLegacy's existing readers but cleaner long-term. Riskier mid-flight while v3 hub is rolling out.

**Effort:** Small. **Risk:** Medium — touches consumers.

### Option 3: Skip rename; rely on #140 to delete the convention

Cleanest if #140 ships in the next session, but kicks the inconsistency down the road.

**Effort:** None. **Risk:** Documentation debt.

## Recommended Action

Option 1. Pairs with #140; document now, delete the convention when the server-side hub roster lands.

## Technical Details

- `server/src/features/players/routes.ts:99` — rename
- `CLAUDE.md` "Conventions" section — add deprecation note
- Reference todos #116 and #140 for the full removal path

## Acceptance Criteria

- [ ] `_dbId` renamed to `_dbPlayerId` server-side
- [ ] CLAUDE.md "Conventions" includes a "Player row enrichment (deprecated)" note
- [ ] Note explicitly references #140 as the removal vehicle

## Resources

- Architecture review under /ce:review 2026-04-30
- Todo #116 (panel data shape — root cause)
- Todo #140 (server-side hub roster — removal vehicle)

## Work Log

### 2026-04-30 — Initial Discovery
- architecture-strategist flagged during /ce:review re-run.

---
status: pending
priority: p3
issue_id: "179"
tags: [code-review, simplicity, awards]
dependencies: []
---

# Awards weekKey: tighten regex and add availableWeeks enumeration

## Problem Statement

Carved out of todo #148 during its 2026-05-07 close-out — the awards-side
follow-up was real but lives in a different feature module (`awards/` not
`players/`), so it ships separately.

1. **`/^\d{4}-W\d{2}$/` regex is too permissive** — at
   `server/src/features/awards/routes.ts:22`. Accepts nonsense like
   `0000-W00` and `9999-W99` (semantic-but-harmless: falls through to
   compute and returns empty). Tighten to a realistic season-year range
   and `W01`-`W53`.
2. **No enumeration for valid weeks.** Agents asking "what weeks have an
   MVP race?" hit guess-and-check. Either:
   - Add `availableWeeks` to the awards response payload, or
   - Add `GET /api/leagues/:leagueId/awards/weeks` returning the same
     shape the digest endpoint already exposes.

   `server/src/features/mlb-feed/digestRoutes.ts:23-43` is the canonical
   prior art — `AiInsight` rows where `type = "league_digest"` joined to
   the current week key via `getWeekKey()`. Awards can do the same lookup
   for `type = "awards_snapshot"` (or whatever the persisted-snapshot
   type is — confirm in `awards/services/awardsService.ts`).

## Findings

- `server/src/features/awards/routes.ts:22` — regex
- `server/src/features/awards/services/awardsService.ts` — persisted
  snapshot type for the `availableWeeks` lookup
- `server/src/features/mlb-feed/digestRoutes.ts:23-43` — copy this
  pattern

## Proposed Solutions

### Option 1: Add `availableWeeks` to existing response (recommended)

Smallest diff: extend the awards response shape with `availableWeeks:
{ weekKey, label, generatedAt }[]` so a single call answers both
"this week's awards" and "what other weeks can I ask for?" — one less
round-trip than a separate sub-route.

Tighten the regex in the same PR:

```ts
// Real OGBA seasons start ~2024; pad to 2020-2099 for safety. W01-W53.
const WEEK_KEY_REGEX = /^(20[2-9]\d)-W(0[1-9]|[1-4]\d|5[0-3])$/;
```

**Effort:** Small (~1-2h). **Risk:** Low — regex tightening is
backward-compatible (real keys all match), enumeration is additive.

## Recommended Action

Option 1.

## Acceptance Criteria

- [ ] Regex rejects `0000-W00` / `9999-W99` / `2026-W00` / `2026-W54`
- [ ] Awards response carries `availableWeeks` (or sub-route exists)
- [ ] Tests added at `server/src/features/awards/__tests__/routes.test.ts`

## Resources

- Carved from todo #148 closure (2026-05-07)
- Prior art: `server/src/features/mlb-feed/digestRoutes.ts:23-43`

## Work Log

### 2026-05-07 — Carve-out
- Original todo #148 conflated three independent items across two
  feature modules. Awards split here so it can be picked up cleanly.

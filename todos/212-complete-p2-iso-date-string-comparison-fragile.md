---
status: pending
priority: p2
issue_id: "212"
tags: [code-review, typescript, teams, period-roster, date-handling, correctness]
dependencies: []
---

# ISO date string comparison `releasedAt > selectedPeriodStart` is correct but implicitly format-dependent

## Problem Statement

The period roster display filter in `Team.tsx` uses lexicographic string comparison:

```typescript
return periodRoster.filter(r =>
  r.releasedAt === null || !selectedPeriodStart || r.releasedAt > selectedPeriodStart
)
```

Lexicographic `>` on ISO-8601 strings is correct when both strings are in the same timezone/format (e.g. both `"2026-05-15T04:00:00.000Z"`). The concern: `releasedAt` comes from Prisma `DateTime` (always full UTC timestamp), while `selectedPeriodStart` comes from `res.period.startDate`. If `period.startDate` is serialized as a date-only string (`"2026-05-15"`) rather than a full timestamp, the comparison becomes:

```
"2026-05-15T04:00:00.000Z" > "2026-05-15"
```

This evaluates to `true` in JS string ordering (because character 10 is `"T"` > nothing), which means a player released at exactly `period.startDate` (midnight UTC) would pass through the filter and render — the opposite of the intended exclusion.

**Context from past solution:** `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md` documents a previous `gt` vs `gte` boundary bug in this exact area. The current strict `>` is intentional (exclude released-at-exactly-period-start), but the mixed-format risk is the same pattern.

Prisma serializes `DateTime` consistently as full UTC in JSON, so this likely works today. The risk is an invisible dependency on serialization format.

## Findings

- **File:** `client/src/features/teams/pages/Team.tsx` line ~411
- `releasedAt` type: `string | null` (Prisma DateTime → always `"YYYY-MM-DDTHH:mm:ss.sssZ"`)
- `selectedPeriodStart` type: `string` (from `res.period.startDate` — format depends on server serialization)
- Server `Period.startDate` field type: `DateTime` in Prisma schema — should serialize as full timestamp
- No runtime assertion or normalization at the comparison site

## Proposed Solutions

### Option A — Use `Date` objects for comparison (Recommended)
```typescript
return periodRoster.filter(r =>
  r.releasedAt === null ||
  !selectedPeriodStart ||
  new Date(r.releasedAt) > new Date(selectedPeriodStart)
)
```
`new Date()` handles both full timestamps and date-only strings correctly (date-only parsed as UTC midnight). Zero behavior change today; robust against format changes.
- **Effort:** 1 line
- **Risk:** None

### Option B — Add a comment documenting the format dependency
```typescript
// Both releasedAt (Prisma DateTime → UTC ISO) and selectedPeriodStart (period.startDate → UTC ISO)
// must be full ISO-8601 timestamps for string comparison to be correct.
```
- **Pros:** Zero code change
- **Cons:** Doesn't fix the underlying fragility

## Recommended Action

Option A — `new Date()` comparison. It's one line and makes the contract explicit.

## Acceptance Criteria
- [ ] Comparison uses `new Date(r.releasedAt) > new Date(selectedPeriodStart)` (or equivalent)
- [ ] Existing period roster display behavior unchanged
- [ ] Test: player released exactly at `period.startDate` is excluded from display

## Work Log
- 2026-05-18: Identified by TypeScript reviewer + Architecture Strategist. Past solution doc for same boundary area referenced.

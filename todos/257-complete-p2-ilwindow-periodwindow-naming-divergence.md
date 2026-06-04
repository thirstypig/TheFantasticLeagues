---
status: pending
priority: p2
issue_id: 257
tags: [code-review, architecture, ilWindows, rosterWindow, standings]
dependencies: []
---

## Problem Statement

`ilWindows.ts` defines `IlWindow` with fields `{ start: Date; end: Date | null }`. `rosterWindow.ts` defines `PeriodWindow` with fields `{ startDate: Date; endDate: Date }`. Both represent the same concept (a half-open date window), but with different field names. Since both fields are `Date` type, TypeScript's structural typing will NOT catch a mix-up at the call site — a bug would be a silent date swap.

Any future attribution helper that needs both IL exclusion and period overlap (e.g., the MCP historical standings tool in todo #249) must destructure across two naming conventions, increasing the chance of a transposition error.

## Findings

From architecture-strategist:
- `ilWindows.ts`: `IlWindow { start: Date; end: Date | null }`
- `rosterWindow.ts`: `PeriodWindow { startDate: Date; endDate: Date }`
- `wasOnIlAtPeriodStart` in `ilWindows.ts` currently accepts `period.startDate` as a bare `Date`, not a `PeriodWindow`, which sidesteps the mismatch today
- The two modules are documented as companions (`// Companion: lib/ilWindows.ts`) but are not compositionally compatible
- Architecture risk: medium — the codebase has several upcoming attribution-aware features (MCP tools, snapshot service, roster-hub history) that will need both window types

## Proposed Solutions

**Option A — Rename `IlWindow.start/end` to `startDate/endDate` (Recommended)**

Update `IlWindow` in `ilWindows.ts`:
```typescript
export interface IlWindow {
  startDate: Date;
  endDate: Date | null;
}
```

Update `buildIlWindows` return and all consumers in `ilWindows.ts` and its one primary consumer (`standingsService.ts`).

Effort: Small | Risk: Low (single consumer, contained refactor)

**Option B — Unify under a shared `DateWindow` type in `server/src/types/`**

Extract a base `DateWindow { startDate: Date; endDate: Date | null }` and have both `IlWindow` and `PeriodWindow` alias or extend it. More principled but adds a third type name.

Effort: Small | Risk: Low

**Recommended:** Option A — minimal change, makes `IlWindow` consistent with `PeriodWindow` and the Prisma `Period` model field names.

## Technical Details

Affected files:
- `server/src/lib/ilWindows.ts` — rename `start`/`end` → `startDate`/`endDate` in `IlWindow` interface and `buildIlWindows` return
- `server/src/features/standings/services/standingsService.ts` — update any `ilWindow.start`/`ilWindow.end` references

## Acceptance Criteria

- [ ] `IlWindow` uses `startDate`/`endDate` field names
- [ ] `buildIlWindows` updated to return renamed fields
- [ ] All consumers of `IlWindow` fields updated
- [ ] tsc clean; standing tests pass
- [ ] `PeriodWindow` and `IlWindow` now have consistent field naming

## Work Log

2026-06-04 — Surfaced by architecture-strategist. Deferred until a second attribution consumer appears or until #249 (MCP historical standings) is implemented.

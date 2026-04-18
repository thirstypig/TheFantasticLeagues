---
status: complete
priority: p2
issue_id: "096"
tags: [code-review, architecture, pattern-violation, ui]
dependencies: []
---

# StandingsBlock raw `<table>` violates the ThemedTable pattern

## Problem Statement

`client/src/features/reports/pages/ReportPage.tsx:174-217` (`StandingsBlock` helper) uses a raw `<table>` element with inline `style={{ tableLayout: "fixed" }}` and bespoke padding (`py-1.5`) instead of the project-standard `ThemedTable` + `ThemedTh`/`ThemedTd` components.

This conflicts with the Session 64 convention documented in:
- `docs/solutions/ui-bugs/table-layout-fixed-for-proportional-columns.md`
- Memory: `feedback_table_layout_fixed_pattern.md`
- `client/src/components/ui/table.tsx` header: "single source of truth for all table styling"

CLAUDE.md is unambiguous: all data tables use `ThemedTable` + centralized density. Self-contained inline tables aren't a documented exemption — every other table in the app tracks the density tier system + design tokens; this one doesn't.

## Findings

### Agent: architecture-strategist
- Pattern violation worth a P2 todo. "Self-contained helper" is not a documented exemption. Future density-tier changes won't track this table.

### Agent: kieran-typescript-reviewer
- Same finding. Migration is low effort — wrap in `ThemedTable`, use `ThemedTh`/`ThemedTd`, drop inline styles. The share-bar `<div>` stays inside the last `<ThemedTd>`.

### Agent: learnings-researcher
- Flagged as "implement the table layout fix immediately."
- References `docs/solutions/ui-bugs/table-layout-fixed-for-proportional-columns.md` and `feedback_table_layout_fixed_pattern.md`.

## Proposed Solutions

### Solution 1: Migrate to ThemedTable (recommended)
- Wrap with `ThemedTable` (likely `density="compact"` to match digest/insights aesthetic)
- Replace `<thead><tr>` with `ThemedThead`/`ThemedTr`
- Replace `<th>` with `ThemedTh` preserving column widths via `className="w-12"` etc.
- Replace `<td>` with `ThemedTd`
- The share-bar `<div>` stays inside the last `ThemedTd`
- **Pros**: Aligns with universal project convention; future density + color-theme changes apply automatically.
- **Cons**: None meaningful.
- **Effort**: Small (~15 min)
- **Risk**: Visual regression if default styles differ from current inline styles — verify with a screenshot or Playwright pass.

### Solution 2: Leave as-is
- **Pros**: Zero churn.
- **Cons**: Pattern drift continues; cited in CLAUDE.md as the trap we already fixed in Session 64.
- **REJECT**

## Recommended Action

Solution 1.

## Acceptance Criteria

- [ ] `StandingsBlock` uses `ThemedTable` + `ThemedThead`/`ThemedTr`/`ThemedTh`/`ThemedTd`
- [ ] No inline `tableLayout: "fixed"` — `ThemedTable` handles it
- [ ] Column widths preserved via `className="w-*"` on `ThemedTh`
- [ ] Share-bar div retained inside the last `ThemedTd`
- [ ] Visual check at `/report` — no regression
- [ ] Appears in next table-audit sweep as "compliant"

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged unanimously by architecture-strategist, kieran-typescript-reviewer, and learnings-researcher.

## Resources

- `client/src/features/reports/pages/ReportPage.tsx:174-217` (target)
- `client/src/components/ui/ThemedTable.tsx` (reference components)
- `docs/solutions/ui-bugs/table-layout-fixed-for-proportional-columns.md`
- Session 64 memory `feedback_table_layout_fixed_pattern.md`

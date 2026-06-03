---
status: pending
priority: p2
issue_id: "245"
tags: [code-review, pr-365, claude-md, conventions, prevention]
dependencies: []
---

# Add CLAUDE.md convention for time-aware predicates

## Problem Statement

The compound doc Prevention section codifies a rule that applies project-wide,
not just to standings:

> Any function that takes a `period` or `date` parameter MUST NOT use
> `releasedAt === null` or variables named `current*` for ownership/state
> checks. Use named predicates: `ownedOn(roster, date)`,
> `wasRosteredDuring(roster, period)`. The naked `releasedAt === null`
> check is correct only for free-agent detection (no time dimension) —
> `transactions/lib/freeAgent.ts`.

This applies to wire-list, keeper-prep, period-roster, transactions/freeAgent
(only legitimate use). CLAUDE.md "Conventions" section has zero entries
about time-aware predicates today.

## Proposed Solutions

### Option 1 (recommended): One bullet in CLAUDE.md Conventions section

Add the rule verbatim under "Conventions" — searchable for any future
agent or human writing time-aware standings/roster code.

### Option 2: Custom ESLint rule

Flag any reference to `currentTeam` / `currentOwner` / `releasedAt === null`
inside files that import `PlayerStatsPeriod` or `period.startDate` /
`period.endDate`. Higher effort; pays back with every future regression
prevented.

## Acceptance Criteria

- [ ] CLAUDE.md "Conventions" section updated with the rule
- [ ] Cross-reference to `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md`
- [ ] (Optional) ESLint rule scaffolded

## Resources

- Compound doc: `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md`
- PR #365 architecture review finding F4

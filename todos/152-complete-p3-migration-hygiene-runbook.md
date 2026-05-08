---
status: complete
priority: p3
issue_id: "152"
tags: [code-review, data-migration, deployment, conventions]
dependencies: []
---

# Migration hygiene: document `CONCURRENTLY` discipline and ban duplicate timestamps

## Problem Statement

Two operational gaps surfaced during the migration audit. Both are P3 documentation/hygiene items, not active bugs:

1. **`CREATE INDEX` not `CONCURRENTLY`.** `prisma/migrations/20260430000000_aiinsight_3col_index/migration.sql` builds the index with a plain `CREATE INDEX`, which takes a `ShareLock` blocking writes for the duration. AiInsight is a low-write table so the impact was bounded — but on bigger tables this would cause an outage. No convention currently captures when to use `CONCURRENTLY`.
2. **Both new migrations share the timestamp `20260430000000`.** Prisma applies in lexicographic directory-name order so the order is determined; the two touched disjoint schema (AiInsight vs. Roster + LeagueRule) so it didn't matter here. But duplicate timestamps are fragile — a future engineer adding a third migration with the same timestamp introduces non-determinism.

Bonus: `auto_resolve_slots` rollback runbook is captured in #142 — this todo focuses on conventions for future migrations, complementing #125.

## Findings

- `prisma/migrations/20260430000000_aiinsight_3col_index/migration.sql`
- `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql`

## Proposed Solutions

### Option 1: Add a "Migrations" section to CLAUDE.md (recommended)

Document:
- Use `CREATE INDEX CONCURRENTLY` on tables with > N rows or > M writes/min (pick a threshold)
- Migration directory timestamps must be unique to the second; if two land on the same day, use `20260430000000` and `20260430000001`
- Prefer `IF EXISTS` / `IF NOT EXISTS` guards for idempotency
- Reference rollback runbooks (see #142)

**Effort:** Trivial (~30 min). **Risk:** None.

## Recommended Action

Option 1. Pair with #125 (the broader migration hardening todo).

## Technical Details

- `CLAUDE.md` Database section — add Migrations subsection

## Acceptance Criteria

- [ ] CLAUDE.md has a "Migrations" subsection capturing both rules
- [ ] Future migrations follow the convention

## Resources

- data-migration-expert + deployment-verification-agent under /ce:review 2026-04-30
- Todo #125 (broader migration hardening — companion)
- Todo #142 (auto_resolve_slots rollback runbook)

## Work Log

### 2026-04-30 — Initial Discovery
- data-migration-expert flagged both items.

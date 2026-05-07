---
status: pending
priority: p1
issue_id: "162"
tags: [code-review, wire-list, prisma, schema-drift]
dependencies: []
---

# Wire List: Prisma schema vs migration onDelete drift

## Problem Statement

The wire-list two-list migration applies explicit FK behaviors at the database level (`ON DELETE RESTRICT` for `leagueId`, `ON DELETE SET NULL` for `consumedDropEntryId`, `ON DELETE CASCADE` for `periodId`/`teamId`/`playerId` children), but `prisma/schema.prisma` declares the matching relations with no `onDelete` qualifier — Prisma defaults to `NoAction` in its model. This means the database and the Prisma client have divergent assumptions: the next time anyone runs `prisma migrate dev` (or `prisma db pull`), Prisma will generate a phantom drift migration trying to "fix" the database to match the schema, which would silently weaken the FK constraints in production.

This is a latent foot-gun: the constraint behavior is correct today, but the schema is the source of truth Prisma uses for codegen and migration planning. Any contributor running `prisma migrate dev` against a fresh DB will get a migration tree that doesn't match production.

## Findings

`prisma/migrations/20260506000000_waiver_wire_list_two_lists/migration.sql:48` — leagueId FK `ON DELETE RESTRICT`.
`prisma/migrations/20260506000000_waiver_wire_list_two_lists/migration.sql:84` — periodId FK `ON DELETE CASCADE`.
`prisma/migrations/20260506000000_waiver_wire_list_two_lists/migration.sql:123` — consumedDropEntryId FK `ON DELETE SET NULL`.
`prisma/migrations/20260506000000_waiver_wire_list_two_lists/migration.sql:140` — periodId/teamId/playerId on `WaiverDropEntry` `ON DELETE CASCADE`.

`prisma/schema.prisma:968-1020` — relation declarations (WaiverPeriod, WaiverAddEntry, WaiverDropEntry):
```prisma
model WaiverAddEntry {
  ...
  period   WaiverPeriod @relation(fields: [periodId], references: [id])  // no onDelete
  team     Team         @relation(fields: [teamId], references: [id])    // no onDelete
  player   Player       @relation(fields: [playerId], references: [id])  // no onDelete
  consumedDrop WaiverDropEntry? @relation("ConsumedDrop", fields: [consumedDropEntryId], references: [id])  // no onDelete
}
```

Verify drift today:
```bash
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
                       --from-migrations prisma/migrations \
                       --script
```
This will print the corrective DDL Prisma wants to generate — that's the drift.

## Proposed Solutions

### Option 1: Align schema to match migration DDL (recommended)
Add explicit `onDelete` qualifiers to all 8 wire-list relations in `prisma/schema.prisma:968-1020`:

| Relation | Field | onDelete |
|---|---|---|
| WaiverPeriod.league | leagueId | Restrict |
| WaiverAddEntry.period | periodId | Cascade |
| WaiverAddEntry.team | teamId | Cascade |
| WaiverAddEntry.player | playerId | Cascade |
| WaiverAddEntry.consumedDrop | consumedDropEntryId | SetNull |
| WaiverDropEntry.period | periodId | Cascade |
| WaiverDropEntry.team | teamId | Cascade |
| WaiverDropEntry.player | playerId | Cascade |

Verify with `prisma migrate diff` — should produce empty diff after the edit. No new migration file needed (DB already matches the desired state).

**Effort:** Trivial (~30min including diff verification). **Risk:** Low — schema-only, no DB change.

### Option 2: Generate a no-op marker migration
Create a migration file that pulls the schema into alignment and uses `prisma migrate resolve --applied` to mark it without running DDL. Heavier; only needed if the diff is non-empty.

**Effort:** Small. **Risk:** Low.

### Option 3: Re-evaluate the FK strategy
Audit whether `onDelete: Cascade` on `playerId` is actually desired (deleting a Player would silently delete their wire-list history; today this is fine because Players are never deleted, but if that changes the cascade is surprising). Possibly switch to `Restrict` for player. Defer.

**Effort:** Medium. **Risk:** Medium.

## Recommended Action

**Option 1.** Add the 8 `onDelete` qualifiers, run `prisma migrate diff`, confirm empty diff, commit. Defer Option 3 to a separate audit.

## Technical Details

Files:
- `prisma/schema.prisma:968-1020`

Verification:
```bash
npx prisma migrate diff \
  --from-schema-datamodel prisma/schema.prisma \
  --to-migrations prisma/migrations \
  --script
# Should output: "No difference detected." after the edit.

npx prisma generate
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

CI: existing migration-grep guard in `docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md` covers `CONCURRENTLY` but not drift; consider adding a CI step that runs `prisma migrate diff` and fails on non-empty output (separate todo).

## Acceptance Criteria

- [ ] All 8 wire-list relations carry the correct `onDelete` qualifier.
- [ ] `prisma migrate diff --from-schema-datamodel ... --to-migrations ... --script` outputs no diff.
- [ ] `npx prisma generate` runs cleanly.
- [ ] Server and client TypeScript still typecheck.
- [ ] No new migration file added (DB already matches).

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `prisma/schema.prisma:968-1020`
- `prisma/migrations/20260506000000_waiver_wire_list_two_lists/migration.sql:48,84,123,140`
- Memory: `feedback_prisma_migrate_concurrently.md` (precedent for migration-correctness vigilance)

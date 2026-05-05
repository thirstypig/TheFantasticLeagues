---
title: Ghost-IL warning chip never lit up due to stale Prisma client
date: 2026-05-05
type: build-config-issue
module: roster-hub
symptom: Ghost-IL warning chip on /teams/:code never displayed despite mlbStatus data being populated in DB
severity: medium
impact_scope: Managers couldn't see which active-roster players had MLB IL status, defeating the purpose of the ghost-IL stash detection feature on the v3 roster hub
tags: [prisma, prisma-generate, codegen, type-cast-masking, roster-hub, mlb-status, ghost-il, build-pipeline, silent-runtime-drop]
---

# Ghost-IL warning chip never lit up due to stale Prisma client

## Problem statement

The v3 roster hub (`/teams/:code`) had a "ghost-IL warning chip" wired end-to-end: schema column on the `Player` model, a migration that added it, a daily MLB sync writing real values, the server-side hub-roster payload assembler reading it, and a client-side `ghostIlSuspects` reducer rendering the chip. Yet the chip never displayed — even on Los Doyers, where Clayton Beeter occupied an active P slot and his real-world MLB status was "Injured 15-Day."

The session-88 milestone memo (2026-04-30) had logged this as "owed work — Player.mlbStatus not yet on team-detail payload — chip ships dormant." Five days later, investigation revealed the field *was* on the payload — and yet always arrived as `null`.

## Root cause

Prisma's generated client at `node_modules/.prisma/client` was stale. The migration `20260430120000_player_mlb_status` had been applied to Postgres (1,306 of 2,497 players had real `mlbStatus` values), but `npx prisma generate` was never run after the schema change. Without regeneration, the typed client's internal column list excluded `mlbStatus` — and Prisma's runtime SELECT only fetches columns the client knows about, even when calling `include: { player: true }`. The `include` directive looks like "give me everything," but it's actually "give me everything the generated client knows about."

The smoking gun was a defensive TypeScript cast in `server/src/features/teams/services/teamService.ts:193`:

```ts
mlbStatus: (r.player as { mlbStatus?: string | null }).mlbStatus ?? null,
```

The cast was added to silence `Property 'mlbStatus' does not exist on type 'Player'`. It made the compiler happy but did nothing at runtime — the column was never in the SELECT, so the value was always `undefined`, always coalescing to `null`. The cast itself was the warning sign that the generated types were out of sync with the schema.

## Investigation

1. Started from the session-88 assumption that the team-detail payload didn't include `mlbStatus`.
2. Grepped server-side for `mlbStatus` — found it *was* being included in the response shape.
3. Traced the chain: `getTeamRosterHub` → `getTeamSummary` → roster query.
4. Spotted the TS cast at `teamService.ts:193`. Key question: *why does this cast exist if the field is in the Prisma schema?*
5. Probed Prisma directly:
   ```ts
   prisma.player.count({ where: { mlbStatus: { not: null } } })
   ```
   Got `Unknown argument 'mlbStatus'`. Confirmed the generated client had no knowledge of the column.
6. Ran `npx prisma generate`. Re-ran the count — 1,306 of 2,497 players had values. The data had been in Postgres the whole time.
7. Picked Clayton Beeter on Los Doyers (active P slot, `mlbStatus="Injured 15-Day"`) as the live verification fixture for the Ghost-IL chip.

## Working solution

Regenerate the Prisma client:

```bash
npx prisma generate
```

Drop the now-unnecessary cast in `server/src/features/teams/services/teamService.ts`:

```ts
// Before
mlbStatus: (r.player as { mlbStatus?: string | null }).mlbStatus ?? null,

// After
mlbStatus: r.player.mlbStatus ?? null,
```

Restart the Express dev server. The local stack runs `npx tsx` without `--watch`, so neither schema changes nor regenerated client bindings hot-reload — a manual restart is required for runtime to pick up the new client.

Shipped as PR #244.

### Generalizable lesson

A TypeScript cast that papers over `Property 'X' does not exist on type 'Y'` for a column that *is* in `schema.prisma` is a structural signal that `prisma generate` is overdue. Treat such casts as bug markers, not type-system noise. Any post-schema-change checklist should pair `prisma migrate` with `prisma generate` + dev-server restart.

## Prevention

Four concrete recommendations, ordered by ROI. Each is cheap to add and would have caught this specific class of bug at a different stage of the pipeline.

### 1. Make `prisma generate` non-skippable (codegen drift)

Combine three layers so no single forgotten step breaks the chain:

- **`postinstall` in `server/package.json`**: `"postinstall": "prisma generate"`. Every fresh install or branch switch with `npm ci` regenerates the client. Zero developer discipline required.
- **CI drift check**: after `npm ci`, run `prisma generate` then `git diff --exit-code` against a tracked snapshot of the generated `.d.ts`. Fails the PR if the committed schema and generated types disagree. Catches the case where a dev edited `schema.prisma`, wrote the migration, but never re-ran generate locally.
- **Migration-paired husky pre-commit**: when `prisma/schema.prisma` or `prisma/migrations/**` is staged, refuse the commit unless `prisma generate` has run since the schema's mtime.

The `postinstall` alone fixes 80% of cases; the CI check is the backstop.

### 2. Ban or quarantine ad-hoc shape casts (the smoking-gun cast)

The pattern `as { mlbStatus?: string | null }` is a structural assertion that the Prisma type *should* have but doesn't — exactly the failure mode we hit. Add an ESLint rule:

- **`@typescript-eslint/consistent-type-assertions`** + a custom **`no-restricted-syntax`** rule banning `TSAsExpression` whose `typeAnnotation` is a `TSTypeLiteral` (inline object cast) on any identifier whose type originates from `@prisma/client`. Force devs to either extend the Prisma type via a named `Prisma.PlayerGetPayload<...>` helper, or add an eslint-disable with a comment explaining *why* the Prisma type is wrong — the moment they realize they need to run `prisma generate`.
- **Code review heuristic**: any `as { ... }` on a DB row in a PR diff is a review-blocking smell. Add to the PR template checklist: "Inline shape casts on Prisma rows? → run `prisma generate` and remove the cast."

### 3. Contract test: schema ↔ API response shape

Add one integration test per endpoint that returns DB-derived fields. It hits the real route with a seeded fixture row that has every nullable column populated, then asserts the JSON response includes those keys with non-undefined values. For this case: a roster endpoint test seeding a player with `mlbStatus: 'Injured 10-Day'` and asserting `response.body.players[0].mlbStatus === 'Injured 10-Day'`. This is the single test that would have failed on day 1 — the cast compiles, the wire payload doesn't lie. Pair with a snapshot of the response shape so adding a column without surfacing it triggers a visible diff.

### 4. Dormant-feature operational signal

For any column feeding a conditional UI element (chips, badges, warnings), add a lightweight `/internal/health/columns` endpoint that reports `populated_pct` per tracked column over the last 24h, plus a frontend counter (`chip_rendered_total{type="ghost_il"}`) emitted on render. Alert (or just dashboard) when a column's populated_pct > 0 in DB but the chip render rate is 0 for >24h — the exact dormant-feature signature. One Grafana row, catches the whole class.

## Related documentation

**Prior solutions**

- `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` — v3 hub single-chip eligibility bug: under-declared TS type hid fields the server actually returned. Direct precedent for the dormant chip — type/payload mismatch where the UI silently falls back because the field isn't surfaced through types.
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — different "ghost" (orphaned roster rows), but same shape: data the UI/computation sees doesn't match the schema's intended state.
- `docs/solutions/deployment/railway-migration-deploy-missing.md` — schema/DB drift root cause (`prisma migrate deploy` wasn't running on Railway); references `mlbStatusSnapshot` IL-stash flow. Connects to "schema drift between schema.prisma and the database."

**Runbooks**

- `docs/runbooks/auto_resolve_slots_rollback.md` — only existing runbook; covers a Prisma migration (column drop) rollback. Template for any schema-drift rollback for the `mlbStatus` follow-up.

**Memory**

- `roster_hub_session_88_milestone.md` — explicitly logs the dormant chip as owed work.
- `feedback_du_interface_extends_trap.md` — the `mlbStatus?: string` extension bug from the same session (PR #212); shows TS casts were used to paper over the missing field.

**Relevant PRs**: #214 (IL stash + activate, dormant chip shipped), #212 (DU extends trap, mlbStatus type fix), #244 (the eventual fix).

# Current Product Status

Last updated: 2026-05-08

## Source Of Truth

`server/data/planning.json` is the unified planning source for both:

- micro todos: actionable tasks in `categories[].tasks`
- macro roadmap: larger product themes in `roadmap[]`

Do not recreate a separate `TODO.md`, `todo-tasks.json`, or `docs/ROADMAP.md`. If a task belongs on the roadmap, link the micro task to the matching roadmap section with `roadmapLink`.

Legacy task docs may remain as historical references under `docs/plans/` or `docs/solutions/`, but the active todo list and roadmap must stay together in `server/data/planning.json` and the in-app Admin/Roadmap views.

## Current Focus

Primary product work is OGBA in-season roster management and league dashboard clarity.

### Roster Hub

Roster Hub is the active roster-management direction. The UX follows the Yahoo-style mental model:

- The team roster table is the hub.
- Add/drop, IL stash, and IL activate are focused roster-move flows.
- Confirm buttons unlock only after the server-backed roster-rule preview accepts the move.
- The server full-roster matcher is the final authority for legal roster states.
- OGBA has no bench. Every active player must fit a legal slot.
- OGBA pitcher slots are `P`, not `SP`/`RP`.
- OGBA outfield slots display as `OF`, not separate `LF`/`CF`/`RF`.

### Roster Move Tables

Any player table used for player choice or comparison should follow the same core pattern:

- sortable table, not bento cards
- player name, eligible fantasy positions, MLB team, and role-appropriate stats
- hitters show hitting stats only
- pitchers show pitching stats only
- selected add/drop players must be visually highlighted
- expansion reveals career stats and position eligibility details
- transaction review uses readable opaque table treatment, not transparent glass over dense stats

### Home Dashboard

Home is the daily league cockpit:

- left column favors wider stat tables such as My Team Today and Weekly Insights
- right column favors compact cards such as Your Team, Current Standings, League Activity, Pending Trades, Around the League, League Board, and Injured List
- My Team Today should show current-day hitter/pitcher lines when MLB games have started or completed
- Weekly Insights tabs use the week start date, not labels like `W17`
- past AI insights stay available through the AI Hub
- stale AI copy should be labeled when it may lag current standings

### Wire List (two-list waiver model)

Wire List is the new in-season waiver workflow, shipped as v1 on 2026-05-06 (13 PRs, #255–#267). It replaces the legacy paired-row WaiverClaim auto-engine for new owners; the legacy engine is left running side-by-side until retirement.

- Two independent ranked lists per owner per `WaiverPeriod`: Add list (FA-eligible acquisitions) + Drop list (each entry tagged RELEASE or IL_STASH).
- Commissioner-driven consume/free reducer: each PENDING period transitions to LOCKED (auto at deadline via 5-min cron), then commissioner marks each Add as succeed / fail / skip. Each succeed consumes the next PENDING Drop top-down.
- Atomic finalize: roster mutations + `TransactionEvent` writes happen in one Prisma transaction; remaining PENDING drops marked UNUSED. Per-team summary push notification fan-out to team owners (no email per direction).
- Owner UI at `/teams/:code/wire-list`; commissioner UI at `/commissioner/:leagueId/wire-list`; home dashboard banner surfaces the active period to owners.
- Direction-locks (PM-confirmed): independent of stat-periods, weekly cadence; `Roster.acquiredAt > WaiverPeriod.createdAt` is the "acquired this period" hard block; default drop mode = RELEASE; soft warning when `adds > drops`.
- See `docs/decisions.md` ADR-012 and memory `waiver_wire_list_feature.md`.

### AI Insight Retention

All generated AI outputs should have a durable home in the AI section. This includes weekly digests, trade analyzer output, player/team insights, and future commissioner-assistant summaries.

## Deferred

SEO and blog expansion are intentionally on hold while roster management, standings accuracy, daily stats, and dashboard UX are stabilized.

Stripe and growth work remain roadmap items, but they should not displace active OGBA in-season correctness work.

### Stats freshness rollout (2026-05-07/08)

Server-supplied `computedAt` ISO timestamps now flow through every stats endpoint and surface as date+time badges across pages. The badge format is "Updated MMM D, h:MM AM" — visible without hover, tooltip carries the full local string + relative time.

- 7 stats endpoints expose `computedAt` (standings/season, standings/period/current, period-category-standings, teams/:id summary + roster-hub, players list, player-season-stats, player-period-stats, player detail + fielding, matchups list + my-matchup + standings, keeper-prep roster, auction state + bid-history).
- Client surfaces: Season, SeasonLegacy, Players (Aurora + Legacy), Team (Aurora v3 hub + Legacy), Matchup (Aurora + Legacy), PlayerDetail, InjuredList, KeeperSelection, AuctionResults, AuctionValues, AuctionComplete.
- Foundation lives at `client/src/components/shared/DataFreshness.tsx` (Aurora) and `<StatsUpdated>` in `components/shared/StatsTables.tsx` (legacy).
- Contract test at `server/src/__tests__/integration/stats-computed-at-contract.test.ts` is the cross-cutting safety net so the wire shape can't silently drop the field again.

### Wire List v1.1 hardening (2026-05-07/08)

After v1 shipped 2026-05-06, a multi-agent `/ce:review` produced 23 todos (#156–#178). Every prioritized P1 and P2 closed in the same session via 14 PRs:

- **Atomicity** (#156–#158): finalize TOCTOU + double-finalize race + succeed/revert race + auto-lock cron vs owner mutation race — all closed by wrapping state-reads in `prisma.$transaction` with status-CAS. Race losers get clean 409 codes (`PERIOD_NOT_LOCKED`, `DROP_RACE_LOST`).
- **Atomic reorder** (#159): replaced 3-call client swap with `POST /periods/:periodId/reorder` (two-pass server-side rewrite).
- **Performance** (#160, #171, #172, #173): finalize batched (~290 calls → ~10), push fan-out batched (12 teamOwnership queries → 1), `getPeriodResults` one-pass + commissioner local-patch, partial-on-PENDING deadline index for cron.
- **Security** (#161, #165, #166, #167): cross-league probe oracle closed via `loadPeriodForTeam`, audit logs awaited on state-changing endpoints, advisory locks switched to `pg_try_advisory_xact_lock` (pgBouncer-safe), rate limits on mutation endpoints.
- **Type safety** (#169): `req.body as` casts replaced with Zod inference, `status: string` replaced with `WaiverPeriodStatus` discriminated union, client redeclared interfaces deleted in favor of shared schema imports, `loadAddEntryAsCommissioner` uses `Prisma.WaiverAddEntryGetPayload`.
- **Architecture** (#163, #170, #174, #175): WaiverWirePreview deleted (-872 LOC, reducer drift), outcome handlers consolidated into 4 file-local helpers, `processorService.ts` extracted (`processor.ts` 1037 → 542 LOC, −48%), free-agent detection extracted to `transactions/lib/freeAgent.ts` with fail-closed empty-mlbTeam tightening.
- **Tests** (#168): 7-scenario reducer state-machine + finalize call-count budget + 11 new direct-service unit tests.
- **MCP** (#176): new `mcp-servers/fbst-app/` server registers 12 wire-list tools (4 reads, 3 owner writes, 5 commissioner reducer) reusing `shared/api/wireList.ts` Zod schemas as input validators.

The wire-list module is now fully reviewed, hardened, performance-tuned, type-safe, service-extracted, and agent-callable.

## Verification Baseline

Recent verification for this workstream:

- `npm run test`: 1079 server + 661 client + 53 MCP fbst-app + 50 MCP mlb-data = **1843 tests green** (7 skipped, 1 todo) + 1 E2E.
- `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit` — both clean.
- Browser-verified on localhost — Team page (`/teams/LDY`) reads from new `roster-hub` endpoint per #298, manage sub-routes (`/manage/{claim,il-stash,il-activate}`) mount inline below team chrome per #309, Activity page renders without `undefined` text per #313.

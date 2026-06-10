# Architecture Decision Records

Documents the "why" behind key architectural choices. For reference docs, see `CLAUDE.md`. For how-to guides, see `howto.md`.

---

## ADR-001: Feature Module Organization

**Context**: The codebase grew from a flat file structure to 15+ domain areas. Files were hard to find and cross-cutting concerns were unclear.

**Decision**: Organize by domain feature modules (auth, trades, auction, etc.) with each module containing its own routes, services, pages, components, and API client. Shared infrastructure (auth middleware, Prisma, UI primitives) stays in common directories.

**Consequences**:
- Adding a feature is self-contained — create a directory, add routes/pages, mount router
- Cross-feature imports are explicit and documented in CLAUDE.md
- Some duplication vs. a shared service layer, but isolation is worth it
- Index.ts barrels in each module for clean re-exports

---

## ADR-002: Supabase Auth with Express Middleware

**Context**: Needed authentication that supports OAuth (Google, Yahoo) and email/password, with minimal custom auth code.

**Decision**: Use Supabase Auth for identity management. Client holds Supabase sessions and sends JWT via `Authorization: Bearer` header. Server verifies JWT using Supabase Admin SDK in `attachUser` middleware.

**Consequences**:
- No custom password hashing or session management
- All API calls go through `fetchJsonApi()` which auto-injects the Bearer token
- Dev login flow uses Supabase Admin API to set passwords for OAuth-only accounts
- Token caching in middleware (`userCache` Map) avoids repeated Supabase calls

---

## ADR-003: Prisma Singleton Pattern

**Context**: Multiple `new PrismaClient()` instances cause connection pool exhaustion, especially in dev with hot reload.

**Decision**: Single Prisma instance exported from `server/src/db/prisma.ts`. All features import from this file — never instantiate PrismaClient directly.

**Consequences**:
- One connection pool shared across all features
- Easy to mock in tests (`vi.mock("../../db/prisma.js")`)
- Must restart server to pick up schema changes (standard Prisma behavior)

---

## ADR-004: DB-Backed Standings via PlayerStatsPeriod + Ownership-Window Attribution

> **Updated 2026-06-08.** The original ADR described CSV-based computation. That was replaced in 2026 when the stats pipeline migrated to the MLB Stats API and `PlayerStatsPeriod` became the authoritative source. See ADR-013 for the attribution model built on top of this decision.

**Context**: Period standings need to be computed from per-player statistics. The original CSV approach (`ogba_player_period_totals_2025.csv`) could not support mid-period attribution (who owned a player on which day) because CSVs store totals, not game-by-game rows.

**Decision**: Stats are stored in two complementary tables:
- `PlayerStatsPeriod` — full-period aggregate per player per period, sourced from the MLB Stats API nightly cron. 218 rows for a completed 8-team period. Used when no mid-period transactions exist for that period (performance path).
- `PlayerStatsDaily` — one row per player per game date, also from the MLB Stats API. Used when any player was acquired or dropped mid-period (accuracy path via `computeWithDailyStats`).

`TeamStatsPeriod` is a **derived cache** populated by the standings cron — it is NOT the live computation source. The standings API (`computeTeamStatsFromDb`) recomputes from `PlayerStatsPeriod` / `PlayerStatsDaily` on every request, routed through:
- `computeWithPeriodStats` — credits the player's full PSP row to whoever holds them at `period.endDate`. Fast; only correct for boundary-aligned periods.
- `computeWithDailyStats` — splits daily rows by exact ownership window. Authoritative; required whenever any mid-period add/drop occurred (enforced by `hasMidPeriodPickup` guard, PR #374).

**Consequences**:
- Stats are always as fresh as the last nightly MLB API sync (typically 9–10 AM PT)
- `PlayerStatsPeriod` and `PlayerStatsDaily` are the sources of truth for standings — never the CSV files
- `TeamStatsPeriod` can be regenerated from PSP/PSD at any time; it is only a read-through cache for the team-detail page
- Mid-period transaction detection is automatic — `computeTeamStatsFromDb` checks `hasMidPeriodPickup` and routes to the correct path without caller intervention

---

## ADR-005: Design Token System (--lg-* CSS Custom Properties)

**Context**: The app had inconsistent styling with hardcoded colors (`bg-slate-800`, `text-gray-300`) that broke in light/dark mode.

**Decision**: All colors use `--lg-*` CSS custom properties defined in `client/src/index.css`. Light and dark variants are defined on `:root` and `.dark` respectively. Zero hardcoded Tailwind color classes for backgrounds or text.

**Consequences**:
- Light/dark mode works consistently across all components
- Single source of truth for design tokens
- New components must use `var(--lg-*)` — enforced by convention
- `text-white` is only allowed on accent/opaque backgrounds (buttons, auth hero)

---

## ADR-006: ThemedTable as Single Table Abstraction

**Context**: Multiple table implementations existed (raw HTML tables, shadcn Table, custom styled tables) with inconsistent styling.

**Decision**: `ThemedTable`, `ThemedThead`, `ThemedTh`, `ThemedTr`, `ThemedTd` in `components/ui/ThemedTable.tsx` are thin wrappers around shadcn table primitives. All tables use these — no inline style overrides on table components.

**Consequences**:
- Consistent table appearance across all pages
- Style changes propagate globally from one file
- Slightly more verbose than raw `<table>`, but consistency is worth it

---

## ADR-007: Middleware Ordering Convention

**Context**: Express middleware ordering matters for security. Auth must run before handlers, but sometimes validation must run before auth (when auth reads from request body).

**Decision**: Standard ordering: `requireAuth → validateBody(schema) → requireTeamOwner/requireLeagueMember → asyncHandler(fn)`. Exception: when auth middleware reads from `req.body` (e.g., `requireTeamOwner("proposerTeamId")`), validation runs first.

**Consequences**:
- Unauthenticated requests are rejected before any business logic runs
- Body is always validated before authorization checks that depend on body fields
- Documented in CLAUDE.md so all contributors follow the same pattern

---

## ADR-008: Trade Lifecycle with Separate Endpoints

**Context**: Initially, trade actions (accept, reject, veto, cancel, process) were handled by a single endpoint with an `action` parameter. This led to bugs where veto silently processed trades as accepted.

**Decision**: Separate endpoints for each action: `POST /trades/:id/vote` (accept/reject), `POST /trades/:id/process`, `POST /trades/:id/veto`, `POST /trades/:id/cancel`. Each has its own authorization logic.

**Consequences**:
- Clear authorization per action (veto = commissioner only, cancel = proposer or commissioner)
- Status transitions are explicit and validated per endpoint
- Client API has distinct functions (`vetoTrade()`, `cancelTrade()`, `processTrade()`)
- More endpoints but each is simple and testable

---

## ADR-009: Season Lifecycle with Auto-Locking

**Context**: League rules should be editable during setup but locked once the draft begins. Manual lock/unlock was error-prone.

**Decision**: Season transitions (`SETUP → DRAFT`) automatically lock league rules via `CommissionerService.lockRules()`. The season service imports and calls the commissioner service directly.

**Consequences**:
- Rules can't be accidentally changed mid-season
- Cross-feature dependency: `seasons/services/seasonService` → `commissioner/services/CommissionerService`
- Commissioner can still unlock rules explicitly if needed (but this is intentionally friction-ful)

---

## ADR-010: No Bench/Reserves for OGBA League Format

**Context**: OGBA league format uses fixed position slots (C:2, 1B:1, 2B:1, 3B:1, SS:1, MI:1, CI:1, OF:5, DH:1 for hitters; SP/RP slots for pitchers). No bench or reserve slots.

**Decision**: Roster management enforces slot-based positions without bench/reserves. Total roster: 14 hitters + 9 pitchers = 23 players per team. OGBA uses `CM` for corner-man and a single `P` pitcher pool; the frontend must not display fantasy-team codes or split OGBA roster slots into `SP`/`RP` or `LF`/`CF`/`RF`.

**Consequences**:
- Simpler roster validation — just check slot counts
- MI (Middle Infield) eligible = 2B or SS; CM (Corner-man) eligible = 1B or 3B
- Position eligibility is derived from current-year, prior-year, and rookie-primary rules; the full roster matcher is the final authority for add/drop, IL stash, and IL activation legality
- Player tables may show MLB team abbreviations, but league/team UI must show full fantasy team names

## ADR-011: Unified Planning Data

**Context**: Separate roadmap, TODO, and task docs drifted apart. The user-facing product needs micro todos and macro roadmap items to agree.

**Decision**: `server/data/planning.json` is the active source of truth for both planning levels. `categories[].tasks` holds micro todos. `roadmap[]` holds macro product themes. A micro task that supports a macro roadmap item should include `roadmapLink`.

**Consequences**:
- Do not recreate `TODO.md`, `server/data/todo-tasks.json`, or `docs/ROADMAP.md`
- Keep docs/plans as rationale/proposals, not as the active todo list
- Keep docs/solutions as postmortems/learnings, not as current task status
- In-app Admin/Roadmap views should render from the unified planning data

---

## ADR-012: Waiver Wire List uses two independent ranked lists, not paired claims

**Context (2026-05-06)**: Building a Waiver Wire List feature — owner-curated, ranked instructions that the commissioner runs on waiver day. The first design proposal had each row pair an ADD with a specific DROP (drop only fires if the matching add succeeds). Mid-spec the PM revised: the two lists are independent — a successful Add consumes the *next pending* Drop top-down, a failed Add doesn't consume anything, and excess successful Adds beyond the Drop list length get a SKIPPED outcome.

**Decision**: Model the feature as `WaiverPeriod` (one row per league per waiver run) with two child collections: `WaiverAddEntry` and `WaiverDropEntry`. Each child carries its own priority, its own status enum, and its own constraints. Outcome attribution lives on `WaiverAddEntry.consumedDropEntryId` (1:1, `@unique`); a Drop's `status` field (PENDING/CONSUMED/UNUSED) is stored explicitly rather than derived via reverse-join.

The legacy `WaiverClaim` model (paired-claim style, drives the existing `/api/waivers/process` engine) is **not modified**. Wire List is a parallel feature; the two coexist until the legacy auto-engine is retired.

**Consequences**:
- Two separate API surfaces (`POST /api/waivers/periods/:id/add-entries`, same for `drop-entries`) instead of one combined CRUD. Each has its own validation and uniqueness rules.
- "Acquired this period" hard block (rule: a player added in this period cannot be on the same period's Drop List) reuses `Roster.acquiredAt > WaiverPeriod.createdAt` — no new column needed. Trade-in eligibility falls out for free since trades update `Roster.acquiredAt`.
- The polymorphic-table alternative (one `WaiverEntry` table with a `type` discriminator) was considered and rejected: Add and Drop have different column shapes (only Drop has `dropMode`), and every query would need a `WHERE type=…` filter for no offsetting benefit.
- The "execution outcome" of a waiver run lives entirely in `WaiverAddEntry.outcome` + `WaiverAddEntry.consumedDropEntryId` + `WaiverDropEntry.status`. No separate `WaiverRun` event-log model required for MVP — the post-run results report renders directly from these tables.
- Hardcoded OGBA rules (NL-only filter, no add cap, no drop cap, drop after add prohibition) live in the API layer; structuring for a future per-league override is a server-side concern, not a schema concern.
- Schema and migration shipped in PR #256 with empty tables — no risk to legacy `WaiverClaim`. CI guardrail in PR #251 enforces the migration policy that protects this and future waiver-related schema work.

---

## ADR-013: Stat Attribution is Ownership-Window; Scoring is Period-by-Period Roto Accumulated (2026-06-04)

**Context**: An audit comparing FBST standings against OnRoto (FanGraphs-powered) revealed systematic stat gaps that required root-cause explanation. OnRoto credits each team with their current-roster members' full-season YTD stats (drop a player → stats vanish; pick someone up → get their entire season instantly). FBST attributed stats using end-of-period owner semantics in `computeWithPeriodStats` (whoever holds the player at period end gets the full PSP row). The audit surfaced concrete examples: Tanner Scott (The Show acquired him May 17, OnRoto credited all pre-acquisition saves to The Show; FBST correctly didn't), Zac Gallen (dropped by RGing after Period 2 — FBST kept his P1+P2 K, OnRoto wiped them). Both systems diverged from what the league intended.

The audit also confirmed OGBA's scoring model: scoring periods are discrete windows (Period 1: Mar 25–Apr 18; Period 2: Apr 19–May 16; Period 3: May 17–Jun 6; …), each scored as an independent roto contest. Points from each period accumulate into the season total. This is NOT pure YTD roto (which OnRoto uses as its display format).

**Decision**:

1. **Stat attribution is ownership-window.** A player's stats count for your team only on the days the player was actually on your roster.
   - Pre-acquisition stats → do not count for the acquiring team
   - Post-drop stats → do not count for the dropping team
   - Player dropped mid-period with no pickup → stats for that period go to nobody (correct; neither team earned them)

2. **`computeWithDailyStats` (via `clampToPeriod`) is the authoritative path** for correct attribution. It splits daily stat rows (`PlayerStatsDaily`) by exact ownership window.

3. **`computeWithPeriodStats` (end-of-period owner + full PSP row) is permitted only as a performance optimization** when all transactions in the period are confirmed to be boundary-aligned (i.e., `releasedAt` and `acquiredAt` values fall exactly on `period.startDate` or `period.endDate`). If any mid-period add+pickup occurs, `computeWithPeriodStats` MUST NOT be used for that period — it would over-credit the acquiring team with pre-acquisition production.

4. **OnRoto is a display reference, not the scoring authority.** Expected divergence between FBST and OnRoto is intentional. The learnable heuristic: if FBST > OnRoto for a team, that team dropped a contributing player. If FBST < OnRoto, that team picked up a player with pre-acquisition production. Neither is wrong; they answer different questions.

5. **Scoring is period-by-period roto accumulated.** OGBA season points = Σ(period N points) across all periods. Each period is scored independently as a roto contest (10 categories × 8 teams, 1–8 points per category per period). Max per period = 80 pts; season totals are in the 100–200+ range, not 0–80.

**Consequences**:

- `computeWithPeriodStats` carries a code comment warning against use if mid-period transactions have occurred. Any code touching stat computation must check whether mid-period pickups exist before choosing the path.
- `computeWithDailyStats` is the correct default for any period with transactions; `computeWithPeriodStats` is a cache-friendly optimization only for clean boundary-aligned periods.
- The three audit scripts added in `server/src/scripts/` (`audit_period.ts`, `find_mid_period_trades.ts`, `spot_check_team.ts`) are the standard tooling for detecting attribution anomalies.
- A pending todo (#260, below) tracks fixing `computeTeamStatsFromDb` to route through `computeWithDailyStats` automatically whenever a mid-period transaction is detected.
- Documented in `docs/solutions/logic-errors/onroto-vs-fbst-stat-attribution-semantics.md`.

## ADR-014: Stats Integrity — Continuous Reconciliation Against the Official MLB Record (2026-06-10)

**Status**: Accepted

**Context**: Every stats-correctness bug found by the June 2026 OnRoto audit was *silent*. P1's `PlayerStatsPeriod` rows carried April 19's games (a stale boundary at last sync) for seven weeks; the stale `TeamStatsPeriod` cache misdisplayed two periods; the daily-path regression drifted P3 off FanGraphs — none of it alerted. Tests prevent *known* failure modes; nothing protected against unknown ones. Stats correctness is the product's core promise: closed-period stats are FINAL and identical across the MLB Stats API, FanGraphs, and Baseball Reference. Any persistent closed-period divergence is therefore a TFL-side defect — never "lag" (lag applies only to the active period).

**Decision**:

1. **Closed periods are continuously reconciled against the official MLB record.** A daily job (14:00 UTC, after the morning sync) re-fetches each recently closed period's stats through the SAME fetch/parse path the syncer uses and diffs against stored PSP rows on the standings-driving fields.
2. **Drift auto-heals, persistent drift alerts.** Mismatch → re-run `syncPeriodStats` under the period's current boundaries → re-verify. Still mismatched → `logger.error` + admin error buffer entry (`ERR-recon-p{id}`). Healed and clean outcomes are logged for the audit trail.
3. **The reconciler and syncer share one fetch/parse implementation** (`fetchFreshPeriodStats`). A reconciler with its own fetch logic would eventually diverge from the syncer and report phantom drift — the same disease that made `audit_period.ts` untrustworthy.
4. **Any edit to a period's start/end dates must be followed by a re-sync of that period** (`POST /api/admin/sync-stats {periodId}`). The reconciliation window (default 5 days post-close) backstops forgotten re-syncs and late MLB stat corrections; boundary edits to long-closed periods still require the manual call.
5. **Manual diagnostics**: `POST /api/admin/reconcile-period {periodId}` (read-only diff report) or with no body (run the auto-healing sweep).

**Consequences**:
- Silent drift on closed periods is now bounded to ~24 hours across all leagues, sports, and seasons — the mechanism is league-agnostic and source-keyed (player external id + date range), not OGBA-specific.
- The MLB API fetch cost is one batch-hydrate pass per recently-closed period per day — negligible.
- Two-way (Ohtani) pre-split rows are reconciled via the same in-memory mirror transform the syncer applies, so they cannot false-alarm.
- Origin: audit report `docs/reports/onroto-audit-2026-06-08.md` Sections 5–7; todo #287; solutions doc `docs/solutions/logic-errors/closed-period-psp-frozen-with-stale-boundary.md`.

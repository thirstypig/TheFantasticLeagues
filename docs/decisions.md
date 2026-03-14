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

## ADR-004: CSV-Based Standings Computation

**Context**: Period and season standings need to be computed from player statistics. Two options: (1) pre-compute and store in DB tables, (2) compute on-the-fly from source data.

**Decision**: Compute standings on-the-fly from CSV data (`ogba_player_period_totals_2025.csv`). `TeamStatsPeriod` and `TeamStatsSeason` DB tables exist but are seeded with zeros — not used for display.

**Consequences**:
- Always accurate — no stale cache issues
- CSV is the single source of truth for stats
- Slightly slower on each request, but acceptable for current scale (8 teams, 6 periods, ~840 player rows)
- Future: may migrate to DB-backed computation if performance becomes an issue

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

**Decision**: Roster management enforces slot-based positions without bench/reserves. Total roster: 14 hitters + 9 pitchers = 23 players per team.

**Consequences**:
- Simpler roster validation — just check slot counts
- MI (Middle Infield) eligible = 2B or SS; CI (Corner Infield) eligible = 1B or 3B
- Position eligibility based on games played (10+ games at position) — deferred for future implementation
- `isCIEligible()` and `isMIEligible()` helpers in `baseballUtils.ts`

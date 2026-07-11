---
title: "Phase 1: Polish & Foundation — Sidebar, Mobile Nav, Code Review, Empty States, Public Pages"
type: feat
status: active
date: 2026-03-24
deepened: 2026-03-24
origin: docs/plans/CPLAN-saas-vision.md
---

# Phase 1: Polish & Foundation

> Sessions 40–45 | Make the existing product SaaS-ready for baseball auction/roto leagues

## Enhancement Summary

**Deepened on:** 2026-03-24
**Sections enhanced:** All 6 workstreams
**Research agents used:** 8 (sidebar nav, mobile bottom nav, empty states, onboarding wizard, security-sentinel, performance-oracle, architecture-strategist, code-simplicity-reviewer, kieran-typescript-reviewer)

### Key Improvements from Deepening
1. **Scope reduced ~40%** — cut nav config extraction (YAGNI), MoreSheet component (reuse sidebar), wizard (single form), onboarding tour (cut entirely)
2. **P1 Performance** — add `React.lazy` code splitting for all non-critical routes; Mermaid.js (~250KB) currently in main bundle
3. **P1 Security** — trade budget validation missing (negative budgets possible), public league endpoint leaks full User model
4. **P1 TypeScript** — BottomNav has prefix collision bug; insights history uses `as any` on Prisma JSON
5. **Accessibility** — `aria-current="page"`, `aria-expanded`, skip-nav link, route change announcer
6. **iOS Mobile** — `viewport-fit=cover` meta tag required, hide nav on keyboard open, `100svh` for layouts

### Critical Simplification Decisions
- **Nav config**: Keep inline array in AppShell (don't extract to `navigation.ts` — YAGNI until SaaS tiers exist)
- **MoreSheet**: Cut. "More" tab opens existing sidebar drawer (zero new components)
- **League wizard**: Single form with sections, not a 3-step wizard
- **Onboarding tour**: Cut from Phase 1. Good empty states with CTAs ARE the onboarding
- **Public pages**: Not optional stretch — create minimal `PublicLayout` for unauthenticated visitors

---

## Overview

Phase 1 transforms FBST from a single-league internal tool into a polished product ready for external users. Five workstreams run across ~5 sessions:

1. **Code review fixes** — 14 findings from Session 39 (1 P1, 8 P2, 5 P3) + new security findings
2. **Sidebar + mobile nav** — reorganize sidebar sections, add BottomNav for mobile, extract sidebar from AppShell
3. **Empty states** — shared component + contextual CTAs for every page
4. **Public pages + code splitting** — Changelog/Roadmap/Status public, `React.lazy` for all routes
5. **Self-service league creation** — single-form creation page (not wizard)

## Problem Statement / Motivation

FBST has 19 feature modules, 730 tests, 8 AI features, and a best-in-class auction engine. But several UX gaps block external adoption:

- **Navigation is overwhelming** — 4 collapsible sections, 15+ items, Dev pages hidden behind admin
- **Mobile is hamburger-only** — no persistent bottom nav. Every competitive sports app uses bottom tabs
- **Empty states are text-only** — 18+ ad-hoc implementations, no CTAs, no illustrations
- **Dev pages are admin-locked** — Changelog, Roadmap, Status build trust but only admins can see them
- **No self-service** — admin creates leagues manually
- **No code splitting** — Mermaid.js (~250KB gzipped) and all 19 feature modules in a single bundle
- **14+ code review findings** — including data correctness bugs and auth gaps

---

## Technical Approach

### Workstream 1: Code Review Fixes + New Security Findings (Session 40)

Resolve all 14 existing findings plus 3 new high-priority security findings discovered during deepening.

#### 1A: Quick Wins (6 items, ~15 minutes)

| # | ID | Fix | File | LOC |
|---|-----|-----|------|-----|
| 1 | 076 | Add `requireLeagueMember("leagueId")` to vote POST middleware | `server/src/features/mlb-feed/routes.ts:411` | 1 |
| 2 | 078 | Add `isPitcher as isPitcherPos` to static import, remove dynamic import | `server/src/features/auction/routes.ts:11,1777` | 2 |
| 3 | 080 | Delete unused `nonKeepers` variable | `server/src/features/mlb-feed/routes.ts:346` | 1 |
| 4 | 082 | Add `toast("Vote failed", "error")` to catch block | `client/src/pages/Home.tsx:501` | 1 |
| 5 | 083 | Replace `isPP` alias with `isPitcherPos` directly | `server/src/services/aiAnalysisService.ts:502,1052` | 2 |
| 6 | 084 | Delete stale comment | `server/src/services/aiAnalysisService.ts:469` | 1 |

#### 1B: P1 Data Correctness (1 item, ~10 minutes)

**075 — Add "CL" to client `isPitcher`, both `PITCHER_CODES`, and `positionToSlots`**

```typescript
// client/src/lib/sportConfig.ts — PITCHER_CODES + isPitcher
export const PITCHER_CODES = ["P", "SP", "RP", "CL", "TWP"] as const;
// isPitcher string branch: add || s === "CL"

// Both client & server positionToSlots — add CL mapping
case "CL": return ["P"];

// server/src/lib/sportConfig.ts — PITCHER_CODES
export const PITCHER_CODES = ["P", "SP", "RP", "CL", "TWP"] as const;
```

#### 1C: Remaining P2 (4 items, ~30 minutes)

| # | ID | Fix | Effort |
|---|-----|-----|--------|
| 7 | 077 | Wrap vote update in `prisma.$transaction` with `SELECT ... FOR UPDATE` | Small |
| 8 | 079 | Lift `handleVote` from IIFE to component scope | Small |
| 9 | 081 | Define `LeagueRulesPartial` and `DigestData` interfaces, replace `as any` | Small |
| 10 | 088 | Define `LeagueDigest` interface for Home.tsx state | Medium |

##### Research Insight: Vote Race Condition (Finding 077)

A simple `$transaction` with READ COMMITTED is **NOT sufficient** — both transactions can read the same row before either commits. Use `SELECT ... FOR UPDATE` for pessimistic locking:

```typescript
await prisma.$transaction(async (tx) => {
  const insight = await tx.$queryRaw`
    SELECT id, data FROM "AiInsight" WHERE id = ${insightId} FOR UPDATE
  `;
  const data = insight[0].data as DigestData;
  const votes = data.votes || {};
  votes[String(userId)] = vote;
  await tx.aiInsight.update({
    where: { id: insight[0].id },
    data: { data: { ...data, votes } },
  });
});
```

#### 1D: P3 Cleanup (3 items, ~20 minutes)

| # | ID | Fix | Effort |
|---|-----|-----|--------|
| 11 | 085 | Wrap independent Prisma queries in `Promise.all` (digest endpoint) | Small |
| 12 | 086 | Add `@@index([type, leagueId, weekKey])` to AiInsight model | Small |
| 13 | 087 | Extract `KEEPER_SOURCE` constant + `isKeeperRoster()` predicate | Small |

#### 1E: NEW Security Findings from Deepening (~30 minutes)

| # | Finding | Fix | File | Severity |
|---|---------|-----|------|----------|
| S1 | Trade processing doesn't validate sender budget — negative budgets possible | Add budget check before `decrement`; consider `CHECK (budget >= 0)` DB constraint | `server/src/features/trades/routes.ts:387` | **P1** |
| S2 | Public league endpoint leaks full User model (`owner: true`) | Replace with `owner: { select: { id, name, avatarUrl } }` | `server/src/routes/public.ts:25` | P2 |
| S3 | 4 in-memory caches unbounded — potential OOM | Add `MAX_CACHE_SIZE = 500` eviction, matching auth.ts pattern | trades, auction, waivers, keeper-prep routes | P2 |
| S4 | Invite code only 32 bits entropy (`randomBytes(4)`) | Increase to `randomBytes(16)` + rate limit `/leagues/join` | `server/src/features/leagues/routes.ts:390` | P2 |

#### 1F: Fix `as any` on Insights History Endpoint

The weekly insights history endpoint (built this session) uses `...(row.data as any)`. Parse with Zod schema instead:

```typescript
const teamInsightsDataSchema = z.object({
  insights: z.array(z.object({ category: z.string(), title: z.string(), detail: z.string() })),
  overallGrade: z.string(),
  mode: z.string().optional(),
});

const weeks = insights.map(row => {
  const data = teamInsightsDataSchema.parse(row.data);
  return { weekKey: row.weekKey, generatedAt: row.createdAt.toISOString(), ...data };
});
```

**Acceptance Criteria (Workstream 1):**
- [ ] All 14 original todo files renamed `pending` → `complete`
- [ ] `isPitcher("CL")` returns `true` on both client and server
- [ ] Vote endpoint requires league membership + uses `FOR UPDATE`
- [ ] Trade budget validated before decrement
- [ ] Public league endpoint stripped of sensitive User fields
- [ ] 4 unbounded caches capped at 500
- [ ] Invite code entropy increased to 128 bits
- [ ] Insights history uses Zod parse instead of `as any`
- [ ] All 730+ tests pass, TypeScript clean

---

### Workstream 2: Sidebar Redesign + Mobile Bottom Nav (Session 41, ~4 hours)

#### Research Insights

**Key decisions from deepening research:**

1. **Keep nav inline in AppShell** — the `buildNavSections()` extraction is YAGNI. No second consumer exists. Current inline array with `show: Boolean(user?.isAdmin)` works. Extract only when SaaS tiers or feature flags demand it.

2. **Extract sidebar rendering from AppShell** — AppShell is 504 lines and will grow with BottomNav. Extract the `<aside>` and all sidebar content into `client/src/components/Sidebar.tsx`. AppShell becomes ~150 lines of layout orchestration.

3. **"More" tab reuses existing sidebar drawer** — no new MoreSheet component needed. This is zero new state management and the sidebar already contains everything.

4. **Use NavLink's built-in `className` callback** — don't manually reimplement `isActive` with `useLocation()`. NavLink handles trailing slashes, nested routes, and provides the `end` prop for exact matching.

#### Target Sidebar Structure

Five sections (implemented inline, same pattern as today):

```
CORE (always visible)
├── Home, Season, Players, Auction (season-gated), Activity

AI (collapsible, default open)
├── Draft Report, AI Hub

LEAGUE (collapsible, default closed)
├── Rules, Payouts, Archive, Keepers, Guide, About

MANAGE (collapsible, role-gated)
├── Commissioner (commissioner/admin), Admin (admin only)

PRODUCT (collapsible, NO admin gate)
├── Changelog, Roadmap, Status, Under the Hood (admin only)
```

#### Implementation Steps

**Step 1: Extract Sidebar.tsx from AppShell**

Move the `<aside>` element and all children (logo, league switcher, nav sections, user profile, drag handle) into `client/src/components/Sidebar.tsx`. AppShell passes down props: `width`, `open`, `mobileOpen`, `collapsedSections`, callbacks.

**Step 2: Reorganize nav sections inline**

Update the nav sections array in Sidebar.tsx:
- Rename "Dev" → "Product", remove admin gate from Changelog/Roadmap/Status
- Add "AI" section (default open) with Draft Report and AI Hub
- Move "Keepers" into League section
- `show: false` items are filtered (keep filtering in one place — the render)

**Step 3: localStorage migration**

```typescript
// On component mount, migrate old collapsed-section keys
const stored = localStorage.getItem("fbst-nav-collapsed");
if (stored?.includes('"Dev"')) {
  const migrated = stored.replace('"Dev"', '"Product"');
  localStorage.setItem("fbst-nav-collapsed", migrated);
}
```

**Step 4: Create BottomNav.tsx**

```typescript
// client/src/components/BottomNav.tsx
// 5 tabs: Home, Season, Players, Activity, More
// "More" opens existing sidebar drawer via onMore callback
// Use NavLink with className callback + end prop (NOT manual isActive)
// Height: 56px + env(safe-area-inset-bottom)
// Touch targets: min-h-[44px] min-w-[64px]
// Apply: will-change: transform, contain: layout paint
// Always show labels (not icon-only)
```

**Critical TypeScript fix (from review):** Use NavLink's built-in active detection:

```typescript
// WRONG (plan's original approach — prefix collision bug):
const isActive = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);

// RIGHT:
<NavLink to={tab.to} end={tab.exact}
  className={({ isActive }) => `... ${isActive ? "text-accent" : "text-muted"}`}
/>
```

**Step 5: Integrate BottomNav in AppShell**

- Render `<BottomNav onMore={() => setMobileOpen(true)} />` after `<main>`
- Add `pb-16 lg:pb-0` to main content area
- BottomNav visible only on `lg:hidden`
- When "More" tapped → opens existing sidebar drawer (same as hamburger)

**Step 6: Accessibility**

- Sidebar: `<nav aria-label="Main navigation">`
- BottomNav: `<nav aria-label="Quick navigation">`
- Active links: `aria-current="page"` (NavLink does this automatically)
- Collapsible sections: `aria-expanded` on toggle button, `aria-controls` pointing to content
- Skip-nav link: `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>`
- Route change announcer (optional): `<div role="status" aria-live="polite" className="sr-only">`

**Step 7: iOS/Mobile compliance**

- Verify `<meta name="viewport" content="..., viewport-fit=cover">` in `index.html`
- Bottom nav padding: `padding-bottom: env(safe-area-inset-bottom, 0px)`
- Hide bottom nav when keyboard opens (use `visualViewport` resize detection with 75% height threshold)
- Use `min-height: 100svh` on app shell, not `100vh` or `100dvh`

**Acceptance Criteria (Workstream 2):**
- [ ] Sidebar extracted to `Sidebar.tsx` — AppShell under 200 lines
- [ ] 5 nav sections: Core, AI, League, Manage, Product
- [ ] Product section visible to all authenticated users
- [ ] BottomNav with 5 tabs visible on mobile (< 1024px)
- [ ] "More" opens existing sidebar drawer
- [ ] NavLink with `end` prop for active state (no manual `isActive`)
- [ ] `aria-current="page"`, `aria-expanded`, skip-nav link
- [ ] Touch targets ≥ 44x44px, nav height 56px + safe area
- [ ] Bottom nav hidden when keyboard opens
- [ ] localStorage migration from "Dev" → "Product"

---

### Workstream 3: Empty States (Session 42, ~2 hours)

#### Research Insights

**Key patterns from deepening:**

1. **Discriminated union for action type** — use `kind: "link" | "button"` instead of structural `'to' in action` check
2. **Add `children` prop** — escape hatch for multi-CTA cases (Home "no leagues" needs two buttons)
3. **Don't nest `<a>` inside `<button>`** — use Button's `asChild` pattern or style Link as button
4. **Add `compact` prop** — for inline/card contexts (less padding)
5. **Table empty states keep headers** — put EmptyState inside tbody, not replacing the whole table
6. **Role-aware messaging** — commissioner sees "Create" CTAs, member sees "Waiting for..."

#### EmptyState Component

```typescript
// client/src/components/ui/EmptyState.tsx

type EmptyStateAction =
  | { kind: "link"; label: string; to: string }
  | { kind: "button"; label: string; onClick: () => void };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  children?: React.ReactNode;    // Custom content (overrides action slot)
  compact?: boolean;              // Reduced padding for inline/card contexts
}
```

**Rendering rules:**
- If `children` provided → render children (custom content area)
- Else if `action.kind === "link"` → render `<Link>` styled as button
- Else if `action.kind === "button"` → render `<Button onClick={...}>`
- Icon: `text-[var(--lg-text-muted)]` at 32px, wrapped in tinted box
- Title: `text-[var(--lg-text-primary)]` font-semibold
- Description: `text-[var(--lg-text-muted)]` max-w-xs
- Padding: `py-16` default, `py-8` compact

#### Pages to Update

| Page | Empty State | Role-Aware? |
|------|------------|-------------|
| Season | "Standings appear once the season begins" | No |
| Activity | "No transactions yet — trades, waivers, roster moves appear here" | No |
| Teams list | Commissioner: "Add teams" / Member: "No teams yet" | Yes |
| Trades | "No trade proposals" / CTA: "Propose a trade" | No |
| Archive | Commissioner: "Import from Excel" / Member: "No historical data" | Yes |
| Players search | "No players match your search — try a different name" | No |
| Auction (pre-draft) | Commissioner: "Start the draft" / Member: "Draft hasn't started" | Yes |
| Home (no leagues) | Children: two buttons — "Create a League" + "Join a League" | Yes |

#### Loading → Empty → Populated Transitions

**Explicit state derivation (avoid flash-of-empty-state):**

```typescript
type ViewState = "loading" | "empty" | "populated" | "error";

function deriveViewState(isLoading: boolean, data: unknown[] | undefined): ViewState {
  if (isLoading) return "loading";
  if (!data) return "error";
  if (data.length === 0) return "empty";
  return "populated";
}
```

For tables: keep headers visible across all states. EmptyState renders inside `<tbody>` via `<tr><td colSpan={...}>`.

**Acceptance Criteria (Workstream 3):**
- [ ] `EmptyState` component with discriminated union action, `children`, `compact` props
- [ ] At least 8 pages updated
- [ ] Role-aware CTAs (commissioner vs member) on 3+ pages
- [ ] No nested `<a>` inside `<button>`
- [ ] Table empty states preserve headers
- [ ] Dark and light mode both correct

---

### Workstream 4: Public Pages + Code Splitting (Session 43, ~3 hours)

#### Research Insights — P1 Performance Finding

**Mermaid.js (~250KB gzipped) is in the main bundle.** All 19 feature modules are statically imported in App.tsx. Zero code splitting. Every visitor downloads the entire app including Mermaid, auction engine, archive, commissioner tools — even if they never visit those pages.

**This is the single highest-impact performance fix available.**

#### Step 1: Add React.lazy code splitting to App.tsx

```typescript
// App.tsx — replace static imports with lazy
const Tech = React.lazy(() => import("./pages/Tech"));
const Roadmap = React.lazy(() => import("./pages/Roadmap"));
const Changelog = React.lazy(() => import("./pages/Changelog"));
const Status = React.lazy(() => import("./pages/Status"));
const Commissioner = React.lazy(() => import("./features/commissioner/pages/Commissioner"));
const Admin = React.lazy(() => import("./features/admin/pages/Admin"));
const ArchivePage = React.lazy(() => import("./features/archive/pages/ArchivePage"));
const Auction = React.lazy(() => import("./features/auction/pages/Auction"));
const AuctionResults = React.lazy(() => import("./features/auction/pages/AuctionResults"));
const KeeperSelection = React.lazy(() => import("./features/keeper-prep/pages/KeeperSelection"));

// Keep static: Home, Season, Players, ActivityPage, Login (high-traffic core)
```

Wrap lazy routes in `<Suspense fallback={<LoadingSpinner />}>`.

#### Step 2: Lazy-load Mermaid inside MermaidDiagram.tsx

```typescript
// Dynamic import — only loads when Tech page is visited
useEffect(() => {
  let cancelled = false;
  import("mermaid").then(({ default: mermaid }) => {
    if (cancelled) return;
    mermaid.initialize({ startOnLoad: false, theme: ... });
    mermaid.render(id, chart).then(({ svg }) => { /* ... */ });
  });
  return () => { cancelled = true; };
}, [chart, theme]);
```

**Expected gain:** Removes ~250KB gzipped from initial bundle. Initial load improves 40-60%.

#### Step 3: Remove admin gate from sidebar (handled in Workstream 2)

#### Step 4: Remove in-component admin checks

Check Changelog.tsx, Roadmap.tsx, Status.tsx for internal admin guards. Remove them.

#### Step 5: Create PublicLayout for unauthenticated visitors

**This is NOT optional** (per architecture review). A public page with no chrome looks broken.

```typescript
// client/src/components/PublicLayout.tsx
// Minimal: logo + "Sign In" button + children
// Uses same --lg-* design tokens
// Dark/light mode toggle
```

Add public routes to unauthenticated block in App.tsx:

```tsx
<Route path="/changelog" element={<PublicLayout><Changelog /></PublicLayout>} />
<Route path="/roadmap" element={<PublicLayout><Roadmap /></PublicLayout>} />
<Route path="/status" element={<PublicLayout><Status /></PublicLayout>} />
```

#### Step 6: Sanitize public page content (Security P3)

Before making pages public:
- **Tech.tsx**: Remove exact version numbers, port numbers, line counts. Keep high-level stack description. Remove ERD diagrams from public view (gate behind auth check).
- **Changelog.tsx**: Generalize security-related entries (e.g., "Improved input validation" not "was bypassing via 'as any'")
- **Status.tsx**: Remove internal service names and port numbers

**Acceptance Criteria (Workstream 4):**
- [ ] React.lazy on 8+ non-critical routes (Tech, Commissioner, Admin, Archive, Auction, etc.)
- [ ] Mermaid dynamically imported in MermaidDiagram.tsx
- [ ] Changelog, Roadmap, Status accessible to all authenticated users
- [ ] PublicLayout created for unauthenticated visitors
- [ ] Public pages sanitized of infrastructure details
- [ ] Lighthouse LCP improved (measure before/after)

---

### Workstream 5: Self-Service League Creation (Session 44-45, ~4 hours)

#### Research Insights — Simplification

**Single form, not a wizard.** Yahoo, ESPN, and Sleeper all create leagues in a single page. A 3-step wizard implies step state management, back/forward navigation, and validation per step — significant code for something that happens once per league.

**Must reuse `CommissionerService.createLeague()`** — do not create a parallel service. The only difference from the admin endpoint is the middleware chain.

#### New API Endpoint

`POST /api/leagues` — mounted in `server/src/features/leagues/routes.ts`

```typescript
const createLeagueSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  season: z.number().int().min(1900).max(2100),
  leagueType: z.enum(["NL", "AL", "MIXED"]).default("NL"),
  isPublic: z.boolean().default(false),
}).and(
  z.discriminatedUnion("draftMode", [
    z.object({ draftMode: z.literal("AUCTION") }),
    z.object({ draftMode: z.literal("DRAFT"), draftOrder: z.enum(["SNAKE", "LINEAR"]) }),
  ])
);

// Response type
interface CreateLeagueResponse {
  league: { id: number; name: string; season: number; franchiseId: number };
  inviteCode: string;
}

router.post("/",
  requireAuth,
  validateBody(createLeagueSchema),
  asyncHandler(async (req, res) => {
    // Rate limit: max 5 leagues per user
    const existingCount = await prisma.league.count({
      where: { memberships: { some: { userId: req.user!.id, role: "COMMISSIONER" } } },
    });
    if (existingCount >= 5) {
      return res.status(429).json({ error: "Maximum 5 leagues per user" });
    }

    const league = await commissionerService.createLeague({
      ...req.body,
      creatorUserId: req.user!.id,
    });
    res.json({ league });
  })
);
```

**Critical fix:** Wrap `CommissionerService.createLeague()` internals in `prisma.$transaction()` to prevent orphaned franchises on partial failure.

#### New UI: Single-Form League Creation

`client/src/features/leagues/pages/CreateLeague.tsx`

Single page with visual sections (not wizard steps):
- **League Info**: Name, season year, league type (NL/AL/Mixed)
- **Format**: Draft type (Auction/Snake), scoring (Roto — others future)
- **Invite**: Generated after creation — copy link + invite code + email form

"Recommended" badges on default options. "Show advanced settings" toggle for roster config.

**Route:** `/create-league` — added to App.tsx
**Nav entry:** CTA on Home page when user has no leagues (via EmptyState children)

#### Home Page No-Leagues Empty State

When user has no leagues, Home shows:

```tsx
<EmptyState icon={Trophy} title="Welcome to The Fantastic Leagues">
  <div className="flex gap-3 mt-4">
    <Link to="/create-league"><Button>Create a League</Button></Link>
    <Button variant="outline" onClick={() => setShowJoinModal(true)}>Join a League</Button>
  </div>
</EmptyState>
```

#### Join flow enhancement

Upgrade existing invite code banner on Home to a modal dialog (better UX, more prominent).

**Acceptance Criteria (Workstream 5):**
- [ ] Non-admin users can create leagues via `POST /api/leagues`
- [ ] Reuses `CommissionerService.createLeague()` (no code duplication)
- [ ] Service wrapped in `prisma.$transaction()` for atomicity
- [ ] Per-user league limit (5) enforced
- [ ] Zod discriminated union for draftMode/draftOrder
- [ ] Single-form UI at `/create-league`
- [ ] Home page shows "Create/Join" when user has no leagues
- [ ] Join modal replaces inline banner
- [ ] Update `client/src/api/index.ts` barrel exports

---

## System-Wide Impact

### Interaction Graph
- **Sidebar extraction** touches only AppShell.tsx → new Sidebar.tsx. No other components import sidebar logic.
- **BottomNav** is additive. "More" triggers `setMobileOpen(true)` — same state as hamburger menu.
- **Code splitting** touches only App.tsx imports. Feature modules themselves are unchanged.
- **Empty states** replace inline text in 8+ pages. No cross-component dependencies.
- **League creation** adds a new route in `leagues/routes.ts` calling existing `CommissionerService`.

### Error Propagation
- Vote race condition fix (077) uses `SELECT ... FOR UPDATE` — Prisma raw query errors propagate to route's try/catch.
- Trade budget check throws before the Prisma `decrement` — handler's existing error boundary catches it.
- League creation `$transaction` rollback means no orphaned records — UI shows "Failed, try again."

### State Lifecycle Risks
- **Sidebar localStorage migration**: "Dev" → "Product" key rename on first load.
- **League creation atomicity**: Franchise + League + Membership in single `$transaction`.
- **Code splitting**: Suspense fallback shown during chunk load — need a branded spinner, not a blank page.

### API Surface Parity
- New `POST /api/leagues` follows conventions: `requireAuth`, `validateBody(schema)`, `asyncHandler`.
- No new endpoints needed for sidebar, bottom nav, or empty states (all client-side).

---

## Implementation Phases

### Session 40 (This Session)
- [x] Weekly insights history tabs (done ✅)
- [ ] Code review fixes — all 14 items + new security findings (Workstream 1)
- [ ] Update FEEDBACK.md, CLAUDE.md, docs pages

### Session 41
- [ ] Extract Sidebar.tsx from AppShell (Workstream 2, Step 1)
- [ ] Reorganize nav sections: Core, AI, League, Manage, Product (Step 2)
- [ ] Create BottomNav.tsx with NavLink active detection (Steps 4-5)
- [ ] Accessibility: aria attributes, skip-nav link (Step 6)
- [ ] iOS compliance: viewport-fit, safe area, keyboard detection (Step 7)

### Session 42
- [ ] Empty states — shared EmptyState component (Workstream 3)
- [ ] Update 8+ pages with contextual empty states
- [ ] Role-aware CTAs for commissioner vs member

### Session 43
- [ ] React.lazy code splitting for all non-critical routes (Workstream 4, Step 1)
- [ ] Dynamic Mermaid import (Step 2)
- [ ] PublicLayout + public routes for Changelog/Roadmap/Status (Steps 4-5)
- [ ] Sanitize public page content (Step 6)

### Session 44-45
- [ ] League creation API endpoint (Workstream 5)
- [ ] CommissionerService $transaction wrapping
- [ ] CreateLeague single-form UI
- [ ] Home page no-leagues empty state + join modal
- [ ] Phase 1 QA: dark/light, mobile 390px, desktop
- [ ] Update all docs

---

## Dependencies & Prerequisites

| Dependency | Status | Notes |
|------------|--------|-------|
| Code review findings resolved | Pending | Must complete before sidebar work |
| `viewport-fit=cover` in index.html | Check | Required for iOS safe area insets |
| `DIRECT_URL` env var in Render | Verify | Required for Prisma interactive transactions |
| Prisma schema (AiInsight index) | Pending | Batch with any migration in Phase 1 |

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sidebar extraction breaks existing nav | Medium | High | Extract first, change structure second. Test all links. |
| Bottom nav overlaps content on iOS | Medium | Medium | `pb-16 lg:pb-0`, test on Safari, env(safe-area-inset-bottom) |
| Code splitting causes loading jank | Low | Medium | Branded Suspense fallback spinner, prefetch critical routes |
| League creation abuse | Medium | Medium | Per-user limit (5), global rate limit, increased invite code entropy |
| localStorage migration breaks collapsed sections | Low | Low | Simple string replace on first load, fallback to defaults |
| Public pages leak infrastructure details | Medium | Low | Sanitize before making public |

## Success Metrics

- Initial bundle size reduced 40%+ (measure with `vite build --report`)
- Mobile bottom nav functional on screens < 1024px
- At least 8 pages have proper empty states with CTAs
- Non-admin users can create a league
- All code review findings resolved
- 730+ tests passing
- Visual QA: dark mode, light mode, mobile 390px
- Lighthouse performance score improved (measure before/after code splitting)

## Documentation Plan

After each session:
- [ ] Update `FEEDBACK.md` with session progress
- [ ] Update `CLAUDE.md` if conventions change (EmptyState component, Sidebar extraction)
- [ ] Update `client/src/pages/Tech.tsx` Build Journal
- [ ] Update `client/src/pages/Changelog.tsx`
- [ ] Update `client/src/pages/Roadmap.tsx` item statuses

## Sources & References

### Origin
- **Master plan:** [docs/plans/CPLAN-saas-vision.md](docs/plans/CPLAN-saas-vision.md)
- Key decisions: 5-section nav, "Product" replacing "Dev", AI as its own section

### Internal References
- Sidebar: `client/src/components/AppShell.tsx:147-197`
- Routes: `client/src/App.tsx:56-119`
- iOS solution: `docs/solutions/ui-bugs/ios-viewport-height-and-touch-target-sizing.md`
- Sticky header: `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md`
- CommissionerService: `server/src/features/commissioner/services/CommissionerService.ts`

### Research References (from deepening)
- **Sidebar nav**: shadcn/ui Sidebar compound component pattern, WAI-ARIA Navigation landmarks
- **Mobile bottom nav**: `env(safe-area-inset-bottom)`, `viewport-fit=cover`, `visualViewport` API for keyboard detection, `will-change: transform` + `contain: layout paint`
- **Empty states**: Linear (icon + title + CTA), Stripe (educational), Notion (template-as-onboarding)
- **League creation**: Yahoo (smart defaults + single page), Sleeper (mobile-first cards), Fantrax (templates)
- **Code splitting**: React.lazy + Suspense, Vite automatic chunk splitting, dynamic import for Mermaid

### Review Agent Findings Summary
- **Security**: 3 new P1/P2 findings (trade budget, user model leak, unbounded caches)
- **Performance**: P1 — code splitting needed (Mermaid ~250KB in bundle)
- **Architecture**: P1 — extract Sidebar from AppShell; P2 — PublicLayout not optional
- **Simplicity**: Cut 40% scope (no nav extraction, no MoreSheet, no wizard, no tour)
- **TypeScript**: P1 — use NavLink built-in active detection; P1 — Zod parse on insights history

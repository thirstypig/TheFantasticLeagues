---
id: DOC-030
title: "Four-tab shell (UX Phase 3) — implementation plan"
description: "Replace the ~40-item navigation with four tabs (Today, My Team, Players, League): bottom tabs on phones, a left rail on desktop, a League page that holds everything else, phase-aware draft items, and an admin-only entry for dev pages."
type: plan
status: active
phase: null
owner: james
tags: [design-system, league-admin]
links: [DOC-027]
updated: 2026-11-09
---

# Four-Tab Shell (UX Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner sees exactly four destinations everywhere: **Today · My Team · Players · League**. Phones get a bottom tab bar, desktop gets a left rail. Everything else moves into a League page or behind an admin-only entry. Every route stays reachable by URL.

**Architecture:**
- **One pure navigation model** (`client/src/lib/navModel.ts`) decides the tabs, which tab is active for a path, the League page's sections (gated by season phase, draft mode and role), and the admin link list.
- **Both shells render from that model,** so desktop and mobile can't drift:
  - `AuroraShell`: the desktop top nav becomes a left rail.
  - `MobileShell`: the hamburger drawer becomes a bottom tab bar.
- **A new shared `/league` page** renders the League sections, and `/more` redirects to it.

**Tech Stack:** React 18 + React Router v6, Vitest + RTL.

**Branch base:** this branch stacks on `feat/usc-theme-phase2` (PR #474), because both rewrite `AuroraShell` and `MobileShell`, and #474 already removed their theme toggles. The PR targets `feat/usc-theme-phase2`. **Retarget it to `main` after #474 merges, before merging this one** (memory: stacked squash-merge).

**Spec:** `docs/superpowers/specs/2026-11-09-ux-simplification-design.md` (DOC-027), section "Navigation: 4 tabs" and Phase 3. The approved mockup is `navigation.html` from the brainstorm (4 tabs, with the hidden items struck through).

## Global Constraints

- **Tabs, in this order:** `Today` → `/`, `My Team` → `/teams/:myTeamCode` (or `/teams` when the user has no team), `Players` → `/players`, `League` → `/league`. Phase 4 builds the real Today page; until then `/` keeps today's Home.
- **League holds:** Standings (`/season`), Teams (`/teams`), Activity / trades (`/activity`), Rules (`/rules`), Payouts (`/payouts`) and Archive (`/archive`). It also holds Matchup (`/matchup`) only for H2H leagues, and **Commissioner** (`/commissioner/:leagueId`) only for the commissioner role or an admin.
- **Phase-aware draft items:**
  - **Auction** (`/auction`): only when `draftMode === "AUCTION"` and `gating.canAuction`.
  - **Auction results** (`/auction-results`) and **Auction values** (`/auction-values`): only when `draftMode === "AUCTION"` and `gating.canViewAuctionResults`.
  - **Snake draft** (`/draft`) and **Draft report** (`/draft-report`): only when `draftMode === "DRAFT"`, and only while `seasonStatus === "DRAFT"` (draft) or after it (report).
  - **Keepers** (`/leagues/:leagueId/keepers`): only when `gating.canKeepers`.
- **Hidden from owners.** These are still routed, but linked only from the admin-only entry:
  - AI (`/ai`), Analytics, Weekly Report
  - Board, Community
  - NBA (`/nba`), NFL (`/nfl`); the MLB/NFL/NBA switcher is removed
  - Concepts, Roadmap, Todo, Docs, Under the Hood (`/tech`), Status, Changelog
  - Admin Users, Admin Reports
- **The account menu holds:** Profile (`/profile`), Help & Guide (`/guide`), About (`/about`), **Admin** (`/admin`, admins only) and Sign out.
  - Desktop: at the bottom of the rail.
  - Mobile: an avatar button in the top bar that opens a sheet.
- **Mobile constraints.**
  - The bottom bar has 4 equal tap targets, each ≥ 44 × 44px, and respects `env(safe-area-inset-bottom)`.
  - The active tab uses `--am-accent`. Tab labels may be 12px, as a standard tab-bar exception; all other new text is ≥ 16px.
  - Page content gets bottom padding so the bar never covers it.
- **No pop-up modals.** The mobile account menu is a bottom sheet (the allowed exception). Desktop uses the existing popover pattern.
- **Every previously linked route still works by URL. No route is deleted.**
- **Colors:** `--am-*` tokens only. No new cross-feature imports (`node scripts/check-feature-isolation.mjs`: only the 2 pre-existing server violations, which #473 fixes).
- Run `npm run docs:refresh` before push, and never commit `docs/under-the-hood/system-status.md`.

## Review Focus

1. **The wrong tab lights up on deep pages.** `/teams/OTHER` (someone else's team) is League, not My Team. `/teams/:myTeamCode/wire-list` is My Team. `/players/:mlbId` is Players. `/commissioner/5/money` is League. Task 1 tests each.
2. **Owner with no team, or a brand-new league.** `myTeamCode` null: the My Team tab goes to `/teams`, nothing crashes, and Today is still active on `/`. Task 1 tests it.
3. **The commissioner loses their link.** The Commissioner entry must appear for the COMMISSIONER role and for admins, and never for plain owners. Task 1 tests all three.
4. **Content hidden behind the bottom bar on phones.** The last row of a long table or the save bar must stay reachable. Task 3 tests that the shell's content wrapper reserves bottom space. Task 6 checks it in the browser on a long page.
5. **Draft items in the wrong phase.** Auction shows during IN_SEASON, or Keepers after the draft. Task 1 tests every gating combination listed above.

---

### Task 1: Navigation model

**Files:**
- Create: `client/src/lib/navModel.ts`
- Test: `client/src/lib/__tests__/navModel.test.ts`

**Interfaces:**
- Produces:
  - `type PrimaryTabKey = "today" | "myTeam" | "players" | "league"`
  - `buildPrimaryTabs(args: { myTeamCode: string | null | undefined }): { key: PrimaryTabKey; label: string; to: string }[]`. Exactly 4, in spec order.
  - `activeTabFor(pathname: string, myTeamCode: string | null | undefined): PrimaryTabKey | null`
  - `type NavLink = { to: string; label: string }`
  - `buildLeagueSections(args: { leagueId: number | null; draftMode: "AUCTION" | "DRAFT" | null | undefined; seasonStatus: string | null | undefined; canAuction: boolean; canViewAuctionResults: boolean; canKeepers: boolean; isH2H: boolean; canAccessCommissioner: boolean }): { title: string; links: NavLink[] }[]`
    - Sections, in this order: `"League"` (Standings, Teams, Activity, Matchup if H2H), `"Draft"` (only the phase-aware items that apply; omit the section when empty), `"Rules & money"` (Rules, Payouts, Archive), `"Commissioner"` (only if `canAccessCommissioner` and `leagueId`).
  - `ADMIN_LINKS: NavLink[]`: the hidden list from Global Constraints, plus `/admin/users` and `/admin/reports`.
  - `ACCOUNT_LINKS(isAdmin: boolean): NavLink[]`: Profile, Help & Guide, About, plus Admin when `isAdmin`.
- **League prefixes for `activeTabFor`:** `/league`, `/more`, `/season`, `/activity`, `/trades`, `/transactions`, `/teams` (except the user's own team), `/rules`, `/payouts`, `/archive`, `/matchup`, `/commissioner`, `/auction`, `/draft`, `/leagues/`, `/period`.
- `activeTabFor` returns `null` for paths that belong to no tab (`/profile`, `/admin`, hidden pages).

- [ ] **Step 1: Write the failing tests.** Cover every Review Focus 1, 2, 3 and 5 case as a named `it`.
  - `activeTabFor("/teams/LDY/wire-list","LDY") === "myTeam"`
  - `activeTabFor("/teams/SKD","LDY") === "league"`
  - `activeTabFor("/players/660271", "LDY") === "players"`
  - `activeTabFor("/commissioner/5/money", null) === "league"`
  - `activeTabFor("/profile", "LDY") === null`
  - `buildPrimaryTabs({ myTeamCode: null })[1].to === "/teams"`
  - The Commissioner section is present for `canAccessCommissioner: true` and absent for `false`.
  - IN_SEASON with an AUCTION league (`canAuction` false, `canViewAuctionResults` true) → the Draft section has Auction results and values but not Auction. SETUP + `canKeepers` → Keepers present. A DRAFT-mode league during DRAFT → Snake draft present. No Draft items → no Draft section.
  - `ADMIN_LINKS` includes `/ai` and `/nba`, and `buildLeagueSections` output never includes `/ai`, `/board`, `/nba`, `/nfl` or `/weekly-report`.
- [ ] **Step 2:** `cd client && npx vitest run src/lib/__tests__/navModel.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement as pure functions with no React imports.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(nav): four-tab navigation model`.

---

### Task 2: League page (`/league`) and the admin entry list

**Files:**
- Create: `client/src/pages/League.tsx` (app-level page, shared by both shells)
- Modify: `client/src/App.tsx`. Add `<Route path="/league" element={<League />} />`, and route `/more` to `<Navigate to="/league" replace />`.
- Modify: `client/src/mobile/MobileShell.tsx`. Remove the `/more` → `MobileMore` substitution in `pickMobilePage`. Leave the `MobileMore.tsx` file in place; it becomes unused, and its deletion is noted in the report.
- Modify: `client/src/features/admin/pages/Admin.tsx`. Add a "Hidden pages" card that renders `ADMIN_LINKS` as links.
- Test: `client/src/pages/__tests__/League.test.tsx`, plus extending the Admin page test (or creating `features/admin/__tests__/AdminHiddenPages.test.tsx`).

**Interfaces:**
- Consumes: `buildLeagueSections`, `ADMIN_LINKS` (Task 1); `useLeague()` from `client/src/contexts/LeagueContext.tsx` for `leagueId`; `useSeasonGating()`; the role/admin check that `AuroraShell` uses today for `canAccessCommissioner` (move that logic into a hook in `client/src/hooks/` if it isn't one, and import it from both shells and this page).
- Produces: `/league` renders each section as a card with full-width link rows (≥ 48px, 16px text, chevron). The page heading is "League".

- [ ] **Step 1: Write the failing tests:**
  - An owner (not commissioner) in an IN_SEASON auction league sees Standings, Teams, Activity, Rules, Payouts, Archive, Auction results and Auction values, and no Commissioner or Auction.
  - A commissioner sees the Commissioner row linking to `/commissioner/<leagueId>`.
  - `/more` navigates to `/league`.
  - The Admin page lists `/ai` and `/tech`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS. Then run the full client suite.
- [ ] **Step 5:** Commit: `feat(nav): League page and admin hidden-pages list`.

---

### Task 3: Mobile shell: bottom tab bar, avatar menu, no drawer

**Files:**
- Modify: `client/src/mobile/MobileTabBar.tsx`. Rebuild it as a fixed bottom bar rendering `buildPrimaryTabs` with `activeTabFor` (`aria-current="page"` on the active tab). Keep the existing `data-testid` / `data-tab-key` attribute names, with values switched to the new tab keys.
- Modify: `client/src/mobile/MobileShell.tsx`.
  - Remove the hamburger drawer and its overlay.
  - The top bar becomes: page title (center) + avatar button (right, `aria-label="Account"`) that opens a ConfirmSheet-style bottom sheet listing `ACCOUNT_LINKS(isAdmin)` and "Sign out". Reuse the existing sign-out handler.
  - Wrap the content in an element with `data-testid="mobile-content"` and `padding-bottom: calc(64px + env(safe-area-inset-bottom))`.
- Test: update `client/src/mobile/__tests__/MobileShell.test.tsx` and the tab bar test.

**Interfaces:**
- Consumes: `buildPrimaryTabs`, `activeTabFor`, `ACCOUNT_LINKS` (Task 1).

- [ ] **Step 1: Write and adjust the failing tests:**
  - The bottom bar shows exactly Today, My Team, Players, League.
  - On `/teams/SKD` (not my team), League is `aria-current="page"`.
  - No element has `aria-label="Open navigation menu"`.
  - The Account button opens a sheet with Profile, Help & Guide and About. For an admin it also has Admin.
  - `mobile-content` has a non-zero `padding-bottom` (Review Focus 4).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run, then run the full client suite. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(nav): mobile bottom tab bar and account sheet`.

---

### Task 4: Desktop shell: left rail

**Files:**
- Modify: `client/src/components/aurora/AuroraShell.tsx`.
  - Replace the top nav (the sport switcher, the primary items and the grouped "More" dropdown, ~lines 85–160 and the header ~186–300) with a left rail about 220px wide.
  - The rail has the app name, the 4 tabs from `buildPrimaryTabs` (active via `activeTabFor`, `aria-current="page"`), a flexible spacer, then an account button at the bottom. The button opens the existing popover pattern, listing `ACCOUNT_LINKS(isAdmin)` plus Sign out.
  - Keep the existing league/season selector, either at the top of the rail or in a slim header in the content column, whichever matches the current component more simply. Say which in the report.
  - The content column flexes to fill.
- Test: update the AuroraShell tests, including `AuroraShell.theme.test.tsx` from Phase 2 if it is on main (it is not, so ignore it).

**Interfaces:**
- Consumes: Task 1, plus the commissioner/admin hook from Task 2.

- [ ] **Step 1: Write and adjust the failing tests:**
  - The rail has exactly 4 tab links, in spec order.
  - No "MLB" / "NFL" / "NBA" / "AI" / "Board" link is rendered.
  - The account popover lists Admin only for admins.
  - On `/season`, League is `aria-current="page"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run, then run the full client suite. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(nav): desktop left rail with four tabs`.

---

### Task 5: Every-page browser check at phone and desktop width, then PR

Owner: the controller. Use the local setup from memory `local_browser_check_setup`. For phone width, if `resize_window` doesn't take effect (the window is maximized), ask James to un-maximize Chrome, or use the DevTools device toolbar.

- [ ] **Step 1:** Run the full server and client suites, `tsc` (full-log count), and `check-feature-isolation`.
- [ ] **Step 2: Browser pass** at 440 × 956 and 1440 × 900.
  - Each tab lands on the right page and highlights correctly. Check these deep links: `/teams/<mine>/wire-list`, `/teams/<other>`, `/players/<id>`, `/commissioner/<id>`, `/season`.
  - The League page shows the right sections for the seeded commissioner.
  - The account menu works and Sign out works.
  - `/more` redirects to `/league`.
  - Hidden pages still open by URL (`/ai`, `/board`, `/nba`).
  - The last row of `/players` is reachable above the bottom bar.
  - Check in both Light and Dark. The theme comes from the #474 base.
- [ ] **Step 3:** Fix findings through one implementer dispatch, then run one scoped re-review.
- [ ] **Step 4:** `npm run docs:refresh`, commit, push `feat/four-tab-shell-phase3`, and open the PR against `main`. Open it against `feat/usc-theme-phase2` (stacked), and say in the body that it must be retargeted to `main` after #474 merges.

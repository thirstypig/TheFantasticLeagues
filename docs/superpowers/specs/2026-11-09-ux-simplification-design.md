---
id: DOC-027
title: "UX simplification — commissioner hub, 4-tab shell, USC theme, Today page"
description: "Design for simplifying FBST for non-technical owners and the commissioner: guided commissioner jobs, a 4-tab mobile-first shell, a medium-tone USC light/dark theme, and a Today landing page."
type: tech-spec
status: active
phase: null
owner: james
tags: [design-system, league-admin, roster]
links: [DOC-001]
updated: 2026-11-09
---

# UX simplification — design

Brainstormed with James on 2026-11-09 (mockups in `.superpowers/brainstorm/27287-1794239536/content/`, not committed).

## Why

James's read: "there might be too much on the tool." The evidence backs that up. The desktop and mobile shells have about **40 navigation labels**. The commissioner page is **one 1,863-line screen with 6 tabs, each with sub-tabs** (`client/src/features/commissioner/pages/Commissioner.tsx`). The owners in OGBA are not all tech-savvy, and most of them check on a phone.

Real money is involved (entry fees, IL fees, payouts). The commissioner's busiest moment, closing a period, currently has a hidden side effect: setting a period to `completed` silently enqueues IL-fee billing (`server/src/features/periods/routes.ts`, `PATCH /:id` → `enqueueIlFeeReconcile`).

## Who it serves

1. **The typical owner.** Not tech-savvy, on a phone. Comes to answer "where do I stand, and do I need to do anything?", fix their lineup, and add/drop players.
2. **The commissioner (James).** Uses the app a few times per period for period close, roster fixes, trades and money.

## Goals

- An owner gets their answer with **zero taps** on opening the app.
- Every commissioner chore is a **named job with a guided page**, not a hunt through tabs.
- A theme that is comfortable for long viewing in **both** modes: medium tones, no pure white, no near-black.
- Mobile-first at **iPhone 16 Pro Max (440 × 956 pt)**, and still correct on desktop.
- Feature-module isolation (ADR-015) gets better, never worse.

## Non-goals

- New scoring, roster or transaction behavior. This is presentation and flow only, with these exceptions, all decided by James:
  - The close-period flow exposes the existing fee dry-run.
  - The flow offers "close, bill later."
  - The flow becomes the only UI path that closes a period.
- Rewriting the internals of the existing commissioner panels. They get **re-homed** into routes, not rebuilt.
- Undo for commissioner actions. "Recent changes" is a read-only log in v1 (my call; undo on money and roster paths needs its own design).
- Deleting AI, Board or multi-sport code. These are **hidden**, not removed.

## Anti-goals: a failure even if it "works"

- Closing a period bills fees the commissioner didn't see first.
- A non-tech owner taps Back and loses a half-finished action. This is why multi-step flows must be routes, not modals.
- The new theme fails text contrast anywhere (WCAG AA: 4.5:1 text, 3:1 for buttons and controls against their surface).
- New cross-feature imports appear.

## Decisions James made

### Interaction rules (app-wide)
- **No pop-up modals** (James: "if best practices do NOT use pop up modals - we should not use them either"). Allowed exceptions:
  - A small confirm before an irreversible or money-moving action (a bottom sheet on mobile).
  - A player-card peek (a side panel on desktop, a bottom sheet on mobile).
  - Auth.
- Multi-step flows are **routes**, with a URL and a working Back button. Small edits expand inline. Success messages are toasts.
- Pages reached from a list must **restore the list's scroll position and filters** on Back.
- Mirror Yahoo Fantasy where it fits roto (existing rule, `feedback_yahoo_copy_no_modals`).

### Theme: "USC," medium tones (James picked the 2nd recommendation)

| Token role | Light ("Trojan Gold") | Dark ("Cardinal") |
|---|---|---|
| Page background | `#e0d3ae` | `#3a1f22` |
| Card / surface | `#ece2c6` | `#4a2a2e` |
| Border | `#c9b98c` | `#6a3d42` |
| Text | `#15171a` | `#f6f7f4` |
| Secondary text | `#33373b` | `#dde1dc` |
| Primary button / link / active tab | USC Cardinal `#990000`, label `#ffffff` | USC Gold `#FFCC00`, label `#2a1a00` |
| Warning | amber `#5e3400` | amber `#f8db9c` |

- **Red never means "warning";** warnings are amber.
- **In dark mode, cards are lighter than the page.** This fixes the current inversion (`--am-bg #3d434b` behind `--am-surface #222630`).
- **Measured contrast** (on cards):
  - Light: text 13.9:1, secondary 9.3:1, button vs card 6.9:1, label on button 8.9:1.
  - Dark: text 11.8:1, secondary 9.6:1, button 8.4:1, label 11.1:1.
- **Positive/negative stat colors** (`--am-positive` / `--am-negative`) are left to the builder, but must pass 4.5:1 on both surfaces, and negative must not use the brand cardinal.
- **The theme follows the OS setting** (`prefers-color-scheme`), with a manual override in Profile. This replaces the header toggle.
- **Colors only.** No USC logo or marks.

### Navigation: 4 tabs
**Today · My Team · Players · League.** These are a bottom tab bar on mobile (< 768px, inside `MobileLayoutGate`) and a left rail on desktop.

| Tab | Holds |
|---|---|
| Today | Your rank and trend, a "Needs you" list, tonight's players, and the top of the standings with a "see all" link |
| My Team | The existing v3 roster hub (unchanged behavior) |
| Players | Search, add/drop, Wire List |
| League | Standings (full), other teams, trades, activity, rules, payouts; Auction/Keepers/Draft only while that phase is active; **Commissioner (commissioner role only)** |

**Hidden from owners** (still reachable by URL; links behind an admin-only entry):
- AI features (James: "tuck the ai feature for now")
- Analytics, Weekly Report
- Board / Community
- The NFL / NBA / MLB switcher
- Concepts, Roadmap, Todo, Docs, Under the Hood, Status, Changelog
- Pricing: this lives on the www site

### Mobile sizing
- Minimum 16px body text and 44 × 44pt tap targets.
- Primary verification size: 440 × 956 (iPhone 16 Pro Max), both modes.

## Commissioner hub (build first: James said "lets start with this")

Mockup: `commissioner.html`.

**Location:** League → Commissioner, at `/commissioner/:leagueId`. Only visible to the commissioner role.

**The hub page has three cards:**
1. **Needs you:** items that need action, each linking to the job that fixes it. In v1:
   - The active period has ended → Close a period.
   - Today is on or after the next period's start date and it isn't active yet → Start next period. This item is urgent: a late start misdates owners' moves.
   - Any roster is illegal under the enforced roster rules → Fix a roster.
   - Pending items that need commissioner action, if that concept exists in the trades module. The builder verifies; if there's no approval step, omit the item rather than invent one.
2. **Jobs:** seven rows, each its own route.

   | Job | Route (suggested) | Re-homes today's |
   |---|---|---|
   | Close a period | `/commissioner/:leagueId/close/:periodId` | SeasonManager period controls |
   | Start next period | `/commissioner/:leagueId/start/:periodId` | SeasonManager status → active |
   | Fix a roster | `/commissioner/:leagueId/rosters` | Operations → roster / bulk / ghost-IL (`CommissionerRosterTool`, `BulkOpsPanel`) |
   | Trades | `/commissioner/:leagueId/trades` | Operations → trades (`CommissionerTradeTool`) |
   | Money | `/commissioner/:leagueId/money` | Finances tab (entry fees, ledger, payouts, balances) |
   | League settings & rules | `/commissioner/:leagueId/settings` | Settings tab + existing `/scoring` and `/wire-list` routes |
   | Owners & invites | `/commissioner/:leagueId/owners` | Teams & People tab |

   Overview, LeagueHealthTab and Archive move into the hub or Settings as the builder sees fit. Nothing currently reachable may become unreachable.
3. **Recent changes:** a read-only feed of commissioner actions from the existing audit log.

**Close a period: a five-step guided route.** Nothing is final until step 5. Each step is a screen (or a `?step=` state with real history entries, so Back works).
1. **Final stats are in:** last game date and last sync time for the period.
2. **Rosters check out:** roster legality for every team across the period.
3. **Preview standings:** period points computed but not locked, labeled "not final."
4. **Review fees:** the IL fees this close *would* bill, per team, **before** anything is enqueued. Two choices (James, 2026-11-09):
   - **"Close & bill now"** (default).
   - **"Close, bill later."** This closes the period without enqueuing billing. The commissioner bills later through the existing `POST /api/commissioner/:leagueId/reconcile-il-fees/:periodId`. A "Needs you" item reminds them while any closed period is unbilled.
5. **Close the period:** a confirm bottom sheet ("you can't undo this"), then the close itself. It does **not** start the next period; that's its own job, below. Finishes with a success toast and an audit entry.

**Server change this requires:** the period-close endpoint must support closing with or without enqueuing billing. Today `PATCH /api/periods/:id {status:"completed"}` always enqueues. Whatever the mechanism (a flag on the PATCH, or a dedicated close endpoint), it must be commissioner-only, written to the audit log, and tested both ways.

**The guided flow is the only UI path that closes a period (James).** Remove `completed` from SeasonManager's status dropdown. If the raw PATCH stays callable for scripts, it keeps today's bill-on-close behavior.

**Start next period: a one-step job.**
- Shows the period's start date.
- Warns if any roster moves are dated after the start date while it was still pending. Those moves were misdated; link to Fix a roster.
- If no `pending` next period exists, the page says so and links to Settings → periods. It does not invent one.
- Confirm bottom sheet, then `PATCH {status:"active"}` and an audit entry.

**Step 4's fee preview already exists.** `reconcileIlFeesForPeriod(..., { dryRun: true })` in `server/src/features/transactions/services/ilFeeService.ts` returns the exact ledger rows it *would* write, from the same function the drainer bills with. Expose it read-only to the hub. Do not write a second fee calculation.

**Step 2 "Rosters check out" in v1 = current-state checks only** (my call; checking legality across the whole period would mean rebuilding history from `RosterSlotEvent`, which is a separate project):
- roster size versus the cap
- ghost-IL (the existing `/ghost-il`)
- whatever the existing `/health` endpoint reports

The same checks drive the "Needs you → Fix a roster" item. If a thin read-only aggregation endpoint is needed, it lives in the commissioner module and calls through `server/src/lib/`, not into `transactions/`.

**Trades:** the commissioner step already exists. `ACCEPTED` trades wait on `POST /api/trades/:id/process`, and that is the "Needs you" item.

**Recent changes (my call):** v1 reads the existing `AuditLog` with no migration. League scope follows a metadata convention (`leagueId` in the existing JSON/metadata field) for **new** writes. The Phase 1 flow adds audit writes for period close and next-period start through the existing `writeAuditLog`. Older rows that can't be league-scoped are simply not shown. No schema change (this repo has frozen prod twice on migrations).

**Constraints specific to this phase:**
- **Fix the existing ADR-015 violation first:** `server/src/features/commissioner/services/CommissionerService.ts` imports `../../transactions/lib/positionInherit.js`. Promote `positionInherit` to `server/src/lib/` (this also fixes the same import in `trades/routes.ts`). After that, `node scripts/check-feature-isolation.mjs` should exit 0.
- **The hub uses the existing `--am-*` tokens,** so it picks up the theme automatically when Phase 2 lands. No hard-coded colors.
- **Prod writes need James.** The flow must be verified on local/staging data. A real period close on prod is James's action.

## Phases (each its own plan and PR)

1. **Commissioner hub + close-period flow:** the ADR-015 fix and re-homing the existing panels into routes. No visual theme change.
2. **USC theme:**
   - Replace the light and dark `--am-*` values in `client/src/components/aurora/aurora.css`.
   - Switch to OS-driven theme plus the Profile override.
   - Browser-check every routed page in both modes. This touches every page, so it gets its own PR and a page-by-page checklist.
3. **4-tab shell:**
   - Bottom tabs on mobile and a left rail on desktop.
   - Hide the items listed above.
   - Phase-aware Auction/Keepers/Draft.
   - Admin-only entry for dev pages.
4. **Today page:** the new landing route, built from existing data (standings, roster status / IL alerts, today's games, pending trades).

## Left to the builder

- Exact route shapes, and whether the close-period steps are sub-routes or `?step=`, as long as Back works.
- Icons; the rail vs. tabs breakpoint details above 768px.
- How to persist list scroll and filters (URL params preferred).
- Positive/negative stat colors within the contrast rule.
- Where Overview, League Health and Archive land, as long as nothing becomes unreachable.

## Verification (every phase)

- `npm run test`, server and client `tsc`, `node scripts/check-feature-isolation.mjs` (exit 0 from Phase 1 on), and `npm run docs:refresh` before push.
- Browser verification at 440 × 956 and desktop, in light **and** dark, on every page the phase touches. Phase 2 covers every routed page.
- Phase 1: walk the full close-period flow on non-prod data, and confirm step 4's preview equals what the drainer actually bills for the same period.

---
id: DOC-031
title: "Today page (UX Phase 4) — implementation plan"
description: "Replace Home and MobileHome with one Today page: rank and trend, owner Needs-you list, tonight's players, top-5 standings."
type: plan
status: active
phase: null
owner: james
tags: [design-system]
links: [DOC-027, DOC-030]
updated: 2026-11-09
---

# Today Page (UX Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` becomes the Today page on phone and desktop. It answers "where do I stand, do I need to do anything, who plays tonight, how's the race" with zero taps, and it replaces `pages/Home.tsx` and `mobile/pages/MobileHome.tsx`.

**Architecture:**
- All derivation lives in one pure module (`todayModel.ts`) with exhaustive unit tests.
- One hook (`useTodayData`) loads six existing endpoints in parallel. Each fails soft: a failed source hides its own section and nothing else.
- One `TodayPage` component renders in both shells. It uses a single column below 1024px and two columns at or above it.
- The page lives in `client/src/pages/today/`. `pages/` is app level, not a feature module, so importing feature API clients from it is allowed under ADR-015.

**Tech Stack:** React 18, React Router v6, TypeScript strict, Vitest + Testing Library, `--am-*` tokens in `client/src/components/aurora/aurora.css`.

**Spec:** `docs/superpowers/specs/2026-11-09-ux-simplification-design.md` (DOC-027): "Navigation: 4 tabs" (Today row) and Phase 4.
- The spec file is on branch `feat/commissioner-hub-phase1` (PR #473) and not on this branch. Read it with `git show origin/feat/commissioner-hub-phase1:docs/superpowers/specs/2026-11-09-ux-simplification-design.md`.
- The approved mockup is `.superpowers/brainstorm/81243-1794281175/content/today-v1.html` (gitignored, local only).

**Base branch:** `feat/today-page-phase4`, cut from `feat/four-tab-shell-phase3` (PR #475). It stacks on #475 → #474.

## Global Constraints

- No pop-up modals. Every Needs-you row is a link to the page that fixes it. No inline accept/reject on Today.
- Minimum 16px body text. Tap targets at least 44×44px.
- Primary verification size is 440×956, light **and** dark. Desktop is verified too.
- Colors come only from `--am-*` tokens. No hex literals in new files. Text on an accent fill uses `--am-on-accent`.
- Red never means warning: warning rows use the amber tokens. The negative trend uses `--am-negative`, never the accent.
- No new server endpoints and no schema changes. This phase is presentation only.
- No ad slot. News feeds, historical insights, league activity, depth chart and quick links are **not** on Today. Their components stay on disk, and only Home's use of them goes away.
- ADR-015: `node scripts/check-feature-isolation.mjs` shows no new violations. Only the 2 known server violations, which #473 fixes, may appear.
- Copy is American English, sentence case, and plain words for non-tech owners.

## Review Focus

1. **No team in this league** (`myTeamId == null`, e.g. the commissioner or an admin browsing): the rank card shows "You're not on a team in this league", and Needs-you and Tonight are hidden. Standings still render. Owned by Task 3 test `renders standings only when the user has no team`.
2. **Ties in total points**: two teams on 58.5 both rank 3rd, the next team is 5th, and the gap line says "tied with <team>". Owned by Task 1 test `ties share a rank and the gap says tied`.
3. **A trade the user proposed** must not appear as "Trade offer from …". Only PROPOSED trades where `acceptingTeamId === myTeamId` count. Owned by Task 1 test `ignores trades the user proposed`.
4. **One endpoint fails** (e.g. statsapi down, so my-players-today returns 500): Tonight hides, and rank, Needs-you and standings still render. No error toast. Owned by Task 2 test `a failed source leaves the others intact`.
5. **Between periods or off-season** (no period with status `active`): the header has no "days left", the rank card label reads "Final · 3rd of 8", and Tonight is hidden. Owned by Task 1 test `periodHeader returns null without an active period` and Task 3 test `hides tonight without an active period`.

---

## File structure

| File | Responsibility |
|---|---|
| `client/src/pages/today/todayModel.ts` (create) | Pure derivations: standings normalize/rank, rank summary, standings preview, owner Needs-you, period header, tonight ordering |
| `client/src/pages/today/__tests__/todayModel.test.ts` (create) | Unit tests for the above |
| `client/src/pages/today/api.ts` (create) | `getMyPlayersToday(leagueId)` client wrapper + `MyPlayerToday` type |
| `client/src/pages/today/useTodayData.ts` (create) | Parallel fail-soft loading of the five sources |
| `client/src/pages/today/__tests__/useTodayData.test.tsx` (create) | URL + fail-soft tests |
| `client/src/pages/today/TodayPage.tsx` (create) | Page composition + layout |
| `client/src/pages/today/sections.tsx` (create) | `RankCard`, `NeedsYouCard`, `TonightCard`, `StandingsPreviewCard` |
| `client/src/pages/today/today.css` (create) | Layout + section styles, tokens only |
| `client/src/pages/today/__tests__/TodayPage.test.tsx` (create) | Render tests per state |
| `client/src/App.tsx`, `client/src/mobile/MobileShell.tsx` (modify) | `/` → `TodayPage` in both shells |
| `client/src/pages/Home.tsx`, `client/src/mobile/pages/MobileHome.tsx` + their tests (delete) | Replaced |

---

### Task 1: Pure Today model

**Files:**
- Create: `client/src/pages/today/todayModel.ts`
- Test: `client/src/pages/today/__tests__/todayModel.test.ts`

**Interfaces:**
- Consumes:
  - `RosterAlertPlayer` from `client/src/components/shared/RosterAlertAccordion.tsx`. Its `position` is the assigned slot, e.g. `"IL"`, `"BN"`, `"OF"`.
  - `TradeProposal` from `client/src/features/trades/api.ts`, which has `status`, `acceptingTeamId`, `proposingTeam`, `items`.
  - `WaiverPeriod` from `client/src/features/wire-list/api.ts`, which has `status: "PENDING"|"LOCKED"|…` and `deadlineAt` (an ISO string).
  - `PeriodInfo` from `client/src/features/periods/api.ts`, which has `name`, `startDate`, `endDate`, `status`.
  - `MyPlayerToday` from Task 2's `api.ts`. Define that type in this task's file instead and have Task 2 re-export it (see Produces).
- Produces (all exported from `todayModel.ts`):
  ```ts
  export interface TodayStandingsRow { teamId: number; teamName: string; teamCode?: string; totalPoints: number; periodPoints: number[]; }
  export interface RankedRow extends TodayStandingsRow { rank: number; }
  export function normalizeStandings(res: { periodIds?: number[]; rows?: unknown[] }): TodayStandingsRow[];
  export function rankRows(rows: TodayStandingsRow[], pick?: (r: TodayStandingsRow) => number): RankedRow[];
  export interface RankSummary { rank: number; teamCount: number; totalPoints: number;
    trend: number | null; trendSince: string | null;
    gap: { kind: "behind" | "ahead" | "tied"; points: number; teamName: string } | null; }
  export function summarizeRank(rows: TodayStandingsRow[], myTeamId: number | null, periodNames: string[]): RankSummary | null;
  export function standingsPreview(rows: TodayStandingsRow[], myTeamId: number | null, top?: number): { top: RankedRow[]; mine: RankedRow | null };
  export type NeedsYouKind = "il-in-lineup" | "ghost-il" | "trade-offer" | "wire-deadline";
  export interface OwnerNeedsYouItem { key: string; kind: NeedsYouKind; title: string; detail: string; to: string; cta: "Fix" | "Review" | "Open"; counts: boolean; }
  export function deriveOwnerNeedsYou(i: { roster: RosterAlertPlayer[]; trades: TradeProposal[]; wirePeriod: WaiverPeriod | null; myTeamId: number | null; myTeamCode: string | null; now: Date }): OwnerNeedsYouItem[];
  export function periodHeader(periods: PeriodInfo[], now: Date): { name: string; label: string } | null;
  export interface MyPlayerToday { playerName: string; mlbId: number; mlbTeam: string; posPrimary?: string; gameTime: string; opponent: string; homeAway: "home" | "away"; gameStatus?: "PRE" | "LIVE" | "FINAL"; gameStateDesc?: string; line?: { hitting?: { AB: number; H: number; R: number; HR: number; RBI: number; SB: number; BB?: number; SO?: number }; pitching?: { IP: number; H: number; R: number; ER: number; BB: number; K: number } }; }
  export function orderTonight(players: MyPlayerToday[], shown?: number): { shown: MyPlayerToday[]; more: number };
  export function formatLine(p: MyPlayerToday): string | null;
  ```

Rules the implementer cannot infer:
- **`normalizeStandings`**: move the row narrowing from `client/src/pages/Home.tsx:107-127` (it reads `periodPoints[]`, falling back to `P{periodId}` columns, and `totalPoints = sum`), sorted by total descending.
- **`rankRows`**: competition ranking, so rank = 1 + the number of rows with a strictly greater value. `pick` defaults to `r => r.totalPoints`.
- **`summarizeRank`**:
  - Returns null when `myTeamId` isn't in `rows`.
  - `trend` = (rank computed on the sum of `periodPoints` excluding the last element) − (current rank). Positive means moved up.
  - `trend` is null when there are fewer than 2 periods. `trendSince = periodNames[periodNames.length - 2]`.
  - `gap`, when rank > 1: the nearest team with strictly more points; kind "behind", points = their total − mine.
  - `gap`, when another team has an equal total: kind "tied" with that team, points 0. Tied wins over behind/ahead.
  - `gap`, when rank === 1 and untied: the 2nd-place team, kind "ahead". Null for a 1-team league.
  - Round points to one decimal.
- **`standingsPreview`**: `top` is the first `top` (default 5) ranked rows. `mine` is the user's ranked row only when it isn't in `top`.
- **`deriveOwnerNeedsYou`** returns items in this order:
  1. **il-in-lineup**: `isInjured && position not in ["IL","BN",""]`.
     - title `"<playerName> is on the IL but still in your lineup"`, detail `"He won't score while on the IL"`.
     - to `/teams/<myTeamCode>`, cta "Fix", counts true.
  2. **ghost-il**: `position === "IL" && !isInjured && mlbStatus === "Active"`.
     - title `"<playerName> is back from the IL"`, detail `"Move him back into your lineup"`.
     - to `/teams/<myTeamCode>`, cta "Fix", counts true.
  3. **trade-offer**: `status === "PROPOSED" && acceptingTeamId === myTeamId`.
     - title `"Trade offer from <proposingTeam.name>"`, detail is the first item's player name(s) if present, else `"Tap to review"`.
     - to `/activity?tab=trades`, cta "Review", counts true.
  4. **wire-deadline**: `wirePeriod.status === "PENDING"` and `0 < deadlineAt − now ≤ 48h`.
     - title `"Wire List locks <weekday> <h:mm AM/PM>"`, formatted in the viewer's local time.
     - detail `"Review your claims before it locks"`, to `/teams/<myTeamCode>/wire-list`, cta "Open", counts **false**.
  - Returns `[]` when `myTeamId` or `myTeamCode` is null.
- **`periodHeader`**: finds the period with `status === "active"`.
  - Days left = whole calendar days from today (local date) to `endDate` (date part).
  - label: `"<n> days left"`, `"1 day left"`, or `"last day"` when n ≤ 0.
  - Returns null when there's no active period.
- **`orderTonight`**: sort LIVE first, then PRE by `gameTime` ascending, then FINAL. `shown` defaults to 4. `more` = remaining count.
- **`formatLine`**: hitters → `"<H>-<AB>"` plus `", <n> HR"`, `", <n> RBI"`, `", <n> SB"` for each nonzero, e.g. "1-1, HR" when n = 1. Write the stat without a count when n = 1: `"1-1, HR"`, `"2-4, 2 RBI"`. Pitchers → `"<IP> IP, <ER> ER, <K> K"`. Null when there's no line.

- [ ] **Step 1: Write the failing tests**, one `it` per rule above. Names:
  - `ranks by total and ties share a rank`
  - `ties share a rank and the gap says tied`
  - `trend compares against totals before the last period`
  - `no trend with a single period`
  - `leader shows the gap ahead of 2nd`
  - `returns null rank when the user has no team`
  - `preview adds the user's row below the top 5`
  - `preview omits mine when the user is in the top 5`
  - `flags an injured player in an active slot`
  - `does not flag an injured player already in the IL slot or bench`
  - `flags a player back from the IL still in the IL slot`
  - `flags trade offers sent to the user`
  - `ignores trades the user proposed`
  - `wire deadline appears within 48 hours and does not count`
  - `wire deadline hidden beyond 48 hours or after it passes`
  - `orders needs-you items il, ghost, trade, wire`
  - `periodHeader labels days left, 1 day left and last day`
  - `periodHeader returns null without an active period`
  - `orderTonight puts live first then upcoming by time then final`
  - `formatLine formats hitters and pitchers`

  Fixtures must use the real API shapes: `RosterAlertPlayer` with all fields, and `TradeProposal` with `acceptingTeamId` and `proposingTeam: { id, name }`. Use a fixed `now` (e.g. `new Date("2026-06-14T18:00:00")`).
- [ ] **Step 2: Run** `cd client && npx vitest run src/pages/today/__tests__/todayModel.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `todayModel.ts` per the signatures and rules above.
- [ ] **Step 4: Run** the same command. Expected: PASS, every test.
- [ ] **Step 5: Commit** `feat(today): pure model for rank, needs-you, tonight and standings preview`.

### Task 2: API wrapper and fail-soft data hook

**Files:**
- Create: `client/src/pages/today/api.ts`, `client/src/pages/today/useTodayData.ts`
- Test: `client/src/pages/today/__tests__/useTodayData.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `MyPlayerToday`, `normalizeStandings`, `TodayStandingsRow`.
  - Existing clients:
    - `getSeasonStandings(leagueId)` from `client/src/features/players/api.ts`, which hits `GET /api/standings/season?leagueId=` and is cached per league.
    - `getTrades(leagueId, { status: "PROPOSED", limit: 20 })` from `features/trades/api.ts`.
    - `getActivePeriod(leagueId)` from `features/wire-list/api.ts`.
    - `getPeriods(leagueId)` from `features/periods/api.ts`.
    - The roster-status fetch: call `fetchJsonApi(`${API_BASE}/mlb/roster-status?leagueId=${leagueId}`)` directly, the same URL `useRosterStatus` uses. Don't nest that hook, so this hook owns all loading state.
- Produces:
  ```ts
  // api.ts
  export type { MyPlayerToday } from "./todayModel";
  export function getMyPlayersToday(leagueId: number): Promise<{ players: MyPlayerToday[] }>; // GET `${API_BASE}/mlb/my-players-today?leagueId=<id>`
  // useTodayData.ts
  type Source<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };
  export interface TodayData {
    standings: Source<{ rows: TodayStandingsRow[]; periodNames: string[] }>;
    roster: Source<RosterAlertPlayer[]>;
    trades: Source<TradeProposal[]>;
    wirePeriod: Source<WaiverPeriod | null>;
    periods: Source<PeriodInfo[]>;
    tonight: Source<MyPlayerToday[]>;
  }
  export function useTodayData(leagueId: number | null, hasTeam: boolean): TodayData;
  ```
- **Loading rules:**
  - When `hasTeam` is false, `roster`, `trades`, `wirePeriod` and `tonight` are never fetched and stay `{status:"ok", data: []/null}`.
  - Every source catches its own failure and becomes `{status:"error"}`. Nothing calls `reportError` or shows a toast.
  - Ignore results after unmount or a league change, using a canceled flag.

- [ ] **Step 1: Write failing tests.** Mock `fetchJsonApi` from `client/src/api/base` and assert on the **URLs requested**, not only on returned data (see memory `feedback_mock_cannot_catch_wrong_query`).
  - `requests the six sources with the league id`: assert the exact URL strings include `/mlb/my-players-today?leagueId=5`, `/mlb/roster-status?leagueId=5`, `/trades?leagueId=5&status=PROPOSED&limit=20`, `/periods?leagueId=5`, `/wire-list/periods/active?leagueId=5`, and the season standings URL.
  - `a failed source leaves the others intact`: my-players-today rejects, so `tonight.status === "error"` and the rest are `"ok"`.
  - `skips team-only sources when the user has no team`: only standings and periods are requested.
- [ ] **Step 2: Run** `cd client && npx vitest run src/pages/today/__tests__/useTodayData.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `api.ts` and `useTodayData.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(today): fail-soft data hook and my-players-today client`.

### Task 3: TodayPage and sections

**Files:**
- Create: `client/src/pages/today/TodayPage.tsx`, `client/src/pages/today/sections.tsx`, `client/src/pages/today/today.css`
- Test: `client/src/pages/today/__tests__/TodayPage.test.tsx`

**Interfaces:**
- Consumes:
  - `useTodayData` (Task 2).
  - Every Task 1 function.
  - `useLeague()` → `{ leagueId, currentLeagueName, currentSeason, myTeamId, myTeamCode }` from `client/src/contexts/LeagueContext.tsx`.
- Produces: `export default function TodayPage(): JSX.Element` (also named export `TodayPage`).

**Layout and copy (from the approved mockup `today-v1.html`):**
- **Header:**
  - H1 "Today".
  - Subline joined by " · ": desktop prefixes `currentLeagueName currentSeason`, then `periodHeader.name`, then `periodHeader.label`, then today's date (e.g. "Sun Jun 14").
  - The phone header has no avatar, because the MobileShell top bar from Phase 3 owns account access.
- **Rank card:**
  - Big text "You're <ordinal>" (e.g. "You're 3rd").
  - Trend:
    - `▲ <n> since <trendSince>` in `--am-positive`.
    - `▼ <n> since <trendSince>` in `--am-negative`.
    - `Same as <trendSince>` in secondary text when 0.
    - Omitted when null.
  - Meta line `"<totalPoints> pts · <gap>"`, where gap is one of:
    - `"<pts> behind <team> (<ordinal rank-1>)"`
    - `"<pts> ahead of <team> (2nd)"`
    - `"tied with <team>"`
  - With no active period: big text `"Final · <ordinal> of <teamCount>"`.
  - No team: `"You're not on a team in this league"`.
- **Needs you:**
  - Heading "Needs you (<count of counts:true>)". Drop the parenthetical when the count is 0.
  - Each row is a `<Link>` to `item.to`. The whole row is the tap target, at least 56px tall.
  - The icon chip is amber (`--am-warning` text) for il-in-lineup and ghost-il, neutral otherwise.
  - The CTA is an accent-filled pill for "Fix" (label `--am-on-accent`) and accent text for "Review"/"Open".
  - Empty state: one line, "✓ Nothing needs you. Your lineup is set."
  - Hidden entirely when there's no team.
  - When `roster` or `trades` errored and the list is empty, show "Couldn't check your roster right now." instead of the all-clear. Never claim all clear on missing data.
- **Tonight:**
  - Heading "Tonight" with right link "All <n> ›" to `/teams/<myTeamCode>`.
  - Each row: name + `posPrimary`; secondary line `"<mlbTeam> vs|@ <opponent> · <formatLine or gameStateDesc>"`.
  - Right chip: `gameStateDesc`, styled as accent-filled "LIVE <desc>" when LIVE.
  - Footer `"<more> more playing"` when more > 0.
  - Empty list: "No games for your players today."
  - Hidden when there's no team, no active period, or `tonight` errored.
- **Standings:**
  - Heading "Standings" with right link "See all ›" (desktop: "See all & by category ›") to `/season`.
  - Rows: rank, team name, total. The user's row gets a token-based highlight (e.g. `--am-bg` fill inside the card; no hex) and " (you)".
  - When `mine` is set, render a thin separator, then the user's row.
  - Desktop shows all ranked rows (`top = rows.length`). The phone shows top 5.
- **Layout:**
  - Below 1024px: one column in the order header, rank, needs you, tonight, standings.
  - At or above 1024px: a two-column grid (1.25fr / 1fr). Left: rank, needs you, tonight. Right: standings.
  - Use `useMediaQuery("(min-width: 1024px)")` from `client/src/hooks/useMediaQuery.ts` only for the top-N choice. Do the layout in CSS.
- **Loading:** each section shows a skeleton block (token-colored, `aria-busy`) until its source settles.
- Body text is 16px minimum and tap targets are 44px minimum.

- [ ] **Step 1: Write failing render tests.** Mock `useTodayData` and `useLeague`, and wrap in `MemoryRouter`. Tests:
  - `shows rank, trend and gap for an owner`: "You're 3rd", "▲ 2 since Period 7", "2.5 behind Demolition (2nd)".
  - `needs-you rows link to the fixing page`: the Soto row has an href of `/teams/LD`, and the trade row `/activity?tab=trades`.
  - `shows the all-clear line when nothing needs the user`.
  - `does not claim all clear when the roster check failed`.
  - `renders standings only when the user has no team`.
  - `hides tonight without an active period` (the rank card shows "Final · 3rd of 8").
  - `tonight shows live first and the more count`.
  - `standings highlight the user and add their row below the top 5`.
  - `has no ad, news or activity sections`: `queryByText(/League activity|News|Depth Chart/i)` is null.
- [ ] **Step 2: Run** `cd client && npx vitest run src/pages/today/__tests__/TodayPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the page, sections and CSS. Every class used must have its CSS in the same commit (memory `feedback_class_hook_without_css`).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(today): Today page with rank, needs-you, tonight and standings`.

### Task 4: Route `/` to Today in both shells; retire Home

**Files:**
- Modify:
  - `client/src/App.tsx`: the `<Route path="/" element={<Home />} />` at about line 156, plus the `Home` import.
  - `client/src/mobile/MobileShell.tsx`: `pickMobilePage`, `if (pathname === "/") return <MobileHome />;`, plus the import.
- Delete:
  - `client/src/pages/Home.tsx`
  - `client/src/pages/__tests__/Home.test.tsx`
  - `client/src/mobile/pages/MobileHome.tsx`
  - `client/src/mobile/__tests__/MobileHome.test.tsx`
- Modify: any doc listing those test files (grep `docs/` for `Home.test.tsx` and `MobileHome.test.tsx`, e.g. `docs/TESTING.md`). Also fix the stale `MobileMore.test.tsx` line there, a Phase 3 follow-up.

**Interfaces:**
- Consumes: `TodayPage` (Task 3).
- **Before deleting**, grep for every import of `pages/Home` and `MobileHome`. Only `App.tsx`, `MobileShell.tsx` and the two tests may reference them. Keep `pages/components/MyTeamTodayPanel.tsx`, `pages/home/types.ts`, `NewsFeedsPanel`, `HistoricalInsightsTab`, the depth-chart code and `AdUnit` on disk. Only Home's use of them goes away.

- [ ] **Step 1: Write the failing test.** Add to the existing MobileShell test file, or create `client/src/mobile/__tests__/MobileShell.today.test.tsx`: `renders TodayPage at /`, rendering the shell at `/` and asserting heading "Today". Add the same for desktop if an App routing test exists. Otherwise, a test rendering the `/` route element is enough.
- [ ] **Step 2: Run it.** Expected: FAIL (MobileHome renders).
- [ ] **Step 3: Swap both routes and delete the four files.** Run `grep -rn "pages/Home\b\|MobileHome" client/src` and expect no hits.
- [ ] **Step 4: Run the full client suite**, `cd client && npx vitest run`, then `npx tsc --noEmit -p client` with the full output (no `tail`). Then `node scripts/check-feature-isolation.mjs`. Expected:
  - All tests pass.
  - 0 tsc errors.
  - Isolation shows only the 2 known server violations.
- [ ] **Step 5: Commit** `feat(today): route / to the Today page and retire Home and MobileHome`.

### Task 5: Browser verification (controller runs this)

Follow memory `local_browser_check_setup`: Colima, local Supabase, process-env keys, seeded league 5, and the 440px same-origin iframe for phone width.

- [ ] Phone (440px), light and dark, as `commish@fbst.test`:
  - Rank card numbers match `/season` totals.
  - Needs-you rows open the right pages, and Back returns to Today.
  - The Tonight section renders, or its empty state does (local statsapi data depends on the date).
  - The last standings row clears the tab bar.
- [ ] Desktop (1920): two columns and full standings.
- [ ] Seed one injured-in-lineup player and one PROPOSED trade addressed to the test user's team on the **local** DB. Confirm both rows appear and the count says 2. Remove the seed rows afterward.
- [ ] No console errors. `npm run docs:refresh` before push. Never commit `docs/under-the-hood/system-status.md`.

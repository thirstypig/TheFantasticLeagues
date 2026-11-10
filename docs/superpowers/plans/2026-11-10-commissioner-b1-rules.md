---
id: DOC-034
title: "Commissioner B1 — Rules as switches and server enforcement (UX step B1) — implementation plan"
description: "Trade-window rule enforced on the server, innings check at period close, rules lock loophole closed, new Rules screen, and the step-A auth revert."
type: plan
status: active
phase: null
owner: james
tags: [league-admin, transactions]
links: [DOC-032, DOC-027]
updated: 2026-11-10
---

# Commissioner B1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the commissioner a Rules screen where the rules that can change are switches and the rest show as locked for the season. Enforce a new "When trades are allowed" rule on the server. Flag teams under the innings minimum at period close. Close the loophole that lets locked rules be changed.

**Architecture:**
- **Rules** stay one `LeagueRule` row per key. The new key `transactions.trade_window` joins `DEFAULT_RULES`, and `getRules` backfills any missing default rows for existing leagues.
- **Trade timing** is a shared server helper in `server/src/lib/tradeWindow.ts`, called by the propose and accept trade routes.
- **The innings check** is computed by the standings route the close page already calls, which now also returns each team's innings and the league minimum. The client flags teams under the minimum.
- **The Rules screen** is a new commissioner page that reads and writes through the existing rules API.

**Tech Stack:** React 18, Vite, Vitest + Testing Library, Express, Prisma, supertest-style route tests (follow existing server test patterns).

**Spec:** the approved step B review draft (https://claude.ai/artifact/6efBpbW8tZ7oxjstL9xRGL) plus the Style Bible screen 2 (https://claude.ai/artifact/UDWjhsrCsDKxovbSjkyPXc#screens). The binding decisions are copied into Global Constraints below. James approved the draft on 2026-11-10.

## Global Constraints

- **Worktree:** `/Users/jameschang/Projects/thefantasticleagues/tfl-step-b1`, branch `feat/commissioner-b1`, based on origin/main `ca335ed6`. node_modules are symlinked: never `npm install`, never commit node_modules.
- **No schema change and no migration.** Rules are rows in the existing `LeagueRule` table.
- **The new rule:**

  | Field | Value |
  |---|---|
  | category | `"transactions"` |
  | key | `"trade_window"` |
  | value | `"anytime"` or `"meeting_day"` |
  | default | `"anytime"`, so leagues that don't set it are unchanged |
  | label | `"When trades are allowed"` |

  The transactions category is already editable at any time (`MUTABLE_ANY_TIME_CATEGORIES`).
- **"Meeting day" means between periods:** no `Period` for the league has `status === "active"`. While a period is active and the rule is `meeting_day`:
  - Proposing a trade (`POST /api/trades`) and accepting one (`POST /api/trades/:id/accept`) are refused with HTTP **409** and `{ error: "Trades open at the next meeting, after <period.name> closes." }`.
  - Processing (`/:id/process`), veto, reject, cancel, reverse and the commissioner's `execute-trade` are **never** blocked.
- **Innings check:** a team is flagged when its period innings are below the `scoring.min_innings` rule (OGBA 50). The flag never blocks closing and never penalizes anyone. Leagues without the rule flag nothing. Innings display in thirds, e.g. `46⅓`, `50`, `49⅔`. The stored IP is a true decimal (`46.333…`).
- **Lock rule (same as `updateRules` today):** any change to a rule outside `transactions` is refused when any league rule `isLocked` OR any season for the league has a status other than `SETUP`. Messages: `"Rules are locked for this season"` / `"Rules cannot be changed after season setup."`.
- **Style:**
  - Font sizes only 13/15/17/24/32. The `textSizeSweep` test enforces this.
  - Colors only from `--am-*` tokens.
  - Inputs, pickers and segmented controls use `--am-field` / `--am-field-line`.
  - Cards are `--am-surface` on the page.
  - No modals.
- **Feature isolation (ADR-015):** no new cross-feature imports. Run `node scripts/check-feature-isolation.mjs`; the result must be 0 new.
- **Docs:** `npm run docs:refresh` before push. Never commit `docs/under-the-hood/system-status.md`.
- **Prod:** never run anything against prod. James flips OGBA to "Meeting day only" himself in the UI after deploy.
- **Commits:** end every message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Existing leagues have no `trade_window` row.** OGBA was created before the key existed, so the Rules screen must still show the switch. `getRules` backfills it as `anytime` without touching existing rows. (Task 2 test.)
2. **Between periods with no periods at all** (preseason, or the season's first period still pending): no active period means trades are open under `meeting_day`. (Task 2 test.)
3. **A trade proposed during the window, then accepted after the next period starts,** is refused at accept with the 409 message. It stays PROPOSED, so it can be accepted at the next meeting. (Task 2 test.)
4. **Innings at exactly the minimum (50.0) are not flagged; 49⅔ is.** Float sums like `49.99999` must not flag 50. Compare in outs: `Math.round(ip * 3) < min * 3`. (Task 3 test.)
5. **The Rules screen on a locked season:** locked rows render read-only, saving a transactions switch still works, and a failed save shows the server's message without losing the screen. (Task 5 test.)

---

### Task 1: Revert the 8 auth non-input elements to the card color

**Files:**
- Modify (lines as of `ca335ed6`; confirm with `git grep -n "am-field" -- client/src/features/auth`):
  - `client/src/features/auth/pages/ForgotPassword.tsx`: the success box ~126, a `<Link>` ~166, the error alert ~228
  - `client/src/features/auth/pages/Login.tsx`: the email-not-confirmed box ~293, the dev-login button ~398
  - `client/src/features/auth/pages/ResetPassword.tsx`: the success box ~227, the error alert ~341
  - `client/src/features/auth/pages/Signup.tsx`: the success box ~194

  On these elements only, `var(--am-field)` → `var(--am-surface-faint)` and `var(--am-field-line)` → `var(--am-border)`. The input style blocks (Login `inputStyle`, ResetPassword `inputStyle`, Signup `fieldInputStyle`, the ForgotPassword input ~207) keep Field.
- Test: `client/src/components/aurora/__tests__/fieldInputs.test.ts`

- [ ] **Step 1:** Add `it("auth pages use Field only on their input style")`. For each of the four auth files, the count of `var(--am-field)` matches (not counting `--am-field-line`) must be exactly **1**, and the count of `var(--am-field-line)` must be exactly **1**.
- [ ] **Step 2:** Run `cd client && npx vitest run src/components/aurora/__tests__/fieldInputs.test.ts`. Expected: FAIL, with counts above 1.
- [ ] **Step 3:** Make the edits.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `fix(auth): Field color only on inputs; boxes and buttons back to card`.

### Task 2: Trade-window rule and server enforcement

**Files:**
- Modify: `server/src/lib/sports/baseball.ts` `DEFAULT_RULES`: add `{ category: "transactions", key: "trade_window", value: "anytime", label: "When trades are allowed" }`.
- Modify: `server/src/features/commissioner/services/CommissionerService.ts` `getRules`. After loading, insert any `DEFAULT_RULES` entries whose `(category, key)` is missing with `createMany({ skipDuplicates: true })`, call `invalidateLeagueRules`, then reload. The existing "no rules at all" path keeps working.
- Create: `server/src/lib/tradeWindow.ts`, exporting `getTradeWindow(leagueId: number): Promise<{ open: true } | { open: false; message: string }>`. It reads the rule via `getLeagueRules(prisma, leagueId)` (`server/src/lib/leagueRuleCache.ts`), treats a missing rule as `"anytime"`, and otherwise checks `prisma.period.findFirst({ where: { leagueId, status: "active" }, select: { name: true } })`.
- Modify: `server/src/features/trades/routes.ts`:
  - In `POST /` (~line 163), after the proposer/league check, `const w = await getTradeWindow(leagueId); if (!w.open) return res.status(409).json({ error: w.message });`.
  - In `POST /:id/accept` (~line 288), the same check after loading the trade (use `trade.leagueId`) and before any state change.
- Modify: `client/src/features/leagues/components/RulesEditor.tsx` `RULE_CONFIGS`: add `trade_window: { type: 'select', options: ['anytime', 'meeting_day'] }`, matching the existing select config shape, so the existing `/rules` page renders it.
- Tests:
  - `server/src/lib/__tests__/tradeWindow.test.ts`
  - extend the trades route tests (grep `server/src/features/trades/__tests__` for the propose and accept tests and their mocking pattern)
  - `CommissionerService` getRules backfill test (grep its existing tests)

**Interfaces:**
- Produces: `getTradeWindow(leagueId)`. Steps D and G will reuse it.

- [ ] **Step 1: Write the tests.**
  - `tradeWindow`:
    - The rule is missing, with an active period → `{open:true}`.
    - `"anytime"` with an active period → `{open:true}`.
    - `"meeting_day"` with no active period → `{open:true}`.
    - `"meeting_day"` with an active period named "Period 8" → `{open:false, message:"Trades open at the next meeting, after Period 8 closes."}`.
    - Assert on the prisma `findFirst` args (`where: { leagueId, status: "active" }`). Per memory, a mock can't catch a wrong query unless you assert the args.
  - Trades routes:
    - Propose while closed → 409 with that message, and no trade is created.
    - Accept while closed → 409 and the status stays PROPOSED.
    - Propose while open → unchanged success path.
    - Process while closed → not blocked.
  - `getRules`:
    - A league with existing rules but no `trade_window` row gets exactly one created row (`transactions`/`trade_window`/`"anytime"`). Assert the `createMany` data and `skipDuplicates: true`.
    - A league that already has all keys triggers no `createMany`.
- [ ] **Step 2:** Run the new and changed server tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd server && npx vitest run` and `npx tsc --noEmit`, reading the full output. Expected: PASS, with tsc exit 0.
- [ ] **Step 5:** Commit `feat(trades): trade_window rule (meeting day / anytime) enforced on propose and accept`.

### Task 3: Innings check on the close checklist

**Files:**
- Modify: `server/src/features/standings/routes.ts`, the `GET /period-category-standings` handler (~line 117; it already calls `computeTeamStatsFromDb(leagueId, period.id)`). Add two fields to the response:
  - `teamInnings: Array<{ teamId: number; teamName: string; ip: number }>`, from each row's `stats.IP`
  - `minInnings: number | null`, from `getLeagueRules(prisma, leagueId).scoring?.min_innings` parsed to a number, or null
- Modify: `client/src/features/commissioner/api.ts`: extend `PeriodStandingsPreviewResponse` with those two optional fields. Add `export function teamsUnderInnings(resp): Array<{ teamName: string; ip: number; min: number }>`, which returns `[]` when `minInnings` is null and flags a team when `Math.round(ip * 3) < minInnings * 3`. Add `export function formatInnings(ip: number): string`, which rounds to outs: 46.333… → `"46⅓"`, 49.666… → `"49⅔"`, 50 → `"50"`.
- Modify: `client/src/features/commissioner/pages/ClosePeriodPage.tsx`, in the standings preview step (the one using `getPeriodStandingsPreview`, ~line 119). When `teamsUnderInnings` is non-empty, render a card titled "Innings minimum" listing `"<team> · <formatInnings(ip)> of <min> IP"` with an Alert-colored "Review" label, and the line "You decide what happens; closing isn't blocked." It never disables the step's continue button.
- Tests:
  - the server standings route test (assert `teamInnings` and `minInnings` are present, and the rules lookup is called with the leagueId)
  - `client/src/features/commissioner/__tests__/innings.test.ts` (pure functions)
  - extend `ClosePeriodPage.test.tsx` (the card renders when a team is under, is absent otherwise, and continue stays enabled)

- [ ] **Step 1: Write the tests.**
  - `teamsUnderInnings`:
    - `{teamInnings:[{teamName:"Bombers",ip:46.3333}],minInnings:50}` → one flag.
    - ip `50` → none.
    - ip `49.99999` → none.
    - ip `49.6667` → one flag.
    - `minInnings:null` → `[]`.
  - `formatInnings`: `46.3333` → `"46⅓"`, `49.6667` → `"49⅔"`, `50` → `"50"`, `0` → `"0"`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd client && npx vitest run src/features/commissioner` and the server standings tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): flag teams under the innings minimum on the close checklist`.

### Task 4: Close the rules lock loophole

**Files:**
- Modify: `server/src/features/commissioner/services/CommissionerService.ts`:
  - Extract the lock check from `updateRules` into `async assertRulesEditable(leagueId: number, categories: string[]): Promise<void>`. It returns without querying when every category is in `MUTABLE_ANY_TIME_CATEGORIES`. Otherwise it throws the same two errors as today.
  - `updateRules` calls it with the owned rules' categories, keeping its behavior identical.
- Modify: `server/src/features/commissioner/routes.ts`, `POST /commissioner/:leagueId/rules` (~line 998). Before the upsert, call `commissionerService.assertRulesEditable(leagueId, [category])`. Map the thrown lock errors to HTTP **403** `{ error: <message> }`. Grep how other routes in this file catch service errors and follow that.
- Test: extend the commissioner route tests and the CommissionerService tests.

- [ ] **Step 1: Write the tests.**
  - POST rules with category `"il"` while a season is IN_SEASON → 403 `"Rules cannot be changed after season setup."`, and no upsert is called.
  - POST rules with category `"il"` while a rule is locked → 403 `"Rules are locked for this season"`.
  - POST rules with category `"transactions"` while in season → 200, upsert called.
  - `updateRules` behavior is unchanged: the existing tests still pass.
- [ ] **Step 2:** Run them. Expected: FAIL on the first two.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd server && npx vitest run` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(commissioner): single-rule route honors the season rules lock`.

### Task 5: Rules screen (Style Bible screen 2)

**Files:**
- Create: `client/src/features/commissioner/pages/RulesPage.tsx`, mounted at `/commissioner/:leagueId/rules`.
  - **Data:** `GET /api/leagues/:id/rules` (returns rows with `id, category, key, value, label, isLocked`) and the season status from `useLeague()` (LeagueContext `seasonStatus`).
  - **Saving:** `PUT /api/leagues/:id/rules` with `{ updates: [{ id, value }] }`, sent per change on toggle or select. Add these two calls to `client/src/features/commissioner/api.ts`.
  - **Groups and rows, in order.** Use the key when present. Skip missing keys silently.
    - **Rosters:**
      - `stats_source` as "NL players only" (On when the value is `"NL"`)
      - "Roster size", computed from `batter_count + pitcher_count` (14 + 9 = 23) with the sub-line "14 hitters · 9 pitchers"
    - **IL fees:**
      - `il_slot_1_cost` as "IL fee, 1st player on IL" (`$10`)
      - `il_slot_2_cost` as "IL fee, 2nd player on IL" (`$15`)
    - **Scoring:**
      - `min_innings` as "Minimum innings per period" (`50 IP`), sub-line "The app flags teams under it at close; you decide"
    - **Trades and moves:**
      - `trade_window` as "When trades are allowed", a segmented control with options "Meeting day only" (`meeting_day`) and "Anytime" (`anytime`)
      - `owner_self_serve` as "Owners make their own moves", a switch
    - **Auction:** `auction_budget` ("$400"), `bid_timer` ("15 sec"), `nomination_timer` ("30 sec").
    - **Payouts:** `payout_1st`…`payout_8th` as one row, e.g. "40 / 25 / 15 / 10 / 5 / 3 / 2 / 0 %".
  - **Editable:** only `transactions` rows (`trade_window`, `owner_self_serve`) are editable while locked. "Locked" means any row `isLocked`, or `seasonStatus !== "SETUP"`. Locked rows show their value with a muted "Locked for the season" sub-line and no control.
  - **Saving states:** while a save is in flight the control is disabled. On error, show the server message in an Alert-colored line under that row and revert the control. On success, show "Saved".
  - **Layout:** phone is one column of grouped lists (`--am-surface` cards, 56px rows, 13px uppercase group captions). Desktop (≥ 1024px) is two columns: Rosters, IL fees, Scoring on the left; Trades and moves, Auction, Payouts on the right. There's a back link "‹ Commissioner" to `/commissioner/:leagueId`. No page header card and no phase banner.
  - **Controls:** the segmented control and switches use `--am-field` / `--am-field-line`, with the selected segment on `--am-accent` + `--am-on-accent`. The switch is a `button role="switch" aria-checked`. Every control is at least 44px tall.
- Modify: `client/src/App.tsx`: add the route `/commissioner/:leagueId/rules` before the `/commissioner/:leagueId/:section` catch-all (lazy, like its neighbors).
- Modify: `client/src/features/commissioner/pages/CommissionerHub.tsx`: the "League settings & rules" job links to `${base}/rules`.
- Test: `client/src/features/commissioner/__tests__/RulesPage.test.tsx`

- [ ] **Step 1: Write the tests** (mock the two API calls and LeagueContext the way other commissioner page tests do):
  - With `seasonStatus:"IN_SEASON"`:
    - "IL fee, 1st player on IL" shows `$10` with "Locked for the season" and no switch inside its row.
    - The `trade_window` segmented control is enabled.
    - Clicking "Meeting day only" calls the PUT with `{ updates: [{ id: <trade_window id>, value: "meeting_day" }] }`.
  - Without a `trade_window` row in the data, the Trades row is absent and the page doesn't crash.
  - A PUT rejecting with "Rules are locked for this season" shows that message and the control reverts.
  - "Roster size" shows 23.
  - With `seasonStatus:"SETUP"` and no locked rows, `owner_self_serve` and `trade_window` are editable. This page does **not** make il/auction rows editable even in SETUP; full editing stays on the existing `/rules` page.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep `RulesPage.tsx` focused. If it passes ~300 lines, split the row components into `client/src/features/commissioner/components/rules/`.
- [ ] **Step 4:** Run `cd client && npx vitest run` and `npx tsc --noEmit -p .`, reading the full output. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): Rules screen — switches for what can change, locked rows for the rest`.

### Task 6: Docs, browser check, PR

- [ ] **Step 1:** Run `npm run docs:refresh`, then `git checkout -- docs/under-the-hood/system-status.md`. Add one line to `docs/TESTING.md` for the new tests.
- [ ] **Step 2: Gates.**
  - `cd client && npx vitest run && npx tsc --noEmit -p . && npm run build`
  - `cd ../server && npx vitest run && npx tsc --noEmit`
  - `node scripts/check-feature-isolation.mjs`

  Read the full output each time.
- [ ] **Step 3: Browser check** on local Supabase, per memory `local_browser_check_setup.md`, done by the controller.
  - On `/commissioner/5/rules` at phone 440 and desktop 1440, in light and dark:
    - Locked rows show values.
    - Toggling "Meeting day only" saves and survives a reload.
  - With an active period:
    - Proposing a trade as an owner shows the 409 message.
    - Switching back to Anytime lets it through.
  - On a period whose end has passed, the close checklist shows the innings card when the seed has a team under 50.
  - Revert any local test data afterwards.
- [ ] **Step 4:** Commit, push, and open the PR against main, titled `feat(commissioner): Rules screen + trade window + innings check (UX step B1)`. The body lists what OGBA's commissioner should do after deploy: open Rules and set "When trades are allowed" to "Meeting day only".

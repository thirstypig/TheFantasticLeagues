---
id: DOC-035
title: "Commissioner B2 — the rest of the commissioner screens (UX step B2) — implementation plan"
description: "Home, Money, Close checklist, Start, Owners, Season and periods, History; commissioner-only gating; B1 follow-ups."
type: plan
status: active
phase: null
owner: james
tags: [league-admin]
links: [DOC-034, DOC-032, DOC-027]
updated: 2026-11-10
---

# Commissioner B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining cluttered commissioner pages with the approved Style Bible screens:
- Home (1)
- Money (3)
- Close checklist (19)
- Start (20)
- Owners (21)
- Season and periods (22)
- History (23)

Commissioner pages show only to commissioners. The open B1 follow-ups are fixed too.

**Architecture:**
- Each screen is one page in `client/src/features/commissioner/pages/` (phone first, two columns on desktop ≥ 1024px) built on existing endpoints.
- Server changes are small: History filters by league in the database, and the rules PUT maps its errors.
- A shared `useIsCommissioner` hook and `CommissionerOnly` wrapper gate every commissioner page on the client. The server already enforces permissions.
- Legacy panels stay only for Rosters, Trades, Settings (league basics), Overview and Archive. Steps C and D replace Rosters and Trades.

**Tech Stack:** React 18, React Router 6, Vitest + Testing Library, Express, Prisma (Postgres JSON path filters).

**Spec:** the approved step B review draft (https://claude.ai/artifact/6efBpbW8tZ7oxjstL9xRGL, "PR B2" + "Screens replaced"), Style Bible screens 1, 3, 19–23 (https://claude.ai/artifact/UDWjhsrCsDKxovbSjkyPXc#screens; repo copy `client/public/style-bible/index.html`), and James's direction: the commissioner area must not scroll needlessly, must be intuitive, and must fit the screen.

## Global Constraints

- **Worktree:** `/Users/jameschang/Projects/thefantasticleagues/tfl-step-b2`, branch `feat/commissioner-b2`, based on origin/main `d5b49ee2`. node_modules are symlinked: never `npm install`, never commit node_modules.
- **No schema change and no migration.**
- **Money writes keep their exact current behavior:**
  - Close: `PATCH /api/periods/:id` with body `{ status: "completed", billFees: <bool> }`
  - Start: `PATCH /api/periods/:id {status:"active"}`
  - Bill: `POST /api/commissioner/:id/reconcile-il-fees/:pid`, with dry-run via `?dryRun=true`
  - FinanceLedger is append-only. B2 adds no new ledger writes.
- **Honest data only.**
  - The app records each team's **net balance** (`GET /commissioner/:id/balances`, positive = owes), not paid-vs-owed. Show balances as "Owes $X", "Paid up" (0) or "Credit $X" (negative). Never show invented "paid" figures.
  - No "last seen" and no "Resend invite" (no data or endpoint exists).
- **Every commissioner page renders "Commissioners only."** (and nothing else) for users who are neither admin nor commissioner of the URL's league. Use `user.isAdmin` or a membership with `role === "COMMISSIONER"` for that `leagueId`, following the existing `isCommissioner` logic in `client/src/features/trades/pages/TradesPage.tsx` ~line 41.
- **Style:**
  - Sizes only 13/15/17/24/32. `textSizeSweep` enforces it.
  - Colors only from `--am-*` tokens.
  - Inputs, pickers and segmented controls use `--am-field` / `--am-field-line`.
  - Cards are `--am-surface` on the page.
  - Every tap target is at least 44px. Rows are at least 56px.
  - No page header card, no league card, no phase banner. A back link "‹ Commissioner" goes to `/commissioner/:leagueId`.
  - No modals except the existing `ConfirmSheet` for irreversible actions (close, start, bill, regenerate invite code, remove owner, delete period).
- **Copy:** plain American English, sentence case, no jargon. Dates read like "Jun 14". Money reads "$45".
- **Feature isolation (ADR-015):** no new cross-feature imports. Shared helpers go in `client/src/lib` or `client/src/hooks`. The commissioner feature may call any endpoint through its own `api.ts`. Check with `node scripts/check-feature-isolation.mjs` (0 new).
- **Docs:** `npm run docs:refresh` before push. Never commit `docs/under-the-hood/system-status.md`.
- **Never run anything against prod.**
- **Commits:** end every message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Close checklist keeps the money behavior.**
   - "Bill now" sends `billFees:true`. "Bill later" sends `billFees:false`.
   - "Bill now" is unavailable when the fee preview failed.
   - Closing stays disabled until `ready`.
   - The ConfirmSheet must be confirmed before the PATCH.

   (Task 6 tests assert the PATCH body.)
2. **Period tracker states** on Home, derived only from period data:
   - active and not yet ended → Play
   - active and ended → Close
   - no active, last completed, next pending → Meeting
   - start due → Start
   - no periods → "Set up periods"

   (Task 8 test per state.)
3. **History league scoping:** rows from other leagues never appear. The current league's older rows aren't pushed out by other leagues' activity. (Task 2 server test asserts the Prisma `where` JSON path filter.)
4. **Commissioner-only gating** on every page, including RulesPage: an owner who is not commissioner sees "Commissioners only." and no controls. An admin always passes. (Task 1 test.)
5. **Season and periods defaults:** the next period starts the day after the last period ends and runs 14 days, named "Period N+1". End before start is refused client-side with a message. Deleting is offered only for pending periods. (Task 3 tests.)

---

### Task 1: Commissioner-only gate + B1 follow-ups

**Files:**
- Create: `client/src/hooks/useIsCommissioner.ts`, exporting `useIsCommissioner(leagueId: number | null): boolean`. It returns true for an admin, or for a membership in that league with role `COMMISSIONER`. Read the user from the existing auth hook, the same one TradesPage uses.
- Create: `client/src/features/commissioner/components/CommissionerOnly.tsx`, exporting `CommissionerOnly({ leagueId, children })`, which renders `children` or `<p>Commissioners only.</p>` in muted text inside the page column.
- Modify: wrap the page body of each of these in `CommissionerOnly`, using the URL's `leagueId`:
  - `CommissionerHub.tsx`
  - `ClosePeriodPage.tsx`
  - `StartPeriodPage.tsx`
  - `BillPeriodPage.tsx`
  - `RecentChangesPage.tsx`
  - `RulesPage.tsx`
- Modify: `client/src/features/commissioner/pages/RulesPage.tsx`:
  - (a) Locked values render as plain text (`--am-text`, weight 600). No chip background or border, so they don't look tappable.
  - (b) The payouts row puts the value on its own line under the label on phone (< 768px), so the label doesn't wrap.
  - (c) Take `seasonStatus` for the URL's league. If LeagueContext's `leagueId` differs from the URL's, fetch `GET /api/leagues/:id` and use its season status. If that's unavailable, treat the league as locked.
- Modify: `server/src/features/leagues/rules-routes.ts` `PUT /:id/rules`. Map `RulesLockedError` to **403** and the invalid-`trade_window` error to **400**, as `{ error: message }`. Find their classes and messages in `CommissionerService.ts` (`assertRulesEditable`, `assertValidRuleValue`). Other errors go to the normal handler.
- Tests:
  - `client/src/hooks/__tests__/useIsCommissioner.test.ts`
  - `CommissionerOnly` (one test)
  - RulesPage additions
  - server rules-routes test (403 and 400)

- [ ] **Step 1: Write the tests.**
  - The hook:
    - admin → true
    - commissioner membership for league 5 → true for 5, false for 6
    - owner membership → false
    - no user → false
  - `CommissionerOnly`: shows "Commissioners only." and hides its children for a non-commissioner.
  - RulesPage:
    - a non-commissioner sees "Commissioners only." and no switch
    - a locked value has no border style
  - Server: PUT with a locked rule → 403 with the message. PUT with `trade_window: "maybe"` → 400.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. Existing page tests that render as a non-admin need their mocked user updated to a commissioner. Update the mock; don't weaken the gate.
- [ ] **Step 4:** Run `cd client && npx vitest run && npx tsc --noEmit -p .` and `cd ../server && npx vitest run && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): commissioner-only gate on all commissioner pages; rules screen polish; rules PUT error codes`.

### Task 2: History (screen 23) with league-scoped server query

**Files:**
- Modify: `server/src/features/commissioner/hubRoutes.ts` `GET /commissioner/:leagueId/recent-changes`. Replace "newest 500 then filter in memory" with `prisma.auditLog.findMany({ where: { metadata: { path: ["leagueId"], equals: leagueId } }, orderBy: { createdAt: "desc" }, take: limit, include/select as today })`. Keep the default limit at 50. Raise the max to **200**. The response shape is unchanged.
- Modify: `client/src/features/commissioner/pages/RecentChangesPage.tsx` becomes **History**. The title "History" sits on the existing route `/commissioner/:leagueId/recent`.
  - Fetch with limit 200.
  - Filter chips (single select, `aria-pressed`): All · Periods · Money · Rules · Trades · Rosters · Owners. Map them client-side by action:

    | Chip | Actions |
    |---|---|
    | Periods | `PERIOD_*` |
    | Money | `IL_FEE_*`, `FINANCE_*`, actions containing `FEE` or `BILL` |
    | Rules | `RULES_UPDATE`, `LEAGUE_UPDATE` |
    | Trades | `TRADE_*` |
    | Rosters | `ROSTER_*`, `COMMISSIONER_ASSIGN*`, `COMMISSIONER_RELEASE*`, `WIRE_LIST_*` |
    | Owners | `MEMBER_*`, `INVITE_*`, `TEAM_OWNER_*`, `TEAM_*` |

    Anything unmatched shows under All only.
  - Rows are grouped by day under caption headers ("Jun 14"). Each row shows the `describeChange` text in body text, and below it the time ("8:31 pm") plus `userName` in muted small text.
  - Empty state for a filter: "Nothing in this group yet."
  - Desktop shows a table: When · What · Who.
  - Undo/Reverse buttons are **not** added (nothing in B2 implements them).
- Modify: `client/src/lib/recentChangeCopy.ts` (or wherever `describeChange` lives). Add plain copy for `RULES_UPDATE` (e.g. "Changed a league rule", using `metadata.key`/`value` when present: "When trades are allowed → Meeting day only"), `MEMBER_ADD`/`MEMBER_REMOVE`, `INVITE_CANCEL`, `INVITE_CODE_REGENERATE`, `TEAM_OWNER_ADD`/`TEAM_OWNER_REMOVE`. Grep the server for the exact action strings first.
- Tests:
  - the hubRoutes server test (assert the `where.metadata` path filter and `take`)
  - the RecentChangesPage test (rename references as needed: filter chips filter, grouping by day, empty filter state)
  - `recentChangeCopy` tests for the new copy

- [ ] **Step 1:** Write the tests.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the server and client suites and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): History with filters; recent changes scoped to the league in the database`.

### Task 3: Season and periods (screen 22)

**Files:**
- Create: `client/src/features/commissioner/pages/SeasonPage.tsx` at `/commissioner/:leagueId/season`.
  - Data: `GET /api/seasons/current?leagueId` (period list `currentSeason.periods`).
  - List each period as name · "May 31 – Jun 14" · status chip: Closed (completed), Now (active, accent), Next (first pending), Upcoming (other pending).
  - **Add next period** (inline form, not a modal):
    - Name defaults to "Period N+1", where N is the highest number in existing names, or count + 1.
    - Start defaults to the day after the latest period's end, or today if there are none.
    - End defaults to start + 13 days.
    - Inputs are date fields styled with Field.
    - Submit calls `POST /api/periods { leagueId, seasonId, name, startDate:"YYYY-MM-DD", endDate }`.
    - Client-side validation: end must be after start ("End date must be after the start date."). Show server errors inline.
  - **Edit** a pending period's name and dates inline via `PATCH /api/periods/:id {name,startDate,endDate}`. Active and completed periods aren't editable here.
  - **Delete** a pending period through ConfirmSheet ("Delete Period 10? This can't be undone.") → `DELETE /api/periods/:id`.
  - No raw status control. Starting and closing go through the Start and Close flows: each Now row links "Close ›" and the Next row links "Start ›".
  - A link "Season status ›" goes to the legacy `/commissioner/:leagueId/archive` (season transitions stay there; they're rare).
  - Desktop shows the table on the left and the add form on the right.
- Modify: `client/src/App.tsx`: add the route before the `:section` catch-all.
- Modify: `CommissionerHub.tsx` and `StartPeriodPage.tsx`. Every "No next period set up / Set up periods" link (today `/settings`) points to `/commissioner/:leagueId/season`.
- Modify: `client/src/features/commissioner/api.ts`. Add `getCurrentSeason(leagueId)`, `createPeriod(...)`, `updatePeriod(...)` and `deletePeriod(id)`. Grep `client/src/features/seasons/api.ts` for the existing shapes, but don't import across features.
- Test: `client/src/features/commissioner/__tests__/SeasonPage.test.tsx`.

- [ ] **Step 1: Write the tests.**
  - Defaults: given the last period ending 2026-06-14 named "Period 9", the form shows "Period 10", 2026-06-15, 2026-06-28.
  - End before start shows the message and no POST.
  - Submit POSTs the exact body.
  - Delete appears on a pending period only and calls DELETE after the sheet is confirmed.
  - The status chips are right.
  - The hub's no-next-period link points to `/season`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): Season and periods screen; fix dead "set up periods" links`.

### Task 4: Owners and invites (screen 21)

**Files:**
- Create: `client/src/features/commissioner/pages/OwnersPage.tsx` at `/commissioner/:leagueId/owners`. This replaces the legacy section: register the route before `:section`, so the old `owners` → people mapping no longer renders.
  - Data: `GET /api/commissioner/:id` (`teams[].ownerships[].user{name,email}`, `memberships[]`), `GET /api/commissioner/:id/invites` (show `PENDING` only), and `GET /api/leagues/:id/invite-code`.
  - **Invite link card:** the full join URL `${window.location.origin}/join/<code>`, shown as selectable text, a Copy button (`navigator.clipboard.writeText`, with a fallback that selects the text on rejection), and "New link" → ConfirmSheet ("Make a new invite link? The old link stops working.") → `POST /api/leagues/:id/invite-code/regenerate`.
  - **Teams list:** team name, owners' names (email if no name), and "Joined" if it has an owner or "No owner" (Alert).
    - Row action "Manage" expands inline, not as a modal. It shows the owners, each with Remove (ConfirmSheet → `DELETE /api/commissioner/:id/teams/:tid/owner/:uid`).
    - "Add owner" is a select of **league members only** (from `memberships`, not `available-users`). It submits `POST /api/commissioner/:id/teams/:tid/owner {userId}`.
    - It's hidden when the team already has 2 owners.
  - **Pending invites:** email · "Invited Mar 2" · Cancel (ConfirmSheet → `DELETE /api/commissioner/:id/invites/:iid`).
  - **Add someone:** an email field plus a role select (Owner / Commissioner) → `POST /api/commissioner/:id/members {email, role}`. Show the server's result message inline.
  - Desktop: teams table on the left; invite link, pending invites and add someone on the right.
- Modify: `client/src/features/commissioner/api.ts` with the needed calls. Grep the legacy `Commissioner.tsx` people section for the exact request bodies and role values.
- Test: `client/src/features/commissioner/__tests__/OwnersPage.test.tsx`.

- [ ] **Step 1: Write the tests.**
  - Copy calls the clipboard with the full URL.
  - Regenerate requires confirming the sheet, then POSTs.
  - The add-owner select lists league members only. Assert that `available-users` is never requested.
  - Remove owner goes through the sheet and calls DELETE with the right ids.
  - Pending invites list `PENDING` only.
  - Add someone POSTs `{email, role}`.
  - A team with no owner shows "No owner".
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): Owners and invites screen (league members only in owner picker)`.

### Task 5: Money (screen 3)

**Files:**
- Create: `client/src/features/commissioner/pages/MoneyPage.tsx` at `/commissioner/:leagueId/money`, replacing the legacy finances section (route before `:section`).
  - Data:
    - `GET /api/commissioner/:id`: `league.entryFee`, `entryFeeNote`, team count
    - `GET /api/commissioner/:id/balances`
    - `GET /api/commissioner/:id/unbilled-periods`
    - `GET /api/periods?leagueId` (for names)
  - **Summary card:**
    - "Prize pool" = entryFee × team count (e.g. "$1,600", with "8 × $200").
    - "Owed" = the sum of positive balances, with "by N teams".
    - If the entry fee isn't set: "Entry fee not set" with an inline Edit.
  - **Bill IL fees:** for each unbilled period, a primary button "Bill IL fees for <period name>" linking to the existing `/commissioner/:id/bill/:periodId` page. It's hidden when nothing is unbilled.
  - **Teams list**, sorted by balance descending:
    - name and "Owes $25" (Alert chip) for positive
    - "Paid up" (Good chip) for 0
    - "Credit $10" (chip) for negative

    Desktop shows a table: Team · Balance.
  - **Entry fee row:** "Entry fee $200 per team" with an inline Edit → number field (Field) + note → `PATCH /api/commissioner/:id {entryFee, entryFeeNote}`. Grep the legacy finances tab for the exact field names.
  - **Payouts:** a link "Payouts ›" to the existing `/payouts` page.
  - No "Ledger" tab and no "coming soon" boxes.
- Modify: `client/src/features/commissioner/api.ts` with the needed calls.
- Test: `client/src/features/commissioner/__tests__/MoneyPage.test.tsx`.

- [ ] **Step 1: Write the tests.**
  - Balances render "Owes $25" / "Paid up" / "Credit $10" and are sorted.
  - The owed total sums positive balances only.
  - The bill button shows per unbilled period with the right href, and is absent when there are none.
  - Prize pool math.
  - The entry fee edit PATCHes the exact body.
  - No "coming soon" text renders.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): Money screen — balances, prize pool, bill when due`.

### Task 6: Close checklist (screen 19)

**Files:**
- Modify (rewrite the presentation; keep every data call and the write): `client/src/features/commissioner/pages/ClosePeriodPage.tsx`. One page instead of five steps. The `?step=` param is ignored if present.
  - Title "Close <period name>", sub-line "May 31 – Jun 14".
  - **"Before you close" list.** Each row has a status chip: Ready (Good), Review (Alert), Waiting (muted).
    - Final stats are in: `close-readiness.ready`, sub-line "Last stat date Jun 14 · period ended Jun 14".
    - Rosters at the limit: roster-check, e.g. "8 of 8 teams at 23" or "Los Doyers 24 / 23", linking to `/rosters`.
    - IL players back from MLB IL: ghost-il list, linking to `/rosters`.
    - Innings minimum: `teamsUnderInnings`, e.g. "Bombers 46⅓ of 50 IP · you decide". Omitted when there's no rule.
  - **"Standings at close":** the summed totals list, as today's step 3.
  - **"IL fees for <period>":** the total and per-team lines from the dry-run preview (team names via roster-check, as today), and a segmented control "Bill now" / "Bill later".
    - "Bill now" is disabled with the line "Couldn't load the fee preview; you can bill later from Money" when the preview failed.
    - With zero fees it shows "No IL fees this period" and sends `billFees:false`.
  - **"Close <period>" primary button:**
    - Disabled until `ready` and a billing choice is set. The billing choice defaults to "Bill now" when the preview loaded and fees > 0.
    - Opens the existing `ConfirmSheet`. The copy keeps today's two variants: "Standings lock — IL fees stay unbilled until you bill them. You can't undo this." / "Standings lock. There are no IL fees to bill. You can't undo this." Add the billed variant if missing.
    - On confirm, `PATCH /api/periods/:id { status: "completed", billFees }` exactly as today, then navigate as today.
  - Desktop: the checklist and standings on the left; the IL fees panel and Close button on the right.
- Test: rewrite `client/src/features/commissioner/__tests__/ClosePeriodPage.test.tsx` around the single page. Keep coverage equivalent to the 28 current tests where behavior still exists (already-closed state, readiness gating, load errors, fee preview failure, zero fees, confirm required).

- [ ] **Step 1: Write the tests.**
  - Not ready → the Close button is disabled.
  - Ready, fees > 0, "Bill now", confirm → PATCH body `{status:"completed", billFees:true}`.
  - "Bill later" → `billFees:false`.
  - The preview failed → "Bill now" is disabled and the closing PATCH sends `billFees:false`.
  - Zero fees → "No IL fees this period" and `billFees:false`.
  - Cancelling the sheet → no PATCH.
  - An already-closed period shows "This period is already closed." with no button.
  - The innings row appears only when a team is under.
  - `?step=4` still renders the single page.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): close a period from one checklist page (same write, same billing)`.

### Task 7: Start (screen 20)

**Files:**
- Modify the presentation of `client/src/features/commissioner/pages/StartPeriodPage.tsx`. Keep its data calls and its write (`PATCH {status:"active"}`).
  - A period card: name, "Mon Jun 15 – Sun Jun 28", and the day count.
  - "Moves since the start date · N": moves grouped by team, with adds (Good) and drops (Alert) on one line each. "No moves since the start date." when there are none.
  - The roster check from `GET /commissioner/:id/roster-check`: "✓ All 8 rosters at 23", or the over-limit teams in Alert with a link to `/rosters`. It doesn't block.
  - Keep today's warning when another period is still active.
  - "Start <period>" → ConfirmSheet → PATCH.
  - "No next period set up" links to `/season` (Task 3).
  - Desktop: moves on the left; the period card and button on the right.
- Test: update `StartPeriodPage.test.tsx`. Moves are grouped by team, the roster check line shows, confirm is required before the PATCH body `{status:"active"}`, and the already-started state still works.

- [ ] **Step 1:** Write the tests.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): start-period screen with moves by team and roster check`.

### Task 8: Commissioner home (screen 1)

**Files:**
- Modify (rewrite the presentation): `client/src/features/commissioner/pages/CommissionerHub.tsx`.
  - **Period tracker card** (accent border).
    - Caption "<period> · ends <date> · N days left", or the state's own caption.
    - A 4-step tracker: Play · Close · Meeting · Start. The current step is highlighted (accent) and done steps are muted.
    - Under it, one sentence and one button for the next step:
      - Play: "When <period> ends, close it to freeze standings." with a disabled "Close <period> · <end date>"
      - Close: "Close <period>" (primary) → the close page
      - Meeting: "Enter meeting moves when ready, then start <next>." with "Start <next>" → the start page
      - Start: "Start <next>" (primary)
      - No periods: "Set up periods" → `/season`

    Derive the state with a pure function `derivePeriodState(periods, now)` in `client/src/features/commissioner/lib/periodState.ts`. Reuse the `CLOSE_READY_HOUR_UTC` rule from `needsYou.ts` for "ended".
  - **"Waiting on you":** the existing `needsYou` items as rows, with a chip count or Fix/Review label. Hidden when empty ("Nothing needs you right now." as a single muted line).
  - **Job tiles** (2 columns on phone, 3 on desktop). Each tile is a link with a title and a one-line status:
    - Rosters: "8 teams"
    - Trades: "N waiting", from the accepted trades count
    - Money: "$45 owed" or "All paid up", from balances
    - Rules: "Trades: meeting day only" / "Trades: anytime", from rules
    - Owners: "N teams · N invites pending"
    - Season: "<current period>"

    If a status call fails, show the tile with no status line.
  - Below the tiles: "History ›" → `/recent`, and "Scoring categories ›" and "Wire List settings ›" (existing routes).
  - **Desktop** (≥ 1024px) is two columns: the tracker and Waiting on you on the left; the tiles and the latest 3 history rows on the right. It must fit 1440×900 without scrolling with typical data (8 teams, ≤ 3 waiting items).
- Create: `client/src/features/commissioner/lib/periodState.ts` + `__tests__/periodState.test.ts`.
- Test: rewrite `CommissionerHub.test.tsx` (tracker per state, tiles link to the right routes, waiting rows, a failed status call doesn't crash).

- [ ] **Step 1: Write the tests.** `derivePeriodState` covers:
  - active, before its end + 1 day at 14:00 UTC → `play`
  - active, after it → `close`
  - no active, last completed, a pending next one → `meeting`
  - a pending period whose startDate ≤ today with no active → `start`
  - no periods → `setup`
  - all completed with no pending → `meeting`, with `next: null` (copy: "Add the next period")

  Page tests: each state's button text and href, tile hrefs, "Nothing needs you right now."
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the client suite and tsc. Expected: PASS.
- [ ] **Step 5:** Commit `feat(commissioner): new commissioner home — period tracker, waiting on you, job tiles`.

### Task 9: Docs, browser check, PR

- [ ] **Step 1:** Run `npm run docs:refresh`, then `git checkout -- docs/under-the-hood/system-status.md`. Add the new tests to `docs/TESTING.md`.
- [ ] **Step 2: Gates.**
  - `cd client && npx vitest run && npx tsc --noEmit -p . && npm run build`
  - `cd ../server && npx vitest run && npx tsc --noEmit`
  - `node scripts/check-feature-isolation.mjs`

  Read the full output each time.
- [ ] **Step 3: Browser check** on local Supabase, done by the controller.
  - Visit each new screen at phone 440 and desktop 1440, in light and dark:
    - `/commissioner/5`
    - `/money`
    - `/owners`
    - `/season`
    - `/recent`
    - `/close/<active id>`
    - `/start/<pending id>`
  - Confirm:
    - nothing renders under 13px
    - no sideways scroll
    - the desktop home fits 1440×900
    - a non-commissioner sees "Commissioners only."
  - Exercise one safe write per screen locally, then revert it: add and delete a test period, copy the invite link, and filter history. **Do not** close or start a real period unless the local seed is restored afterwards.
- [ ] **Step 4:** Commit, push, and open the PR against main, titled `feat(commissioner): the rest of the commissioner screens (UX step B2)`.

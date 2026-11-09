---
id: DOC-028
title: "Commissioner hub (UX Phase 1) — implementation plan"
description: "Task-by-task plan for the commissioner hub, guided close-period and start-period jobs, and the ADR-015 positionInherit fix."
type: plan
status: active
phase: null
owner: james
tags: [league-admin, design-system]
links: [DOC-027]
updated: 2026-11-09
---

# Commissioner Hub (UX Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-tab commissioner screen with a hub ("Needs you", jobs, recent changes), add guided **Close a period** (5 steps, fee preview, bill now/later) and **Start next period** jobs, and clear the commissioner module's ADR-015 violation.

**Architecture:**
- **Server:** one small behavior change in `PATCH /api/periods/:id` (an optional `billFees` flag, plus audit writes), and a new read-only `hubRoutes.ts` sub-router in the commissioner module.
- **Client:**
  - New pages in `features/commissioner/pages/`.
  - The existing `Commissioner.tsx` tab panes are **re-homed**, not rewritten: a `section` prop renders one pane with no tab bar.
  - "Needs you" is derived client-side by one pure function.

**Tech Stack:** React 18 + React Router v6, Express, Prisma, Zod, Vitest + supertest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-09-ux-simplification-design.md` (DOC-027), section "Commissioner hub" and Phase 1.

## Global Constraints

- **No pop-up modals.** The only overlay is a confirm bottom sheet before an irreversible action. Multi-step flows are routes with a working Back button.
- **No new cross-feature imports.** `node scripts/check-feature-isolation.mjs` must exit 0 from Task 1 onward. Client code calls other features' endpoints through thin fetch wrappers in `features/commissioner/api.ts` (duplicating a wrapper is allowed; importing another feature's `api.ts` is not).
- **Use existing `--am-*` tokens only;** no hard-coded colors. The USC theme lands in Phase 2.
- **Mobile:** ≥ 16px body text, ≥ 44px tap targets. Verify at 440 × 956 and on desktop, in light and dark.
- **No schema migration** in this phase.
- **Prod writes need James.** All flow verification is on local/staging data.
- **The fee preview must use `reconcileIlFeesForPeriod(..., { dryRun: true })`** via the existing `POST /api/commissioner/:leagueId/reconcile-il-fees/:periodId?dryRun=true`. Never a second fee calculation.
- **Audit entries are league-scoped by `metadata.leagueId`.** Action names: `PERIOD_CLOSE` (metadata `{ leagueId, periodId, billed: boolean }`) and `PERIOD_START` (metadata `{ leagueId, periodId }`). `resourceType: "Period"`, `resourceId: String(periodId)`.
- **Run `npm run docs:refresh` before every push,** and exclude `docs/under-the-hood/system-status.md` from commits.

## Review Focus

1. **Double tap on "Close period"** must produce one close. The button is disabled while the request is in flight, and the server's existing `period.status !== "completed"` guard prevents a second enqueue. Test in Task 8.
2. **Closing too early in the evening (Pacific).** A Sunday 7pm PT game ends after UTC midnight. "Ready to close" must stay false until **13:00 UTC on the day after `endDate`** (after the ~6am PT sync). Test in Task 3.
3. **Back and reload inside the close flow.** Back goes to the previous step, not the hub. Reloading `?step=4` stays on step 4 and re-fetches the fee preview, never showing a stale one. Test in Task 8.
4. **"Bill later," then billing later:** the period must leave the unbilled list once a manual reconcile has run (an `IL_FEE_RECONCILE` audit row for that period, created after the `PERIOD_CLOSE`). Test in Task 4.
5. **Owner (non-commissioner) access.** Every new hub endpoint uses `requireCommissionerOrAdmin()`. Test in Task 3 by asserting the factory was applied to each route.

---

### Task 1: Promote `positionInherit` to `server/src/lib` (ADR-015)

**Files:**
- Move: `server/src/features/transactions/lib/positionInherit.ts` → `server/src/lib/positionInherit.ts`
- Move: `server/src/features/transactions/lib/__tests__/positionInherit.test.ts` → `server/src/lib/__tests__/positionInherit.test.ts`
- Modify (import path only): every file `grep -rln positionInherit server/src` lists. As of writing:
  - `trades/routes.ts`, `transactions/routes.ts`, `transactions/lib/freeAgent.ts`, `teams/routes.ts`
  - `wire-list/services/processorService.ts`, `commissioner/routes.ts`, `commissioner/services/CommissionerService.ts`
  - their tests' `vi.mock` paths
- Modify: `scripts/feature-isolation-baseline.json`. Remove entries the move made stale, but only if the script reports them.

**Interfaces:**
- Produces: `server/src/lib/positionInherit.ts` with an unchanged export set (`rosterSlotFor`, `isEligibleForSlot`, `negotiateInheritedSlot`, `assertAddEligibleForDropSlot`).

- [ ] **Step 1:** Run `node scripts/check-feature-isolation.mjs`. Expected: exit 1, listing exactly `commissioner → transactions` and `trades → transactions` (positionInherit).
- [ ] **Step 2:** `git mv` both files. Fix the moved file's own relative imports (`../../../lib/...` → `./...`, `../../../db/...` → `../db/...`).
- [ ] **Step 3:** Rewrite every importer and every `vi.mock("…positionInherit.js")` path to the new location.
- [ ] **Step 4:** Run `cd server && npx tsc --noEmit 2>&1 | tee /tmp/tsc.log; grep -c "error TS" /tmp/tsc.log`. Expected: `0` (read the whole log; never trust a `tail`).
- [ ] **Step 5:** Run `cd server && npx vitest run src/lib/__tests__/positionInherit.test.ts src/features/commissioner src/features/trades src/features/teams src/features/wire-list src/features/transactions`. Expected: all pass.
- [ ] **Step 6:** Run `node scripts/check-feature-isolation.mjs`. Expected: exit 0. If it reports stale baseline entries, delete those entries and re-run until exit 0.
- [ ] **Step 7:** Commit: `refactor(lib): promote positionInherit to server/src/lib (ADR-015)`.

---

### Task 2: Period close can skip billing; close/start write audit entries

**Files:**
- Modify: `server/src/features/periods/routes.ts` (`updatePeriodSchema` at :23, `PATCH /:id` at :97)
- Test: `server/src/features/periods/__tests__/routes.test.ts` (extend the existing `describe("PATCH /:id")`)

**Interfaces:**
- Produces:
  - Request body accepts `billFees?: boolean` (default `true`).
  - `status: "completed"` with `billFees: false` closes the period **without** calling `enqueueIlFeeReconcile`.
  - Audit rows as defined in Global Constraints, on the pending/active → `completed` and pending → `active` transitions only.

- [ ] **Step 1: Write the failing tests** (mock `../../../lib/outboxDrainer.js` → `enqueueIlFeeReconcile: vi.fn()`, and mock `../../../lib/auditLog.js` → `writeAuditLog: vi.fn()`):
  - `"completed without billFees enqueues IL fee reconcile and audits billed:true"`: period `{status:"active", leagueId:1}`, body `{status:"completed"}`. Expect `enqueueIlFeeReconcile` called with `(null, 1, [1])`, and `writeAuditLog` called with `expect.objectContaining({ action:"PERIOD_CLOSE", resourceType:"Period", resourceId:"1", metadata:{ leagueId:1, periodId:1, billed:true } })`.
  - `"completed with billFees:false does not enqueue and audits billed:false"`: expect `enqueueIlFeeReconcile` not called, and the metadata has `billed:false`.
  - `"already-completed period does not re-enqueue or re-audit"`: period `{status:"completed"}`, body `{status:"completed"}`. Expect neither mock called.
  - `"pending → active audits PERIOD_START"`: expect `action:"PERIOD_START"`, `metadata:{ leagueId:1, periodId:1 }`.
- [ ] **Step 2:** Run `cd server && npx vitest run src/features/periods/__tests__/routes.test.ts`. Expected: the 4 new tests FAIL.
- [ ] **Step 3: Implement.** Add `billFees: z.boolean().optional()` to `updatePeriodSchema`. Gate the existing enqueue on `req.body.billFees !== false`. After the update, call `writeAuditLog({ userId: req.user!.id, ... })` for the two transitions. Fire-and-forget is fine; it never throws. The `billFees` field must **not** be written to the `Period` row.
- [ ] **Step 4:** Re-run the file. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(periods): optional billFees on close + PERIOD_CLOSE/PERIOD_START audit`.

---

### Task 3: Hub read endpoints: roster check, close readiness, moves since start

**Files:**
- Create: `server/src/features/commissioner/hubRoutes.ts` (`export const hubRouter = Router()`)
- Modify: `server/src/features/commissioner/index.ts`, to mount it on the existing router: `commissionerRouter.use(hubRouter)`
- Test: `server/src/features/commissioner/__tests__/hubRoutes.test.ts` (same mocking harness as `ghostIl.test.ts`)

**Interfaces:**
- Consumes: `loadLeagueRosterCap(tx, leagueId)` from `server/src/lib/rosterGuard.ts`.
- Produces (all `requireAuth, requireCommissionerOrAdmin()`; all 400 on a non-numeric id; all 404 when the period's `leagueId` ≠ `:leagueId`):
  - `GET /commissioner/:leagueId/roster-check` → `{ cap: number; teams: { teamId: number; teamName: string; activeCount: number; over: boolean }[] }`. `activeCount` counts `Roster` rows with `releasedAt: null` and `assignedPosition` not `"IL"`, the same definition as `assertRosterLimit`.
  - `GET /commissioner/:leagueId/periods/:periodId/close-readiness` → `{ periodId: number; name: string; status: string; endDate: string; lastStatDate: string | null; ready: boolean }`.
    - `ready` = `status === "active"` **and** `now >= Date.UTC(endY, endM, endD + 1, 13)`, where endY/M/D are the UTC date parts of `endDate`.
    - `lastStatDate` = the max `PlayerStatsDaily.gameDate` within `[startDate, endDate]`, as `YYYY-MM-DD`, or `null`.
  - `GET /commissioner/:leagueId/periods/:periodId/moves-since-start` → `{ moves: { id: number; teamName: string | null; playerName: string | null; transactionType: string | null; effDate: string }[] }`. These are `TransactionEvent` rows with `leagueId` and `effDate >= period.startDate`, ordered by `effDate` asc. Use `team.name` / `player.name` via `include`, falling back to `ogbaTeamName` / `playerAliasRaw`.

- [ ] **Step 1: Write the failing tests:**
  - roster-check: cap 23 (mock `leagueRule.findMany` returning `roster.pitcher_count`=9 and `roster.batter_count`=14). A team with 24 active rows → `over:true`. The count query's `where` equals `{ teamId, releasedAt: null, assignedPosition: { not: "IL" } }` (assert the args, not just the result).
  - close-readiness:
    - `endDate 2026-09-28T12:00:00Z`, active, `vi.setSystemTime("2026-09-29T12:59:00Z")` → `ready:false`.
    - `"2026-09-29T13:00:00Z"` → `ready:true`.
    - status `"pending"` at any time → `ready:false`.
  - moves-since-start: the `findMany` `where` includes `{ leagueId: 20, effDate: { gte: <startDate> } }`. A period from another league → 404.
  - auth: `requireCommissionerOrAdmin` (mocked factory) was called once per route registration (3 calls).
- [ ] **Step 2:** Run `cd server && npx vitest run src/features/commissioner/__tests__/hubRoutes.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement the three handlers in `hubRoutes.ts` and mount the router.
- [ ] **Step 4:** Re-run. Expected: PASS. Then run `node scripts/check-feature-isolation.mjs`. Expected: exit 0.
- [ ] **Step 5:** Commit: `feat(commissioner): hub read endpoints (roster-check, close-readiness, moves-since-start)`.

---

### Task 4: Hub read endpoints: recent changes, unbilled periods

**Files:**
- Modify: `server/src/features/commissioner/hubRoutes.ts`
- Test: `server/src/features/commissioner/__tests__/hubRoutes.test.ts`

**Interfaces:**
- Produces:
  - `GET /commissioner/:leagueId/recent-changes?limit=N` (default 50, max 100) → `{ changes: { id: number; action: string; resourceType: string; resourceId: string | null; createdAt: string; userName: string | null; metadata: Record<string, unknown> | null }[] }`. Read the latest 500 `AuditLog` rows (newest first, `include: { user: { select: { name: true } } }`). Keep only those whose `metadata.leagueId === leagueId` (number compare), then slice to `limit`. No JSON-path DB filter (portable, no migration).
  - `GET /commissioner/:leagueId/unbilled-periods` → `{ periods: { periodId: number; closedAt: string }[] }`. Read every `AuditLog` row with `action` in `["PERIOD_CLOSE","IL_FEE_RECONCILE"]` and `resourceType: "Period"`, filtered to this league by `metadata.leagueId`. A period is unbilled when its **latest** `PERIOD_CLOSE` has `metadata.billed === false` and no `IL_FEE_RECONCILE` for the same `resourceId` has a later `createdAt`.

- [ ] **Step 1: Write the failing tests:**
  - recent-changes: rows for leagues 20 and 21 → only 20's returned. `limit=2` returns 2.
  - unbilled:
    - `PERIOD_CLOSE billed:false` at T1 for period 6, nothing after → `[{periodId:6}]`.
    - Plus `IL_FEE_RECONCILE` for period 6 at T2 > T1 → `[]` (Review Focus 4).
    - `billed:true` → `[]`.
    - An `IL_FEE_RECONCILE` at T0 < T1 does **not** clear a later `billed:false` close.
- [ ] **Step 2:** Run the test file. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement both handlers.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(commissioner): recent-changes + unbilled-periods endpoints`.

---

### Task 5: Client API wrappers + `deriveNeedsYou`

**Files:**
- Modify: `client/src/features/commissioner/api.ts`
- Create: `client/src/features/commissioner/lib/needsYou.ts`
- Test: `client/src/features/commissioner/__tests__/api.test.ts` (extend), `client/src/features/commissioner/__tests__/needsYou.test.ts`

**Interfaces:**
- Produces in `api.ts` (all via `fetchJsonApi`, `API_BASE`):
  - `getLeaguePeriods(leagueId): Promise<HubPeriod[]>`: `GET /periods?leagueId=` and unwrap `.data`. Type: `HubPeriod = { id: number; name: string; startDate: string; endDate: string; status: "pending"|"active"|"completed"|string }`.
  - `setPeriodStatus(periodId, body: { status: "active"|"completed"; billFees?: boolean }): Promise<HubPeriod>`: `PATCH /periods/:id`.
  - `getRosterCheck`, `getCloseReadiness(leagueId, periodId)`, `getMovesSinceStart(leagueId, periodId)`, `getRecentChanges(leagueId, limit?)`, `getUnbilledPeriods`: the Task 3/4 shapes, exported as types `RosterCheck`, `CloseReadiness`, `MoveSinceStart`, `RecentChange`, `UnbilledPeriod`.
  - `previewIlFees(leagueId, periodId): Promise<IlFeeReconcileResult>`: `POST /commissioner/:leagueId/reconcile-il-fees/:periodId?dryRun=true`. `billIlFees(leagueId, periodId)` is the same call without `dryRun`. The type mirrors the server's `ReconcileResult` / `ReconcilePreviewRow`.
  - `getAcceptedTradeCount(leagueId): Promise<number>`: `GET /trades?leagueId=&status=ACCEPTED`, returns `trades.length`.
  - `getPeriodStandingsPreview(leagueId, periodId)`: `GET /standings/period-category-standings?leagueId=&periodId=`. Type it from that handler's `res.json` (`server/src/features/standings/routes.ts:117`) and export a `toTeamTotals(resp): { teamName: string; points: number }[]` sorted by points desc.
- Produces in `needsYou.ts`: `deriveNeedsYou(input: { periods: HubPeriod[]; ghostIlTotal: number; teamsOverCap: number; acceptedTrades: number; unbilled: UnbilledPeriod[]; now: Date }): NeedsYouItem[]`, with `NeedsYouItem = { key: string; kind: "start"|"close"|"roster"|"trade"|"bill"; title: string; detail: string; to: string /* path relative to /commissioner/:leagueId */; urgent: boolean }`.
  - `start`: a `pending` period whose UTC start date ≤ today's UTC date, where no `active` period has an `endDate` in the future. `urgent: true`, `to: "start/<id>"`, title `"Start <name> · today"` if the start date is today, else `"Start <name> · <n> days late"`.
  - `close`: an `active` period whose UTC end date < today's UTC date. `to: "close/<id>"`.
  - `roster`: emitted when `ghostIlTotal + teamsOverCap > 0`. `to: "rosters"`.
  - `trade`: emitted when `acceptedTrades > 0`. `to: "trades"`.
  - `bill`: one per unbilled period. `to: "money"`.
  - Order: urgent first, then close, bill, roster, trade.

- [ ] **Step 1: Write the failing tests:** URL/method assertions for every new wrapper (mirror the existing `getGhostIlSummary` test), plus `needsYou.test.ts` cases:
  - pending P8 starting today, with active P7 ended yesterday → `[start(urgent), close]` in that order.
  - pending P8 starting in 3 days → no start item.
  - nothing to do → `[]`.
  - `ghostIlTotal: 1` → one roster item.
  - two unbilled → two bill items.
  - start 2 days late → the title contains `"2 days late"`.
- [ ] **Step 2:** Run `cd client && npx vitest run src/features/commissioner/__tests__/api.test.ts src/features/commissioner/__tests__/needsYou.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS. Then run `node scripts/check-feature-isolation.mjs`. Expected: exit 0.
- [ ] **Step 5:** Commit: `feat(commissioner): hub API wrappers + deriveNeedsYou`.

---

### Task 6: Re-home existing tab panes as section pages

**Files:**
- Modify: `client/src/features/commissioner/pages/Commissioner.tsx` (tab state at ~:345–375, tab bar render, panes at :913/:1116/:1391/:1489/:1644/:1771)
- Create: `client/src/features/commissioner/pages/CommissionerSectionPage.tsx`
- Modify: `client/src/App.tsx` (commissioner routes near :182–:211)
- Test: `client/src/features/commissioner/__tests__/CommissionerSectionPage.test.tsx`

**Interfaces:**
- Produces:
  - `Commissioner` accepts optional props `{ section?: TabKey; opsSubTab?: "roster"|"trades"|"ghost-il"|"bulk"; hideTabs?: boolean }`. These seed the initial `activeTab` / `opsSubTab`, and `hideTabs` suppresses the top-level tab bar. Sub-tabs inside a pane stay visible.
  - `CommissionerSectionPage` reads `:leagueId` and `:section` and maps the slug:

    | Slug | Renders |
    |---|---|
    | `rosters` | `{section:"ops", opsSubTab:"roster"}` |
    | `trades` | `{section:"ops", opsSubTab:"trades"}` |
    | `money` | `{section:"finances"}` |
    | `settings` | `{section:"settings"}` |
    | `owners` | `{section:"people"}` |
    | `overview` | `{section:"overview"}` |
    | `archive` | `{section:"archive"}` |

    It renders a "‹ Commissioner" back link to `/commissioner/:leagueId` above `<Commissioner … hideTabs />`. An unknown slug redirects to the hub.
  - Route: `/commissioner/:leagueId/:section`, declared **after** the existing `wire-list` and `scoring` routes, so those keep matching. (`close`/`start`/`recent` get their own routes in Tasks 7–9, also declared before this catch.)

- [ ] **Step 1: Write the failing tests** (mock the commissioner API module as `Commissioner.test.tsx` does):
  - `/commissioner/20/money` shows the Finances pane content and no element with the tab-bar role/label.
  - `/commissioner/20/trades` shows the Operations → trades sub-pane.
  - `/commissioner/20/bogus` navigates to `/commissioner/20`.
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Implement the props, the page and the route. Change nothing inside the panes.
- [ ] **Step 4:** Re-run. Also re-run `Commissioner.test.tsx`; it must still pass unchanged.
- [ ] **Step 5:** Commit: `feat(commissioner): section routes re-home existing panes`.

---

### Task 7: Commissioner hub page + recent changes page

**Files:**
- Create: `client/src/features/commissioner/pages/CommissionerHub.tsx`, `client/src/features/commissioner/pages/RecentChangesPage.tsx`
- Modify: `client/src/App.tsx`. `/commissioner/:leagueId` now renders `CommissionerHub` (keep the `ErrorBoundary name="commissioner"` wrapper). Add `/commissioner/:leagueId/recent`.
- Test: `client/src/features/commissioner/__tests__/CommissionerHub.test.tsx`

**Interfaces:**
- Consumes: Task 5's wrappers and `deriveNeedsYou`, plus `getGhostIlSummary` (existing).
- Produces, from the mockup `phase1-mockups-v2.html`:
  - **"Needs you" card:** a count badge, then each item as a full-width ≥ 48px row linking to `item.to`. Urgent items use the warning token.
  - **"Jobs" card:** exactly seven rows, in this order: Close a period → the active period's `close/<id>` (or the most recent ended one), Start next period → the first pending period's `start/<id>`, Fix a roster → `rosters`, Trades → `trades`, Money → `money`, League settings & rules → `settings`, Owners & invites → `owners`.
  - **"More" links:** `overview`, `archive`.
  - **"Recent changes" card:** the latest 3 from `getRecentChanges(leagueId, 3)`, plus "All ›" → `recent`.
  - `RecentChangesPage`: the full list (limit 50), read-only, with the footnote "Older actions from before this feature may not appear."
  - **Copy for audit actions:**

    | Action | Text |
    |---|---|
    | `PERIOD_CLOSE` | `"Closed <period name or #id> (fees billed)"` or `"(bill later)"` |
    | `PERIOD_START` | `"Started <…>"` |
    | `IL_FEE_RECONCILE` | `"Billed IL fees for <…>"` |
    | `TRADE_PROCESS` | `"Processed trade #<resourceId>"` |
    | anything else | the action name in sentence case |
  - **Loading:** each card shows its own skeleton. **A failed fetch** shows a one-line error inside that card only; the rest of the hub still renders.

- [ ] **Step 1: Write the failing tests:**
  - With a pending P8 starting today and an ended active P7, the hub shows "Start Period 8 · today" first, linking to `/commissioner/20/start/8`.
  - Jobs shows 7 rows with the hrefs above.
  - If `getRecentChanges` rejects, Needs you and Jobs still render.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(commissioner): hub page + recent changes`.

---

### Task 8: Close a period (5-step guided route) + shared confirm sheet

**Files:**
- Create: `client/src/components/shared/ConfirmSheet.tsx`, the only overlay allowed by the spec, so it's shared and lives outside feature modules.
- Create: `client/src/features/commissioner/pages/ClosePeriodPage.tsx`
- Modify: `client/src/App.tsx`, adding `/commissioner/:leagueId/close/:periodId`
- Test: `client/src/components/shared/__tests__/ConfirmSheet.test.tsx`, `client/src/features/commissioner/__tests__/ClosePeriodPage.test.tsx`

**Interfaces:**
- Produces:
  - `ConfirmSheet({ open, title, body, confirmLabel, cancelLabel = "Cancel", busy, onConfirm, onCancel }: {...}): JSX.Element | null`.
    - It's a bottom-anchored panel on < 768px and a centered panel on desktop, with a scrim.
    - Esc and a scrim click call `onCancel`.
    - Focus moves to the confirm button when it opens.
    - `busy` disables both buttons.
  - `ClosePeriodPage`: the step is held in `?step=1..5` (default 1), and moving forward uses `navigate("?step=N")`, which **pushes** history so Back returns to the previous step. The steps:
    1. `getCloseReadiness`: shows the end date and last stat date. If `ready` is false, no Next button, just the text "Come back after tomorrow morning's stats sync." plus a link back to the hub.
    2. `getGhostIlSummary` + `getRosterCheck`: flagged rows link to `../../rosters`. **Next is always enabled**, under the note "This checks rosters as they are now, not every day of the period."
    3. `getPeriodStandingsPreview` → `toTeamTotals`, labeled "not final".
    4. `previewIlFees`: the per-team sum of `preview` rows (`action:"add"` minus voids) and the total. Two buttons: **"Close & bill now"** sets `billFees=true` and goes to step 5; **"Close, bill later"** sets `billFees=false` and goes to step 5. The choice rides in the URL as `&bill=now|later`, so a reload keeps it.
    5. A summary, then a `ConfirmSheet` (title `"Close <name>?"`, body `"Standings lock{ and $X in IL fees are billed| — IL fees stay unbilled until you bill them}. You can't undo this."`). Confirming calls `setPeriodStatus(periodId, { status:"completed", billFees })` once, then a toast `"<name> closed"`, then navigates to `/commissioner/:leagueId`.
  - Every step re-fetches its own data on mount (no cross-step cache), which covers reload safety.

- [ ] **Step 1: Write the failing tests:**
  - ConfirmSheet: Esc calls `onCancel`; with `busy`, a confirm click doesn't call `onConfirm`.
  - Close page:
    - With `ready:false`, step 1 has no "Next" button.
    - Rendering `?step=4` calls `previewIlFees` on mount (reload case).
    - Clicking "Close, bill later" then confirming calls `setPeriodStatus` with `{status:"completed", billFees:false}`.
    - **Double-clicking confirm calls `setPeriodStatus` exactly once** (Review Focus 1).
    - After the step 2 → 3 navigation, `history.back()` renders step 2 (use `MemoryRouter` with `initialEntries` + `initialIndex`).
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(commissioner): guided close-period flow with fee preview`.

---

### Task 9: Start next period + guided flow becomes the only close in the UI

**Files:**
- Create: `client/src/features/commissioner/pages/StartPeriodPage.tsx`
- Modify: `client/src/App.tsx`, adding `/commissioner/:leagueId/start/:periodId`
- Modify: `client/src/features/commissioner/components/SeasonManager.tsx:603-618`, the status `<select>`
- Test: `client/src/features/commissioner/__tests__/StartPeriodPage.test.tsx`, plus a SeasonManager test (extend the existing one if present; otherwise create `__tests__/SeasonManager.test.tsx`)

**Interfaces:**
- Produces:
  - **StartPeriodPage:**
    - Shows the period's dates and a "today" / "N days late" badge.
    - Lists `getMovesSinceStart` results under "⚠ N moves made while pending", each linking to `../../rosters`. If there are none, it shows "No moves since the start date."
    - If the period isn't `pending`, it shows "This period has already started" and a link back.
    - If `:periodId` doesn't exist in `getLeaguePeriods`, it shows "No next period set up" with a link to `../../settings`.
    - The confirm sheet calls `setPeriodStatus(id, { status:"active" })` once, then shows a toast and navigates to the hub.
  - **SeasonManager:** the `<option value="completed">` renders **only** when `p.status === "completed"` (so a completed period still displays its value), and as `disabled`. Next to an active period, add a link "Close…" → `/commissioner/:leagueId/close/:id`.

- [ ] **Step 1: Write the failing tests:**
  - Start page:
    - With 1 move since start, it shows the warning and the player name.
    - A non-pending period shows "already started".
    - Confirming calls `setPeriodStatus(8, {status:"active"})` once.
  - SeasonManager: an active period's select has no enabled `completed` option.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(commissioner): start-next-period job; close only via guided flow`.

---

### Task 10: Full verification, browser check, PR

**Files:** none new (plus the docs regenerated by `docs:refresh`).

- [ ] **Step 1:** `npm run test 2>&1 | tee /tmp/test.log`. Expected: 0 failures across server and client (read the whole log).
- [ ] **Step 2:** Server and client `npx tsc --noEmit`, each teed to a file, then `grep -c "error TS"`. Expected: `0` and `0`.
- [ ] **Step 3:** `node scripts/check-feature-isolation.mjs`. Expected: exit 0.
- [ ] **Step 4: Browser check on the local server against non-prod data,** at 440 × 956 and at desktop width, in light **and** dark (current tokens):
  - The hub loads.
  - Every job row lands on the right page.
  - Close-flow steps 1→5 work, including Back from step 3 to step 2, and a reload on step 4.
  - "Close, bill later" makes a bill item appear in Needs you. Running a manual bill on the Money page clears it.
  - Start next period, including the moves warning.
  - The fee total on step 4 equals the ledger rows the drainer writes for the same period after "Close & bill now". Compare in the local DB.
  - Tap targets ≥ 44px.
  - Console errors: none.
- [ ] **Step 5:** `npm run docs:refresh`. Commit the regenerated docs, excluding `docs/under-the-hood/system-status.md`. Push, then open the PR. The PR body includes the browser-check sentence and **"prod period close is James's action; not exercised on prod."**

---
id: DOC-036
title: "Commissioner C — Rosters and the meeting (UX step C) — implementation plan"
description: "Rosters home, meeting moves entry, review-and-save, one-team fixes; replaces the legacy Manual Roster and Activate Needed tabs."
type: plan
status: active
phase: null
owner: james
tags: [league-admin, roster]
links: [DOC-035, DOC-034, DOC-032]
updated: 2026-11-10
---

# Commissioner C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the commissioner Rosters page (four inner tabs, a three-column add/drop panel, unusable on phone) with Style Bible screens 12–15:
- 12 Rosters home: meeting card between periods, teams A to Z with fix flags
- 13 Meeting: one team's moves, each an add + drop pair, checked as you type
- 14 Review and save: every move by team, flags on top, one confirm sheet, saved dated to the next period's start
- 15 One team: one-off fixes between meetings (Move to IL, Drop, Activate)

**Architecture:**
- Client only. **No server change, no schema change, no migration.** Every write goes through the existing endpoints the legacy Manual Roster tool already uses (`/api/transactions/claim`, `/il-stash`, `/il-activate`, and their `/preview` twins), so fees, TransactionEvents, AuditLog and IL fee reconcile behave exactly as today.
- The meeting draft lives in the browser (`localStorage`, keyed by league + period), written on every change. Nothing reaches rosters until Review → Save.
- Save runs the moves one at a time in draft order: preview, then claim with `effectiveDate = next period startDate`. Saved moves leave the draft; failed moves stay in the draft with the server's error on the row.
- Four new pages in `client/src/features/commissioner/pages/`, one pure lib `client/src/features/commissioner/lib/meetingDraft.ts`, new wrappers in `client/src/features/commissioner/api.ts`.

**Tech Stack:** React 18, React Router 6, Vitest + Testing Library.

**Spec:** Style Bible screens 12–15 (https://claude.ai/artifact/UDWjhsrCsDKxovbSjkyPXc#screens; repo copy `client/public/style-bible/index.html`), the roadmap step C card (https://claude.ai/artifact/2ZwcUjSmsWTMZ34GjCU5vS#c), and James's direction: commissioner area must not scroll needlessly, must be intuitive, must fit the screen; phone and desktop versions of every screen.

## Decisions taken at planning time (rulings)

1. **Draft lives in the browser, not a new table.** No migration (prod has frozen twice on migrations). Cost if wrong: switching devices mid-meeting loses the draft; a cleared browser loses it. Server-side drafts can come later without changing the screens.
2. **Save is sequential, not one database transaction.** The claim handler is ~500 lines with money and IL side effects; wrapping N of them in one transaction means a risky refactor. Each move is independent (one team, one add, one drop), each is previewed right before it's written, and failures stay visible in the draft for retry. Cost if wrong: a mid-save failure leaves some moves saved and some not — the screen says exactly which.
3. **Effective date = the next period's `startDate`** (date part, `YYYY-MM-DD`). If no next period exists the meeting card says "Set up the next period first" and links to `/commissioner/:id/season`.
4. **One-off fixes (screen 15) send no `effectiveDate`.** The server then uses tomorrow, the same as an owner's own move, and does NOT turn on backdated auto-release.
5. **"Change position" from screen 15 is deferred.** There is no standalone slot-change endpoint; lineup slots are managed on the team's roster page. Screen 15 shows Move to IL, Drop, Activate.
6. **Bulk import survives** as "Preseason tools", a link on Rosters home to `/commissioner/:id/roster-setup`, which renders the legacy Bulk panel (keepers + CSV roster setup) through `CommissionerSectionPage`.
7. **Trade Review stays** on `/commissioner/:id/trades` (legacy) until step D.

## Global Constraints

- **Worktree:** `/Users/jameschang/Projects/thefantasticleagues/tfl-step-c`, branch `feat/commissioner-c-rosters`, stacked on `feat/commissioner-b2` (`a65b3a67`, PR #479). node_modules are symlinked: never `npm install`, never commit node_modules.
- **No server code change.** If a task believes it needs one, stop and report.
- **Writes use only these endpoints**, via wrappers in the commissioner `api.ts` (no imports from `features/transactions`):
  - `POST /api/transactions/claim/preview` and `/claim` — body `{leagueId, teamId, playerId, dropPlayerId, effectiveDate?}`
  - `POST /api/transactions/il-stash/preview` and `/il-stash` — body `{leagueId, teamId, stashPlayerId, addPlayerId?}`
  - `POST /api/transactions/il-activate/preview` and `/il-activate` — body `{leagueId, teamId, activatePlayerId, dropPlayerId}`
  - Preview success is `{ok:true, ...}`; failure is HTTP 400/404 `{ok:false, error, code}`. Mutation failure is `{error, code?}`. Show `error` verbatim on the row.
- **Never send `effectiveDate` from screen 15.** Always send it from meeting Save.
- **Never call claim without a successful preview in the same save pass.** (Any supplied `effectiveDate` makes the server auto-release a player from another team; the preview's `OWNERSHIP_CONFLICT` is what stops that.)
- **Reads:**
  - Teams + periods: `getCommissionerOverview`, `getLeaguePeriods` + `derivePeriodState` (`lib/periodState.ts`)
  - Rosters: `getCommissionerRosters` (all active rows; filter by `teamId`; IL = `assignedPosition === "IL"`)
  - Cap and over-cap: `getRosterCheck` → `{cap, teams:[{teamId, activeCount, over}]}`
  - Back from MLB IL: `getGhostIlSummary`
  - Free agents: `GET /api/player-season-stats?leagueId=N&freeAgentsOnly=true&q=<text>&take=20` (server already applies NL-only from the league's `stats_source`)
  - IL fees: league rules `il_slot_1_cost` / `il_slot_2_cost` (defaults $10 / $15) via `getCommissionerRules`
- **Commissioner-only:** every new page wraps its body in `CommissionerOnly` (B2 pattern: `export default function XPage(){ return <CommissionerOnly><XBody/></CommissionerOnly> }`).
- **Style:** sizes only 13/15/17/24/32 (`textSizeSweep`); colors only `--am-*`; inputs/pickers on `--am-field` / `--am-field-line`; cards `--am-surface`; tap targets ≥ 44px, rows ≥ 56px; back link at the top, no header card; `PlayerFace` / `TeamLogo` for players and MLB teams. Phone first; two columns / tables at ≥ 1024px exactly as the screen mockups show.
- **No modals** except `ConfirmSheet` for: meeting Save, Move to IL, Drop, Activate.
- **Copy:** plain American English, sentence case. Dates like "Mon Jun 15". Money "$15". Use the mockup wording.
- **Feature isolation (ADR-015):** `node scripts/check-feature-isolation.mjs` reports 0 new violations.
- **localStorage:** wrap every read and write in try/catch; the page works (draft in memory only) if storage throws.
- **Docs:** `npm run docs:refresh` before push. Never commit `docs/under-the-hood/system-status.md`.
- **Never run anything against prod.**
- **Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two teams add the same free agent at one meeting.** The second add is flagged in the draft ("Already added by Bombers tonight") and blocked from Save.
2. **Dropping someone added tonight**, or dropping the same player twice, is flagged and blocked.
3. **Reload mid-meeting** restores every move, the Passed / No moves marks, and the selected team.
4. **Save with one bad move** (preview fails, e.g. a player was claimed by an owner since the draft was made): the good moves save, the bad one stays in the draft with the server's message, and the screen says "Saved 8 of 9 moves".
5. **Meeting card when there's no next period** says "Set up the next period first" with a link, never a broken meeting URL.

---

### Task 1: Meeting draft model (`lib/meetingDraft.ts`)

**Files:**
- Create: `client/src/features/commissioner/lib/meetingDraft.ts`
- Test: `client/src/features/commissioner/__tests__/meetingDraft.test.ts`

**Interfaces — Produces:**
```ts
export interface DraftPlayer { playerId: number; name: string; pos: string; mlbTeam: string | null; mlbId: number | null }
export interface DraftMove { id: string; teamId: number; add: DraftPlayer | null; drop: DraftPlayer | null; error?: string }
export type TeamMark = "passed" | "done";
export interface MeetingDraft { leagueId: number; periodId: number; moves: DraftMove[]; marks: Record<number, TeamMark>; selectedTeamId: number | null }
export interface MoveFlag { moveId: string; message: string }

export function emptyDraft(leagueId: number, periodId: number): MeetingDraft
export function draftKey(leagueId: number, periodId: number): string   // "fbst.meetingDraft.v1.<league>.<period>"
export function loadDraft(leagueId: number, periodId: number): MeetingDraft      // emptyDraft on missing/corrupt/throwing storage
export function saveDraft(d: MeetingDraft): void                               // swallows storage errors
export function clearDraft(leagueId: number, periodId: number): void
export function addMove(d: MeetingDraft, teamId: number): MeetingDraft         // appends {add:null,drop:null}
export function updateMove(d: MeetingDraft, id: string, patch: Partial<Pick<DraftMove,"add"|"drop"|"error">>): MeetingDraft
export function removeMove(d: MeetingDraft, id: string): MeetingDraft
export function setMark(d: MeetingDraft, teamId: number, mark: TeamMark | null): MeetingDraft
export function completeMoves(d: MeetingDraft): DraftMove[]                    // add && drop both set
export function flagMoves(d: MeetingDraft, teamNames: Record<number,string>): MoveFlag[]
export function teamCountAfter(activeCount: number, d: MeetingDraft, teamId: number): number  // active + adds - drops (complete moves only)
```
All functions are pure and return new objects (no mutation).

`flagMoves` rules, each producing one flag per offending move, messages exactly:
- incomplete: `"Needs a drop"` (add, no drop) / `"Needs an add"` (drop, no add)
- same add on two moves (any teams): later move gets `"Already added by <team> tonight"`
- drop of a player added tonight by the same team: `"<name> was added tonight and can't be dropped"`
- same drop twice: later move gets `"<name> is already being dropped"`

- [ ] **Step 1: Write failing tests** covering: emptyDraft shape; add/update/remove/setMark immutability (original object unchanged); `completeMoves` filter; each `flagMoves` rule with the exact message; `teamCountAfter(23, …)` is 23 for a complete pair and still 23 for an add-only move (only complete moves count); `loadDraft` returns emptyDraft for corrupt JSON and when `localStorage.getItem` throws; `saveDraft` → `loadDraft` round trip; `saveDraft` does not throw when `setItem` throws.
- [ ] **Step 2:** `cd client && npx vitest run src/features/commissioner/__tests__/meetingDraft.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement. Move ids via `crypto.randomUUID?.() ?? String(Date.now()+Math.random())`. `loadDraft` validates `leagueId`/`periodId` match and `Array.isArray(moves)`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(commissioner): meeting draft model for step C`.

### Task 2: API wrappers

**Files:**
- Modify: `client/src/features/commissioner/api.ts`
- Test: `client/src/features/commissioner/__tests__/rosterMovesApi.test.ts`

**Interfaces — Produces** (all `leagueId: number` first; use the file's existing `fetchJsonApi` + `API_BASE` pattern):
```ts
export interface PreviewResult { ok: boolean; error?: string; code?: string }
export interface FreeAgent { playerId: number; name: string; pos: string; mlbTeam: string | null; mlbId: number | null }
export function searchFreeAgents(leagueId: number, q: string): Promise<FreeAgent[]>   // freeAgentsOnly=true&take=20; q trimmed; "" → []
export function previewMove(leagueId: number, teamId: number, addId: number, dropId: number): Promise<PreviewResult>
export function saveMove(leagueId: number, teamId: number, addId: number, dropId: number, effectiveDate: string): Promise<void>
export function previewCommissionerIlStash(leagueId: number, teamId: number, stashPlayerId: number, addPlayerId: number): Promise<PreviewResult>
export function commissionerIlStash(leagueId: number, teamId: number, stashPlayerId: number, addPlayerId: number): Promise<void>
export function previewCommissionerIlActivate(leagueId: number, teamId: number, activatePlayerId: number, dropPlayerId: number): Promise<PreviewResult>
export function commissionerIlActivate(leagueId: number, teamId: number, activatePlayerId: number, dropPlayerId: number): Promise<void>
export function previewOneOffSwap(leagueId: number, teamId: number, addId: number, dropId: number): Promise<PreviewResult> // same as previewMove
export function oneOffSwap(leagueId: number, teamId: number, addId: number, dropId: number): Promise<void>                 // claim WITHOUT effectiveDate
```
- Previews **never throw** on a 400/404 rule failure: they resolve `{ok:false, error, code}` read from the response body. Network/500 → `{ok:false, error:"Couldn't check this move. Try again."}`.
- Mutations throw `Error(body.error ?? "Save failed")` on non-2xx.
- `searchFreeAgents` maps the server row fields (read `server/src/features/players/routes.ts` ~436–560 for the actual names: id, name, posPrimary/positions, mlbTeam, mlbId) to `FreeAgent`. Write the test fixture from that real shape (see memory: fixtures must mirror real API responses).
- `oneOffSwap`, `ilStash`, `ilActivate` bodies contain **no** `effectiveDate` key. `saveMove` always contains it.

- [ ] **Step 1: Failing tests** mocking `fetch`: assert URL, method, and exact JSON body for each function (including absence of `effectiveDate` for one-off calls and presence for `saveMove`); preview resolves `{ok:false,error,code}` on a 400 body; preview resolves the generic message on a 500; mutation rejects with the server error text; `searchFreeAgents("")` makes no request.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Check how existing functions in this file call `fetchJsonApi` and whether it throws on non-2xx with the body available; if it hides the body, use `fetch` with the same credentials/headers helper the file already uses.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(commissioner): roster move API wrappers for step C`.

### Task 3: Rosters home (screen 12)

**Files:**
- Create: `client/src/features/commissioner/pages/RostersPage.tsx`
- Test: `client/src/features/commissioner/__tests__/RostersPage.test.tsx`

**Interfaces — Consumes:** Task 1 `loadDraft`, `completeMoves`; B2 `getCommissionerOverview`, `getLeaguePeriods`, `derivePeriodState`, `getRosterCheck`, `getCommissionerRosters`, `getGhostIlSummary`, `CommissionerOnly`, `cardParts`.
**Produces:** route component for `/commissioner/:leagueId/rosters`.

Layout (copy from mockup 12):
- Back link `‹ Commissioner`, title "Rosters".
- **Meeting card**, shown only when `derivePeriodState().step` is `"meeting"` or `"start"`:
  - With a next period: cap "Between Period N and N+1" (or "Before Period N+1" when no completed period), title "Period N+1 meeting moves", body "Enter every owner's adds and drops, review, then save them all at once. Dated <Mon Jun 15>." Primary button "Enter meeting moves" → `/commissioner/:id/meeting/:nextPeriodId`. If the stored draft has complete moves, button text "Continue meeting moves (<n>)".
  - Without a next period: "Set up the next period first" + link "Season and periods ›" → `/commissioner/:id/season`.
- **Teams · A to Z**: phone = rows (team name, `<active> / <cap>`, flag or ›); desktop ≥1024px = table with columns Team, Roster, IL, Needs attention. Row → `/commissioner/:id/rosters/:teamId`.
  - Flags: over cap → "<n> over" (phone) / "<n> over the limit" (desktop), negative color; each ghost IL player → "<Last name> back from MLB IL" with a "Fix" affordance, warning color. Otherwise "–".
- Footer link "Preseason tools ›" → `/commissioner/:id/roster-setup`.

- [ ] **Step 1: Failing tests** (mock the api module): meeting card shows with exact copy and link when state is meeting with a pending next period; hidden when state is `play`; "Set up the next period first" when no next period; teams sorted A–Z with `23 / 23`; over-cap and ghost flags with exact copy; row link targets; "Continue meeting moves (2)" when a draft with 2 complete moves exists in localStorage; non-commissioner sees "Commissioners only."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS; `textSizeSweep` passes.
- [ ] **Step 5:** Commit `feat(commissioner): rosters home (screen 12)`.

### Task 4: Meeting moves entry (screen 13)

**Files:**
- Create: `client/src/features/commissioner/pages/MeetingPage.tsx`
- Create: `client/src/features/commissioner/components/MoveEditor.tsx` (one move card: add search, drop chooser, Remove) and `components/PlayerSearch.tsx` (debounced 250ms `searchFreeAgents`, results list, ≥44px rows, Field-colored input)
- Test: `client/src/features/commissioner/__tests__/MeetingPage.test.tsx`

**Interfaces — Consumes:** Tasks 1 and 2; `getCommissionerOverview`, `getLeaguePeriods`, `getCommissionerRosters`, `getRosterCheck`.
**Produces:** route component for `/commissioner/:leagueId/meeting/:periodId`; `MoveEditor` and `PlayerSearch` (reused by Task 6).

Behavior:
- Header: back `‹ Rosters`, title "Period N moves", subline "Dated <Mon Jun 15> · <k> of <T> teams done · nothing saved until you review". A team is "done" when marked passed/done or it has ≥1 complete move.
- If `periodId` is not a pending period: show "This period has already started. Meeting moves are for the next period." + back link. No editor.
- Team list A–Z: status per team: "Passed", "<n> ✓", "Not yet", or › for the selected team. Phone: the list is its own view; tapping a team opens that team's editor (back returns to list). Desktop: list left, editor right, "Tonight's moves" card under the editor.
- Editor: title "<Team> · <count after> / <cap>". One `MoveEditor` per move of that team; "+ Another move" adds one; "No moves" marks passed and returns to the list (phone) / next team (desktop); "Done · back to teams" / "Done · next team" marks done.
- `MoveEditor`: "+ <add>" row with `PlayerFace`, pos · MLB team · free agent; "− <drop>" row chosen from that team's current active (non-IL) roster minus players already being dropped tonight. Empty states "Add: search NL free agents" and "Drop: choose a player ›".
- Checks as you type, shown under the moves: "✓ Roster stays at <c> / <cap>" when every move is complete and nothing is flagged; otherwise each `flagMoves` message for that team. When a move becomes complete, call `previewMove` once; on `{ok:false}` store `error` on the move and show it on the card.
- Every change → `saveDraft`. On mount → `loadDraft`, restore `selectedTeamId`.
- "Tonight's moves (<n>)" lists complete moves by team ("+ Casas · − Pham"); "Review all moves" → `.../meeting/:periodId/review`, disabled with no complete moves.

- [ ] **Step 1: Failing tests:** restores a saved draft (moves, marks, selected team) on mount; adding a free agent via search + choosing a drop produces a complete move and calls `previewMove` once with the right ids; preview failure shows the server message on the card; drop chooser excludes IL players and players already being dropped; "No moves" sets Passed; the same free agent added for a second team shows "Already added by <team> tonight" and Review lists it as flagged; non-pending period shows the "already started" message; every change writes localStorage.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(commissioner): meeting moves entry (screen 13)`.

### Task 5: Review and save (screen 14)

**Files:**
- Create: `client/src/features/commissioner/pages/MeetingReviewPage.tsx`
- Test: `client/src/features/commissioner/__tests__/MeetingReviewPage.test.tsx`

**Interfaces — Consumes:** Tasks 1, 2; `ConfirmSheet`.
**Produces:** route component for `/commissioner/:leagueId/meeting/:periodId/review`.

Behavior:
- Header: back `‹ Period N moves`, title "Review", desktop right side "<n> moves".
- Flags card at top (negative): every `flagMoves` message plus every move with a stored `error`, prefixed "<Team>: ". Phone rows / desktop table (Team, Add, Drop, Edit/Fix). Edit/Fix → back to the meeting page with that team selected (set `selectedTeamId` in the draft before navigating).
- Save button "Save <n> moves for <t> teams" — disabled while any flag exists, with the line "Fix the flagged move first." Opens `ConfirmSheet`: title "Save <n> moves for <t> teams?", body "Rosters change effective <Mon Jun 15>. Owners see the moves in Activity.", confirm "Save moves", cancel "Keep reviewing".
- On confirm, for each complete move in draft order: `previewMove` → if ok `saveMove(..., effectiveDate = nextPeriod.startDate.slice(0,10))` → remove from draft and `saveDraft`; if preview not ok or save throws, store the message as `error` and continue. Show progress "Saving 3 of 9…".
- All saved: `clearDraft`, toast "Saved <n> moves", navigate to `/commissioner/:id/start/:periodId`. Some failed: stay, banner "Saved <k> of <n> moves. The rest need a look." with failed moves listed and flagged.
- Do not use B2's "<n> moves" wording that implies legal rosters; the copy above is final.

- [ ] **Step 1: Failing tests:** flags from `flagMoves` and stored errors render at top and disable Save; confirm sheet copy exact; save calls preview then claim per move in order, with `effectiveDate` equal to the pending period's start date; a preview failure on move 2 of 3 saves moves 1 and 3, keeps move 2 in localStorage with its error, and shows "Saved 2 of 3 moves. The rest need a look."; claim is never called for a move whose preview failed; all-success clears the draft and navigates to the Start page.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(commissioner): review and save meeting moves (screen 14)`.

### Task 6: One team — one-off fixes (screen 15)

**Files:**
- Create: `client/src/features/commissioner/pages/TeamRosterPage.tsx`
- Test: `client/src/features/commissioner/__tests__/TeamRosterPage.test.tsx`

**Interfaces — Consumes:** Task 2; Task 4 `PlayerSearch`; `getCommissionerRosters`, `getRosterCheck`, `getGhostIlSummary`, `getCommissionerRules`, `ConfirmSheet`.
**Produces:** route component for `/commissioner/:leagueId/rosters/:teamId`.

Behavior:
- Header: back `‹ Rosters`, title "<Team>" (desktop "<Team> · <active> / <cap>").
- Ghost banner for each ghost: "<Last> is back from the MLB IL but still in your IL slot." + "Activate ›" (opens the Activate flow).
- Roster grouped Hitters / Pitchers / IL (phone) or one table Slot, Player, MLB, Status, Action (desktop), slot order C, 1B, 2B, 3B, SS, MI, CM, OF, DH, P, SP, RP, BN, IL.
- Row "Actions" opens an inline action panel under the row (phone) or the right column (desktop) — not a modal — with "Move to IL ›", "Drop ›". IL rows show "Activate".
- **Move to IL:** heading "<Last>: move to IL", line "IL slot <k> of 2 · fee $<fee> per period" (fee = `il_slot_1_cost` for slot 1, `il_slot_2_cost` for slot 2; defaults 10/15), `PlayerSearch` "Add a replacement: search NL free agents", check line from `previewCommissionerIlStash` ("✓ Roster stays at 23 / 23" or the server error). Button "Move <Last> to IL" → `ConfirmSheet` → `commissionerIlStash`. Cancel closes the panel.
- **Drop:** `PlayerSearch` for the add, `previewOneOffSwap`, button "Drop <Last>, add <Last>" → `ConfirmSheet` → `oneOffSwap`.
- **Activate:** choose a drop from active players, `previewCommissionerIlActivate`, button "Activate <Last>" → `ConfirmSheet` → `commissionerIlActivate`.
- After any success: toast, reload rosters, close the panel.

- [ ] **Step 1: Failing tests:** ghost banner copy; rows in slot order; Move to IL shows "IL slot 2 of 2 · fee $15 per period" when one IL slot is already used; replacement pick calls `previewCommissionerIlStash` with the right ids; confirm calls `commissionerIlStash` with a body that has no `effectiveDate`; preview failure shows the server error and disables the button; Drop and Activate flows call the right functions; non-commissioner sees "Commissioners only."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(commissioner): one team one-off fixes (screen 15)`.

### Task 7: Routing and retiring the legacy tabs

**Files:**
- Modify: `client/src/App.tsx` (add routes **above** the `/commissioner/:leagueId/:section` catch-all): `rosters` → RostersPage, `rosters/:teamId` → TeamRosterPage, `meeting/:periodId` → MeetingPage, `meeting/:periodId/review` → MeetingReviewPage, each in `ErrorBoundary`. Lazy-load them the same way B2 pages are loaded in that file.
- Modify: `client/src/features/commissioner/pages/CommissionerSectionPage.tsx`: remove `rosters`; add `"roster-setup": { section: "ops", opsSubTab: "bulk" }`.
- Modify: `client/src/features/commissioner/pages/Commissioner.tsx`: remove the `roster` (Manual Roster) and `ghost-il` (Activate Needed) sub-tabs and their panels; default `opsSubTab` becomes `"trades"`; the ghost-IL banner inside ops links to `/commissioner/:id/rosters` instead of switching tabs.
- Delete `client/src/features/commissioner/components/CommissionerRosterTool.tsx` **only if** `grep -rn "CommissionerRosterTool" client/src` shows no import outside Commissioner.tsx and tests (RosterGrid only mentions it in a comment — update that comment). Update or delete the tests that covered the removed tabs.
- Mobile: check `MobileLayoutGate` / `pickMobilePage` does not intercept the new routes (memory: twin pages get empty `useParams`). If it does, add the routes to its pass-through list.
- Test: update `CommissionerSectionPage.test.tsx`, `Commissioner.test.tsx`; add a routing test that `/commissioner/5/rosters` renders RostersPage and `/commissioner/5/roster-setup` renders the legacy Bulk panel.

- [ ] **Step 1:** Write/adjust the failing routing tests.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Full client suite + typecheck: `cd client && npx tsc --noEmit -p . > /tmp/c-tsc.log 2>&1; echo $?` (read the WHOLE log, never `tail`) and `npx vitest run` → all pass; `node scripts/check-feature-isolation.mjs` → 0 new.
- [ ] **Step 5:** Commit `feat(commissioner): route step C screens, retire legacy roster tabs`.

### Task 8 (controller): Browser verification and PR

- Local stack per memory `local-browser-check-setup` (Colima, local Supabase, server 4010, client 3010; test login from scratchpad, never printed).
- Make the local league "between periods" (complete the active period locally, have a pending next period), then: enter 3 moves for 2 teams, reload mid-way (draft restored), add the same FA for two teams (flag), save, check rosters and Start page show moves dated to the next period start; screen 15 Move to IL with replacement, Activate a ghost if one can be made.
- Phone 390×844 and desktop 1440×900, light and dark: 0 text under 13px, no horizontal overflow.
- Restore local data afterwards.
- `npm run docs:refresh`, push, PR against `feat/commissioner-b2` (retarget to main after #479 merges).

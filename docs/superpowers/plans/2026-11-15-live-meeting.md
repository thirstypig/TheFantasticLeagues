# Live Meeting with a Clock (UX step G) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners enter their own between-period add/drop on a turn clock from their phones. The commissioner runs the clock and saves through today's Review & save. There's also a visible rename of "Wire List" to "List" with a help icon.

**Architecture:**
- New server feature `meeting`:
  - a pure reducer;
  - one `MeetingSession` row per (league, pending period), with JSON state and compare-and-set on `version`;
  - the clock is a saved deadline (`turnEndsAt`), never a timer.
- New client feature `meeting`: API, a polling hook (every 2s), the owner screen and the commissioner live screen.
- The route that switches between today's meeting page and the live one, and the hand-off into today's localStorage draft, live in `client/src/pages/` so no feature imports another (ADR-015 ratchet).

**Tech Stack:** Express + Prisma + zod (`shared/api`), React 18 + Vite + vitest + Testing Library, Playwright for browser checks.

**Spec:** `docs/superpowers/specs/2026-11-13-live-meeting-design.md` (DOC-042, approved 2026-11-15)

## Global Constraints

- **Off by default.** `meeting.live` defaults to `"false"`. With it off, today's screens 13 and 14 behave byte-for-byte as now.
- **No new cross-feature imports.** `node scripts/check-feature-isolation.mjs` must report 0 new. Feature-to-feature data goes over HTTP (`fetchJsonApi`) or through `client/src/pages/*`.
- **No timers on the server for the meeting.** No `setTimeout`/`setInterval` anywhere in `server/src/features/meeting/`.
- **Every meeting write** is `prisma.meetingSession.updateMany({ where: { id, version }, data: { state, version: version + 1 } })`. 0 rows → HTTP 409 `{ error: "The meeting just changed" }`.
- **Only Review & save writes rosters.** No meeting code writes `Roster`.
- **Rule keys** (category `meeting`):
  - `live`: `"true"|"false"`, default `"false"`;
  - `turn_seconds`: `"60"|"120"|"180"`, default `"120"`;
  - `can_add_time`: `"true"|"false"`, default `"true"`;
  - `overtime_fee`: `"0"|"1"|"5"`, default `"0"`.
- **Ledger row** on overtime: `type: "meeting_overtime"`, `amount: overtimeFee` (positive), `periodId: <session.periodId>`, `teamId: <team on the clock>`, `reason: "Over time at the meeting"`.
- **Copy:** user-visible "Wire List" becomes "List".
  - Wire help text: `Your wire list: players you'd pick up between periods, in order.`
  - Auction help text: `Your auction list: players you plan to put up, in order. If your clock runs out, the top one goes up.`
- **UI rules:** no modals except irreversible confirms (`ConfirmSheet`); Style Bible tokens; 13px text floor; 44px tap targets.
- **Prisma migration:** plain SQL, never `CONCURRENTLY`. Locally use `prisma db push` (local migrations are broken; see memory `local_browser_check_setup`).
- **Each PR:**
  - updates `STATUS.md` in the same commit (under 500 words, `wc -w`);
  - runs `npm run docs:refresh` before push, then `git checkout -- docs/under-the-hood/system-status.md`;
  - gets a browser check of every changed screen at 390px and 1440px.

## Review Focus

1. **Two writers at the same instant** (commissioner taps Skip as the owner taps Submit). One wins; the other gets 409, refetches, and sees the new turn. No double turn advance, no lost move. Test: Task 4, `submit and skip race → second gets 409`.
2. **Server restart mid-turn.** After restart the same team is on the clock with the same `turnEndsAt`. Covered by design (no in-memory state). Browser-check it in Task 8.
3. **Owner phone clock skew** (phone 90s fast). The countdown uses `serverNow` skew, not raw `Date.now()`. Test: Task 5, `remainingMs uses skew`.
4. **Player already taken earlier in the meeting, or rostered since the List was made.** Hidden from the List section, and refused by Submit with a clear message. Tests: Task 3 reducer `add already taken`; Task 4 route `rostered add → 400 "That player is already on a team"`.
5. **A team that loses its owner's attention** (phone locked). Polling drops to 15s while hidden, and the commissioner can Skip or Enter for them. A skipped team keeps its turn next round. Test: Task 3 `skip is not a pass`.

---

## PR 1: List rename (branch `feat/list-rename` from `main`)

### Task 1: Rename visible "Wire List" to "List" with a help icon; auction list gets the same icon

**Files:**
- Create: `client/src/components/shared/ListHelp.tsx`, `client/src/components/shared/__tests__/ListHelp.test.tsx`, `client/src/__tests__/noWireListCopy.test.ts`
- Modify: every non-test file under `client/src` containing user-visible "Wire List" / "wire list". From the 2026-11-15 grep: `features/wire-list/pages/WireListOwnerPage.tsx`, `WireListCommissionerPage.tsx`, `components/AddPicker.tsx`, `DropPicker.tsx`, `SlotEditor.tsx`, `features/players/components/PlayersTable.tsx`, `features/players/pages/Players.tsx`, `features/transactions/pages/ActivityPage.tsx`, `features/teams/pages/Team.tsx`, `features/commissioner/pages/CommissionerHub.tsx`, `mobile/pages/MobileWireList.tsx`, `pages/today/sections.tsx`, plus `AuroraShell` nav if it has the label. Then `features/auction/components/live/YourTurn.tsx` (the "Your list" heading). Update the matching tests' expected strings.

**Interfaces:**
- Produces: `export function ListHelp({ kind }: { kind: "wire" | "auction" }): JSX.Element`.
  - Renders a ⓘ button, `aria-label="What is this list?"`, at least 44×44 hit area.
  - Toggles an inline note (not a modal) on click/tap, and also shows it on hover and focus.
  - The text is exactly the two Global Constraints strings.
  - Escape or a second tap closes it.

- [ ] **Step 1:** Write `ListHelp.test.tsx`:
  - `shows wire text on click`: click the button; `getByText("Your wire list: players you'd pick up between periods, in order.")`.
  - `shows auction text`: same with `kind="auction"`.
  - `closes on Escape`.
- [ ] **Step 2:** Write `noWireListCopy.test.ts`. It walks `client/src/**/*.tsx` (skipping `__tests__` and `*.test.*`) with `fs`, strips `//` and `/* */` comments, and expects no match of `/["'>`]\s*[^"'<`]*\bWire List\b/i` (string literals and JSX text only). Identifiers like `WireListOwnerPage` don't match.
- [ ] **Step 3:** Run `cd client && npx vitest run src/components/shared/__tests__/ListHelp.test.tsx src/__tests__/noWireListCopy.test.ts`. Expect FAIL: the module is missing and there are N copy hits.
- [ ] **Step 4:** Implement `ListHelp`, then replace the copy:
  - "Wire List" → "List", and "your Wire List" → "your List".
  - At each page heading, nav label or section label that names the list, put `<ListHelp kind="wire" />` right after the word.
  - In `YourTurn.tsx`, put `<ListHelp kind="auction" />` after "Your list".
  - Leave routes, file names and identifiers alone.
- [ ] **Step 5:** Run `cd client && npx vitest run` and `npx tsc --noEmit`. Expect all green, with no errors in full output (never `tail`).
- [ ] **Step 6:** Browser check: List page (owner), commissioner List page, Players "+ List", Today section, auction Your Turn. Each at 390 and 1440. The tooltip opens by tap and by hover.
- [ ] **Step 7:** Update STATUS.md (Shipped: "List rename"), run docs:refresh, commit `List: rename Wire List in the app, add a help icon (also on the auction list)`, open the PR.

---

## PR 2: Meeting server (branch `feat/live-meeting-g`, already holds the spec commit)

### Task 2: Meeting rules: seed, backfill, validation, Rules page group

**Files:**
- Modify: `server/src/lib/sports/baseball.ts` (seed 4 rows after `trade_window`, labels from the spec table)
- Modify: `server/src/features/commissioner/services/CommissionerService.ts`:
  - `MUTABLE_ANY_TIME_CATEGORIES` gets `"meeting"`;
  - `BACKFILL_RULE_KEYS` gets the 4 keys;
  - `assertValidRuleValue` checks the allowed values from Global Constraints. Message: `"<label> must be one of …"`.
- Modify: `client/src/features/commissioner/pages/RulesPage.tsx`:
  - `CATEGORY_OF` entries;
  - a new `Meeting` group after "Trades and moves": switch `live`, segmented `turn_seconds` (1 min / 2 min / 3 min), switch `can_add_time`, segmented `overtime_fee` (Off / $1 / $5).
  - The last three render only when `live === "true"`.
  - Sub-line under `live` when off: `You enter them for everyone`.
- Modify: `client/src/features/commissioner/lib/recentChangeCopy.ts` (labels plus value words)
- Test: `server/src/features/commissioner/__tests__/meetingRules.test.ts`, `client/src/features/commissioner/__tests__/RulesPage.meeting.test.tsx`

**Interfaces:**
- Produces: `leagueRules.meeting.{live,turn_seconds,can_add_time,overtime_fee}` strings in `LeagueContext`, via the existing rules map.

- [ ] **Step 1:** Server tests:
  - `assertValidRuleValue("meeting","turn_seconds","90")` throws `InvalidRuleValueError`;
  - `"120"` passes;
  - `overtime_fee` `"2"` throws;
  - `BACKFILL_RULE_KEYS` contains all 4;
  - `assertRulesEditable` does not throw for `["meeting"]` in IN_SEASON with locked rules (mirror the existing `transactions` test).
- [ ] **Step 2:** Client tests:
  - with `live: "false"`, only the "Owners enter own moves at the meeting" switch renders;
  - toggling it calls save with `"true"`;
  - with `"true"`, all 4 rows render;
  - choosing "3 min" saves `"180"`.
- [ ] **Step 3:** Run and see FAIL. Implement. Run `cd server && npx vitest run src/features/commissioner` and `cd client && npx vitest run src/features/commissioner`. Expect PASS.
- [ ] **Step 4:** Commit `Meeting: Rules switches for the live meeting (off by default)`.

### Task 3: Shared schema, `MeetingSession` table, pure reducer

**Files:**
- Create: `shared/api/meeting.ts`, `server/src/features/meeting/lib/reducer.ts`, `server/src/features/meeting/__tests__/reducer.test.ts`
- Modify: `prisma/schema.prisma` (model exactly as the spec's Data model, plus `meetingSessions MeetingSession[]` on `League`)
- Create: `prisma/migrations/20261115000000_add_meeting_session/migration.sql` (CREATE TABLE plus unique index on `(leagueId, periodId)` plus FK cascade)

**Interfaces:**
- Produces, in `shared/api/meeting.ts`:
  - `MeetingPlayerSchema = { playerId: number, name: string, pos: string, mlbTeam: string|null, mlbId: number|null }`. This matches the client `DraftPlayer` exactly.
  - `MeetingMoveSchema = { id: string, teamId: number, add: MeetingPlayer, drop: MeetingPlayer }`.
  - `MeetingStateSchema` (fields exactly as the spec's `MeetingState`).
  - `MeetingSessionResponseSchema = { session: { id, leagueId, periodId, handedOffAt: string|null, state: MeetingState } | null, version: number, serverNow: string, online: number[] }`.
  - Request bodies: `OpenBody {periodId, order:number[]}`, `VersionBody {version}`, `OrderBody {order, version}`, `SubmitBody {teamId, addPlayerId, dropPlayerId, version}`, `PassBody {teamId, version}`.
  - The inferred types.
- Produces, in `reducer.ts`:
  - `createMeetingState(order: number[], settings: MeetingState["settings"]): MeetingState`, with status `"setup"`.
  - `currentTeamId(s: MeetingState): number | null`.
  - `type MeetingAction = {type:"setOrder";order:number[]} | {type:"start"} | {type:"pause"} | {type:"resume"} | {type:"addTime"} | {type:"skip"} | {type:"end"} | {type:"submit";teamId:number;add:MeetingPlayer;drop:MeetingPlayer;moveId:string} | {type:"pass";teamId:number}`.
  - `type Actor = {kind:"commissioner"} | {kind:"owner";teamId:number}`.
  - `reduceMeeting(s: MeetingState, a: MeetingAction, actor: Actor, nowMs: number): { state: MeetingState; overtime: { teamId: number; overMs: number } | null }`.
  - `class MeetingRuleError extends Error`.

Rules the reducer enforces (the tests pin each one):

| action | allowed when | who | effect |
|---|---|---|---|
| setOrder | setup | commissioner | order must be a permutation of the current order |
| start | setup | commissioner | running, round 1, turnIndex 0, `turnEndsAt = now + turnSeconds*1000` |
| pause | running | commissioner | paused, `pausedRemainingMs = turnEndsAt − now` (may be negative), `turnEndsAt = null` |
| resume | paused | commissioner | running, `turnEndsAt = now + pausedRemainingMs` |
| addTime | running or paused, `settings.canAddTime` | commissioner | +60000 to `turnEndsAt` or to `pausedRemainingMs` |
| submit | running, `teamId === currentTeamId` | commissioner, or owner of `teamId` | append move. Error `"That player was already picked in this meeting"` if `add.playerId` is in any move's add; `"That player is already being dropped"` if `drop.playerId` is in any move's drop. turnsLog `move`, then advance |
| pass | same as submit | same | add to `passedThisRound`, turnsLog `pass`, then advance |
| skip | running | commissioner | turnsLog `skipped`, then advance (not added to passed) |
| end | setup, running or paused | commissioner | ended, `turnEndsAt = null`, no overtime |

- **Advance:**
  - `overMs = max(0, now − turnEndsAt)`; return `overtime = {teamId, overMs}` when `overMs > 0`;
  - `turnIndex += 1`;
  - on wrap: if `passedThisRound` contains every team in `order`, then `status = "ended"`; else `round += 1`, `passedThisRound = []`, `turnIndex = 0`;
  - if still running, `turnEndsAt = now + turnSeconds*1000`.
- **Owner out of turn:** error `"It isn't your turn"`. An owner acting for another team gets the same error.
- An ended session refuses every action with `"The meeting has ended"`.

- [ ] **Step 1:** Write `reducer.test.ts`, one `it` per table row plus:
  - `round wraps and repeats order`;
  - `all teams pass in one round → ended`;
  - `skip is not a pass` (3 teams: A passes, B is skipped, C passes, so round 2 starts and doesn't end);
  - `overtime reported on submit after deadline` (turnSeconds 120, submit at +150s, so `overMs === 30000`);
  - `no overtime on end`;
  - `pause keeps negative remaining, resume restores it`;
  - `addTime refused when canAddTime false`;
  - `owner cannot act for another team`.
- [ ] **Step 2:** Run `cd server && npx vitest run src/features/meeting`. Expect FAIL.
- [ ] **Step 3:** Implement the schema, model, migration and reducer. Locally run `npx prisma db push` and `npx prisma generate`.
- [ ] **Step 4:** Run the tests and expect PASS. Mutation check: delete the `currentTeamId` guard in submit, and `owner cannot act…` plus `It isn't your turn` must fail. Restore it.
- [ ] **Step 5:** Commit `Meeting: session table and turn rules`.

### Task 4: Meeting routes

**Files:**
- Create: `server/src/features/meeting/routes.ts`, `server/src/features/meeting/index.ts` (exports `meetingRouter`), `server/src/features/meeting/lib/presence.ts`, `server/src/features/meeting/lib/settings.ts`, `server/src/features/meeting/__tests__/routes.test.ts`
- Modify: `server/src/index.ts`, adding `app.use("/api/meeting", meetingRouter);` next to `/api/wire-list`

**Interfaces:**
- Consumes: Task 3 reducer and schemas. Auth helpers from `middleware/auth.ts`: `requireAuth`, `requireLeagueMember`, `requireCommissionerOrAdmin`, `isTeamOwner(teamId, userId)`.
- Produces HTTP:
  - `GET /api/meeting/leagues/:leagueId/current` → `MeetingSessionResponse`. Picks the latest session by `periodId desc` whose status ≠ ended, else the latest ended one. Records presence for the caller's owned teams in the league.
  - `POST /api/meeting/leagues/:leagueId/open`
  - `POST /api/meeting/sessions/:id/{order,start,pause,resume,add-time,skip,end,submit,pass,handed-off}`
  - `GET /api/meeting/sessions/:id/choices?teamId=` → `{ list: MeetingPlayer[], roster: MeetingPlayer[] }`
  - Every POST returns `MeetingSessionResponse`.
- `settings.ts`: `readMeetingSettings(leagueId): Promise<{ live: boolean; turnSeconds: number; canAddTime: boolean; overtimeFee: number }>`, from `LeagueRule` rows with spec defaults when missing.
- `presence.ts`: `markSeen(leagueId, teamIds, nowMs)`, `onlineTeamIds(leagueId, nowMs): number[]` (seen within 10000ms). It's an in-memory Map.

Route rules:
- **open:**
  - commissioner/admin only;
  - `live` must be true, else 400 `"Turn on the live meeting in Rules first"`;
  - `periodId` must be a league period with status `"pending"` and no league period with status `"active"`, else 400 `"Close the period before opening the meeting"`;
  - 409 `"A List run is in progress"` if any `WaiverPeriod` for the league has status `LOCKED` and at least one `WaiverAddEntry` with `outcome != PENDING`;
  - `order` must equal the set of the league's team ids, else 400;
  - upsert-if-absent on `(leagueId, periodId)`, so a repeat open returns the existing session.
- **Commissioner-only actions** use `requireCommissionerOrAdmin`, resolving `leagueId` from the session row first.
- **submit/pass:** the actor is the commissioner if the caller is commissioner/admin of the league, else owner if `isTeamOwner(teamId, userId)`, else 403.
- **submit loads players by id:**
  - the add must have no active Roster row in the league (`roster.findFirst({ where: { playerId, releasedAt: null, team: { leagueId } } })`), else 400 `"That player is already on a team"`;
  - its `mlbTeam` must pass `getLeagueStatsSource`/`getTeamsForSource` from `server/src/lib/mlbTeams.ts` (the same policy as `transactions/lib/freeAgent.ts`; do not import that file);
  - the drop must have an active Roster row on `teamId`, else 400 `"That player isn't on this team"`.
- **CAS write** per Global Constraints. When the reducer returns `overtime` and `settings.overtimeFee > 0`, the CAS update and the `financeLedger.create` run in one `prisma.$transaction`.
- **choices:**
  - owner of `teamId` or commissioner;
  - `list` = that team's `WaiverAddEntry` rows on the league's newest `WaiverPeriod` with status in `[PENDING, LOCKED]`, ordered by priority, minus rostered players and adds already in the session;
  - `roster` = active Roster rows of the team, minus drops already in the session.
- **handed-off:** commissioner; sets `handedOffAt = now()` (no version bump).
- `MeetingRuleError` → 400 with its message. A zod failure → 400.

- [ ] **Step 1:** Write `routes.test.ts` (mocked prisma, following `wire-list/__tests__/routes.test.ts`). Assert on query args, not only responses:
  - `CAS uses where {id, version}`: expect `updateMany` called with `where: { id: 7, version: 3 }`.
  - `submit and skip race → second gets 409` (`updateMany` resolves `{count:0}` the second time).
  - `owner of another team → 403`.
  - `open refused while period active` / `open refused when live off` / `open refused during List run`.
  - `overtime writes ledger in same transaction`: expect `financeLedger.create` data `{ type: "meeting_overtime", amount: 5, periodId: 42, teamId: 3, reason: "Over time at the meeting" }`.
  - `no ledger when fee is 0`.
  - `rostered add → 400 "That player is already on a team"`, and the roster query includes `team: { leagueId }`.
  - `GET current returns serverNow and online ids`.
- [ ] **Step 2:** Run `cd server && npx vitest run src/features/meeting`. Expect FAIL.
- [ ] **Step 3:** Implement. Run the tests and expect PASS. Mutation check: change the CAS `where` to `{ id }` only, and the race test must fail. Restore it.
- [ ] **Step 4:** Run `cd server && npx tsc --noEmit` (full output), `node scripts/check-feature-isolation.mjs` (0 new), and `grep -rn "setTimeout\|setInterval" server/src/features/meeting` (no hits).
- [ ] **Step 5:** Update STATUS.md (In progress: G server merged behind a switch), run docs:refresh, commit `Meeting: API for the live meeting`, open PR 2.

---

## PR 3: Commissioner live screen (branch `feat/live-meeting-g-commish`, stacked on PR 2; follow memory `feedback_stacked_pr_squash_merge`)

### Task 5: Client meeting API, polling hook, clock

**Files:**
- Create: `client/src/features/meeting/api.ts`, `client/src/features/meeting/hooks/useMeetingSession.ts`, `client/src/features/meeting/lib/clock.ts`, tests beside each under `__tests__/`

**Interfaces:**
- Produces in `api.ts`:
  - wrappers for every Task 4 route, returning `MeetingSessionResponse` parsed with the shared schema;
  - `searchFreeAgents(leagueId, q): Promise<MeetingPlayer[]>`, which calls `${API_BASE}/player-season-stats?leagueId=&freeAgentsOnly=true&q=&take=20` directly;
  - `getSeasonOrder(leagueId): Promise<number[]>`, which calls `${API_BASE}/standings/season?leagueId=` and returns teamIds sorted by `totalPoints` ascending, ties by `teamName` ascending.
- Produces in `clock.ts`:
  - `skewMs(serverNowIso: string, clientNowMs: number): number`;
  - `remainingMs(turnEndsAtIso: string|null, pausedRemainingMs: number|null, skew: number, clientNowMs: number): number|null`;
  - `formatClock(ms: number): string`, giving `"1:24"`, `"0:05"`, and `"+0:12"` for negative values.
- Produces in the hook: `useMeetingSession(leagueId: number|null): { data: MeetingSessionResponse|null; error: string|null; skew: number; act: (fn: (version: number) => Promise<MeetingSessionResponse>) => Promise<void>; refresh: () => void }`.
  - Polls every 2000ms when `document.visibilityState === "visible"`, 15000ms when hidden, and stops when `state.status === "ended"`.
  - `act` passes the current version and applies the response. On a 409 it refreshes and throws `"The meeting just changed. Try again."`.

- [ ] **Step 1:** Tests:
  - `formatClock(84000) === "1:24"`; `formatClock(-12000) === "+0:12"`;
  - `remainingMs uses skew` (server 90s behind the client gives a remaining time 90s larger than with raw `Date.now()`);
  - `getSeasonOrder sorts worst first, ties by name`;
  - hook with fake timers: 2 fetches in 4s visible, 1 in 15s hidden, none after ended, and a 409 from `act` triggers a refresh.
- [ ] **Step 2:** Run `cd client && npx vitest run src/features/meeting`. Expect FAIL. Implement. Expect PASS.
- [ ] **Step 3:** Commit `Meeting: client API, polling and clock`.

### Task 6: Commissioner live screen, route switch, hand-off to Review

**Files:**
- Create: `client/src/features/meeting/screens/CommissionerLiveMeeting.tsx`, `client/src/features/meeting/components/Countdown.tsx`, `client/src/features/meeting/components/TurnEntry.tsx` (the add/drop/pass picker, shared with Task 7), `client/src/pages/MeetingRoute.tsx`, tests
- Modify: `client/src/App.tsx:213`, so `/commissioner/:leagueId/meeting/:periodId` renders `MeetingRoute` instead of `MeetingPage`

**Interfaces:**
- `CommissionerLiveMeeting({ leagueId, periodId, teams, onHandOff }: { leagueId: number; periodId: number; teams: { id: number; name: string }[]; onHandOff: (moves: MeetingMove[]) => void })`.
- `TurnEntry({ leagueId, sessionId, teamId, onSubmit, onPass }: {...; onSubmit: (addPlayerId: number, dropPlayerId: number) => Promise<void>; onPass: () => Promise<void> })`.
  - Loads `choices`, shows the List (with `<ListHelp kind="wire" />`), FA search, the drop chooser, and the line `✓ Roster stays at N / N`.
  - The Submit button stays disabled until both are picked.
- `MeetingRoute`:
  - reads `leagueRules.meeting?.live` from `useLeague()`;
  - `"true"` renders `CommissionerLiveMeeting`, otherwise today's `MeetingPage`;
  - `onHandOff` maps moves to a `MeetingDraft` (`moves` as is, `marks: {}`, `selectedTeamId: null`). If `loadDraft(...).moves.length > 0` it first shows `ConfirmSheet` "Replace the moves already in Review?". Then it calls `saveDraft`, POSTs `handed-off`, and navigates to `/commissioner/:leagueId/meeting/:periodId/review`.

Screen states (copy from the spec's Screens section):
- **No session:** "Open the meeting" button. Order is pre-filled from `getSeasonOrder` and shown with ↑/↓ per row. Open, then Start.
- **Running or paused:**
  - On-the-clock card with `Countdown` (red past zero);
  - `+1 min` (hidden when `!canAddTime`), `Skip`, `Enter for them` (expands `TurnEntry` inline for that team);
  - "Up next" with ● Online / ○ Not online;
  - "This round" rows ("+ Fraley − Hays" / "Passed" / "Skipped");
  - "Moves so far" grouped by team;
  - `Pause`/`Resume`, `End meeting`.
  - At ≥1024px the order list sits in a right column.
- **Ended:** summary plus `Review all moves`. When `handedOffAt` is set it shows "Moves sent to Review" and a `Copy again` button behind the same confirm.

- [ ] **Step 1:** Tests (`CommissionerLiveMeeting.test.tsx`, `MeetingRoute.test.tsx`, mocked api):
  - `live off renders today's meeting page`;
  - `setup shows worst-first order and Start`;
  - `+1 min hidden when canAddTime false`;
  - `clock turns red past zero` (fake timers);
  - `Review all moves writes the draft and navigates`;
  - `existing local draft asks before replacing`.
- [ ] **Step 2:** Run, see FAIL, implement, and run `cd client && npx vitest run src/features/meeting src/pages` until it passes. Also run `npx tsc --noEmit` and `node scripts/check-feature-isolation.mjs` (0 new).
- [ ] **Step 3:** Browser check at 390 and 1440 on a local league with `meeting.live` on: open, reorder, start, +1 min, Skip, Enter for them, End, then Review shows the moves.
- [ ] **Step 4:** Update STATUS.md, run docs:refresh, commit `Meeting: commissioner live screen`, open PR 3.

---

## PR 4: Owner screen (branch `feat/live-meeting-g-owner`, stacked on PR 3)

### Task 7: Owner turn screen, route, Today banner

**Files:**
- Create: `client/src/features/meeting/pages/OwnerMeetingPage.tsx`, `client/src/features/meeting/components/MeetingLiveBanner.tsx`, tests
- Modify: `client/src/App.tsx` (add the route `/leagues/:leagueId/meeting`), `client/src/pages/today/sections.tsx` (render `<MeetingLiveBanner leagueId myTeamId />` at the top)

**Interfaces:**
- Consumes: `useMeetingSession`, `TurnEntry`, `Countdown` (Tasks 5–6); `myTeamId` from `useLeague()`.
- `MeetingLiveBanner({ leagueId, myTeamId })`:
  - renders only when the session is running or paused;
  - text `Period meeting is live: you're up` when on the clock, else `Period meeting is live: you're Nth`;
  - links to `/leagues/:leagueId/meeting`.

Behavior:
- **My turn:** header "You're up" plus `Countdown`, then `TurnEntry` wired to the submit and pass routes. When the poll flips to my turn, set `document.title = "You're up · Meeting"` and play one short tone with WebAudio (wrapped in try/catch). Restore the title afterwards.
- **Not my turn:** who's on the clock plus the countdown, my place in the order, and my moves so far.
- **No live session:** "No meeting right now."

- [ ] **Step 1:** Tests:
  - `my turn shows TurnEntry`;
  - `submit disabled until add and drop picked`;
  - `not my turn shows who is up and my place`;
  - `title changes when my turn starts`;
  - `banner hidden when no running session`;
  - `banner says you're up`.
- [ ] **Step 2:** Run, see FAIL, implement, PASS. Run tsc and the isolation check.
- [ ] **Step 3:** Commit `Meeting: owner turn screen and live banner`.

### Task 8: End-to-end browser verification and docs

**Files:**
- Modify: `STATUS.md`, `docs/superpowers/specs/2026-11-13-live-meeting-design.md` (add the plan link to `links`)

- [ ] **Step 1:** Local stack (server 4010 via `scratchpad/auction-check/start-server-main.sh`, client 3010). Turn on `meeting.live` and set `overtime_fee` to 5 on a local league with a pending period and no active period.
- [ ] **Step 2:** Playwright, with two contexts: the commissioner at 1440 and an owner at 390.
  - Run two rounds: the owner submits a List pick, then passes;
  - Skip, then +1 min;
  - let one turn go 10s over, then confirm a `meeting_overtime` $5 row in Money;
  - Enter for them;
  - every team passes, so the meeting ends;
  - Review all moves shows every move.
  - Screenshot each step.
- [ ] **Step 3:** Restart the server mid-turn (`start-server-main.sh`). The same team is on the clock and the remaining time is continuous (±3s).
- [ ] **Step 4:** Clean up: void the test ledger row (local DB only) and leave `meeting.live` off.
- [ ] **Step 5:** Update STATUS.md (Shipped: live meeting, off by default), run docs:refresh, commit `Meeting: verified end to end`, push PR 4.

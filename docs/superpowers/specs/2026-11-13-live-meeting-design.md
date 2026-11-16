---
id: DOC-042
title: "Live meeting with a clock (UX step G) — design"
description: "Owners enter their own between-period add/drops on a turn clock; the commissioner runs the clock and saves through the existing Review screen. Saved server-side, phones poll every 2 seconds."
type: spec
status: active
phase: null
owner: james
tags: [commissioner, meeting]
links: [DOC-032, docs/superpowers/plans/2026-11-15-live-meeting.md]
updated: 2026-11-15
---

# Live meeting with a clock (UX step G)

## Why

Between periods, OGBA holds a meeting where each owner makes adds and drops. Today the
commissioner types every move into the app (screen 13), saved only in that browser, then
saves them all on Review (screen 14). The Style Bible (screens 4–5, plus the meeting switches on
the Rules mockup; artifact UDWjhsrCsDKxovbSjkyPXc) designs a version where **owners enter their
own moves from their phones, one at a time, on a clock**, and the commissioner only runs the clock and
reviews.

James asked for it on 2026-11-13 ("start on UX G") and chose to build it knowing OGBA meets
in person and may leave it off. It is **off by default**; with the switch off, nothing about
today's meeting changes.

## Goals

- Commissioner opens a live meeting after Close Period, sets the turn order, and starts it.
- The app puts one owner at a time on the clock. That owner, on their phone, picks an add (from their
  Wire List or a search of free agents) and a drop, or passes.
- Commissioner controls: **+1 min**, **Skip**, **Enter for them**, and sees who is online.
- Optional over-time penalty, logged in Money.
- When the meeting ends, the commissioner saves through **today's Review & save screen**, unchanged.
- A server restart or a dropped phone loses nothing.

## Non-goals

- No live push (websocket) in v1. Polling every 2s; the data shape must allow adding push later
  without a migration.
- No change to how moves are written to rosters. Review & save stays the only writer.
- No change to the existing "Owners make their own moves" switch (`transactions.owner_self_serve`),
  which lets owners make roster moves at any time in-season. It is a different thing; the meeting switches are new.
- No phone push notifications. An in-page cue only (see Builder calls).
- No trades in the meeting.

## Anti-goals (would make this a failure even if it works)

- A server restart stalls or ends a meeting (the auction bug fixed in #496). The clock must be a
  saved deadline, never an in-memory timer.
- Turning the switch on changes anything for a league that never opens a live meeting.
- An owner can act out of turn, act for another team, or change a move after their turn.
- A turn ends automatically while someone is still talking.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Meeting saved on the server; clock stored as a deadline timestamp; phones poll every 2s and count down locally. | ~2s lag when the turn passes. Survives restarts by construction. Smallest. |
| B | Same saved state plus instant updates over a websocket like the auction. | A second live channel to secure and reconnect, for 2s of speed. Can be added on top of A later. |
| C | Keep today's on-device draft; add a clock to the commissioner's screen only. | ~1 day, but owners never enter their own moves, so screen 5 doesn't exist. |

James picked **A** on 2026-11-15.

## Decisions

### James's
- Build G; off by default (2026-11-13).
- Approach A (2026-11-15).
- From the Bible: the commissioner opens the meeting and sets the order, only after Close Period; owners enter
  adds/drops or pass, picking from their Wire List; penalty logged in Money when on; commissioner reviews
  and saves on the same Review screen as today.

### My calls, stated to James and not yet corrected
- **Turn order** is set by the commissioner at open, **pre-filled in reverse season standings** (last place first,
  ties by team name). The commissioner's screen fetches it from the existing standings API over HTTP, so
  there's no new cross-feature import. It can be reordered before starting.
- **The meeting belongs to the pending period**, the same id today's meeting draft and Review use. The overtime
  ledger row carries that id too.
- **Running out of time does not end the turn.** The clock goes red and counts up past zero. The commissioner
  decides whether to Skip. Penalty (if on) is logged once, at the end of that turn.
- **Penalty = a dollar amount** (the Bible's switch reads "$5, logged in Money"), not a lost turn.

### Decided 2026-11-15 (James approved the design with these)
- **Wire List vs. the meeting.** A Wire List period auto-locks at its deadline, and the commissioner then runs it,
  which awards players by itself. In a league with `meeting.live` on, the Wire List is **only the owner's
  ranked shortlist to pick from at the meeting**. The owner screen reads the latest unprocessed period
  (PENDING or LOCKED). Opening a meeting is refused while a Wire List run is in progress (period LOCKED with
  any entry already processed).
- **Rename "Wire List" to "List" in all visible copy**, with a small help icon (tap or hover) that says what
  the list is: "Your wire list: players you'd pick up between periods, in order." The auction's existing "Your
  list" gets the same icon: "Your auction list: players you plan to put up, in order. If your clock runs out,
  the top one goes up." Code names, routes and API paths stay as they are; only the words change. This ships as its
  own small PR before the meeting work.

## Rules switches

New rows in `LeagueRule`, category **`meeting`**. All default off/unchanged, so existing leagues behave exactly as today.

| key | label on Rules | values | default |
|---|---|---|---|
| `live` | Owners enter own moves at the meeting | `"true"` / `"false"`. Sub-line when off: "You enter them for everyone" | `"false"` |
| `turn_seconds` | Clock per turn | `"60"` / `"120"` / `"180"` (segmented: 1 / 2 / 3 min) | `"120"` |
| `can_add_time` | You can add time | `"true"` / `"false"` | `"true"` |
| `overtime_fee` | Penalty for going over | `"0"` (Off) / `"1"` / `"5"` dollars (segmented) | `"0"` |

- Seeded for new leagues in `server/src/lib/sports/baseball.ts` (beside `owner_self_serve`).
- Existing leagues get the rows through a Prisma migration (`INSERT … SELECT … FROM "League" ON CONFLICT DO NOTHING`).
  No `CONCURRENTLY`.
- Added to the commissioner's editable allowlist and value validation in `CommissionerService.ts` (next to `trade_window`).
- Shown on the Rules page as a new **"Meeting"** group, using the existing switch/segmented controls. Not season-locked.
  The three sub-settings render only when `live` is on.
- `recentChangeCopy.ts` gets labels so changes read well in History.

## Data model

One new table, following the `AuctionSession` / `SnakeDraftSession` convention of a JSON state blob:

```prisma
model MeetingSession {
  id        Int      @id @default(autoincrement())
  leagueId  Int
  periodId  Int      // the PENDING (next) period, same id today's meeting draft and Review are keyed by
  state     Json
  handedOffAt DateTime? // set when the moves are copied into the Review draft
  version   Int      @default(0)   // optimistic concurrency: every write is compare-and-set on version
  updatedAt DateTime @default(now()) @updatedAt
  league    League   @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  @@unique([leagueId, periodId])
}
```

`state` shape (a shared zod schema in `shared/api/`):

```ts
type MeetingState = {
  status: "setup" | "running" | "paused" | "ended";
  order: number[];                 // teamIds
  round: number;                   // 1-based
  turnIndex: number;               // index into order
  turnEndsAt: string | null;       // ISO deadline; null while setup/paused/ended
  pausedRemainingMs: number | null;
  passedThisRound: number[];       // teamIds that passed in the current round
  moves: MeetingMove[];            // same fields as client DraftMove: id, teamId, add, drop (DraftPlayer)
  turnsLog: { teamId: number; round: number; result: "move" | "pass" | "skipped"; enteredBy: "owner" | "commissioner"; overMs: number }[];
  settings: { turnSeconds: number; canAddTime: boolean; overtimeFee: number }; // snapshotted at open
};
```

Presence is **not** in `state`. It's an in-memory `Map<leagueId, Map<teamId, lastSeenAt>>`, updated on each poll.
"Online" means polled in the last 10s. Losing it on restart is harmless, because it refills within 2s.

### Why compare-and-set on `version`
Two writers can collide, for example the commissioner taps Skip as the owner taps Submit. Every action is a
read → validate → `updateMany({ where: { id, version }, data: { state, version: version + 1 } })`. Zero rows
updated → 409 "The meeting just changed", the client refetches. No locks, no in-memory state to lose.

## Turn flow

- **Rounds.** Each turn is **one add/drop pair or a pass**. When the last team in `order` finishes, the round
  number goes up and the order repeats. The meeting **ends automatically when every team passes in the same round**.
  The commissioner can also end it at any time.
- **Submit** (owner on their turn, or commissioner via Enter for them):
  - lightweight server checks:
    - the add is not on any roster in this league and not already added in this meeting;
    - the drop is on this team's roster and not already dropped in this meeting.
  - **Every move is an add and a drop, the same as today.** `completeMoves` keeps only full pairs and `saveMove`
    needs both ids, so a pair keeps the roster count unchanged and no count check is needed. Add-only and
    drop-only cases (for example around IL) stay on the existing roster tools.
  - These are direct Prisma reads inside the meeting feature. **The authoritative check is still Review's per-move
    preview**, which already flags failures and keeps them in the draft. This avoids importing the transactions
    feature (ADR-015 ratchet: 0 new cross-feature imports).
- **Pass**: records a pass for this round.
- **Skip** (commissioner): ends the turn with `skipped`. A skip does **not** count as a pass, so a skipped team still
  gets a turn next round.
- **+1 min** (commissioner, only if `canAddTime`): `turnEndsAt += 60s`.
- **Pause/Resume** (commissioner): stores remaining ms; resume sets a new `turnEndsAt`.
- **Overtime**: at the end of any turn, `overMs = max(0, endedAt − turnEndsAt)`. If `overMs > 0` and `overtimeFee > 0`,
  append one `FinanceLedger` row: `type: "meeting_overtime"`, `amount: overtimeFee`, `periodId`, `reason:
  "Over time at the period N meeting"`. Logged in the same request as the turn end. Skips by the commissioner are
  still charged if over. A fee can't be undone in the app yet: there is no void tool in the commissioner's
  Money screens today. A void tool (append-only contra-entry) is a follow-up, todo #315.
- **Expiry is computed on read, never by a timer.** Nothing happens server-side when the clock hits zero. The UI
  shows red/negative time from `turnEndsAt` and the server's clock.

## API

New server feature `server/src/features/meeting/` (routes + a pure reducer in `lib/`, tested like
`wire-list/__tests__/reducer.test.ts`). All under `/api/meeting`:

| method | path | who | does |
|---|---|---|---|
| GET | `/leagues/:leagueId/current` | league member | latest non-ended session (or the ended one for the most recent period). Returns `{ session, version, serverNow, online: teamId[] }` and records presence. |
| POST | `/leagues/:leagueId/open` | commissioner/admin | body `{ periodId, order }`. `periodId` is the pending period (as today's meeting route). Requires `meeting.live === "true"` and that the period before it is closed. Creates `setup` with the given order and snapshotted settings. Idempotent on (league, period). |
| POST | `/sessions/:id/handed-off` | commissioner | stamps `handedOffAt` (see End meeting). |
| POST | `/sessions/:id/order` | commissioner | body `{ order, version }`, only in `setup`. |
| POST | `/sessions/:id/start` \| `pause` \| `resume` \| `add-time` \| `skip` \| `end` | commissioner | body `{ version }` |
| POST | `/sessions/:id/submit` | team owner on the clock, or commissioner | body `{ teamId, addPlayerId, dropPlayerId, version }` |
| POST | `/sessions/:id/pass` | team owner on the clock, or commissioner | body `{ teamId, version }` |

- Owner authorization: the user must own `teamId` (existing ownership helper) **and** `teamId` must be the team on the clock.
- Every response returns the new `{ session, version, serverNow }`, so the actor's screen updates without waiting for the next poll.
- The clients compute clock skew as `serverNow − Date.now()` on each response.

## Screens

### Commissioner: screen 4 (live version of `/commissioner/:leagueId/meeting/:periodId`)
When `meeting.live` is on, the existing meeting route renders the live screen. When off, it renders today's
screen 13 unchanged.

```
Period 9 meeting                      Round 2
┌───────────────────────────────────────────┐
│ On the clock  Los Doyers          1:24    │
│ [ +1 min ] [ Skip ] [ Enter for them ]    │
└───────────────────────────────────────────┘
Up next
  Diamond Kings      ● Online
  Skunk Dogs         ○ Not online
Done / Passed this round
  Moneyball   + Fraley  − Hays
  Big Unit    Passed
[ Pause ]                    [ End meeting ]
```
- **Setup state**: order list with up/down reorder (no drag in v1), Start button.
- **Desktop**: the full order sits beside the clock (two columns). Phone: stacked.
- **Moves so far**: every move, grouped by team.
- **End meeting / Review all moves**: ending sets `ended` and copies the session's moves into the existing
  localStorage meeting draft (`saveDraft` for the same league/period). Then it navigates to Review & save, which
  works unchanged. If a local draft already has moves, the commissioner confirms a replace (irreversible-confirm
  sheet, the existing `ConfirmSheet`). The copy stamps `handedOffAt`. Once that is set, the screen shows
  "Moves sent to Review" and only offers **Copy again** behind the same confirm, for a second device. Review
  itself is unchanged. A move already saved fails its preview there (the add is already rostered) and is flagged, not saved twice.
- **Enter for them** opens the owner's turn screen (below) acting for that team.

### Owner: screen 5 (new route `/leagues/:leagueId/meeting`)
```
You're up                         1:24
Los Doyers · Round 2
Add
  From your List (ⓘ)
   1. Jake Fraley   OF · CIN
   2. …                       (taken players hidden)
  Search NL free agents  [_________]
Drop
  [ choose a player from your roster ▾ ]
✓ Roster stays at 23 / 23
[ Pass ]                  [ Submit move ]
```
- List (the Wire List): the team's `WaiverAddEntry` rows for the league's current PENDING `WaiverPeriod`, by priority,
  minus players rostered or already added in this meeting. If there is none, the section is hidden.
- Search: the existing player search restricted to free agents and the league's stats source (NL-only when on).
- Drop: the team's current roster, minus players already dropped in this meeting.
- **Not your turn**: shows who is on the clock with their countdown, where you are in the order, and your moves so far.
- **Entry point**: a banner on the owner's home/team page while a session is `running` or `paused`:
  "Period 9 meeting is live: you're 4th." It links to this route.
- No modals. Pickers are inline sections / the existing bottom sheet pattern.

## Polling

- Client hook `useMeetingSession(leagueId)` polls GET `current` every **2s** while the page is visible
  (`document.visibilityState`), every 15s when hidden, and stops when the session is `ended`.
- The countdown re-renders every 250ms from `turnEndsAt − (Date.now() + skew)`.
- **Your turn cue**: when a poll flips to "you're on the clock", change the document title ("You're up") and play
  one short sound if the browser allows it.
- Load: ~10 owners × 0.5 req/s = 5 req/s of one indexed lookup for ~30 minutes. Negligible.

## Testing

- **Reducer unit tests** (pure, no DB) for every action:
  - turn advance;
  - round wrap;
  - all-pass ends;
  - skip ≠ pass;
  - add-time gated by setting;
  - pause/resume keeps remaining time;
  - overtime computes `overMs`;
  - out-of-turn rejected.
- **Route tests** assert on the Prisma query args, not just mocked returns (project lesson):
  - the version CAS `where`;
  - the owner-of-team check;
  - the period-closed check;
  - the `FinanceLedger` create args.
- **Mutation-check** the turn guard and the CAS: removing either must turn a test red.
- **Browser verification**, mandatory. Local league:
  - commissioner on desktop plus one owner on a 390px phone viewport;
  - run two rounds, including +1 min, Skip, over-time with the fee on, Enter for them, all-pass end, and the hand-off to Review & save;
  - restart the server mid-turn and confirm the clock and turn survive.
- Rules page: the switches appear, save, and show in History.

## Rollout

- Ships dark: `meeting.live` defaults to `"false"` everywhere, including OGBA.
- One migration (new table plus the rule-row backfill). It runs on Railway boot.
- STATUS.md and DOC-042 status are updated in the same PRs.

## Left to the builder

- PR slicing. Suggested:
  1. rules + migration + reducer + API;
  2. commissioner screen;
  3. owner screen + banner + polling hook.
- Exact component split, reusing `MoveEditor` / player pickers where they fit.
- The sound asset and the title-change details.
- Desktop layout breakpoints, within the Style Bible tokens.

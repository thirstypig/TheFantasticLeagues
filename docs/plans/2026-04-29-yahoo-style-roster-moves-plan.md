# Yahoo-Style Roster Moves — Implementation Plan

**Date:** 2026-04-29
**Status:** ⚠️ **PIVOT PROPOSED** — PR1 SHIPPED (#167); PR2 redesign pending review
**Author:** Plan agent (synthesis from codebase audit + Yahoo/ESPN/Sleeper UX prior art) + 10-agent deepening pass

> **Implementation status as of 2026-04-29:**
> - ✅ **PR1 merged as commit `658822b`** — server-side auto-resolve, bipartite matcher, three endpoint integrations, `Roster.displayOrder` schema field, `LeagueRule(transactions.auto_resolve_slots)` flag, toast wiring on all 3 RosterMoves panels. +37 server tests / +5 client tests.
> - ✅ **Visual preview merged as commit `a8616c5`** (PR #169) — admin-only at `/design/swap-mode`. Click-through of all 7 visual states with mock data.
> - ⚠️ **User feedback after preview review (2026-04-29)**: "I don't see the free agent swap nor the IL stash or activate either. Also, why aren't we using tables? The Swap Mode UI… not sure how it is supposed to work." Triggered a 10-agent deepening pass — see §0 below.
> - 🚧 **PR2 redesign proposed** — see §0 (Deepening synthesis) for the new direction.

## §0 — Deepening synthesis (2026-04-29) — MAJOR PIVOT PROPOSED

After user review of the visual preview surfaced three concerns (missing flows / why not tables / interaction unclear), 10 specialized research agents performed a deepening pass on the plan. Their findings converge unanimously on a substantially different direction than originally proposed.

### Agents that ran

| Agent | Finding |
|-------|---------|
| `best-practices-researcher` | Yahoo / ESPN / Fantrax 2026 = **hub-and-spokes**, NOT one mega-page. Position pill itself is the affordance. No "Swap Mode" toggle in modern Yahoo. |
| `architecture-strategist` | Direction B (narrow scope), HIGH confidence. User confusion is a *navigation/labeling* problem, not composition. |
| `code-simplicity-reviewer` | ~40% of PR2 surface area can be cut: drop `/lineup` endpoint, drop `Roster.displayOrder`, drop the LeagueRule flag, collapse 3 error codes to 1. |
| `agent-native-reviewer` | Two API gaps: (a) `slotsFor()` is client-side only — needs `GET /api/players/:id/eligible-slots`, (b) `displayOrder` would have UI without API parity. |
| `framework-docs-researcher` | **`@dnd-kit` is already installed** at `TeamRosterManager.tsx`. Don't add framer-motion. Sample drag-and-drop code provided. |
| `julik-frontend-races-reviewer` | 5 race conditions identified — most critical: cross-tab roster mutation (need `rosterVersion` etag + 409 STALE_ROSTER). |
| `performance-oracle` | Mobile Safari backdrop-filter + animated borders = 30-45fps cliff. `appliedReassignments.playerName` is N+1 risk. Memoize `SlotCell` with `React.memo`. |
| `repo-research-analyst` | `ThemedTable` already supports everything needed (frozen columns, sortable, per-row actions). Cards-based `RosterGrid` is the awkward outlier. |
| `learnings-researcher` | `positionToSlots()` is canonical eligibility helper. Past learnings: `table-layout: fixed`, `min-w-[600px]` mobile, no backdrop-blur on sticky headers. |
| `kieran-typescript-reviewer` | API contracts use `string` slots when `SlotCode` literal type exists. Adopt Zod-as-source-of-truth pattern from `shared/api/playerSeasonStats.ts`. |

### The unanimous direction shift

**Abandon the standalone Swap Mode page entirely.** The new direction:

1. **Hub = the existing Team page roster table** (`/teams/:code`). It becomes the unified roster-management surface. No new page.
2. **Switch the roster display from `RosterGrid` (cards) to `ThemedTable`** — matches Players, AuctionValues, ActivityHistory, all of which use the canonical table primitive.
3. **Position pill on each row is the primary affordance** (Yahoo's actual production model). Tap pill → legal destinations highlight green/iridescent across the roster + IL pool → tap to commit. No mode toggle.
4. **Existing AddDrop / IL Stash / IL Activate panels stay** as focused subviews, but their *entry points* live on the row's pill menu (e.g., "Add free agent here", "Stash on IL", "Drop"). One hub, four spokes.
5. **dnd-kit drag-and-drop** as an alternative to click-then-click (we already have it installed, used in `TeamRosterManager.tsx`). Keyboard-accessible by default. Mobile-friendly with TouchSensor.
6. **Each click/drag is a fire-on-change PATCH** to `/api/teams/:teamId/roster/:rosterId` (the existing endpoint), not a batched Save. Matches the existing `RosterGrid` and `AuctionCompleteLegacy` patterns. Optimistic update + revert on failure.

### What gets cut from PR2 (per simplicity reviewer)

- ❌ Standalone `SwapMode.tsx` page → instead enhance `Team.tsx`
- ❌ `POST /api/teams/:teamId/lineup` endpoint → reuse existing per-row PATCH
- ❌ `Roster.displayOrder` field → revert PR1's migration; use `acquiredAt` as implicit order
- ❌ `LeagueRule(transactions.auto_resolve_slots)` flag → always-on (OGBA is the only league anyway)
- ❌ Drag-reorder pitchers/OF → not needed; sort client-side by stat
- ❌ 3 error codes (`NO_LEGAL_ASSIGNMENT`, `INVALID_LINEUP`, `ELIGIBILITY_LOST_MID_OPERATION`) → collapse to single `error` + `reason` string
- ❌ 7 visual states → 4 (idle, selected, pending, submitting)
- ❌ Framer Motion `layout` reflow on auto-resolve pulse → CSS transition only
- ❌ Standalone `SwapStateProvider` context → component-local `useReducer`

### What gets added (from race + perf + agent-native + ts reviewers)

- ✅ **Cross-tab safety**: every PATCH carries `If-Unmodified-Since` (or `rosterVersion` etag); server returns `409 STALE_ROSTER` on mismatch; client refetches and reconciles
- ✅ **`GET /api/players/:id/eligible-slots?leagueId=X`** — server endpoint exposing `slotsFor(posList)` for agent parity
- ✅ **Memoize `SlotCell` and `RosterRow`** with `React.memo` keyed on `(playerId, assignedPosition, isSelected, isEligible)`
- ✅ **Type-safe slot codes**: replace `string` with `SlotCode` (literal union from `client/src/lib/sports/baseball.ts:27`) in all API contracts
- ✅ **Zod schemas at `shared/api/rosterMoves.ts`**: server validates outbound, client validates inbound, contract-test ensures alignment
- ✅ **Mobile perf**: animate `opacity` only (not background-image / border-color); `prefers-reduced-motion` fallback; remove backdrop-filter from animated cells
- ✅ **N+1 prevention**: `playerName` flows through `RosterCandidate` → `SlotAssignment` → response without extra DB reads
- ✅ **Pending row visual treatment**: left-edge accent bar + tinted row background + inline "↩ revert" icon — establishes a NEW shared pattern that future batch-save tables can reuse

### Revised rollout — single PR2

PR2 becomes substantially smaller and more focused:

- Modify `Team.tsx` to render roster via `ThemedTable` (replacing `RosterGrid`'s card layout for owner view)
- Add per-row position pill with click-to-highlight-eligible behavior
- Add per-row "..." action menu surfacing existing AddDrop / IL Stash / IL Activate panels as modals
- Wire dnd-kit for optional drag-to-swap (uses existing PATCH endpoint)
- Add `GET /api/players/:id/eligible-slots` endpoint
- Revert PR1's `Roster.displayOrder` migration (add a migration to drop the column + index)
- Remove `LeagueRule(transactions.auto_resolve_slots)` flag — collapse to always-on path
- Tests: ~25 (down from ~42 originally projected)

Estimated: **1.5 sessions** (down from 2 sessions)

### Open questions for user (must answer before PR2 starts)

1. **Approve the pivot?** The new direction is materially different from what you signed off on in §11's resolved decisions. The user-research signal (your reaction to the preview + 10-agent independent convergence) strongly suggests this is right, but it's still a re-vote.
2. **`Roster.displayOrder` migration revert** — PR1 already shipped this column. Reverting is a backward-incompatible schema change but trivial since nothing populates it yet. OK to revert?
3. **Replace `RosterGrid` cards on the Team page** — this is the most invasive UI change. Owners currently see cards for the active roster; they'd see a table going forward. Visually consistent with the rest of the app, but a user-facing change. Approve?
4. **dnd-kit drag-and-drop as primary or secondary affordance?** Click-then-click is more discoverable; drag is faster for power users. Default to both (dnd-kit supports both via `useDraggable` + `onClick`)?

> Sections 1-12 below preserve the original plan as historical context. The active plan from this point forward is §0 (this section). Section 11 (resolved decisions) is partially superseded — Q3 (`Roster.displayOrder` for drag-reorder) and Q6 (iridescent pulse + Framer Motion) are particularly affected.

## Spec corrections (2026-04-29, post-preview)

Surfaced during PR #169 build — original plan diverged from codebase. Plan now matches code:

| Original | Corrected | Source of truth |
|----------|-----------|-----------------|
| `CI` slot label | `CM` (corner-man, 1B/3B eligible) | `client/src/lib/sports/baseball.ts:27` `SLOT_CODES` |
| `UT` / `UTIL` slot label | `DH` (designated hitter, hitters-only) | Same — and "UTIL" was misleading since DH is bat-only |
| OF capacity 3 | OF capacity **5** | `client/src/lib/sports/baseball.ts:209` `rosterSlots` |
| C capacity 1 | C capacity **2** | Same — OGBA has two catcher slots |
| `--am-glow` token | Token doesn't exist; preview uses `am-glow-pulse` keyframe over `--am-irid` colors | `client/src/components/aurora/aurora.css` |
| `--am-positive-warm` for keeper gold | Token doesn't exist; preview uses `#fbbf24` (amber-400) | Same — PR2 should add a token |
| `framer-motion` for slot animations | Not installed; preview uses CSS transitions (200ms ease) | `client/package.json` |

Active roster math now matches reality: 2C + 1·1B + 1·2B + 1·3B + 1·SS + 1·MI + 1·CM + 5·OF + 1·DH + 9·P = **23 active slots, 0 bench**. ✅

> **Reviewers**: read sections 1-3 for the goal and design north star, section 11 for the resolved decisions, and section 10 for the proposed PR breakdown. Sections 4-9 are implementation details — skim or skip if you trust the high level.

## ✅ Resolved decisions (2026-04-29)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Daily eligibility sync race | **A** — re-read `posList` inside transaction; throw `ELIGIBILITY_LOST_MID_OPERATION` on drift, client retries |
| Q2 | Auto-resolve UX | **A** — silent + toast (Yahoo behavior, single-click adds) |
| Q3 | Pitcher slots | **C with drag-reorder** — single `P` pool in storage; new `Roster.displayOrder: Int?` field; Swap Mode renders 9 drag-reorderable P cells |
| Q4 | Backdated transactions | **A** — today's `posList`, document in runbook |
| Q5 | OF labeling | **resolved by code** — `SLOT_CODES` confirms single `OF` slot, capacity 3; same drag-reorder pattern as P |
| Q6 | Roster sort jumps | **C** — pulse changed rows with iridescent border for ~5s after auto-resolve |
| Q7 | Keepers in Swap Mode | **B** — gold ring visual flag; NOT lock-pinned (matcher treats keepers identically to non-keepers) |

These decisions are load-bearing for the implementation. Any change requires re-opening the proposal.

---

## 1. Goal & Non-Goals

**Goal.** Re-platform OGBA's roster-move UX to Yahoo's mental model (roster ≠ lineup) without violating OGBA's hard 23-active / 0-bench constraint. The owner experience should never block on slot-fit math; the server resolves a legal end-state via bipartite matching, and a dedicated Swap Mode UI handles deliberate lineup rearrangement.

**Non-goals.**
- Adding bench (`BN`) slots. The 23-active-no-bench rule is non-negotiable.
- Changing position eligibility rules. The 3-layer Rule 1/2/3 ladder (current ≥3 GP, prior ≥20 GP, rookie-primary) at `Player.posList` stays as-is.
- Restructuring IL handling. IL slots are out-of-band and the matcher must not touch them.
- Touching `/transactions/drop` (standalone IL drops only — already excluded from active-slot logic at `server/src/features/transactions/routes.ts:395-400`).

## 2. User Stories

1. **Owner add/drop with auto-resolve.** "I'm adding Mookie Betts (2B/OF) and dropping Aaron Judge (OF). My OF slots are full and 2B has Trea Turner. The server figures out: park Betts at 2B, slide Turner to SS (he's MI-eligible), the previous SS goes to MI." User sees a toast: "Claimed Betts. Moved Turner 2B→SS, Bohm SS→MI."

2. **Owner pure swap (Swap Mode).** "I want to bench my struggling 2B for tonight's matchup but I have no bench. I open Swap Mode, click my 2B, see the MI/DH slots glow, click MI, and my MI guy moves to 2B. I click Save and the lineup is committed atomically."

3. **Commissioner-on-behalf.** Commissioner pulls up a team in `CommissionerRosterTool`, can either use the existing per-row dropdown override OR open Swap Mode with that team's context for a guided rearrangement.

4. **Failing scenario reported today.** Owner tries to add a SS-only player while dropping a P. Today this 400s with `POSITION_INELIGIBLE` from `assertAddEligibleForDropSlot` at `server/src/features/transactions/lib/positionInherit.ts:40-51`. Tomorrow: server runs the matcher, finds a legal arrangement, succeeds. If no legal arrangement exists, returns `NO_LEGAL_ASSIGNMENT` with a human-readable explanation.

## 3. Design North Star

**Roster ≠ lineup.** Roster = the set of 23+IL players you own. Lineup = which slot each plays. Owners think about *who they want*; Swap Mode handles *where they go*. Every other major fantasy platform decouples these — Yahoo via bench, OGBA via auto-resolve.

**Valid slots light up.** The "what can this player play?" question is answered visually, not via error messages. When a player is selected (in Swap Mode or in an add-flow tooltip), `slotsFor(posList)` from `client/src/lib/positionEligibility.ts:47-57` is rendered as iridescent highlights on eligible slots and dimmed treatment on the rest.

**Server is the source of truth on legality.** The client never decides whether a transaction is allowed; it submits intent and renders the server's resolved end-state.

## 4. Server Changes

### 4A. Bipartite matcher module

New: `server/src/features/transactions/lib/slotMatcher.ts`

Exports:
```ts
interface RosterCandidate {
  rosterId: number;
  playerId: number;
  posList: string;            // from Player.posList
  currentSlot: string | null; // assignedPosition; null = newly added, "IL" = preserve
  pinned?: boolean;           // IL rows are always pinned to current slot
}

interface SlotAssignment {
  rosterId: number;
  oldSlot: string | null;
  newSlot: string;
}

interface MatchResult {
  ok: true;
  assignments: SlotAssignment[];      // only rows where slot changed
} | {
  ok: false;
  code: "NO_LEGAL_ASSIGNMENT";
  reason: string;                     // human-readable
  unfilledSlots: string[];
  unassignedPlayers: number[];        // playerIds with no legal slot
}

function resolveLineup(
  candidates: RosterCandidate[],
  slotCapacities: Record<string, number>, // e.g. { C:2, "1B":1, "2B":1, "3B":1, SS:1, MI:1, CM:1, OF:5, DH:1, P:9 }
): MatchResult;
```

The matcher uses Hopcroft–Karp (max bipartite matching) to assign each non-IL candidate to one of `slotCapacities` slots, where edge `(player, slot)` exists iff `slotsFor(player.posList).has(slot)`. Slot capacities expand to per-instance vertices (P×9 → P1, P2, ..., P9). Among matchings of equal size, prefer assignments that leave existing players in place — implement by adding a small bonus weight to incumbent edges and using Kuhn's algorithm with priority on incumbent matches (or run Hopcroft-Karp first, then permute via cycle-detection to maximize incumbent retention).

**Failure modes:**
- `NO_LEGAL_ASSIGNMENT` — matching size < 23. Return which slots are unfillable and which players have no legal slot.
- `ELIGIBILITY_LOST_MID_OPERATION` — re-read `Player.posList` inside the transaction; if the row changed since the pre-flight read, re-run the matcher. If it now fails, return this code.

**Complexity.** N=23, edges ≤ 23 × ~12 candidate slots = ~276. Hopcroft-Karp is O(E·√V) ≈ trivial. Single-digit milliseconds.

### 4B. Wire matcher into `/claim`, `/il-stash`, `/il-activate`

For each endpoint at `server/src/features/transactions/routes.ts`:
- Lines 192-226 (`/claim` position-inherit pre-check), 564-574 (`/il-stash`), 798-808 (`/il-activate`): replace the `assertAddEligibleForDropSlot` call with a "compute proposed candidate set, run `resolveLineup`" step (only when the league rule `transactions.auto_resolve_slots` is true).
- Inside the existing `prisma.$transaction` block: after the add/drop writes, apply each `SlotAssignment` via `tx.roster.update`. The whole thing remains atomic.
- On `MatchResult.ok === false`: throw `RosterRuleError("NO_LEGAL_ASSIGNMENT", reason, { unfilledSlots, unassignedPlayers })` — the existing catch at lines 343-356 / 679-688 / 881-886 picks it up.

**Response shape change** (additive, non-breaking):
```ts
// /claim, /il-stash, /il-activate response
{
  success: true,
  playerId: number,
  // NEW:
  appliedReassignments: Array<{
    rosterId: number,
    playerId: number,
    playerName: string,
    oldSlot: string,
    newSlot: string,
  }>
}
```

### 4C. New `POST /api/teams/:teamId/lineup` endpoint

New router handler in `server/src/features/teams/routes.ts` (or split into `server/src/features/teams/lineup-routes.ts`).

**Request:**
```ts
interface LineupUpdateRequest {
  assignments: Array<{ rosterId: number; newSlot: string }>;
}
```

**Behavior:**
1. Auth: `requireAuth → requireTeamOwnerOrCommissioner()` (matches existing PATCH gating at `server/src/features/teams/routes.ts`).
2. Load the team's full active roster (excluding IL rows) within a `prisma.$transaction`.
3. Build the proposed end-state: apply each `assignment.newSlot` to the corresponding roster row (in memory).
4. Validate: every active slot in `slotCapacities` exactly filled; every player eligible for their assigned slot per `slotsFor(posList)`; no roster row appears twice.
5. If valid, apply all updates inside the same transaction. If invalid, throw `RosterRuleError("INVALID_LINEUP", reason, { offendingAssignments })`.
6. Write a `TransactionEvent` row (`transactionType: "LINEUP_EDIT"`) summarizing the diff.

**Response:**
```ts
{ success: true, applied: SlotAssignment[] }
```

The existing per-row `PATCH /api/teams/:teamId/roster/:rosterId` stays for commissioner power-user override (`CommissionerRosterTool`'s per-row dropdowns) but the owner UI no longer calls it — it goes through `POST /lineup`.

### 4D. Feature flag

New `LeagueRule` row: `transactions.auto_resolve_slots`, default `true` for OGBA, `false` elsewhere. When false, fall through to today's strict pairwise check (preserves backward compatibility).

## 5. Client Changes

### 5A. Silent auto-resolve in add/drop panels

Files (existing): `client/src/features/roster/components/AddDropPanel.tsx`, `PlaceOnIlPanel.tsx`, `ActivateFromIlPanel.tsx`.

Change: on success, read `appliedReassignments` from response and surface a toast. Format:
> "Claimed Mookie Betts (2B). Also moved: Trea Turner 2B → SS, Alec Bohm SS → MI."

On `NO_LEGAL_ASSIGNMENT`: show inline error with the `reason` string from the server (already populated with which slots/players were unfillable).

### 5B. Swap Mode UI

New: `client/src/features/roster/components/SwapMode.tsx` (+ subcomponents).

Mounted as a new tab in the Roster Moves area, alongside the existing Add/Drop / IL tabs.

**Component structure:**
- `SwapMode` — top-level container
  - `PositionGroupCard` × 5 (Catchers, Infield, Outfield, Flex (MI/CM/DH), Pitchers)
    - `SlotCell` × N (one per active slot in that group)
      - shows occupant player + chip row of their `slotsFor(posList)`
- `SwapStateProvider` — React context holding pending swaps queue
- `SwapActionBar` — Reset / Save Lineup buttons; shows pending swap count

**Visual spec (Aurora):**
- Glass card per position group (existing Aurora `--am-glass` pattern)
- Selected player: iridescent ring + slight scale-up, matches `--am-irid` token
- Eligible slots when a player is selected: animated iridescent border (reuse the Aurora "alive" gradient from the live auction floor PR #157 as inspiration)
- Ineligible slots: dim to `opacity: 0.4` + grayscale
- Pending swap: dashed iridescent outline on both source and destination cells
- Animation: slot transitions use Framer Motion `layout` prop for the satisfying glide

### 5C. Commissioner integration

In `client/src/features/commissioner/components/CommissionerRosterTool.tsx`:
- Keep existing per-row slot dropdowns (power-user override).
- Add a "Open Swap Mode" link/button that navigates to Swap Mode with the team-being-acted-on context (route param: `?onBehalfOfTeamId=X`).

## 6. State Machine — Swap Mode

```
IDLE
  ↓ (player click)
PLAYER_SELECTED { selectedRosterId }
  • highlight slots eligible for this player
  ↓ (eligible slot click)
PENDING_SWAP { queue: [{ srcRosterId, dstSlot, displacedRosterId? }] }
  • previous occupant of dstSlot moves to srcSlot (or is enqueued for further resolution)
  ↓ (another player click) → PLAYER_SELECTED (with queue retained)
  ↓ (Reset) → IDLE (queue cleared)
  ↓ (Save) → SUBMITTING
SUBMITTING
  ↓ (200 OK) → IDLE (queue cleared, roster refetched)
  ↓ (400 INVALID_LINEUP) → ERROR { reason } → user adjusts → PENDING_SWAP
```

**Edge case:** if a queued swap chain becomes infeasible mid-edit (player clicked into slot they can't fill), reject the click locally — server validation is the safety net, not the first line of defense.

## 7. API Contracts

```ts
// POST /api/transactions/claim — request unchanged
// POST /api/transactions/claim — response (additive)
interface ClaimResponse {
  success: true;
  playerId: number;
  appliedReassignments: AppliedReassignment[];
}

interface AppliedReassignment {
  rosterId: number;
  playerId: number;
  playerName: string;
  oldSlot: string;
  newSlot: string;
}

// POST /api/teams/:teamId/lineup
interface LineupUpdateRequest {
  assignments: Array<{ rosterId: number; newSlot: string }>;
}
interface LineupUpdateResponse {
  success: true;
  applied: AppliedReassignment[];
}
interface LineupUpdateError {
  error: string;
  code: "INVALID_LINEUP" | "NO_LEGAL_ASSIGNMENT" | "ELIGIBILITY_LOST_MID_OPERATION";
  detail?: {
    offendingAssignments?: Array<{ rosterId: number; reason: string }>;
    unfilledSlots?: string[];
    unassignedPlayers?: number[];
  };
}
```

## 8. Aurora Visual Spec — Swap Mode

Layout: 5 glass cards stacked vertically on mobile, 2-3 column grid on desktop:
- Card 1: **Catchers** — 2 slots (C × 2)
- Card 2: **Infield** — 4 slots (1B, 2B, 3B, SS)
- Card 3: **Outfield** — 5 slots (OF × 5) — single OF slot code per `SLOT_CODES`, capacity 5
- Card 4: **Flex** — 3 slots (MI, CM, DH)
- Card 5: **Pitchers** — 9 slots (P × 9)

Tokens (consume from `--am-*` namespace per CLAUDE.md Aurora rollout):
- `--am-irid` for selected player ring
- `am-glow-pulse` keyframe (defined in `client/src/features/transactions/components/SwapMode/swapMode.css`) for eligible slot animation — uses `--am-irid` color stops (no `--am-glow` token; PR2 may promote the keyframe to `aurora.css` if reusable elsewhere)
- `--am-glass` for card background
- `--am-text-dim` for ineligible slot opacity treatment

Eligibility chips: small pill row under each player name showing `slotsFor(posList)` (e.g., "2B · SS · MI · DH"). When that player is selected, the matching position group cards get a subtle pulsing border.

## 9. Test Plan

| Area | Tests | Notes |
|---|---|---|
| `slotMatcher.ts` unit | ~15 | happy / multi-eligibility / unsolvable / IL preservation / partial reshuffle / incumbent-preference / 9-pitcher expansion / capacity overflow / empty roster / single-position-only roster |
| `/claim` integration | ~3 | with auto-resolve flag on, off, NO_LEGAL_ASSIGNMENT path |
| `/il-stash` integration | ~3 | same matrix |
| `/il-activate` integration | ~2 | same matrix |
| `/lineup` endpoint | ~6 | full validation / atomic apply / ineligible rejected / IL untouched / auth check / TransactionEvent written |
| Swap Mode component | ~10 | slot highlight / queued swap state / reset / save / API error inline / chain swaps / commissioner mode / saved roster refetch / iridescent class assertions / accessibility (keyboard) |
| AddDropPanel toast | ~3 | reassignments rendered / NO_LEGAL_ASSIGNMENT inline error / no-reassignments happy path |
| **Total** | **~42** | |

## 10. Rollout Phases

**PR1 (Part A only — server auto-resolve).** Lower-risk; immediately fixes the user's failing scenario without any UI work. Ships:
- `slotMatcher.ts` + tests
- Wire-in to `/claim`, `/il-stash`, `/il-activate`
- `transactions.auto_resolve_slots` LeagueRule (default on for OGBA)
- Response shape additive; existing client tolerates extra fields
- Surface `appliedReassignments` as a quick toast in existing `AddDropPanel`
- Estimated: **1 session**

**PR2 (Parts B + D + E — Swap Mode + lineup endpoint).** Builds on PR1's backend trust. Ships:
- `POST /api/teams/:teamId/lineup` endpoint + tests
- `SwapMode` component + Aurora visual treatment
- Commissioner "Open Swap Mode" link
- Updated `docs/aurora-design-system.md` with Swap Mode component spec
- `/now-tldr` line; runbook for "matcher failed" at `docs/solutions/`
- Estimated: **2 sessions**

## 11. Risks & Open Questions — RESOLVED

> **All resolved 2026-04-29.** See the "Resolved decisions" table at the top of the doc for the canonical answers. Original questions retained below for context.

1. **Daily eligibility sync race.** The 12:00 UTC cron at `server/src/index.ts` updates `Player.posList`. If a sync runs between request submission and processing, the matcher might see a different eligibility set than the client. *Mitigation:* matcher reads `posList` inside the transaction; if `ELIGIBILITY_LOST_MID_OPERATION` fires, the user retries. Acceptable since the sync only runs daily. **Decision needed:** OK with this mitigation, or do you want a stricter pin to request-time eligibility?

2. **Incumbent-preference behavior.** When multiple legal matchings exist, we prefer the one that moves the fewest players. **Decision needed:** should we surface "your lineup will be re-shuffled, see preview" as a confirm step, or always silently optimize? (Yahoo silently optimizes; that's the recommendation.)

3. **Pitcher slot indistinguishability.** P1...P9 are interchangeable for eligibility but the user might care about *display order* (e.g., aces first). **Decision needed:** matcher returns `P` and the client sorts by ERA / name? Or matcher returns numbered P1...P9 and we preserve them across moves?

4. **Backdated transactions.** When commissioner backdates a `/claim`, should the matcher use today's `posList` or the historical one at `effective`? **Recommendation:** today's, since `Player.posList` is mutable and we don't preserve history. Document this clearly.

5. **OF1/OF2/OF3 vs single OF.** Confirm with `SLOT_CODES` in `client/src/lib/sports/baseball.ts` — is OF a single slot with capacity 3, or three labeled slots? Affects `slotCapacities` shape. **Decision needed:** confirm by reading the code before PR1 starts.

6. **What happens to roster sort order on auto-resolve?** Existing roster grids sort by `assignedPosition` — players will visually jump. *Mitigation:* show the toast prominently so users understand. **Decision needed:** is the toast enough, or do we want a "review changes" step before committing?

7. **Keepers — special treatment in Swap Mode?** Keepers have `Roster.isKeeper === true` and a fixed `price`. The matcher doesn't care about keeper status today. **Decision needed:** should keepers be visually flagged in Swap Mode (e.g., gold ring) so owners don't accidentally bench them? Should they be lock-pinned by default?

## 12. Estimated Effort

| Phase | Sessions |
|---|---|
| PR1: matcher + endpoint integration + flag + toast | 1 |
| PR2: `/lineup` endpoint + Swap Mode UI + commissioner link + docs | 2 |
| **Total** | **3** (within target of 2-3) |

---

## Critical Files for Implementation

- `server/src/features/transactions/lib/positionInherit.ts` — current pairwise constraint
- `server/src/features/transactions/routes.ts` — three endpoints to wire
- `client/src/lib/positionEligibility.ts` — `slotsFor()` source of truth
- `server/src/features/teams/routes.ts` — new `/lineup` endpoint home
- `client/src/features/roster/components/` — existing AddDrop / IL panels (paths to confirm)
- `client/src/features/commissioner/components/CommissionerRosterTool.tsx` — Swap Mode integration

---

## Review checklist (for the reviewer)

- [ ] Goal section captures the actual UX problem you wanted solved
- [ ] User stories cover your real workflows (especially #4, the failing scenario you reported)
- [ ] Decisions in section 11 are answered (these block implementation)
- [ ] Rollout phases match your appetite for risk (ship PR1 only first vs. both PRs)
- [ ] Test plan count feels right (~42 tests across server + client)
- [ ] Aurora visual spec for Swap Mode aligns with your design intent

Add comments inline (or in PR review) on any item that needs more thought.

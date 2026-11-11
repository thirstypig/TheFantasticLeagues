---
id: DOC-039
type: plan
status: active
---
# Team Page Tidy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the team page (`/teams/:code`) quieter and denser, per James's feedback of 2026-11-11.

**Changes:**
- One line per player.
- Pos and MLB team get their own columns.
- Lineup Intelligence and Weekly Insights are hidden.
- The IL section gains a column for the period the IL stint covers.
- All of this works on phone.

**Architecture:**
- Desktop: `RosterHubV3` / `RosterRowV3` inside `features/teams/pages/Team.tsx`.
- Phone: `client/src/mobile/pages/MobileTeam.tsx` with `MobileRowV3`.
- The server's teams routes already compute IL windows (`server/src/lib/ilWindows.ts` `buildIlWindows`). The roster response gains the current stint's start date.

**Spec:** James, 2026-11-11, in chat. The original request:
- Will Smith shows on three lines.
- Shrink each player to one row, with one column for position (eligibility) and one for team.
- Slots don't change, but owners move players between slots.
- It must work on mobile.
- Hide and disable Lineup Intelligence ("too busy").
- Keep the Watchlist, Trading Block, Waiver Wire List and Injured List.
- The Injured List gets another column for the period the IL stint is for.

**Finding:** Will Smith is not duplicated. It is one row whose cell stacks three lines: the name, "LAD · C", and the eligibility "DH".

## Global Constraints

- Style Bible: text sizes 13/15/17/24px only, nothing under 13px, Style Bible tokens, dark mode through the existing variables.
- No modals. Moving players between slots (slot pills, drag, the "…" menu and its sub-routes) must keep working exactly as today, on both phone and desktop.
- ADR-015: no new cross-feature imports.
- Phone 390px: no sideways scroll.

## Rulings

1. **Desktop hitter row columns:** `Slot | Player | Pos | MLB | AB H R HR RBI SB AVG | …`. Pitcher rows are the same with their stat columns.
   - **Player:** the name with the keeper ★ and the drag handle, on one line, opening the player card as it does today.
   - **Pos:** every eligible position, joined with "/", for example "C/DH".
   - **MLB:** the team abbreviation.
   - Rows target about 40px tall.
   - The eligibility chips the current third line shows also mark which slots a player may move to. That information must survive: in the Pos text, and through the slot pill highlighting that already happens on select.
2. **Phone rows:** two lines.
   - Line one: slot pill, name and "…".
   - Line two: "Pos · MLB" plus a short stats line.
   - Same move behaviour as today.
3. **Hide Lineup Intelligence and the Weekly Insights section.** Weekly Insights is the same kind of AI summary and wasn't on the keep list. Hide means don't render and don't fetch, so remove the calls rather than hiding them with CSS. Keep the components on disk so they're easy to bring back.
4. **Remove the instruction paragraph** under "Active roster · 23 slots" ("Tap a slot pill to select…"). It's part of the busy feel.
5. **IL column "Period":** the period the current IL stint started in, shown as "Since Period 5". If the stint started in the current period, show "This period". If the start date is unknown, show "—".
   - The server adds `ilSince` (ISO date or null) to each IL roster row, from the same IL windows the fee code uses. The client maps the date to a period name using the league's periods.
6. **Keep** the Watchlist, Trading Block, Wire List link and IL sections. Any "View classic Team page" link stays.

## Review Focus

1. Moving a player between slots on desktop and phone still works: pill select, drag and the "…" menu.
2. A player with a long eligibility list (for example "3B/1B/2B/DH/LF/RF/SS") stays on one line, truncating or wrapping inside the Pos cell, without breaking the row height.
3. An IL player whose stint started before the season's first period gets the right label.
4. Keepers (★) and ghost-IL warning chips still show.
5. Dark mode and 390px.

---

### Task 1: One-line rows, columns, hidden AI sections, IL period

**Files** (discover the exact ones):
- `client/src/features/teams/components/RosterHub/{RosterHubV3,RosterRowV3,MobileRowV3,IlSectionV3,PositionEligibilityCell,rosterHub.css}`
- `client/src/features/teams/pages/Team.tsx`
- `client/src/mobile/pages/MobileTeam.tsx`
- `server/src/features/teams/routes.ts` (roster response `ilSince`)
- tests beside each

- [ ] Tests:
  - `hitter row renders Pos "C/DH" and MLB "LAD" in their own cells, name on one line`
  - `Lineup Intelligence and Weekly Insights are not rendered and not fetched`
  - `IL row shows "Since Period N" from ilSince`, plus `"This period"` and `"—"`
  - server: `IL roster rows carry ilSince from the IL windows` (assert the query args, not just the result)
  - the existing move tests stay green
- [ ] Implement.
- [ ] Run the full client and server suites and both tsc runs (grep the full output for "error TS"), plus `node scripts/check-feature-isolation.mjs`.
- [ ] Commit.

### Final

- [ ] Browser check on local Supabase at 390 and 1440, light and dark: one-line rows, a slot move on both phone and desktop, the IL column, no AI sections, no text under 13px, ovX 0.
- [ ] `npm run docs:refresh`, then open the PR (stacked on #482).

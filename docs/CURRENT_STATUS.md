# Current Product Status

Last updated: 2026-05-04

## Source Of Truth

`server/data/planning.json` is the unified planning source for both:

- micro todos: actionable tasks in `categories[].tasks`
- macro roadmap: larger product themes in `roadmap[]`

Do not recreate a separate `TODO.md`, `todo-tasks.json`, or `docs/ROADMAP.md`. If a task belongs on the roadmap, link the micro task to the matching roadmap section with `roadmapLink`.

Legacy task docs may remain as historical references under `docs/plans/` or `docs/solutions/`, but the active todo list and roadmap must stay together in `server/data/planning.json` and the in-app Admin/Roadmap views.

## Current Focus

Primary product work is OGBA in-season roster management and league dashboard clarity.

### Roster Hub

Roster Hub is the active roster-management direction. The UX follows the Yahoo-style mental model:

- The team roster table is the hub.
- Add/drop, IL stash, and IL activate are focused roster-move flows.
- Confirm buttons unlock only after the server-backed roster-rule preview accepts the move.
- The server full-roster matcher is the final authority for legal roster states.
- OGBA has no bench. Every active player must fit a legal slot.
- OGBA pitcher slots are `P`, not `SP`/`RP`.
- OGBA outfield slots display as `OF`, not separate `LF`/`CF`/`RF`.

### Roster Move Tables

Any player table used for player choice or comparison should follow the same core pattern:

- sortable table, not bento cards
- player name, eligible fantasy positions, MLB team, and role-appropriate stats
- hitters show hitting stats only
- pitchers show pitching stats only
- selected add/drop players must be visually highlighted
- expansion reveals career stats and position eligibility details
- transaction review uses readable opaque table treatment, not transparent glass over dense stats

### Home Dashboard

Home is the daily league cockpit:

- left column favors wider stat tables such as My Team Today and Weekly Insights
- right column favors compact cards such as Your Team, Current Standings, League Activity, Pending Trades, Around the League, League Board, and Injured List
- My Team Today should show current-day hitter/pitcher lines when MLB games have started or completed
- Weekly Insights tabs use the week start date, not labels like `W17`
- past AI insights stay available through the AI Hub
- stale AI copy should be labeled when it may lag current standings

### AI Insight Retention

All generated AI outputs should have a durable home in the AI section. This includes weekly digests, trade analyzer output, player/team insights, and future commissioner-assistant summaries.

## Deferred

SEO and blog expansion are intentionally on hold while roster management, standings accuracy, daily stats, and dashboard UX are stabilized.

Stripe and growth work remain roadmap items, but they should not displace active OGBA in-season correctness work.

## Verification Baseline

Recent verification for this workstream:

- `npm run test`: 961 server + 583 client = **1544 tests green** (7 skipped, 1 todo)
- `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit` — both clean
- Browser smoke at `http://localhost:3011/` (port 3010 currently held by an orphan dev server) — Home dashboard, Team page V3 hub, AddDrop / Place-on-IL / Activate-from-IL panels all rendering without console errors
- AddDrop preview-effect regression check: 0 spurious `claim/preview` POSTs from sort/type interactions; exactly 1 POST per drop selection (per `fix/adddrop-preview-deps`, todo #154)

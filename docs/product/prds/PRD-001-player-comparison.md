---
id: PRD-001
title: "Player Comparison (/compare)"
description: "Side-by-side season-stat comparison of up to 5 players, league-scoped, for pickup and start/sit decisions."
type: prd
status: draft
feature_status: planned
phase: null
owner: james
tags: [players, transactions]
links: [DOC-002, DOC-003]
updated: 2026-07-23
---

# Player Comparison (`/compare`)

<!-- Prompt-to-self: this is a FORWARD-LOOKING PRD — the feature is spec'd, reviewed, and
     unbuilt. Every claim is tagged [intended] / [inferred] / [unknown]. Do not upgrade an
     [inferred] to a fact without evidence. -->

> **Source material:** `docs/superpowers/specs/2026-07-11-player-comparison-design.md`
> (rev 2, post multi-agent design review), on branch `feat/player-comparison`.
> **Status: awaiting sign-off.** Two scope calls are still open — see §10.

---

## 1. Problem statement

*What's broken, for whom.*

An owner deciding "should I pick up X over Y?" or "who do I start tonight?" has **no
surface in the app that shows two players next to each other**. [inferred — there is no
comparison route or component in `client/src/features/`; the only player-detail surface is
`PlayerDetailModal`, which shows exactly one player at a time.]

Today the workaround is to open one player's detail, remember the numbers, close it, and
open another. [inferred from the available UI, not from observed user behaviour.]

**Who:** any of the ~12 OGBA owners making an add/drop or start/sit call.
**How often this actually bites:** [unknown] — not instrumented, and not something the
code can reveal. Worth asking the league.

## 2. Strategic rationale

*Why now, why worth it.*

Two honest and somewhat opposing readings:

**For.** The stated core value is serving "the dozen-owner, auction-draft, keeper-league
crowd that Yahoo and ESPN never really served" (`CLAUDE.md`). Side-by-side comparison is
**table stakes** on both of those platforms. Its absence is a gap a switching owner would
notice immediately. [inferred]

**Against — and this should be recorded, not buried.** This feature was **not** selected
because it was the highest-priority need. It was scoped in July 2026 after an
investigation found the roster hub v3 work — the actual planned next thing — was already
complete. `/compare` was picked as a replacement enhancement in that session. [intended —
this is the documented origin in the brainstorm, not a reconstruction.]

That does not make it a bad feature. It does mean it has **never been ranked against the
four open P1 correctness bugs** (`todos/298-306`), which sit on the money-adjacent and
live-scoring paths. [inferred from the todo files.] Whether it should jump them is a
product call, not an engineering one.

Its one saving grace on risk: `/compare` is **read-only**. It touches no roster mutation,
no transaction, and no scoring path. [intended — an explicit design constraint in the
spec.]

## 3. User story

> As a **team owner**, I want to see up to five players' season stats in one table
> with the category leader marked, so that I can make a pickup or start/sit call
> without holding numbers in my head across two screens.

Secondary:

> As an **owner in a league chat argument**, I want to paste a link that opens the exact
> comparison I'm looking at, so that we're both looking at the same numbers.

## 4. Hypothesis

We believe that **giving owners a same-screen stat comparison** will lead to **the page
becoming a recurring part of the weekly add/drop routine** — measured as repeat visits
per owner per week, not one-time curiosity visits.

**We're wrong if:** the page gets a burst of first-week traffic and then near-zero repeat
use. That would mean the real comparison job is already being done adequately elsewhere
(most likely on Fangraphs or the MLB app, in a second browser tab) and we built a worse
copy of an external tool. [inferred — this is the most plausible failure mode given the
feature shows only raw season stats we don't uniquely own.]

**Second failure mode:** owners use it but file bugs that "compare doesn't match my
standings points." The page shows **raw season totals**, while league scoring uses
ownership-window attribution (ADR-013). These will legitimately disagree. The spec
requires stating this on the page. [intended]

## 5. Impact & KPIs

### (a) What the metric *should* be — the bet

| Metric | Target | Why this one |
|---|---|---|
| Weekly repeat rate — owners visiting `/compare` in ≥2 distinct weeks | **≥ 6 of 12 owners** | Repeat use is the only signal that separates "useful" from "novel" |
| Median players per comparison | **≥ 3** | If it's ~2, a simpler two-up view would have done; ≥3 justifies the 5-column build |
| Deep-links opened from a shared `?players=` URL | **> 0, and growing** | The share loop is the only viral-ish behaviour here |

<!-- Prompt-to-self: these are proposed targets, not agreed ones. They are my bet, written
     before launch on purpose so they can be judged honestly afterward. James has not
     signed off on them. -->

### (b) What we can measure **today**

| Metric | Instrumented? | Detail |
|---|---|---|
| `/compare` pageviews | **Yes, automatically** | `PostHogTracker` fires `$pageview` on every route change; `capture_pageview: false` + manual firing means new routes are covered with no extra work |
| Owner identity on those views | **Yes** | `identifyUser()` is called on login/session restore |
| Players-per-comparison | **No** | Requires a `track()` call on add/remove. Not built. |
| Deep-link opens vs. in-app search | **No** | Requires a `track()` call distinguishing hydration source. Not built. |
| Repeat-rate by owner | **Derivable** from pageviews + identity, once there's data |

**Two honest caveats:**
- `autocapture: false` — nothing is captured that isn't explicitly coded. There is no
  safety net of ambient event data. [intended — deliberate config in `client/src/lib/posthog.ts`.]
- PostHog init is gated on `VITE_POSTHOG_KEY`. **Whether that variable is set in the
  Railway production environment is [unknown]** — it isn't in any local file, and I have
  not checked Railway. If it's unset, *none* of the above is being captured today.
  <!-- TODO(james): verify VITE_POSTHOG_KEY is set in Railway prod. If it isn't, the
       entire "measurable today" column is zero. -->

**No baseline exists.** There are no numbers for how owners research players today, so
post-launch figures will have nothing to be compared against. [intended limitation —
stating it rather than inventing a baseline.]

## 6. Technical notes

All [intended] — these are locked decisions from the reviewed spec, not reconstruction.

**Data.** Reuse the existing `GET /api/player-season-stats`, which already does
league-scoped search, stats, ownership, and `is_pitcher`. Add **one additive `ids=`
parameter**. No new endpoint, no new search, no new stats path.

**Identity.** Key on the internal **`Player.id`**, never `mlb_id`. On the wire, `mlb_id`
falls back to `String(Player.id)` for null-`mlbId` players — an overloaded namespace that
risks collisions. `Player.id` is required and stable.

**Section membership.** Keyed off `is_pitcher`, not stat-presence: the endpoint emits `0`
rather than `null`, so there is no per-cell null to gate on. Hitters render in HITTING,
pitchers in PITCHING, never both. Empty sections are hidden.

**Leader highlight.** `compareLeaders` is a **pure function** in `lib/compareLeaders.ts` —
no React — and runs **per section**. Max wins, except ERA/WHIP where min wins. Ties → no
star. Context rows (AB·G, IP·GS) are never highlighted. A **rate-stat sample floor**
(AB < 20, IP < 10) suppresses the star so a 2-AB 1.000 can't out-crown a qualified regular.

**Row typing.** Use a `type` **intersection**, not `interface extends` — the latter
collapses the hitter/pitcher discriminated union (precedent: `feedback_du_interface_extends_trap`).

**Module.** New `client/src/features/compare/`, matching the single-page-module precedent
(`nba`, `nfl`, `board`, `trading-block`).

**Shared hook.** Extract `usePlayerSearch(leagueId)` — this would otherwise be the third
debounced copy of the same search logic.

> **Feature-isolation note.** `usePlayerSearch` must be **promoted to shared**, not
> imported from `features/players/`. This repo currently carries 85 production
> cross-feature imports and 4 circular dependencies; `compare` is a brand-new module and
> should start at zero outbound. The established precedent for exactly this is
> `StatsTables`, which was promoted out of `standings` into shared components.
> See ADR-015 and `docs/engineering/tech-spec.md`.

**CSS discipline.** `ComparisonTable`'s highlight / `—` / section classes ship in the
**same commit** as the JSX. jsdom cannot catch a missing CSS rule (precedent:
`feedback_class_hook_without_css`).

## 7. AI implementation notes

**None. This feature uses no AI.** No model call, no prompt, no per-call cost.

Recorded explicitly rather than omitted, so that a future reader can tell "no AI" apart
from "nobody filled this section in."

## 8. Testing plan

**Unit — `compareLeaders` is the most-tested unit** (pure, no React):
max vs. min stats · ties produce no star · single-member section produces no star · context
rows never highlighted · rate-stat floor suppresses the star below AB 20 / IP 10.

**Unit — deep-link parsing:** column order follows `?players=` param order · cap at 5 with
a user-visible notice · empty/garbage tokens ignored · duplicate ids deduped.

**Component:** partial hydration renders resolved columns plus a dismissible notice · 1
player renders with an "add another" hint, not a half-loaded look · fetch failure shows
retry, not a blank table · a player already added shows "Added" disabled, not a silent no-op.

**Browser verification — mandatory, not optional.** Per `CLAUDE.md`, any UI change requires
live browser testing. Both code paths must be driven: in-app search hydration **and**
`?players=` deep-link hydration. Verifying only one is partial verification (precedent:
`feedback_partial_browser_verification`, PR #182).

**Not covered by tests, needs eyes:** horizontal scroll behaviour at 5 columns on a narrow
mobile viewport inside `MobileLayoutGate`.

## 9. Deferred / future enhancements

Explicitly **out of scope** for MVP:

| Deferred | Why |
|---|---|
| Roster-hub multi-select → "Compare" button | The only touch of the live roster path. Fast-follow, so MVP stays read-only and zero-risk. |
| Two-way (Ohtani) merged column | `TWO_WAY_PLAYERS` is currently empty; Ohtani exists as two Player rows and the synthetic pitcher row returns all-zero season pitching. **Affects zero players today.** |
| L7 / L30 splits | Season-only keeps the endpoint additive |
| Saved comparisons | No persistence model; would need a new table |
| Projections | No projection data source in the app |
| Cross-league share links | `leagueId` is not in the URL; "shareable" means same-league only in MVP, and the page says so |

## 10. Open questions — blocking sign-off

1. **Cut roster-hub multi-select from MVP?** Recommended yes — it's the only touch of the
   live roster path. **[awaiting James]**
2. **Defer two-way display?** Recommended yes — affects zero players today. **[awaiting James]**
3. **Should this be built before the four open P1 bugs** (`todos/298`, `299`, `300`, `306`)?
   Not previously asked. Those are money-adjacent and live-scoring. **[unknown — product call]**
4. Are the §5(a) target numbers the right bet? They are my proposal, unreviewed. **[awaiting James]**

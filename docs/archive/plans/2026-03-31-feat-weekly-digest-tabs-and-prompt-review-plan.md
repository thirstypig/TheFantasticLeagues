---
title: Weekly Digest Tabs + Prompt Review
type: feat
status: active
date: 2026-03-31
---

# Weekly Digest Tabs + Prompt Review

## Overview

Two-part improvement to the Weekly Digest on the Home page:

1. **Tabs** — Add week-by-week navigation so users can browse past digests. Past digests are already stored in the DB (`AiInsight` table, keyed by `weekKey`) but never surfaced.
2. **Prompt overhaul** — Feed real stat data into the AI prompt so grades, analysis, and trade proposals are grounded in actual performance, not roster name recognition. Add new sections that make the digest feel like it was written by a knowledgeable league member.

---

## Part 1: Week Tabs

### Goal

Horizontal scrollable pill strip above the digest content. Each pill = one week's digest. Current week selected by default, past weeks browsable.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Pattern** | Scrollable pill strip (not traditional tabs) | ESPN/Yahoo fantasy pattern for time-series content |
| **Week ordering** | Chronological left-to-right, auto-scroll to current week on mount | Natural timeline mental model — scroll left = "go back in time" |
| **Label format** | `Mar 24` as pill text (compact date of Monday) | More scannable than "Week 13" or "Mar 24 - 30"; week number shown in content header |
| **Overflow** | Gradient fade on edges + partially visible pills signal more content | More elegant than arrow buttons on mobile |
| **Past week votes** | Read-only (show results, buttons disabled) | Only current week should accept votes |
| **Missing content** | "This Week" pill always present; show loading skeleton if not yet generated | Don't hide the current week even if no digest exists yet |

### Server Changes

#### New: `GET /api/mlb/league-digest/weeks?leagueId=N`

```
server/src/features/mlb-feed/routes.ts
```

- Query all `AiInsight` rows with `type: "league_digest"` for the given `leagueId`
- Return `{ weekKey, generatedAt, label }[]` ordered chronologically (oldest first)
- `label` = human-readable Monday date computed from ISO weekKey (e.g., `"2026-W13"` → `"Mar 23"`)
- Always append a synthetic entry for the current week if no digest exists yet (`{ weekKey: currentWeek, generatedAt: null, label: "Mar 31" }`)

#### Modified: `GET /api/mlb/league-digest?leagueId=N&weekKey=YYYY-WNN`

```
server/src/features/mlb-feed/routes.ts:907
```

- Accept optional `weekKey` query param
- If `weekKey` provided: query DB for that specific week, return 404 if not found (never auto-generate for past weeks)
- If `weekKey` omitted: current behavior (generate if missing for current week)
- Vote results included either way; client controls whether voting is enabled

### Client Changes

```
client/src/pages/Home.tsx
```

**New state:**
- `digestWeeks: { weekKey: string; generatedAt: string | null; label: string }[]`
- `selectedWeekKey: string` (defaults to current week)

**UI:**
- Scrollable pill strip between digest header and content
- `useRef` on active pill + `scrollIntoView({ inline: 'center' })` on mount
- CSS: `overflow-x: auto`, `scrollbar-hide`, `scroll-snap-type: x proximity`, gradient fade masks
- Tab click → fetch `/league-digest?leagueId=N&weekKey=X` → update `digest` state
- Vote buttons disabled when `selectedWeekKey !== currentWeekKey`
- Skeleton placeholder while loading (matches digest layout shape)
- Minimum touch target 44px per pill (WCAG)

### Acceptance Criteria

- [ ] Horizontal pill strip with one pill per existing digest week + current week
- [ ] Labels as compact dates (`Mar 24`), chronological left-to-right
- [ ] Auto-scrolls to current week on mount
- [ ] Past weeks load from DB (no regeneration)
- [ ] Current week generates on-demand if not yet persisted
- [ ] Gradient fade on overflow edges, scrollbar hidden
- [ ] Vote buttons read-only on past weeks
- [ ] Mobile: horizontal scroll with snap, touch targets >= 44px

### Edge Cases

- **No past digests** — pill strip shows only "This Week" pill (current week)
- **First visit of the season** — one pill, triggers generation on load
- **Week boundary rollover** — `getWeekKey()` changes on Monday; new pill appears
- **Many weeks (15+)** — horizontal scroll handles gracefully with fade indicators

---

## Part 2: Prompt Overhaul

### The Core Problem

The current prompt receives **only roster names and auction prices**, then tells the AI to ignore prices. The AI has no actual stat data — it grades teams by recognizing player names from training data, producing generic content that doesn't reflect real performance. A team with Ohtani hitting .220 with 2 HR could get an A+ just on name recognition.

### The Fix: Pre-Compute, Then Narrate

**Principle:** Don't ask the LLM to analyze raw data. Ask it to narrate pre-computed insights.

Compute these server-side before calling the AI:

1. **Season stat totals per team** via `computeTeamStatsFromDb()` — R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP
2. **Category ranks per team** (1st–10th) via `computeStandingsFromStats()` + `computeCategoryRows()`
3. **Overall roto points + standings rank** (sum of category points)
4. **Period-over-period rank deltas** (if prior period exists) — "+3 in SB, -2 in ERA"
5. **Biggest mover up / biggest mover down** (max/min of deltas)
6. **Tightest category race** (smallest spread between ranks 3–7)

Pass all of this as structured data in the prompt. The AI's job becomes narration, not analysis.

### Structured Data Format for the Prompt

Replace the current `rosterHighlights` string with structured per-team blocks:

```
=== LOS DOYERS (Overall: 1st, 87.5 pts, +3.5 from last period) ===
Season: R:145(2nd) HR:47(1st) RBI:138(3rd) SB:22(7th) AVG:.271(4th) | W:8(5th) SV:12(2nd) K:198(3rd) ERA:3.45(2nd) WHIP:1.18(3rd)
Period delta: HR:+3ranks SB:-1rank ERA:+1rank
Key players: Ohtani (DH), Betts (SS), Buehler (SP)
Keepers: Ohtani, Betts, Buehler
Recent: +J.Turner (3B, waiver) -M.Gore (SP, dropped)
```

This format is token-efficient, unambiguous, and prevents hallucination since every number is pre-verified.

### Pre-Computed Narrative Hints

Also pass "hints" the AI can weave into its narrative — these are insights we compute server-side and hand to the AI to narrate:

```
NOTABLE INSIGHTS (pre-computed, use these in your analysis):
- Biggest climber: Dodger Dawgs, +4 in SB (10th → 6th)
- Biggest drop: Mad Catz, -3 in ERA (2nd → 5th)
- Tightest race: HR — only 5 HR separate 3rd through 7th
- Surprising stat: Brawlers are 1st in K (198) but 9th in W (3) — their starters are racking up strikeouts in losses
```

### New Digest Sections

Expand from the current 4 sections to 7, ordered by engagement:

| # | Section | Format | Description |
|---|---------|--------|-------------|
| 1 | **The Week in One Sentence** | 1 sentence (15-25 words) | Punchy headline capturing the biggest story. Hooks the reader. |
| 2 | **Power Rankings** | Numbered list, 1 sentence each | Replaces simple grades. Rank 1-10 with movement arrows (↑↓→) from last week. More provocative than letter grades — creates debate. |
| 3 | **Hot / Cold Team** | 2-3 sentences each | Keep existing, but require 2-3 specific category citations. "League-best 12 HR this period, jumped from 4th to 1st..." |
| 4 | **Stat of the Week** | 2 sentences | Surprising stat line or category oddity. Pre-compute 2-3 candidates server-side, AI picks the most interesting. |
| 5 | **Category Movers** | 3 bullet points | Biggest rank changes this period. Pure data-driven, nearly impossible to hallucinate. |
| 6 | **Trade of the Week** | Structured proposal + voting | Keep existing. Enhance with specific category needs ("Team A needs SV, Team B needs SB"). |
| 7 | **Bold Prediction** | 1 sentence | Fun speculation for next week. Labeled as "bold" so readers have appropriate expectations. |

**Target total length:** 400-600 words (scannable in 2-3 minutes). Current digest is ~200-300 words — slightly thin.

### Tone & Voice

The digest should read like a **knowledgeable friend in the league**, not a neutral analyst:

- **Conversational but informed:** "Los Doyers are quietly stacking HR (1st with 47) while everyone's watching the Skunkdogs' pitching collapse"
- **Opinionated with evidence:** Every claim cites a stat. "Hot" must mean something measurable.
- **Light trash talk:** Friendly jabs that create engagement. The AI should feel like it has opinions.
- **Specific, never vague:** Never "struggling" without naming the category and the number.

**Prompt directives to add:**
1. "Write as if you are a fellow league member who studies the stats every morning."
2. "Every claim must cite a specific stat from the data provided. Never say a team is 'struggling' without naming the category and number."
3. "Use last names only (e.g., 'Betts' not 'Mookie Betts') as a real league member would."
4. "Do NOT invent stats. Only reference numbers provided above."
5. "Vary sentence structure. Do not start consecutive sentences with team names."

### Updated Zod Schema

```typescript
const digestSchema = z.object({
  weekInOneSentence: z.string().max(200),
  powerRankings: z.array(z.object({
    rank: z.number().int().min(1),
    teamName: z.string().max(200),
    movement: z.enum(["up", "down", "steady"]),
    commentary: z.string().max(300),
  })),
  hotTeam: z.object({ name: z.string().max(200), reason: z.string().max(500) }),
  coldTeam: z.object({ name: z.string().max(200), reason: z.string().max(500) }),
  statOfTheWeek: z.string().max(500),
  categoryMovers: z.array(z.object({
    category: z.string().max(20),
    team: z.string().max(200),
    direction: z.enum(["up", "down"]),
    detail: z.string().max(300),
  })).max(5),
  proposedTrade: z.object({
    style: z.string().max(50),
    title: z.string().max(200),
    description: z.string().max(500),
    teamA: z.string().max(200),
    teamAGives: z.string().max(500),
    teamB: z.string().max(200),
    teamBGives: z.string().max(500),
    reasoning: z.string().max(1000),
  }),
  boldPrediction: z.string().max(300),
});
```

### Post-Generation Validation

After AI returns its response, validate programmatically:

1. **All team names exist** in the league (catch hallucinated names)
2. **No keeper players in trade proposals** (parse `teamAGives`/`teamBGives` against keeper list)
3. **Power ranking order correlates with actual standings** — 1st place team should be ranked 1-3, last place should be ranked 8-10. Flag violations for regeneration.

### Data Source Wiring

```
server/src/features/mlb-feed/routes.ts (digest route, ~line 926)
```

Add to the parallel query block:

```typescript
// Import standings computation
import { computeTeamStatsFromDb, computeStandingsFromStats } from "../standings/services/standingsService.js";

// Get active period for the league
const activePeriod = await prisma.period.findFirst({
  where: { leagueId, status: "ACTIVE" },
  orderBy: { startDate: "desc" },
});

// Compute current stats + standings (if period exists)
let standingsContext = null;
if (activePeriod) {
  const teamStats = await computeTeamStatsFromDb(leagueId, activePeriod.id);
  const standings = computeStandingsFromStats(teamStats);
  // Also get previous period for deltas...
  standingsContext = { teamStats, standings };
}
```

Pass `standingsContext` into `generateLeagueDigest()` as a new input field.

### Backward Compatibility

The new schema (`powerRankings`, `statOfTheWeek`, etc.) differs from old persisted digests (`teamGrades`, `overview`). The client must handle both shapes:

- New digests use the new schema
- Old digests (already in DB) still have `teamGrades` — render with the old UI
- Detection: check for `digest.powerRankings` to determine which layout to use

---

## Implementation Order

### Phase 1: Tabs (UI-only, no prompt changes)
1. Server: `GET /league-digest/weeks` endpoint
2. Server: Add `weekKey` query param to existing digest endpoint
3. Client: Pill strip UI, week selection, skeleton loading
4. Client: Read-only votes on past weeks

### Phase 2: Prompt Overhaul
5. Server: Wire `computeTeamStatsFromDb()` + standings into digest route
6. Server: Build structured per-team data block with stats, ranks, deltas
7. Server: Pre-compute narrative hints (biggest mover, tightest race, surprising stat)
8. AI service: Rewrite prompt with new sections, tone directives, grounding constraints
9. AI service: Update Zod schema for new response shape
10. Client: Update Home.tsx digest rendering for new sections (power rankings, stat of the week, category movers, bold prediction)
11. Server: Add post-generation validation (team names, keeper exclusion, rank correlation)

### Phase 3: Polish
12. Test with real data — generate digest, verify grades match standings
13. Mobile testing — pill strip scroll, touch targets, content rendering
14. Backward compatibility — old digests render correctly in new UI

## Files to Modify

| File | Change |
|------|--------|
| `server/src/features/mlb-feed/routes.ts` | Add `/weeks` endpoint, `weekKey` param, wire standings data |
| `server/src/services/aiAnalysisService.ts` | Rewrite prompt, new input type, new Zod schema, validation |
| `client/src/pages/Home.tsx` | Pill strip tabs, new digest sections rendering, backward compat |
| `server/src/features/standings/services/standingsService.ts` | Ensure `computeTeamStatsFromDb` is exported (may already be) |

## Sections NOT Including (and why)

| Section | Reason to skip |
|---------|---------------|
| **Waiver Wire Watch** | Would require stats for unrostered players — data not readily available |
| **Matchup Preview** | Not applicable to roto leagues (no head-to-head matchups) |
| **Weekly MVP/LVP** | Requires individual player stat lines in prompt — significantly increases token count |
| **Injury Report** | Would be hallucinated unless we pull live IL data from MLB API |

---
title: "feat: Make all AI features visible and discoverable across the app"
type: feat
status: active
date: 2026-03-23
---

# Make All AI Features Visible and Discoverable

## Overview

All 9 AI features exist server-side but are hidden until specific contexts arise. Users don't know they exist. The goal: make every AI feature visible at all times, with clear state indicators showing when each becomes actionable.

## Design Principle

**Always visible, progressively enabled.** Each AI feature shows in the UI at all times with one of three states:

| State | Visual | Behavior |
|-------|--------|----------|
| **Available** | Full color, clickable | Feature works — click to generate |
| **Locked** | Greyed out, tooltip explains why | "Available after your first trade" |
| **Loading/Generated** | Active with results displayed | Shows cached AI output |

## AI Features Inventory

### 1. Draft Grades — `/auction` page
- **When available:** After auction is completed
- **When locked:** During SETUP, DRAFT (before auction ends)
- **Lock message:** "Available after the auction is complete"
- **Current state:** Working, visible on AuctionComplete

### 2. Draft Report (Retrospective) — `/auction` page
- **When available:** After auction is completed
- **When locked:** During SETUP, DRAFT
- **Lock message:** "Available after the auction is complete"
- **Current state:** Working with roster fallback

### 3. Bid Advice — `/auction` page (during live auction)
- **When available:** During active bidding on a player
- **When locked:** When auction is not in bidding state
- **Lock message:** "AI advice appears during active bidding"
- **Current state:** Working, inline in AuctionStage
- **Note:** This one is correctly context-sensitive — only during live bidding

### 4. Trade Analysis — `/trades` page
- **When available:** After at least one trade has been processed
- **When locked:** Before any trades exist
- **Lock message:** "Available after your first trade is processed"
- **Also available:** When building a new trade proposal (pre-submit analysis)
- **Current state:** Wired to trades page, only during proposal

### 5. Keeper Recommendations — `/commissioner` or `/keeper-prep` page
- **When available:** During SETUP/DRAFT when keeper prep is active
- **When locked:** During IN_SEASON, COMPLETED
- **Lock message:** "Available during keeper selection (pre-draft)"
- **Current state:** Wired to KeeperSelection page

### 6. Waiver Bid Advice — `/activity` page (waivers tab)
- **When available:** During IN_SEASON when submitting a waiver claim
- **When locked:** Outside IN_SEASON or no active waivers
- **Lock message:** "Available when submitting waiver claims"
- **Current state:** Wired to waivers page

### 7. Weekly Team Insights — Team page or Home page
- **When available:** During IN_SEASON with at least one period of stats
- **When locked:** Before IN_SEASON or no stats synced
- **Lock message:** "Available after first stats sync during the season"
- **Current state:** Server endpoint exists, needs UI component

### 8. Historical Trends — `/archive` page
- **When available:** When viewing a team's historical season data
- **When locked:** When no historical data exists for the team
- **Lock message:** "Import historical data to enable AI analysis"
- **Current state:** Wired to Archive page per-team

### 9. Historical Draft Analysis — `/archive` page
- **When available:** When viewing a team's historical draft data
- **When locked:** When no draft data exists for the team
- **Lock message:** "Import historical draft data to enable AI analysis"
- **Current state:** Wired to Archive page per-team

## Proposed Solution: AI Hub + Inline Features

### Option A: Dedicated AI Hub Page (Recommended)

Add an **AI Insights** page (`/ai` or `/insights`) accessible from the sidebar that shows ALL AI features in one place with their current status:

```
┌─────────────────────────────────────────────┐
│  AI Insights                    ✨ Powered by │
│                                  Gemini/Claude│
├─────────────────────────────────────────────┤
│                                               │
│  ┌─── Draft ────────────────────────────┐     │
│  │ ✅ Draft Grades        [View Report] │     │
│  │ ✅ Draft Report         [View Report] │     │
│  │ 🔒 Bid Advice     (auction only)     │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌─── Season ───────────────────────────┐     │
│  │ ✅ Weekly Insights    [Generate]      │     │
│  │ 🔒 Trade Analysis  (after 1st trade) │     │
│  │ 🔒 Waiver Advice   (during claims)   │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌─── Planning ─────────────────────────┐     │
│  │ 🔒 Keeper Recs     (pre-draft only)  │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌─── Historical ───────────────────────┐     │
│  │ ✅ Season Trends     [Select Team]    │     │
│  │ ✅ Draft Analysis    [Select Team]    │     │
│  └──────────────────────────────────────┘     │
│                                               │
└─────────────────────────────────────────────┘
```

### Option B: AI Badge on Each Page

Instead of a hub, add a small `✨ AI` badge/button on each page where an AI feature is available. Locked features show the badge greyed out with a tooltip.

### Recommendation: Both

- **AI Hub page** for discoverability and centralized access
- **Inline AI badges** on each relevant page for contextual use

## Implementation Plan

### Phase 1: AI Hub Page (New Feature)

- [ ] Create `client/src/features/ai/pages/AIInsights.tsx`
- [ ] Add route `/ai` in `App.tsx`
- [ ] Add "AI Insights" to sidebar nav (with sparkle icon ✨)
- [ ] Card for each AI feature showing: name, description, status badge, action button
- [ ] Status logic uses `useSeasonGating()` + data checks (trades exist? stats synced?)
- [ ] Available features: click opens inline result or navigates to relevant page
- [ ] Locked features: greyed card with lock icon + tooltip explaining when it unlocks

### Phase 2: Weekly Insights UI (Missing Component)

- [ ] Create `client/src/features/ai/components/WeeklyInsights.tsx`
- [ ] Fetch from `GET /teams/ai-insights?leagueId=X&teamId=Y`
- [ ] Show insights cards grouped by category (Roster, Standings, Budget, Pitching, Hitting)
- [ ] Include overall team grade
- [ ] Accessible from AI Hub and Team page

### Phase 3: Trade Analysis Visibility

- [ ] On `/trades` page, add "AI Analysis" section below trade list
- [ ] If no processed trades: greyed card with "Available after your first trade"
- [ ] After first processed trade: show "Analyze Trade" button per trade
- [ ] Result shows fairness rating, winner, analysis, recommendation

### Phase 4: Inline AI Badges

- [ ] Create shared `<AIBadge feature="draft-grades" />` component
- [ ] Badge shows ✨ when available, 🔒 when locked, with tooltip
- [ ] Add to: Auction page, Trades page, Teams page, Activity page, Archive page
- [ ] Clicking available badge scrolls to/opens the AI feature

## Acceptance Criteria

- [ ] All 9 AI features visible from the AI Hub page
- [ ] Each feature shows correct Available/Locked state
- [ ] Locked features explain what action unlocks them
- [ ] Available features generate AI output on click
- [ ] Weekly Insights component built and working
- [ ] AI Hub accessible from sidebar nav
- [ ] No duplicate API calls (cache AI results client-side)
- [ ] Works in both light and dark mode
- [ ] Mobile responsive

## Files to Create/Modify

| File | Action |
|------|--------|
| `client/src/features/ai/pages/AIInsights.tsx` | **New** — AI Hub page |
| `client/src/features/ai/components/WeeklyInsights.tsx` | **New** — Weekly insights component |
| `client/src/features/ai/components/AIFeatureCard.tsx` | **New** — Reusable card for each AI feature |
| `client/src/features/ai/api.ts` | **New** — API client for all AI endpoints |
| `client/src/features/ai/index.ts` | **New** — Module exports |
| `client/src/App.tsx` | **Modify** — Add `/ai` route |
| `client/src/components/AppShell.tsx` | **Modify** — Add "AI Insights" nav item |
| `client/src/features/trades/pages/TradesPage.tsx` | **Modify** — Add AI analysis section |
| `client/src/features/teams/pages/Team.tsx` | **Modify** — Add Weekly Insights section |

## Sources

- `server/src/services/aiAnalysisService.ts` — All 8 AI methods
- `server/src/features/auction/routes.ts` — draft-grades, retrospective, ai-advice endpoints
- `server/src/features/trades/routes.ts` — trade analysis endpoint
- `server/src/features/teams/routes.ts` — ai-insights endpoint
- `server/src/features/waivers/routes.ts` — ai-advice endpoint
- `server/src/features/archive/routes.ts` — ai/trends, ai/draft endpoints
- `client/src/hooks/useSeasonGating.ts` — Season phase gating

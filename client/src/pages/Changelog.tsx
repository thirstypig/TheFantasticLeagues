import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  GitCommit,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Bug,
  Sparkles,
  Wrench,
  Shield,
  Zap,
  TestTube,
  Layers,
  Database,
  Globe,
  Users,
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

interface ChangelogEntry {
  version: string;
  date: string;
  session: string;
  title: string;
  highlights: string[];
  changes: { type: "feat" | "fix" | "perf" | "refactor" | "test" | "docs" | "security"; description: string }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: "0.37.0",
    date: "Mar 23, 2026",
    session: "Session 37",
    title: "AI Insights Fixes, Table Density System, Code Quality, SaaS Planning",
    highlights: [
      "All 9 AI features tested and verified — fixed trade analyzer middleware bug and weekly insights missing teamId",
      "Table density system — 3-tier (compact/default/comfortable) with SortableHeader and zebra striping",
      "Extracted splitTwoWayStats() helper, typed mlbGetJson with generics, stabilized enrichedPlayers",
      "SaaS Phase 1 plan — snake draft, self-service onboarding, Stripe billing, public league directory",
    ],
    changes: [
      { type: "fix", description: "requireLeagueMember middleware now checks req.body — fixes trade analyzer 400 error on POST endpoints" },
      { type: "fix", description: "AIHub weekly insights includes teamId in generate URL — was missing, causing 400" },
      { type: "fix", description: "AIHub fetches user's team on mount for team-scoped AI features" },
      { type: "feat", description: "3-tier table density system: compact (28px), default (36px), comfortable (44px) via React context" },
      { type: "feat", description: "SortableHeader component — reusable sort indicators replacing 10+ inline implementations" },
      { type: "feat", description: "Zebra striping prop on ThemedTable — activates existing lg-table CSS class" },
      { type: "feat", description: "Semantic value tokens: --lg-positive / --lg-negative for mode-aware green/red" },
      { type: "refactor", description: "splitTwoWayStats() extracted from inline route logic into statsService.ts helper" },
      { type: "refactor", description: "mlbGetJson<T> generic type parameter — backwards-compatible type safety" },
      { type: "perf", description: "enrichedPlayers rosterFingerprint — stable dependency prevents re-renders on non-roster auction updates" },
      { type: "test", description: "requireLeagueMember body fallback test — 493 server tests (was 492)" },
      { type: "docs", description: "SaaS Phase 1 plan: snake draft, onboarding, directory, Stripe billing, Astro marketing" },
    ],
  },
  {
    version: "0.36.0",
    date: "Mar 22-23, 2026",
    session: "Session 36",
    title: "Position Eligibility, Prospects, AI Hub, Sidebar, Ohtani Stats",
    highlights: [
      "Position eligibility from MLB fielding stats — 199 players updated with multi-position eligibility",
      "AAA prospect sync — 622 new minor league players added (2,274 total)",
      "AI Insights hub page (/ai) — all 9 AI features visible with Available/Locked states",
      "Sidebar condensed — collapsible sections, season-gated nav, Cmd+B toggle",
      "Ohtani two-way stats fixed end-to-end — Team page, standings, position eligibility",
    ],
    changes: [
      { type: "feat", description: "syncPositionEligibility() — updates Player.posList from MLB fielding stats (GP >= configurable threshold)" },
      { type: "feat", description: "syncAAARosters() — fetches Triple-A rosters, tags prospects with parent org (PR #82)" },
      { type: "feat", description: "POST /api/auction/complete — commissioner can manually end auction (PR #86)" },
      { type: "feat", description: "POST /api/auction/refresh-teams — triggers matrix refresh after position changes (PR #86)" },
      { type: "feat", description: "AI Insights hub page (/ai) — 9 AI features with Generate/Locked/Cached states (PR #88)" },
      { type: "feat", description: "Sidebar collapsible sections with localStorage persistence + Cmd+B shortcut (PR #87)" },
      { type: "feat", description: "Anthropic Claude fallback for AI when Gemini fails + model updated to gemini-2.5-flash" },
      { type: "feat", description: "Retrospective falls back to roster data when no AuctionLot records exist" },
      { type: "fix", description: "Auction budget uses Team.budget (reflects trades) instead of league-wide budgetCap (PR #81)" },
      { type: "fix", description: "Ohtani pitcher row shows pitching stats on Team page (uses assignedPosition)" },
      { type: "fix", description: "Ohtani standings — split hitting/pitching stats by assigned role (no double-counting)" },
      { type: "fix", description: "Auction nav accessible during IN_SEASON for viewing results" },
      { type: "refactor", description: "CI renamed to CM (Corner Man) across all code + DB (PR #85)" },
      { type: "refactor", description: "6-agent code review — P1/P2 findings resolved: batch lookups, shared helpers, null guards (PR #84)" },
      { type: "refactor", description: "N+1 queries eliminated via buildPlayerLookup() in all sync functions" },
      { type: "docs", description: "5 implementation-ready plans: tables, news feed, AI visibility, backlog, SaaS Phase 1" },
    ],
  },
  {
    version: "0.35.0",
    date: "Mar 22, 2026",
    session: "Session 35",
    title: "Live Auction Production Fixes & Code Quality Sweep",
    highlights: [
      "Fixed production auction outage — 0 teams caused by hardcoded /api/ paths bypassing API_BASE",
      "Player names in Teams tab — server now sends mlbId/playerName in roster data",
      "Position dropdown shows MI/CI roster slots via positionToSlots()",
      "Ohtani two-way stats split — pitcher row shows pitching stats only",
      "Complete API_BASE migration — 49 hardcoded paths fixed across 22 files",
    ],
    changes: [
      { type: "fix", description: "Auction routing — all fetchJsonApi calls use ${API_BASE} instead of hardcoded /api/ (PRs #79, #80)" },
      { type: "fix", description: "Player names — server includes mlbId/playerName in roster data; Teams tab shows actual names instead of 'Player #XXX'" },
      { type: "fix", description: "Force-assign availability — enrichedPlayers useMemo overlays real-time auction state onto player pool" },
      { type: "fix", description: "Position dropdown — MI/CI slots derived from positionToSlots(); removed BN/UTIL" },
      { type: "fix", description: "Ohtani stats — pitcher row zeros out hitting stats, hitter row zeros out pitching stats" },
      { type: "fix", description: "Position matrix colors — green for full (correct), neutral for partial, muted for empty" },
      { type: "fix", description: "WebSocket safety net — fetchState() on WS connect ensures state even if initial HTTP fetch fails" },
      { type: "refactor", description: "Complete API_BASE migration — 49 paths across 22 files, zero hardcoded /api/ paths remain" },
      { type: "refactor", description: "Server AuctionTeam type updated to match runtime shape (id, mlbId, playerName)" },
      { type: "refactor", description: "Removed duplicate players.find() in TeamListTab, unnecessary (entry as any) cast, || → ?? for mlbId" },
      { type: "docs", description: "Compound learnings — deployment checklist, production outage post-mortem, UX fixes documentation" },
    ],
  },
  {
    version: "0.34.1",
    date: "Mar 21, 2026",
    session: "Session 34b",
    title: "Mobile Readiness & Activity Sticky Headers",
    highlights: [
      "Activity page sticky table headers — Add/Drop and History tabs",
      "iOS Safari viewport fix — 100vh→100svh prevents address bar content clipping",
      "Touch target improvements — sidebar, auction buttons, tabs all 44px+ for accessibility",
    ],
    changes: [
      { type: "feat", description: "Activity page sticky headers on Add/Drop and History tables with viewport height constraint" },
      { type: "fix", description: "iOS viewport — all pages use 100svh instead of 100vh/100dvh (prevents address bar clipping)" },
      { type: "fix", description: "Touch targets — sidebar items 44px+, auction Pass/AI buttons, ContextDeck tabs, icon buttons" },
      { type: "fix", description: "Sidebar nav items — padding 5px→10px, font 13px→14px for readability" },
    ],
  },
  {
    version: "0.34.0",
    date: "Mar 21, 2026",
    session: "Session 34",
    title: "Sticky Table Headers & Accessibility",
    highlights: [
      "Sticky table headers on Players page and Auction PlayerPoolTab — headers stay visible while scrolling",
      "WCAG 2.2 AA color fixes — all status colors now pass contrast requirements in both light and dark mode",
      "Age-friendly table typography — 15px font, taller rows, explicit line-height for 40+ readability",
    ],
    changes: [
      { type: "feat", description: "Sticky table headers — ThemedThead gets sticky prop, bare ThemedTable renders raw <table> to eliminate overflow wrapper" },
      { type: "feat", description: "Players page — viewport-constrained layout with internal scroll container for sticky headers" },
      { type: "fix", description: "WCAG AA status colors — success #065f46, warning #92400e, error #b91c1c (light); #34d399, #fbbf24, #f87171 (dark)" },
      { type: "fix", description: "Dark mode status color overrides — added .dark section overrides following Apple HIG pattern" },
      { type: "fix", description: "Alert classes — replaced hardcoded hex with var() references for theme consistency" },
      { type: "perf", description: "Replaced backdrop-blur-xl on sticky headers with opaque background — eliminates per-frame GPU blur, 60 FPS scroll" },
      { type: "fix", description: "Table cell typography — 14px→15px font, py-2.5→py-3 padding, added leading-5 for 40+ readability" },
      { type: "fix", description: "New --lg-table-header-sticky-bg token — #e8ecf2 (light) / #1c2638 (dark) opaque composited equivalents" },
      { type: "docs", description: "Accessibility plan with 8-agent research — contrast verification, colorblind safety, performance analysis" },
    ],
  },
  {
    version: "0.33.0",
    date: "Mar 20, 2026",
    session: "Session 33",
    title: "Production Deployment & Code Review Hardening",
    highlights: [
      "Production deployment readiness for Render — CSP, HSTS, static caching, shutdown alignment",
      "Auction retrospective endpoint with post-draft analytics and DraftReport component",
      "6-agent code review with all P2/P3 findings resolved",
    ],
    changes: [
      { type: "feat", description: "Auction retrospective endpoint — league stats, bargains/overpays, position spending, contested lots, team efficiency" },
      { type: "feat", description: "DraftReport component — post-auction analytics rendered on AuctionComplete page" },
      { type: "feat", description: "Guide additions — 'Finding Players' screenshot, 'Before the Draft' section with league rules screenshot" },
      { type: "security", description: "CSP hardening — scoped wss: to wss://*.supabase.co, removed stale fbst-api.onrender.com" },
      { type: "security", description: "HSTS header — Strict-Transport-Security (1 year, includeSubDomains) via helmet" },
      { type: "security", description: "Service worker same-origin check — only cache responses from own origin" },
      { type: "fix", description: "CSP connectSrc/scriptSrc — added PostHog domains for analytics in production" },
      { type: "fix", description: "Shutdown timeout alignment — 55s hard kill matches Render's 60s maxShutdownDelaySeconds" },
      { type: "fix", description: "Express version mismatch — removed Express v5 from root package.json (server uses v4)" },
      { type: "perf", description: "Static asset caching — maxAge 1 year + immutable on Vite-hashed assets" },
      { type: "docs", description: "render.yaml overhaul — production domain, VITE_* build-time vars, Node 20 pinned, graceful shutdown" },
      { type: "docs", description: "Production deployment plan at docs/plans/" },
      { type: "fix", description: "CSP wss:// — explicit production domain for WebSocket (browser 'self' mapping inconsistent)" },
      { type: "fix", description: "Light mode contrast — darker backgrounds, stronger table headers, more opaque glass cards" },
      { type: "fix", description: "Dark mode muted text — was same #64748b as light mode, now #8b9bb5 for readability" },
      { type: "fix", description: "Home game cards — 'Final' status visible, team records inline next to abbreviation" },
      { type: "fix", description: "Season 'Cumulative results' subheader promoted from muted+opacity-60 to secondary text" },
      { type: "test", description: "11 new retrospective tests" },
    ],
  },
  {
    version: "0.32.0",
    date: "Mar 20, 2026",
    session: "Session 32",
    title: "Reliability, AI, Auction UX, Platform Quality",
    highlights: [
      "6 AI endpoints: draft grades, trade analyzer, keeper recommender, waiver advisor, weekly insights, bid advisor",
      "Error boundaries, WebSocket reconnect, PostHog expansion (18 events), mobile auction testing",
      "Pre-draft rankings import, post-auction trade block, PWA, browser push notifications",
    ],
    changes: [
      { type: "feat", description: "AI Post-Draft Grade — grades each team A-F with reasoning, cached per league" },
      { type: "feat", description: "AI Trade Analyzer — evaluates fairness (fair/slightly_unfair/unfair), identifies winner" },
      { type: "feat", description: "AI Keeper Recommender — ranks all roster players by keeper value" },
      { type: "feat", description: "AI Waiver Bid Advisor — suggests FAAB bid with confidence level" },
      { type: "feat", description: "AI Weekly Insights — 3-5 actionable insights per team with overall grade" },
      { type: "feat", description: "AI Auction Draft Advisor — real-time 'Should I bid?' recommendation" },
      { type: "feat", description: "Pre-Draft Rankings Import (AUC-10) — CSV upload/paste, private 'My Rank' column" },
      { type: "feat", description: "Post-Auction Trade Block (AUC-11) — toggle players as tradeable, DB-backed (+8 tests)" },
      { type: "feat", description: "PWA installable app — manifest.json, service worker, network-first caching" },
      { type: "feat", description: "Browser push notifications — your turn, outbid, won with Settings toggle" },
      { type: "feat", description: "Commissioner tab reorg — 6→5 tabs (League, Members, Teams, Season, Trades)" },
      { type: "feat", description: "React error boundaries — root + feature-level with retry button, PostHog crash reporting" },
      { type: "feat", description: "Offline/reconnect indicator — amber banner, exponential backoff, polling safety net" },
      { type: "feat", description: "PostHog analytics expansion — 8→18 tracked events across all features" },
      { type: "fix", description: "SS/MI position fix — server double-counting eligible slots, now uses assigned position" },
      { type: "fix", description: "Mobile auction overflow — AppShell min-w-0 overflow-x-hidden fix" },
      { type: "fix", description: "Nomination queue redesign — vertical stack, 3 teams, full names" },
      { type: "fix", description: "Position matrix fix — full team names, P column shows X/9" },
      { type: "security", description: "Zod validation on all AI JSON responses" },
      { type: "security", description: "Cached + deduped draft-grades endpoint prevents abuse" },
      { type: "refactor", description: "Deduplicated reconnect logic (scheduleReconnect)" },
      { type: "refactor", description: "Generic AI error messages — no internal details leaked" },
      { type: "refactor", description: "catch(e: unknown) convention across AI endpoints" },
      { type: "test", description: "8 new trade block tests" },
      { type: "test", description: "Mobile viewport testing (390x844 iPhone 14)" },
    ],
  },
  {
    version: "0.31.0",
    date: "Mar 20, 2026",
    session: "Session 31",
    title: "Auction UX, My Val, MLB Home, Guide Rewrite & Code Review",
    highlights: [
      "Personalized My Val with roster-aware valuation (4 factors)",
      "19 PRs merged — auction enhancements, CI fix, guide pages, test scripts",
      "Val column colors, public guide pages, compact tabs, market pressure",
    ],
    changes: [
      { type: "feat", description: "Personalized My Val — roster-aware player valuation with position need, budget pressure, scarcity, and market pressure factors" },
      { type: "feat", description: "Market pressure factor for My Val — league-wide budget/spots ratio adjusts all values" },
      { type: "feat", description: "Val column color coding — green for bargains, red for overpay, tooltips with base/adjusted breakdown" },
      { type: "feat", description: "Public guide pages — /guide/account, /guide/auction, /guide/faq accessible without login" },
      { type: "feat", description: "Compact tabs and default league filter improvements" },
      { type: "feat", description: "Resource page audit and cleanup" },
      { type: "feat", description: "Nomination timer countdown (30s visible, red pulse at <10s)" },
      { type: "feat", description: "'Going Once, Going Twice, SOLD!' escalation visual (5s/3s/1s)" },
      { type: "feat", description: "Keeper cost preview ($bid+5) when high bidder" },
      { type: "feat", description: "Auction settings panel with 6 per-user toggles" },
      { type: "feat", description: "Auction Excel export on completion screen" },
      { type: "feat", description: "MLB-powered Home page with live scores, transactions, date nav" },
      { type: "feat", description: "About page with product overview and feature breakdown" },
      { type: "feat", description: "Guide split into 3 pages (Account, Auction, FAQ) with screenshots" },
      { type: "feat", description: "Commissioner roster release button in RosterGrid" },
      { type: "feat", description: "Sidebar collapse/expand caret, condensed 6 to 4 sections" },
      { type: "feat", description: "mlb-feed server module (3 endpoints: scores, transactions, my-players)" },
      { type: "feat", description: "Bid timer dropdown (15s increments)" },
      { type: "feat", description: "Position needs matrix in Teams tab (filled/limit per position per team)" },
      { type: "feat", description: "Tooltips on auction column headers" },
      { type: "fix", description: "CI pipeline — Supabase placeholder env vars for GitHub Actions (PRs #58-59)" },
      { type: "fix", description: "Proxy bid auth bypass (GET+DELETE required no ownership check)" },
      { type: "fix", description: "Proxy bid deletion bug" },
      { type: "fix", description: "Unbounded chat array (memory leak)" },
      { type: "fix", description: "Bid picker validation" },
      { type: "refactor", description: "Type safety: teams:any[] to AuctionTeam[], duplicate interfaces removed" },
      { type: "refactor", description: "useCallback on handlers, win sound detection, rate limiter fix" },
      { type: "test", description: "MCP phases 7-8: 21 integration tests, full README" },
      { type: "test", description: "Multi-user auction test script for My Val validation" },
      { type: "docs", description: "Print/PDF styles for Guide pages" },
      { type: "docs", description: "My Val section added to Auction Guide" },
    ],
  },
  {
    version: "0.27.0",
    date: "Mar 19, 2026",
    session: "Session 27",
    title: "6-Agent Code Review, P1/P2 Fixes & Roadmap",
    highlights: [
      "All 3 P1 critical fixes for auction reliability",
      "Visual /roadmap page with project health scorecard",
      "positionToSlots/PITCHER_CODES consolidated into sportConfig.ts",
    ],
    changes: [
      { type: "fix", description: "Awaited AuctionLot.update in finishCurrentLot (data integrity)" },
      { type: "perf", description: "DraftLog re-fetches only on WIN events, not every log event" },
      { type: "perf", description: "checkPositionLimit uses in-memory state (~690 fewer DB queries)" },
      { type: "security", description: "player-season-stats now requires leagueId (no default to 1)" },
      { type: "fix", description: "persistState logs errors instead of silently swallowing" },
      { type: "refactor", description: "positionToSlots(), PITCHER_CODES, NL_TEAMS consolidated to sportConfig.ts" },
      { type: "refactor", description: "Added TWP (two-way player) to PITCHER_CODES" },
      { type: "refactor", description: "Removed unused ThemedTable imports, dead ternary, double useLeague()" },
      { type: "perf", description: "Added useMemo on teamMap and completedLots in AuctionDraftLog" },
      { type: "feat", description: "Visual /roadmap page with health scorecard, audit recommendations, findings timeline" },
      { type: "feat", description: "Cost comparison section on /tech page (AI vs US dev shop vs offshore)" },
      { type: "docs", description: "Consolidated TODO.md with all CR-## findings" },
    ],
  },
  {
    version: "0.26.0",
    date: "Mar 19, 2026",
    session: "Session 26",
    title: "2025 Stats from MLB API & Auction Bid Tracking",
    highlights: [
      "Real 2025 stats for all 1,652 MLB players",
      "Sortable stat columns across Players and Auction pages",
      "Draft Board log with per-lot bid history",
    ],
    changes: [
      { type: "feat", description: "2025 season stats from MLB API with 30-day SQLite cache and CSV fallback" },
      { type: "feat", description: "Sortable stat columns (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP)" },
      { type: "feat", description: "Auction bid history tracking via AuctionLot/AuctionBid models" },
      { type: "feat", description: "Draft Board log with expandable per-lot bid history" },
      { type: "refactor", description: "Removed $ column from Player Pool tab" },
    ],
  },
  {
    version: "0.25.0",
    date: "Mar 19, 2026",
    session: "Session 25",
    title: "Player Data Polish, Full Team Names, OF Mapping",
    highlights: [
      "Full team names replacing 3-letter codes throughout",
      "OF position mapping controlled by league rule",
      "6 new server tests",
    ],
    changes: [
      { type: "feat", description: "Full fantasy team names in PlayerDetailModal, AuctionValues, Team page" },
      { type: "feat", description: "OF position mapping (CF/RF/LF → OF) controlled by outfieldMode league rule" },
      { type: "fix", description: "Transaction section shows last 3 transactions (2-year window, not 30-day)" },
      { type: "fix", description: "Profile tab team fallback to mlbTeam when API returns no currentTeam" },
      { type: "fix", description: "League 1 stats_source updated from NL to ALL" },
      { type: "test", description: "6 new server tests for player routes and mlbSyncService" },
      { type: "docs", description: "Season lifecycle sequence diagram in docs/howto.md" },
    ],
  },
  {
    version: "0.24.0",
    date: "Mar 18, 2026",
    session: "Session 24",
    title: "Live Data Integration & Auction Readiness",
    highlights: [
      "Live standings powered by PlayerStatsPeriod data",
      "All 30 MLB teams synced (not just NL)",
      "4 test leagues prepped for live auction",
    ],
    changes: [
      { type: "feat", description: "Live standings computation from PlayerStatsPeriod via computeTeamStatsFromDb" },
      { type: "feat", description: "Admin stats sync endpoint: POST /api/admin/sync-stats" },
      { type: "feat", description: "syncAllPlayers() syncs all 30 MLB teams with team-change detection" },
      { type: "feat", description: "Auction pause/resume available to commissioners (not just admins)" },
      { type: "feat", description: "NL/AL/All player pool filter toggle in auction UI" },
      { type: "test", description: "20 new tests: 11 standings routes, 7 mlbSyncService, 2 admin" },
    ],
  },
  {
    version: "0.23.0",
    date: "Mar 18, 2026",
    session: "Session 23",
    title: "Auth System Overhaul & MCP Server",
    highlights: [
      "Password reset flow, pre-signup email invites",
      "MCP MLB Data Proxy with SQLite cache",
      "644 tests passing",
    ],
    changes: [
      { type: "feat", description: "Password reset flow via Supabase Auth" },
      { type: "feat", description: "Pre-signup email invites with auto-accept on first login" },
      { type: "feat", description: "MCP MLB Data Proxy server with 8 tools, SQLite cache, rate limiter" },
      { type: "feat", description: "Google OAuth verification" },
      { type: "feat", description: "Custom SMTP via Resend for transactional emails" },
      { type: "test", description: "Keeper lock E2E testing (3 scenarios)" },
    ],
  },
  {
    version: "0.21.0",
    date: "Mar 17, 2026",
    session: "Session 21",
    title: "6-Agent Code Review (PR #37)",
    highlights: [
      "15 findings resolved from 6-agent parallel review",
      "Budget floor check, endAuction transaction, Mermaid hardening",
    ],
    changes: [
      { type: "security", description: "Mermaid securityLevel hardened" },
      { type: "fix", description: "endAuction wrapped in $transaction for atomicity" },
      { type: "fix", description: "Budget floor check added to auction bidding" },
      { type: "refactor", description: "Roto scoring deduplicated in archiveStatsService" },
      { type: "refactor", description: "Double-casts removed in teamService" },
    ],
  },
  {
    version: "0.18.0",
    date: "Mar 16, 2026",
    session: "Sessions 18-20",
    title: "Season-Aware Feature Gating",
    highlights: [
      "Full season lifecycle: SETUP → DRAFT → IN_SEASON → COMPLETED",
      "useSeasonGating() hook + requireSeasonStatus middleware",
      "116 server tests added",
    ],
    changes: [
      { type: "feat", description: "Season lifecycle management (SETUP → DRAFT → IN_SEASON → COMPLETED)" },
      { type: "feat", description: "useSeasonGating() hook for client-side feature visibility" },
      { type: "feat", description: "requireSeasonStatus() middleware for server-side enforcement" },
      { type: "feat", description: "Commissioner tab gating and breadcrumb status bar" },
      { type: "feat", description: "Franchise schema refactor for multi-season leagues" },
      { type: "test", description: "116 new server tests across 10 feature modules" },
    ],
  },
  {
    version: "0.14.0",
    date: "Mar 12, 2026",
    session: "Sessions 11-14",
    title: "Archive System & Design Overhaul",
    highlights: [
      "17 years of Excel archives imported (2008-2025)",
      "Complete design system with dark mode",
      "Custom CSS tokens across all components",
    ],
    changes: [
      { type: "feat", description: "Historical archive system parsing 17 years of Excel spreadsheets" },
      { type: "feat", description: "Grid detection, side-by-side table unrolling, fuzzy player name matching" },
      { type: "feat", description: "Complete design system overhaul with custom CSS tokens" },
      { type: "feat", description: "Dark mode support across all pages" },
      { type: "refactor", description: "Deleted all sci-fi/military naming from 30+ files" },
    ],
  },
  {
    version: "0.10.0",
    date: "Mar 8, 2026",
    session: "Sessions 7-10",
    title: "Auction, Trades, Waivers & Security",
    highlights: [
      "Live auction draft with WebSocket real-time bidding",
      "Trade proposal system with voting",
      "Security audit: hardcoded credentials + missing auth fixed",
    ],
    changes: [
      { type: "feat", description: "Live auction draft with WebSocket (bidding, auto-finish, concurrent protection)" },
      { type: "feat", description: "Trade proposal system with multi-team voting" },
      { type: "feat", description: "FAAB waiver claims workflow" },
      { type: "feat", description: "Commissioner admin tools" },
      { type: "security", description: "Removed hardcoded DB credentials from scripts" },
      { type: "security", description: "Added auth middleware to 3 unprotected endpoints" },
    ],
  },
  {
    version: "0.6.0",
    date: "Dec 2025",
    session: "Sessions 3-6",
    title: "Core Features",
    highlights: [
      "Teams, rosters, player search",
      "Standings computation engine",
      "Auth migration to Bearer tokens",
    ],
    changes: [
      { type: "feat", description: "Team management and roster views" },
      { type: "feat", description: "Player search with MLB Stats API integration" },
      { type: "feat", description: "Standings computation engine with category rankings" },
      { type: "refactor", description: "Auth migration — 20+ files updated to Bearer tokens" },
    ],
  },
  {
    version: "0.2.0",
    date: "Nov 2025",
    session: "Sessions 1-2",
    title: "Scaffolding",
    highlights: [
      "Vite + Express + Prisma initial setup",
      "Database schema with first 10 models",
      "Supabase auth integration",
    ],
    changes: [
      { type: "feat", description: "Initial project scaffolding: Vite + Express + Prisma" },
      { type: "feat", description: "Database schema design with first 10 models" },
      { type: "feat", description: "Supabase Auth integration (Google/Yahoo OAuth)" },
    ],
  },
];

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  feat: { label: "Feature", icon: Sparkles, color: "text-emerald-400" },
  fix: { label: "Fix", icon: Bug, color: "text-amber-400" },
  perf: { label: "Perf", icon: Zap, color: "text-blue-400" },
  refactor: { label: "Refactor", icon: Wrench, color: "text-purple-400" },
  test: { label: "Test", icon: TestTube, color: "text-cyan-400" },
  docs: { label: "Docs", icon: Layers, color: "text-[var(--lg-text-muted)]" },
  security: { label: "Security", icon: Shield, color: "text-red-400" },
};

/* ── Components ──────────────────────────────────────────────────── */

function ChangelogRelease({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <div className="flex flex-col items-center gap-0.5">
          <code className="text-sm font-semibold text-[var(--lg-accent)] tabular-nums">
            {entry.version}
          </code>
          <span className="text-[10px] text-[var(--lg-text-muted)]">{entry.session}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
              {entry.title}
            </h3>
            <span className="text-xs text-[var(--lg-text-muted)]">{entry.date}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {entry.highlights.map((h) => (
              <li key={h} className="text-xs text-[var(--lg-text-secondary)] truncate">
                • {h}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[var(--lg-text-muted)] tabular-nums">
            {entry.changes.length} changes
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[var(--lg-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--lg-text-muted)]" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-1.5">
          {entry.changes.map((change, idx) => {
            const cfg = typeConfig[change.type];
            const TypeIcon = cfg.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm py-1.5 px-3 rounded-md bg-[var(--lg-tint)]"
              >
                <TypeIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                <span className={`text-[10px] font-semibold uppercase w-14 shrink-0 mt-0.5 ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-[var(--lg-text-secondary)]">{change.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChangelogStats() {
  const totalChanges = changelog.reduce((s, e) => s + e.changes.length, 0);
  const typeBreakdown = changelog.reduce<Record<string, number>>((acc, e) => {
    e.changes.forEach((c) => { acc[c.type] = (acc[c.type] || 0) + 1; });
    return acc;
  }, {});
  const sorted = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {changelog.length}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Releases</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {totalChanges}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Total Changes</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            33
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Sessions</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sorted.map(([type, count]) => {
          const cfg = typeConfig[type];
          return (
            <span
              key={type}
              className={`text-[10px] font-semibold uppercase px-2 py-1 rounded ${cfg.color} bg-[var(--lg-tint)]`}
            >
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Changelog() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GitCommit className="w-5 h-5 text-[var(--lg-accent)]" />
            <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              Changelog
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/roadmap"
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Roadmap <ArrowRight className="w-3 h-3" />
            </Link>
            <Link
              to="/tech"
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Under the Hood <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          Release history across all development sessions. Each entry maps to a session
          in the build journal — features shipped, bugs fixed, and improvements made.
        </p>
      </div>

      {/* Stats */}
      <ChangelogStats />

      {/* Releases */}
      <div className="space-y-3">
        {changelog.map((entry) => (
          <ChangelogRelease key={entry.version} entry={entry} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Derived from{" "}
        <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">FEEDBACK.md</code>{" "}
        and git history |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>
      </p>
    </div>
  );
}

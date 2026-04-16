import React, { useState } from "react";
import { Link } from "react-router-dom";
import AdminCrossNav from "../features/admin/components/AdminCrossNav";
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
  todoLink?: string;
  roadmapLink?: string;
  conceptLink?: string;
}

const changelog: ChangelogEntry[] = [
  {
    version: "0.59.0",
    date: "Apr 16, 2026",
    session: "Session 65",
    title: "Task Consolidation, Will Smith Matcher, Weekly Report MVP, IP_HASH_SECRET Rotation",
    highlights: [
      "Single source of truth for todos: admin-tasks.json retired (orphan — AdminTasks.tsx was never routed); content merged into todo-tasks.json with optional `milestone` enum (mvp / mid-season / growth / monetization / content-seo / seo-technical)",
      "Weekly Report MVP at /report — 'This Week in Baseball' aggregator bundles League Digest + per-team Weekly Insights + Activity into one shareable view",
      "Will Smith news false-matching fixed — word-boundary regex + 50-name ambiguous-last-name allowlist in new playerNameMatcher module (Dominic Smith articles no longer appear in Will Smith's news)",
      "IP_HASH_SECRET rotated + redacted — fresh secret generated, Railway updated, todo-tasks.json:44 placeholder-ized",
      "Table width fixes: AddDropTab, Players cell/header consistency, Draft Team/Player columns — three non-compliant tables brought to Session 64 pattern",
      "FanGraphs audit script — new scripts/fangraphs-audit.ts aggregates PlayerStatsDaily respecting roster ownership windows; outputs OnRoto display format",
    ],
    changes: [
      { type: "feat", description: "New feature module `reports` — GET /api/reports/:leagueId/:weekKey? aggregator; ReportPage.tsx at /report with 10 sections; TwibHero inline-SVG retro mark (evokes TWIB without reproducing the MLB-trademarked logo)" },
      { type: "feat", description: "server/features/mlb-feed/services/playerNameMatcher.ts — word-boundary regex via lookbehind/lookahead (handles `Jr.` suffixes) + 50-name ambiguous allowlist" },
      { type: "feat", description: "scripts/fangraphs-audit.ts — aggregates season stats with roster-ownership windows for cell-by-cell OnRoto comparison" },
      { type: "fix", description: "/player-news matcher: Dominic Smith, Derek Smith, etc. no longer false-match articles about Will Smith; Trade Rumors `categories[]` use same word-boundary check" },
      { type: "fix", description: "Table widths: AddDropTab Name w-[220px], Players cell/header consistency, Draft Team w-[180px] + Player w-[220px] — 3 non-compliant tables fixed" },
      { type: "refactor", description: "admin-tasks.json retired — 3 new categories in todo-tasks.json (mid-season, growth, code-quality-review). AdminTasks.tsx (unrouted dead code) deleted. 4 /api/admin/tasks orphan handlers removed." },
      { type: "feat", description: "`milestone` optional enum on task records preserves launch-phase grouping across flat category hierarchy" },
      { type: "security", description: "IP_HASH_SECRET rotated via Railway; server/data/todo-tasks.json line 44 redacted; todo 091 closed. Old value in git history is cryptographically inert post-rotation." },
      { type: "docs", description: "CLAUDE.md feature modules list + cross-feature deps updated for reports module. FEEDBACK.md session entry added. 4 /ce:review follow-up todos (091-094) filed." },
      { type: "test", description: "+25 tests (playerNameMatcher — Will Smith disambiguation, distinctive names, ambiguous names, punctuation, input normalization, regex safety). Server suite 571 passing, client 201 passing." },
    ],
    todoLink: "/todo",
    roadmapLink: "/roadmap",
    conceptLink: "/concepts",
  },
  {
    version: "0.58.0",
    date: "Apr 14, 2026",
    session: "Session 64",
    title: "P0/P1 Burn-Down, Table Layout Overhaul, Color Lab, AI Temperatures",
    highlights: [
      "IPv6 truncation bug fixed — no more `::1::` / `2001:db8::::` garbage; 16 new tests cover every compressed form",
      "GDPR retention cron — 7d ipRaw purge + 90d session row delete at 04:15 UTC, advisory-locked for multi-instance safety",
      "UserDeletionLog helper wired (plan R16) — audit row written in same $transaction as cascade delete, HMAC-hashed email",
      "Middleware ordering fixed — malformed JSON now gets real requestId instead of flooding error ring buffer with ERR-unknown",
      "Tables: `w-full` + `table-layout: fixed` + explicit column widths everywhere — zero dead space, proportional distribution, mobile scroll floor preserved",
      "Color System Lab at /concepts#colors — 5 dark + 4 light palettes, site-wide preview, persists across nav + reload",
      "AI temperature per-feature — trade analysis 0.3, grades 0.4, digest 0.8 (was all default 1.0)",
      "Heartbeat 401 toasts silenced — auth-boot transients no longer spam the user",
      "FanGraphs morning audit: 100% parity across all 10 categories × 8 teams",
    ],
    changes: [
      { type: "fix", description: "lib/ipHash.ts truncateIp: rewrote IPv6 path to expand `::` before slicing; unmap IPv4-mapped; strip zone indices; reject malformed rather than mangle" },
      { type: "feat", description: "hashEmail() in lib/ipHash.ts — HMAC-SHA256(email, IP_HASH_SECRET) for UserDeletionLog" },
      { type: "feat", description: "lib/userDeletion.ts deleteUserWithAudit() — transactional write-then-delete, the only sanctioned path for user deletion" },
      { type: "feat", description: "Daily UserSession retention cron at 04:15 UTC — ipRaw→NULL after 7d, DELETE rows after 90d, pg_try_advisory_lock(0x50555247) for multi-instance safety" },
      { type: "fix", description: "server/index.ts middleware ordering: request-ID runs BEFORE express.json so JSON parse errors get tagged ERR-xxxx instead of ERR-unknown" },
      { type: "feat", description: "AI aiAnalysisService getModel(temperature) — threaded per-call temperature for Gemini (generationConfig) + Anthropic (body). 11 call sites tuned 0.3–0.8 by feature" },
      { type: "fix", description: "client/index.css .lg-table: removed width:100% override; TableCard + ThemedTable use w-full + tableLayout:fixed with explicit column widths" },
      { type: "feat", description: "ThemedTable minWidth prop (default 600) — small tables like Season category standings pass 0 so they hug content on wide viewports" },
      { type: "fix", description: "Players, Season Point Matrix, Team Hitters/Pitchers, Admin Users — all columns now have explicit widths; extra container space distributes proportionally" },
      { type: "feat", description: "ColorLab at /concepts#colors — 9 palettes, site-wide preview via inline <html> overrides + localStorage.fbst-theme sync, applyPersistedPalette() reapplies on boot" },
      { type: "feat", description: "lib/colorLabPalettes.ts — shared palette data + persistence helpers, consumed by ColorLab + main.tsx boot" },
      { type: "fix", description: "useSessionHeartbeat.ts — 401/403 classified as transient auth errors, silently retried instead of toasting the user" },
      { type: "fix", description: "server/.env password synced from root .env (Supabase rotated, never propagated to server/.env); server/.env.local backed up — was steering Prisma to nonexistent localhost DB" },
      { type: "test", description: "+21 tests (16 ipHash edge cases, 5 userDeletion); -6 misplaced duplicate. Server suite 546 passing." },
    ],
    todoLink: "/todo",
    roadmapLink: "/roadmap",
    conceptLink: "/concepts#colors",
  },
  {
    version: "0.57.0",
    date: "Apr 13, 2026",
    session: "Session 63",
    title: "Launch Readiness, Admin IA, Dashboard, Error Correlation, Session Tracking",
    highlights: [
      "Admin dashboard rebuilt as 5-row card grid — stat cards, league health, AI summary, Todo progress, activity feed, recent errors",
      "Side nav reorganized: dedicated Admin section with 3 sub-groups (Operations / Planning / Reference)",
      "Error correlation: every 500 returns ERR- code + admin-only `detail` field; click-to-copy toast; in-memory ring buffer feeds /admin dashboard",
      "Session tracking shipped: UserSession + UserMetrics + UserDeletionLog tables, heartbeat hook (30s, BroadcastChannel, one-session-per-browser), /admin/users page with real data",
      "Cross-linking: Roadmap phases + Concept cards now have stable anchor IDs, hash-scroll + reverse links to related todos",
      "Parallel-agent execution cut combined Phase A + Phase B build time from ~10 hours sequential to ~2.5 hours elapsed",
    ],
    changes: [
      { type: "feat", description: "Admin dashboard: 5-row card grid at /admin with auto-refresh 60s, manual refresh button, graceful degradation" },
      { type: "feat", description: "GET /api/admin/stats — users/leagues/AI/todos/activity/errors with 10s in-memory cache" },
      { type: "feat", description: "GET /api/admin/errors + /admin/errors/:ref — in-memory ring buffer (100 entries), prefix-normalized lookup" },
      { type: "feat", description: "ApiError class with ref, detail, displayCode(); fetchJsonApi + fetchJsonPublic both throw ApiError" },
      { type: "feat", description: "ErrorProvider + ErrorToast — global error surface, ERR-prefixed copyable codes, auto-dismiss w/ hover-pause, dedupes" },
      { type: "feat", description: "errorBus.ts reportError(err, { source }) — any thrown value normalizes to SurfacedError" },
      { type: "feat", description: "X-Request-Id response header exposed via Access-Control-Expose-Headers; 500 body includes { error, requestId, ref, detail? }" },
      { type: "feat", description: "Admin-only detail field on 500s — admins see real error message; regular users see generic envelope" },
      { type: "feat", description: "Side nav Admin section subgroups: Operations (Dashboard, Users), Planning (Todo, Docs), Reference (Changelog, Status, Analytics, Under the Hood)" },
      { type: "feat", description: "Todo category headers: full-width progress bar + {done}/{total} + percentage" },
      { type: "feat", description: "RelatedTodos component — reverse cross-link panel shown on Roadmap phases + Concept cards for admins" },
      { type: "feat", description: "Stable anchor IDs on Roadmap phases (engagement/data/features/monetization/platform) + Concept cards" },
      { type: "feat", description: "/admin/users scaffold at /admin/users with planned-columns preview (awaiting session-tracking migration)" },
      { type: "feat", description: "Admin.tsx /admin 'Product Roadmap' tab renamed 'Launch Milestones' with disambiguation subtitle" },
      { type: "feat", description: "ErrorBoundary captures getLastRequestId() on crash, shows ERR- copyable code, also fires reportError" },
      { type: "refactor", description: "Pricing removed from side nav (kept as public /pricing route); inline tier summary embedded in Concepts pricing concept" },
      { type: "refactor", description: "TODO.md removed from /docs viewer (redundant with /todo interactive page)" },
      { type: "refactor", description: "Manage sidebar section dissolved (one-item smell); Commissioner folded into League section" },
      { type: "refactor", description: "NavSection extended to support optional groups subgroup headers (used by Admin section)" },
      { type: "docs", description: "Admin Users session-tracking plan deepened with 4 parallel agent reviews (security, performance, data-integrity, best-practices); 19 revisions folded in" },
      { type: "docs", description: "Task-system consolidation plan — proposal to merge admin-tasks.json + todo-tasks.json into 3-level hierarchy (awaiting decision)" },
      { type: "docs", description: "Admin dashboard API contract doc for parallel-agent execution" },
      { type: "test", description: "23 new tests: adminStats, adminErrors, errorHandler integration; Admin component tests updated for rebuilt dashboard" },
      { type: "feat", description: "Session tracking — UserSession, UserMetrics, UserDeletionLog Prisma models with HOT-update optimization (no lastSeenAt index, fillfactor 80, aggressive autovacuum)" },
      { type: "feat", description: "POST /api/sessions/start | /heartbeat | /end — ownership checks, 20/min heartbeat rate limit, concurrent-session cap 10, AuditLog LOGIN entries, credential-stuffing canary" },
      { type: "feat", description: "lib/ipHash.ts — HMAC-SHA256 IP hasher with fail-fast if IP_HASH_SECRET missing; IPv4 /24 + IPv6 /48 truncation" },
      { type: "feat", description: "GET /api/admin/users — paginated/filtered/sorted user list with leagues owned/commissioned counts and latest country" },
      { type: "feat", description: "useSessionHeartbeat hook — 30s cadence, visibility-gated, BroadcastChannel leader election for one-session-per-browser, fetch({ keepalive: true }) on pagehide" },
      { type: "feat", description: "AuthProvider wires session kickoff on login + endSession on logout (before signOut so Bearer token is still valid)" },
      { type: "feat", description: "/admin/users rebuilt: stat cards, chip filters (active window + tier), debounced search, sortable columns, default sort lastLoginAt DESC, pagination" },
      { type: "feat", description: "15-min idle session sweeper cron with pg_try_advisory_lock — multi-instance safe, idempotent, naturally excludes live heartbeats" },
      { type: "docs", description: "Session-tracking plan deepened with 4-agent review; 19 material revisions folded in; R1-R19 appendices A-D preserved verbatim" },
      { type: "test", description: "+30 tests (16 server session, 7 client hook, 7 admin users) — total suite 732 passing, 0 failing" },
    ],
    todoLink: "/todo",
    roadmapLink: "/roadmap",
    conceptLink: "/concepts",
  },
  {
    version: "0.56.0",
    date: "Apr 12, 2026",
    session: "Session 62 (cont.)",
    title: "Admin System, Draft Report Regen, Waiver Priority by Period, YouTube Fix",
    highlights: [
      "New /todo page — category-based micro-task tracker with cross-links to Roadmap/Concepts",
      "Concepts page rebuilt with 4 tabs: Strategic / SEO Pages / Integrations / UX Mockups",
      "Waiver priority UI now uses period-based standings (matches server processing logic)",
      "Draft Report regenerated with admin bypass — all 8 teams graded A- to F",
      "YouTube embeds switched to youtube-nocookie.com (fixes prod playback)",
    ],
    changes: [
      { type: "feat", description: "Todo page (/todo) with 6 categories, 15 tasks, priority badges, cross-links, filters, step-by-step expand" },
      { type: "feat", description: "Server API: GET/POST/PATCH/DELETE /api/admin/todos (requireAdmin, JSON-backed, audit logged)" },
      { type: "feat", description: "AdminCrossNav component added to /todo /roadmap /concepts /changelog (See Todo · Roadmap · Concepts · Changelog)" },
      { type: "feat", description: "Concepts page: tabbed layout (Strategic/SEO/Integrations/UX Mockups) with real content" },
      { type: "feat", description: "Changelog entries now support todoLink/roadmapLink/conceptLink fields rendered as Related badges" },
      { type: "feat", description: "GET /api/waiver-priority endpoint returns standings from most recent completed period (or active fallback)" },
      { type: "fix", description: "Waiver priority UI: uses period-based standings, shows source indicator (completed/active/season fallback)" },
      { type: "feat", description: "Draft Report admin bypass: ?force=true during IN_SEASON allows admin-only regeneration" },
      { type: "feat", description: "regen-draft-report.ts script for direct AI regeneration outside HTTP flow" },
      { type: "perf", description: "AI timeouts increased: Gemini 60s→90s, Anthropic 30s→90s, max_tokens 4096→8192" },
      { type: "fix", description: "YouTube embed: switched to youtube-nocookie.com, removed origin= parameter (fixes prod playback)" },
      { type: "refactor", description: "Orphaned GET /api/public/leagues/:slug endpoint removed (LeagueDetail page deleted in Session 61)" },
    ],
    todoLink: "/todo",
    roadmapLink: "/roadmap",
    conceptLink: "/concepts",
  },
  {
    version: "0.55.0",
    date: "Apr 10, 2026",
    session: "Session 62",
    title: "Auction Player Enrichment, Add/Drop Error Handling, Position Sort, Standings Verified",
    highlights: [
      "Auction nomination and force-assign now populate mlbTeam on Player records — no more '—' for newly drafted players",
      "Add/drop claim errors return proper 400 with descriptive messages instead of opaque 500",
      "Team page roster sorted by shared POS_SCORE constant, pitchers now sorted by position (SP before RP)",
      "Scoring and standings verified: 8 teams, 7 periods, roto points computed correctly",
    ],
    changes: [
      { type: "fix", description: "finishCurrentLot: sets mlbTeam from nomination payload when creating new Player records" },
      { type: "fix", description: "force-assign: added team field to schema, sets mlbTeam on create, backfills existing players with null mlbTeam" },
      { type: "fix", description: "Add/drop claim: roster limit and player availability errors now return 400 instead of 500" },
      { type: "fix", description: "Team.tsx: replaced local SLOT_ORDER with shared POS_SCORE, added pitcher position sort (SP before RP then price)" },
      { type: "test", description: "Transaction test mock: added $queryRaw to mockTx (was missing, caused test failures)" },
    ],
    todoLink: "/todo#code-quality",
    roadmapLink: "/roadmap",
  },
  {
    version: "0.53.0",
    date: "Apr 8, 2026",
    session: "Session 60",
    title: "19-Item Backlog Blitz: Race Condition Fixes, Player News, Trade Assets, Position Sort",
    highlights: [
      "21-agent plan review eliminated 5 items, merged 2, simplified the rest before coding",
      "Race condition fixes: advisory lock on waiver processing, FOR UPDATE on roster claims, client in-flight guards",
      "Player news: RSS feed articles from 5 sources now shown in PlayerDetailModal",
      "Trade UI: BUDGET + PICK selectors added, WAIVER_PRIORITY reversal supported",
    ],
    changes: [
      { type: "feat", description: "POST /api/admin/enrich-stale-players — batch MLB API lookup for players with null team/position" },
      { type: "feat", description: "usePlayerNews hook: client-side RSS aggregation from 5 feeds with player name matching in PlayerDetailModal" },
      { type: "feat", description: "TradeAssetSelector: added Waiver Budget input, Draft Pick round/season selector" },
      { type: "feat", description: "AddDropTab: position sort column with SortableHeader" },
      { type: "fix", description: "IL replacement: pitcher depth chart matching now uses P/SP/CP/RP set instead of exact match" },
      { type: "fix", description: "Position sort: DraftReportPage uses POS_ORDER.indexOf() instead of string comparison" },
      { type: "fix", description: "POS_ORDER unified: client now includes SP/RP to match server" },
      { type: "fix", description: "TeamStatsSeason fallback replaced with TeamStatsPeriod aggregation in 6 consumers" },
      { type: "fix", description: "Waiver tiebreaker: deterministic priority via most recent successful claim timestamp" },
      { type: "security", description: "Roster claim: SELECT FOR UPDATE prevents concurrent roster limit bypass" },
      { type: "security", description: "Waiver processing: pg_try_advisory_xact_lock prevents double-processing (returns 409)" },
      { type: "security", description: "RSS feed link validation: URLs must start with https:// to prevent javascript: injection" },
      { type: "fix", description: "Trade reversal: WAIVER_PRIORITY re-swap now supported (was silently ignored)" },
      { type: "fix", description: "Add/Drop buttons disabled during in-flight request" },
      { type: "fix", description: "Auction prices de-emphasized (muted text) during IN_SEASON on RosterGrid + TeamListTab" },
      { type: "fix", description: "Team.tsx: removed 5 as-any casts for assignedPosition/price/isKeeper" },
      { type: "refactor", description: "RSS parser extracted to rssParser.ts — 4 duplicate blocks replaced, mlb-feed/routes.ts reduced by 120 lines" },
      { type: "fix", description: "Home.tsx: stale data guards on YouTube, Reddit, roster status, league data, depth chart fetch effects" },
      { type: "docs", description: "Pre-draft trade record created (Devil Dawgs → DLC: Mullins + $75 for Tucker)" },
      { type: "fix", description: "Rate stat precision: AVG 4dp (.2576), WHIP 3dp (1.077), ERA 2dp — matches FanGraphs OnRoto display" },
      { type: "fix", description: "PlayerDetailModal: useLeague() moved above early return (React Rules of Hooks violation fixed)" },
      { type: "feat", description: "GET /api/mlb/player-news: server-side RSS aggregation endpoint with 5-min cache (agent-native parity)" },
      { type: "refactor", description: "usePlayerNews simplified from 109→40 lines (1 server call instead of 5 client fetches)" },
      { type: "refactor", description: "fetchPlayerBatch returns MlbPerson[] instead of any[] — typed MLB API responses across sync pipeline" },
      { type: "refactor", description: "digestRoutes.ts extracted from mlb-feed god module — 1,426→1,120 lines (-306 lines)" },
      { type: "fix", description: "Waiver priority: replaced 3 round buttons with single toggle (FAAB system has no rounds concept)" },
      { type: "feat", description: "useFetchOnMount<T> hook: reusable stale-guard fetch pattern for simpler effects" },
      { type: "fix", description: "YouTube embed: 'Watch on YouTube' fallback link for videos that disable embedding" },
      { type: "fix", description: "Archive export: period query scoped to leagueId, rate stats games-weighted, budget reversal check" },
      { type: "fix", description: "RSS parser: 2MB size limit, https-only links, 5-min TTL cache, pre-compiled regex" },
      { type: "refactor", description: "Dead code removed: syncNLPlayers + fetchNLTeams (~70 LOC), shouldOverwritePosList extracted" },
      { type: "security", description: "Trade reversal: budget sufficiency check prevents negative balance" },
      { type: "security", description: "Waiver lock: typed LockConflictError replaces fragile string matching" },
      { type: "docs", description: "Railway deployment checklist at docs/RAILWAY-DEPLOY.md" },
      { type: "docs", description: "Multi-league + public discovery plan at docs/plans/ with feature module isolation" },
      { type: "docs", description: "FanGraphs audit cadence established — weekly morning comparison of all 10 stat categories" },
    ],
  },
  {
    version: "0.54.0",
    date: "Apr 10, 2026",
    session: "Session 61",
    title: "Code Review, Login Redesign, Blog Launch, Admin Tasks, Pitcher Stats Fix",
    highlights: [
      "Split-screen login page — marketing panel (left) with value props, login form (right), mobile-responsive",
      "Admin Tasks page — milestone-based product roadmap with status toggles and step-by-step instructions",
      "ER and BB+H columns on Team pitcher stats now populated with real MLB API data",
      "Marketing site: blog infrastructure with 5 SEO-optimized posts, seasonal pricing, email signup",
    ],
    changes: [
      { type: "feat", description: "Split-screen login page with marketing panel (desktop), single-column mobile fallback" },
      { type: "feat", description: "Admin Tasks: milestone-based product roadmap (MVP, Mid-Season, Growth, Monetization) with status toggles, owner badges, step-by-step instructions" },
      { type: "feat", description: "Footer links on Login + Signup pages: Discover Leagues, Pricing, About (marketing site)" },
      { type: "fix", description: "ER and BB+H pitcher stats: added raw earnedRuns/walksAndHits to SeasonStatEntry and API response" },
      { type: "fix", description: "splitTwoWayStats now zeros ER/BB_H/IP on Ohtani hitter row (prevents double-counting)" },
      { type: "fix", description: "Discover page: removed dead click handler, cursor-pointer, and CTA text from league cards" },
      { type: "fix", description: "Added rel='noopener noreferrer' to all external links on auth pages" },
      { type: "refactor", description: "Removed LeagueDetail page and /discover/:slug route (premature, will rebuild)" },
      { type: "refactor", description: "Removed PeriodAwardsCard from Dashboard and deleted orphaned component" },
      { type: "refactor", description: "Removed publicSlug from public leagues API response (still in schema for commissioner use)" },
      { type: "refactor", description: "Removed Early Access banner and unused useNavigate import from Discover page" },
    ],
  },
  {
    version: "0.52.0",
    date: "Apr 7, 2026",
    session: "Session 59",
    title: "AI Grading Fix, Minors Report, Ohtani Stats Isolation, Roster Alert Cards",
    highlights: [
      "AI weekly insights now grade teams based on actual roto standings — 1st place teams can never receive an F grade",
      "Minors Report: new amber accordion on Home and Team pages showing players optioned to the minors",
      "Ohtani two-way stats properly isolated — pitching stats only on pitcher record, hitting only on hitter record",
      "Roster alerts redesigned as horizontal cards with headshots, IL headline featured in Daily Diamond",
    ],
    changes: [
      { type: "fix", description: "AI standings data uses TeamStatsPeriod (real data) instead of empty TeamStatsSeason — grades now correlate with actual roto standings" },
      { type: "fix", description: "Deterministic AI grading: 1st-2nd place = A range, 7th-8th = D range. LLM explains within constrained range" },
      { type: "fix", description: "Ohtani hitter pitching stats zeroed after mirror — prevents W double-counting across DLC + Skunk Dogs" },
      { type: "fix", description: "POSITION_OVERRIDES map prevents daily sync from overwriting DH position back to TWP" },
      { type: "fix", description: "Team page pitching totals ERA/WHIP now computed correctly via IP-weighted reverse calculation" },
      { type: "fix", description: "teamService period query filtered by leagueId — was finding wrong period from another league" },
      { type: "fix", description: "Weekly insights: weekOverride on generate-all endpoint, cache key includes weekKey, stale state reset on team change" },
      { type: "feat", description: "Minors Report: amber accordion on Home + Team pages. Shared RosterAlertAccordion component + useRosterStatus hook" },
      { type: "feat", description: "Roster alerts: horizontal card grid with player headshots — 4-across desktop, stacked mobile" },
      { type: "feat", description: "IL headline: new IL placements featured as Daily Diamond hero with Injury Alert label" },
      { type: "feat", description: "Data integrity audit script: 10 checks including ERA/WHIP math, IP format, TWP position, period coverage" },
      { type: "refactor", description: "Season page: removed roster expansion on team click — team name navigates to team page directly" },
    ],
  },
  {
    version: "0.50.0",
    date: "Apr 5, 2026",
    session: "Session 57",
    title: "H2H Scoring, Snake Draft, League Chat, Push Notifications, Smart Deadlines, 18 Features",
    highlights: [
      "League Board: card-based async communication with Commissioner, Trade Block (auto-synced from rosters), and Banter columns. Thread replies, thumbs up/down reactions",
      "Pricing page: seasonal pricing — Free / Pro $29/season / Commissioner $49/season with founding member lifetime deal",
      "H2H Categories + Points scoring with matchup generation, Snake Draft with live WebSocket board, In-App League Chat with system messages",
      "Trophy Case: dynasty scores, championship history, all-time records from 20+ years of archived data",
      "Push notifications with VAPID keys, smart deadline warnings, conditional waiver claims, sport engine Phase 2",
    ],
    changes: [
      { type: "feat", description: "League Board: 3-column card board (Commissioner/Trade Block/Banter) with thread replies, thumbs up/down, auto-synced trade block from roster" },
      { type: "feat", description: "Pricing page at /pricing: Free / Pro $29/season / Commissioner $49/season. Founding member $99 lifetime deal. FAQ section" },
      { type: "feat", description: "Sport-Agnostic Engine Phase 1: SportConfig interface + baseball.ts extracted + getSportConfig() registry (server + client)" },
      { type: "feat", description: "Trophy Case: trophyCaseService with dynasty scores, championships, all-time standings, records. TrophyCaseTab on Archive page" },
      { type: "feat", description: "Local Timezone Display: timeUtils.ts with cached Intl.DateTimeFormat, three-tier display, useCountdownSeconds hook" },
      { type: "feat", description: "League Health Dashboard: commissioner engagement metrics (score 0-100, active/at-risk/inactive), LeagueHealthTab" },
      { type: "feat", description: "Period Awards: Manager of Period, Pickup of Period, Category Kings. PeriodAwardsCard on Home page" },
      { type: "feat", description: "Pre-Trade AI Advisor: enhanced /analyze with keeper detection, position scarcity, category impact. TradeAnalysisModal" },
      { type: "feat", description: "Concepts Lab at /concepts: interactive League Board prototype with sample cards, reactions, polls" },
      { type: "feat", description: "Product Board placeholder at /community: Announcements, Marketplace, General channels. OGBA listing" },
      { type: "feat", description: "Batch AI Insights: POST /api/teams/ai-insights/generate-all for backfilling all teams" },
      { type: "fix", description: "Category table columns reordered: Team → Season → Period → Chg" },
      { type: "refactor", description: "Trading Block merged into League Board (auto-synced, read-only). Removed Trading Block tab from Activity page" },
      { type: "docs", description: "Competitive analysis brainstorm, deepened plan (4 research agents), roadmap rewrite (5 phases, seasonal pricing)" },
      { type: "feat", description: "Smart deadline warnings: countdown pill banners on Dashboard (blue/amber/red urgency), dismissible, auto-detect period end within 72h" },
      { type: "feat", description: "Push notifications: web-push with VAPID keys, PushSubscription model, sw.js handlers, /api/notifications routes, per-type opt-in/out settings" },
      { type: "feat", description: "H2H Category Scoring: ScoringEngine interface, Roto/H2HCategory/Points implementations, round-robin matchup generation" },
      { type: "feat", description: "Points-Based Scoring: configurable fantasy point weights per stat event (R=1, HR=4, RBI=1, SB=2, W=7, SV=5, K=1)" },
      { type: "feat", description: "Snake Draft: DraftBoard grid, WebSocket /ws/draft with live pick broadcasts, auto-pick timer, pause/resume, On the Clock indicator" },
      { type: "feat", description: "In-App League Chat: WebSocket /ws/chat, ChatPanel (slide-over desktop, full-screen mobile), unread badges, system messages on trade/waiver events" },
      { type: "feat", description: "Conditional Waiver Claims: ONLY_IF_UNAVAILABLE / ONLY_IF_AVAILABLE / PAIR_WITH conditions with evaluateCondition() in processing" },
      { type: "feat", description: "Sport Engine Phase 2: League.sport wired through API → LeagueContext → standings computation + auction config" },
      { type: "feat", description: "Rule Lock Tiers: isRuleLocked() with season-phase enforcement. 10 waiver config fields. Commissioner UI with padlock icons on locked settings" },
      { type: "feat", description: "User Profiles: ProfilePage (/profile, /profile/:userId), bio, favorite team, experience, preferred formats, payment handles (league-members-only)" },
      { type: "feat", description: "League Invites + Public Leagues: /join/:inviteCode, visibility (PRIVATE/PUBLIC/OPEN), Community Board with real public league listings" },
      { type: "security", description: "7-agent code review: 42 findings. Fixed 5 P1 criticals — draft commissioner auth, chat/board membership checks, push subscription hijacking, email exposure in public endpoints" },
    ],
  },
  {
    version: "0.49.0",
    date: "Apr 3, 2026",
    session: "Session 56",
    title: "Watchlist & Trading Block, Email Notifications, AAA Sync, 7-Agent Code Review, ADA Compliance",
    highlights: [
      "Watchlist & Trading Block: private per-team watchlist (notes, tags, player search) + public league-wide trading block ('asking for') — 17 QA bugs found and fixed",
      "Email notifications: trade proposed/processed/vetoed + waiver results via Resend (fire-and-forget, notifyTeamOwners helper, sanitizeSubject for security)",
      "Weekly AAA prospects sync: Monday 14:00 UTC cron, position overwrite bug fixed, admin manual trigger",
      "7-agent code review: TypeScript, Security, Performance, Architecture, Simplicity, Agent-Native, Learnings — 8 P2 findings all resolved",
      "ADA table compliance + frozen first column on mobile + shared PlayerFilterBar/PlayerNameCell/TeamNameLink + all 673 tests passing",
    ],
    changes: [
      { type: "feat", description: "WatchlistPanel: private per-team, player search (loads 2277 players, client-side filter), inline notes, tag toggles, PlayerDetailModal on name click" },
      { type: "feat", description: "TradingBlockPanel: public league-wide with 'asking for' field, grouped by team. /trading-block page + sidebar link. Ownership gating (myTeamId check)" },
      { type: "feat", description: "Email notifications: sendTradeProposedEmail, sendTradeProcessedEmail, sendTradeVetoedEmail, sendWaiverResultEmail — all with HTML templates, List-Unsubscribe header" },
      { type: "feat", description: "notifyTeamOwners() helper: resolves multi-owner teams, skips self-notification, fire-and-forget with 100ms rate limiting" },
      { type: "feat", description: "Weekly AAA prospects sync cron (Monday 14:00 UTC) via existing syncAAARosters(); admin endpoint already at POST /api/admin/sync-prospects" },
      { type: "feat", description: "ADA: scope='col' on all <th>, aria-label on all tables, aria-sort='none' on unsorted columns, caption prop, focus ring upgrade" },
      { type: "feat", description: "Frozen first column: 'frozen' prop on ThemedTh/ThemedTd — sticky left-0, opaque bg, separator line, z-index hierarchy" },
      { type: "refactor", description: "Shared PlayerFilterBar extracted from Players + AddDropTab (~180 LOC deduped). PlayerNameCell + TeamNameLink shared components" },
      { type: "refactor", description: "displayPos() centralized in playerDisplay.ts. notifyTeamOwners() replaces 4 duplicate loops. catch(e: any) → catch(e: unknown) x9" },
      { type: "fix", description: "SW cache fix: sw.js served with max-age=1y immutable — dedicated /sw.js route with no-cache, updateViaCache='none', bumped v4" },
      { type: "fix", description: "Watchlist API: GET returned array not {items}, search used wrong player ID (_dbId fix), availablePlayers filter was always empty" },
      { type: "fix", description: "Trading Block: GET /my and PATCH missing teamName/teamCode, POST missing player include, TradingBlockPanel null guards on .player?.id" },
      { type: "fix", description: "requireSeasonStatus(['IN_SEASON']) on watchlist + trading-block POST endpoints" },
      { type: "security", description: "sanitizeSubject() strips \\r\\n from email subjects (header injection prevention). escapeHtml on all email body content" },
      { type: "test", description: "5 pre-existing client test failures fixed (findMyTeam mock, label updates). 486 server + 187 client = 673 tests, 0 failures" },
      { type: "docs", description: "Solution docs: overflow-hidden-blocks-child-horizontal-scroll.md, service-worker-immutable-cache-headers.md" },
    ],
  },
  {
    version: "0.47.0",
    date: "Apr 1, 2026",
    session: "Session 55",
    title: "Daily Diamond, Table Standardization, Design Consistency Overhaul",
    highlights: [
      "The Daily Diamond: newspaper-style headlines with MLB highlight thumbnails, 60+ fun headlines, On Deck, 30 rotating editorial columns",
      "Table design standardization: all tables across the tool now use compact density from centralized table.tsx — Season, Period, Players, Teams, Auction, Activity, Archive",
      "Removed bulky fantasy team pill badges, oversized buttons, and per-cell padding overrides that broke row consistency",
      "Player name + position badge pattern unified across Players, Add/Drop, and all roster tables",
    ],
    changes: [
      { type: "feat", description: "Daily Diamond newspaper layout: hero (2/3) + sidebar (1/3) with serif typography, gradient overlays, responsive stacking" },
      { type: "feat", description: "MLB highlight thumbnails: backend fetches /game/{gamePk}/content in parallel, maps player IDs to 640px game-day thumbnails (5-min cache)" },
      { type: "feat", description: "Headline generator: 60+ punchy templates with deterministic per-player daily rotation" },
      { type: "feat", description: "On Deck section: upcoming/live roster players; FINAL games excluded. Pulse bar + 30 rotating daily editorial columns" },
      { type: "refactor", description: "Table density standardization: compact default across all 3 table systems (table.tsx, ThemedTable.tsx, TableCard.tsx)" },
      { type: "refactor", description: "Removed 40+ per-cell padding overrides (px-8 py-5, py-3, py-4) in StatsTables, Players, AddDropTab — all inherit from compact density" },
      { type: "refactor", description: "Players page: fantasy team pill badges → plain text; position badges shrunk to text-[8px]; names to text-[11px]" },
      { type: "refactor", description: "AddDropTab: player name/position pattern unified with Players page; Add/Drop buttons shrunk to compact" },
      { type: "refactor", description: "StatsTables: team name font reduced from text-lg to text-[11px]; all padding overrides removed" },
      { type: "feat", description: "League-wide headlines endpoint: GET /api/mlb/league-headlines — top performer per fantasy team with thumbnails" },
      { type: "docs", description: "Solution doc: waiver priority leagueId default bug pattern (docs/solutions/logic-errors/)" },
    ],
  },
  {
    version: "0.46.0",
    date: "Mar 31, 2026",
    session: "Session 51 (cont.)",
    title: "Period Stats Fix, Data Integrity Audit, Column Corrections, Security Review",
    highlights: [
      "Period-to-date stats now display correctly — fixed daily stats path using incomplete data instead of cumulative totals",
      "Period tab Stats/Points toggle — switch between raw stat values and roto points in category tables",
      "Weekly Insights now use actual per-player stat lines — no more hallucinated performance claims",
      "Security review: 4 critical fixes (auth, DST, roster queries, trade reverse dates)",
    ],
    changes: [
      { type: "fix", description: "Period stats showed 1 day instead of cumulative — daily stats path now requires 80% coverage, falls back to PlayerStatsPeriod" },
      { type: "fix", description: "Saves category season-to-date: KEY_TO_DB_FIELD mapping (SV→S) was missing, showing 0 for all teams" },
      { type: "feat", description: "Period tab Stats/Points toggle — Stats shows raw values sorted by stat, Points shows roto points" },
      { type: "feat", description: "Period Totals table shows real stat values in Stats mode (was always showing points)" },
      { type: "fix", description: "Summary table renamed 'Season Totals' → 'Period Totals', columns 'Period to Date' and 'Season to Date'" },
      { type: "feat", description: "Hitter columns corrected: POS, PLAYER, TM, G, AB, R, HR, RBI, SB, AVG (added G+AB, removed GS)" },
      { type: "feat", description: "Pitcher columns: removed SO (shutouts), kept W, SV, K, IP, ERA, WHIP" },
      { type: "feat", description: "Player modal: Positions Played moved above Recent Stats" },
      { type: "feat", description: "Weekly Insights: AI receives actual stat lines per player, cannot hallucinate performance" },
      { type: "feat", description: "League Digest: removed auction price references, strengthened keeper exclusion in trade proposals" },
      { type: "fix", description: "YouTube Error 153: added origin param, expanded CSP, filter non-embeddable videos" },
      { type: "security", description: "Period roster endpoint: added league membership check" },
      { type: "security", description: "nextDayEffective() DST fix: en-CA locale with noon UTC parse" },
      { type: "security", description: "Transaction claim drop: added releasedAt null filter" },
      { type: "security", description: "Trade reverse: uses nextDayEffective() consistently" },
      { type: "perf", description: "Daily stats existence check: count() → findFirst() (short-circuits)" },
      { type: "perf", description: "TeamStatsPeriod upserts: sequential → batched $transaction" },
      { type: "perf", description: "prevTeamStats computed once, reused for total and category deltas" },
    ],
  },
  {
    version: "0.45.0",
    date: "Mar 30, 2026",
    session: "Session 51",
    title: "Stats Attribution, Weekly Insights Overhaul, Railway Migration, Marketing Site Separation",
    highlights: [
      "Date-aware stats attribution: PlayerStatsDaily model, next-day effective dates, dual-path aggregation for mid-period trades/drops",
      "Weekly Insights rewritten: player performance focus (Hot Bats, Pitching, Roster Alert), comparative grading, human-readable week labels",
      "Hosting migrated from Render to Railway ($5/mo) — always-on, no cold starts, WebSocket support",
      "Marketing site separated: www.thefantasticleagues.com (Astro + Tina.io on GitHub Pages) vs app.thefantasticleagues.com (Railway)",
    ],
    changes: [
      { type: "feat", description: "PlayerStatsDaily model — per-day stat tracking for date-aware roster attribution" },
      { type: "feat", description: "nextDayEffective() utility — roster changes effective next day midnight Pacific time" },
      { type: "feat", description: "Date-aware computeTeamStatsFromDb() — dual-path: daily stats (precise) + period fallback" },
      { type: "feat", description: "Period roster endpoint: GET /api/teams/:id/period-roster — shows traded/dropped players with status badges" },
      { type: "feat", description: "Team page period selector dropdown — view all players on team during any period" },
      { type: "feat", description: "Daily stats sync cron at 13:30 UTC + backfill script" },
      { type: "feat", description: "Weekly Insights: 'Week of 3/30' labels, 'Updated Every Monday' subtitle, removed preseason badge" },
      { type: "feat", description: "Weekly Insights AI prompt rewritten: 3 player-focused insights, no budget/auction talk, comparative grading" },
      { type: "feat", description: "Activity tabs reordered: Waivers > Add/Drop > Trades > History" },
      { type: "feat", description: "Season/Period standings: 'Updated Mar 30 at 5:30 PM' timestamps" },
      { type: "feat", description: "FUTURE_BUDGET and WAIVER_PRIORITY trade asset types with full processing" },
      { type: "feat", description: "Marketing site: Astro + Tina.io CMS with landing, blog, changelog, roadmap pages" },
      { type: "fix", description: "Commissioner drops changed from hard-delete to soft-delete with releasedAt" },
      { type: "fix", description: "All roster mutations (trades, waivers, claims) use next-day effective dates" },
      { type: "fix", description: "Hardcoded Render WebSocket fallback removed — Railway handles WS natively" },
      { type: "fix", description: "CSP expanded for Google OAuth, YouTube, fonts, PostHog on new domain" },
      { type: "fix", description: "AuthRedirect preserves OAuth hash fragment during Google login" },
      { type: "fix", description: "Node.js pinned to >=20 for Railway deployment (was defaulting to 18)" },
      { type: "security", description: "DNS migrated to Cloudflare — full control, no Squarespace proxy interference" },
    ],
  },
  {
    version: "0.44.0",
    date: "Mar 30, 2026",
    session: "Session 50",
    title: "Ohtani Profile Fix, Recent Stats, Trade Assets, Waiver Priority",
    highlights: [
      "Ohtani pitcher derived ID resolved at 3 layers (modal, API, routes)",
      "MLB API deprecation fix: replaced last7Days/last15Days with byDateRange",
      "Trade asset types: FUTURE_BUDGET and WAIVER_PRIORITY with full processing",
      "Waiver priority switched from season-wide to period-based standings",
    ],
    changes: [
      { type: "feat", description: "FUTURE_BUDGET trade asset — deferred budget adjustments on season DRAFT transition" },
      { type: "feat", description: "WAIVER_PRIORITY trade asset — swaps waiverPriorityOverride between teams" },
      { type: "fix", description: "Ohtani pitcher resolveRealMlbId() maps derived 1660271 to real 660271" },
      { type: "fix", description: "MLB API: byDateRange replaces deprecated last7Days/last15Days/last30Days" },
      { type: "fix", description: "YouTube search: added relevanceLanguage 'en' filter" },
      { type: "fix", description: "Waiver priority now uses period-based roto standings (not season cumulative)" },
    ],
  },
  {
    version: "0.43.0",
    date: "Mar 27-29, 2026",
    session: "Session 49",
    title: "Performance, Season Launch, Positions, Home Page, YouTube/Reddit/Yahoo, Waiver/Trade Fixes",
    highlights: [
      "Performance audit: 8 DB indexes, 3 N+1 fixes, standings flattened, client waterfalls eliminated",
      "2026 season live: current year stats, draft report locked, Opening Day data synced",
      "Yahoo Fantasy position model: fixed POS column, locked during season, auto-assignment, commissioner editing",
      "Home page: Real-Time Stats (live boxscores, noon PST cutover), MLBTradeRumors.com RSS, YouTube highlights with inline modal, Reddit r/baseball + r/fantasybaseball",
    ],
    changes: [
      { type: "perf", description: "8 compound database indexes deployed (Season, Period, Roster, LeagueMembership, Trade, AiInsight, TransactionEvent, FinanceLedger)" },
      { type: "perf", description: "N+1 queries fixed in admin team codes (2N→2 queries), commissioner roster copy (M*K→1 createMany), standings computation (nested→3 parallel)" },
      { type: "perf", description: "AuctionValues search debounce (250ms), Team page API waterfall eliminated, Activity page trades loaded in parallel" },
      { type: "feat", description: "getCurrentSeasonStats() — 2026 stats from MLB API with 2-hour cache, replacing hardcoded LAST_SEASON=2025" },
      { type: "feat", description: "Draft report locked during IN_SEASON/COMPLETED — served from cache only, no regeneration" },
      { type: "feat", description: "Period labels show name (P1) instead of database ID (P35) via periodNames in API response" },
      { type: "feat", description: "Yahoo Fantasy position model — fixed POS column on Team, Auction Results, Draft Report pages (read-only during season)" },
      { type: "feat", description: "Auto-assignment script for roster slots (C*2, 1B, 2B, 3B, SS, MI, CM, OF*5, DH, P*9) with auction-set positions preserved" },
      { type: "feat", description: "Commissioner position editing via RosterGrid canEditPosition prop in Commissioner Roster tool" },
      { type: "feat", description: "Home page: Real-Time Stats Today — full roster with live boxscore data, auto-refresh every 2 min during live games" },
      { type: "feat", description: "Home page: MLB Trade Rumors RSS feed with NL/AL filter, team dropdown, fantasy team dropdown, My Roster toggle" },
      { type: "feat", description: "Trade rumors cross-reference: player name tags matched against league roster, highlighted with fantasy team name" },
      { type: "feat", description: "New server endpoints: /api/mlb/trade-rumors (RSS parser), /api/mlb/injuries, /api/mlb/roster-stats-today (boxscore)" },
      { type: "fix", description: "ERA/WHIP/IP formatting — shows dash for 0 IP pitchers instead of raw floats like 10.799999" },
      { type: "fix", description: "AI insights and Weekly Digest default to collapsed, auto-expand on Mondays" },
      { type: "feat", description: "YouTube Player Highlights — Data API v3 search for rostered players (falls back to MLB + Jomboy RSS), inline video modal with autoplay" },
      { type: "feat", description: "Reddit r/baseball + r/fantasybaseball feed — hot posts with player cross-referencing, flair tags, engagement metrics, fantasy team filter" },
      { type: "feat", description: "MLBTradeRumors.com — fantasy team dropdown (8 teams + Free Agents), NL/AL toggle from league rules, player tag highlighting" },
      { type: "fix", description: "Real-time stats timezone — uses Pacific time, yesterday's stats visible until noon PST next day" },
      { type: "fix", description: "Boxscore data — switched from schedule hydration to per-game live feed endpoint for actual player stats" },
      { type: "feat", description: "Yahoo Sports MLB RSS feed — 3rd news column with player cross-referencing and fantasy team filter" },
      { type: "feat", description: "3-column news layout — MLBTradeRumors | Reddit | Yahoo side-by-side with equal height, above YouTube Shorts" },
      { type: "feat", description: "YouTube Shorts pagination — 2 rows of 3 per page with < 1 2 3 > navigation" },
      { type: "feat", description: "Waiver Claim Form — team owners can submit FAAB bids (player search, bid amount, drop selection)" },
      { type: "feat", description: "Period stats endpoint enabled — returns PlayerStatsPeriod data for active period" },
      { type: "feat", description: "Roster limit validation — 23-player max enforced on waivers, claims, and trades" },
      { type: "feat", description: "MLB Roster Status alerts — IL and minors players shown as badges on Home page" },
      { type: "feat", description: "REVERSED added to TradeStatus enum — trade reversal no longer uses unsafe type cast" },
      { type: "fix", description: "Season guards added to /transactions/claim and /drop endpoints" },
      { type: "fix", description: "assignedPosition set on waiver claim, waiver processing, and trade processing" },
      { type: "feat", description: "Ohtani split into 2 separate player records — Shohei Ohtani (Hitter) on DLC, Shohei Ohtani (Pitcher) on Skunk Dogs as keeper" },
      { type: "feat", description: "Team page totals row — hitter totals (R/HR/RBI/SB/AVG) and pitcher totals (W/SV/K/IP/ERA/WHIP) at bottom of each table" },
      { type: "feat", description: "Season page: hitters left + pitchers right columns, Chg column with daily standings snapshots" },
      { type: "feat", description: "Players page: NL default, All NL Teams / All AL Teams dropdown groups, Season Total + Period 1 labels" },
      { type: "fix", description: "IP field added to SeasonStatEntry — pitcher IP/ERA/WHIP now display on team pages" },
      { type: "fix", description: "Category tables: real stat values display (was showing dashes), proper labels (Runs not R Metric)" },
      { type: "fix", description: "Fielding stats fetch 2026 (was 2025 due to lastCompletedSeason bug in March)" },
      { type: "fix", description: "Team links in category tables use team code not database ID" },
      { type: "fix", description: "2026 Positions Played label with GP in expanded player rows and detail modal" },
      { type: "docs", description: "Position backfill: 370 active roster entries assigned positions, 15 auction-set positions verified" },
    ],
  },
  {
    version: "0.42.0",
    date: "Mar 26, 2026",
    session: "Session 48",
    title: "Position Dropdown Fix, Trade Guard, Sync Preservation, Multi-Surface Position Editing",
    highlights: [
      "Fixed position dropdowns on Auction page — changes now persist immediately with optimistic UI updates",
      "Added position dropdowns to Draft Report (expandable roster) and Team page (ELIG column) for multi-position players",
      "Fixed daily cron wiping multi-position eligibility data — syncAllPlayers now preserves enriched posList",
      "Added SELECT FOR UPDATE trade processing guard to prevent double-processing race condition",
    ],
    changes: [
      { type: "feat", description: "Position dropdowns on Draft Report — expandable roster now shows position selectors for multi-eligible players (e.g., O'Hearn: 1B/CM/OF/DH)" },
      { type: "feat", description: "Position dropdowns on Team page — ELIG column shows editable dropdowns for multi-position players on both hitter and pitcher tables" },
      { type: "feat", description: "Optimistic position updates — dropdown selections reflect immediately in UI while server round-trip completes in background" },
      { type: "feat", description: "Pre-draft trade history — Trade #17 recorded (DLC→Mullins, Devil Dawgs→$75) for full transaction audit trail" },
      { type: "fix", description: "Position dropdown persistence — AuctionResults was not passing onRefresh to AuctionComplete, causing changes to revert after server sync" },
      { type: "fix", description: "syncAllPlayers now preserves enriched Player.posList — daily cron no longer wipes multi-position eligibility set by syncPositionEligibility" },
      { type: "fix", description: "Period 1 endDate bug — was set before startDate (Mar 22 < Mar 25), corrected to Apr 6" },
      { type: "fix", description: "Trade processing race condition — added SELECT FOR UPDATE row lock inside transaction to prevent double-processing from concurrent requests" },
      { type: "docs", description: "Mandatory browser verification added to CLAUDE.md session checklist — Playwright interaction test required after every code change" },
      { type: "docs", description: "Yahoo-style roster slot management plan created — 4-phase plan for slot-based UI, server validation, compliance indicators" },
    ],
  },
  {
    version: "0.41.0",
    date: "Mar 25, 2026",
    session: "Session 47",
    title: "Auction & Draft Report Overhaul — Expandable Rows, Position Eligibility, Ohtani Split",
    highlights: [
      "Auction page: Keepers/Auction/Total/Left budget columns, expandable player rows with stats, position dropdowns for multi-eligible players",
      "Draft Report: H/P split tables, stats columns (HR/RBI/SB/AVG, W/K/ERA/WHIP), sortable headers, expandable detail rows",
      "Season page: sortable standings matrix with SortableHeader across all stat columns",
      "Position eligibility: 20-game rule synced daily from MLB fielding stats via syncPositionEligibility in cron",
    ],
    changes: [
      { type: "feat", description: "Auction page budget columns: Keepers/Auction/Total/Left per team, expandable player rows with season stats" },
      { type: "feat", description: "Auction page position dropdowns for multi-position-eligible players (based on 20-game fielding rule)" },
      { type: "feat", description: "Draft Report H/P split — separate hitter and pitcher tables with stats columns (HR/RBI/SB/AVG, W/K/ERA/WHIP)" },
      { type: "feat", description: "Draft Report sortable headers and expandable detail rows per player" },
      { type: "feat", description: "Season page sortable standings matrix — SortableHeader on all stat/category columns" },
      { type: "feat", description: "Position eligibility: 20-game rule synced daily from MLB fielding stats (syncPositionEligibility added to daily cron)" },
      { type: "feat", description: "Ohtani two-way stats split — pitcher stats attributed to pitching team, hitter stats to hitting team" },
      { type: "feat", description: "Waiver priority: inverse-standings tiebreaker for same-FAAB-amount claims" },
      { type: "fix", description: "Roster duplication bug — prevented duplicate roster entries on auction finish and keeper import" },
      { type: "fix", description: "Keeper sort pinning — keepers now pinned to top of roster sort regardless of sort column" },
      { type: "fix", description: "DH eligibility — DH no longer incorrectly granted via fielding stats (excluded from position sync)" },
    ],
  },
  {
    version: "0.40.0",
    date: "Mar 24, 2026",
    session: "Sessions 40–44",
    title: "Phase 1: Polish & Foundation — Sidebar, Mobile Nav, Code Splitting, League Creation",
    highlights: [
      "Sidebar extracted to Sidebar.tsx (505→188 LOC AppShell), reorganized into 5 sections: Core, AI, League, Manage, Product",
      "Mobile bottom nav with 5 tabs (Home, Season, Players, Activity, More) — 56px + safe area",
      "React.lazy code splitting on 25 routes + dynamic Mermaid import (~250KB removed from bundle)",
      "Self-service league creation at /create-league — any user can create leagues",
    ],
    changes: [
      { type: "feat", description: "Sidebar extraction + 5-section reorganization: Core, AI (new), League, Manage, Product (renamed from Dev)" },
      { type: "feat", description: "Mobile bottom tab nav (BottomNav.tsx) — 5 tabs, 'More' opens sidebar drawer, 44px touch targets, iOS safe area" },
      { type: "feat", description: "Weekly Insights history tabs on Team page — browse past weeks with grade badges" },
      { type: "feat", description: "Self-service league creation (POST /api/leagues) — single-form UI, Zod validation, per-user limit" },
      { type: "feat", description: "Shared EmptyState component with discriminated union actions — updated 8 pages" },
      { type: "feat", description: "Draft Report regeneration — force=true cache bypass + Regenerate button" },
      { type: "feat", description: "Changelog, Roadmap, Status now visible to all users (no longer admin-only)" },
      { type: "perf", description: "React.lazy code splitting on 25 non-critical routes — Mermaid.js dynamic import removes ~250KB from initial bundle" },
      { type: "fix", description: "Draft Report $0 surplus bug — stale cached report + diacritics name matching (ñ→n, é→e) for CSV lookups" },
      { type: "fix", description: "lookupAuctionValue() with NFD-normalized fallback — 147→159 player name matches across all AI features" },
      { type: "security", description: "Trade budget validation before decrement (prevents negative budgets)" },
      { type: "security", description: "Vote endpoint: added requireLeagueMember + SELECT FOR UPDATE atomic voting" },
      { type: "security", description: "4 unbounded in-memory caches capped at 500 entries each" },
      { type: "security", description: "Invite code entropy increased from 32 to 128 bits" },
      { type: "refactor", description: "12 code review findings resolved (1 P1 + 8 P2 + 3 P3): CL position parity, typed JSON interfaces, IIFE elimination, parallel queries" },
      { type: "refactor", description: "KEEPER_SOURCE constant + isKeeperRoster() predicate extracted to shared sportConfig" },
      { type: "docs", description: "CPLAN-saas-vision.md — 5-phase SaaS roadmap with sneaker-model branding" },
      { type: "docs", description: "Phase 1 deepened plan — 8-agent research synthesis across all workstreams" },
    ],
  },
  {
    version: "0.39.0",
    date: "Mar 24, 2026",
    session: "Session 39",
    title: "AI Insights Overhaul — 8 AI Features, Code Review, League Digest",
    highlights: [
      "Draft Report page (/draft-report) with surplus analysis, grades, keeper assessment, category projections",
      "Home Page Weekly Digest with team grades, hot/cold teams, Trade of the Week with vote poll",
      "Auto-generating Weekly Insights on Team page — persisted weekly, expand/collapse, mobile responsive",
      "Post-Trade and Post-Waiver AI analyzers — auto-generate on processing, persist inline",
    ],
    changes: [
      { type: "feat", description: "Dedicated /draft-report page with per-team AI grades, surplus analysis, projected values from CSV, NL-only context" },
      { type: "feat", description: "Home Page Weekly League Digest — overview, team grades, Trade of the Week (rotating conservative/outrageous/fun)" },
      { type: "feat", description: "Trade of the Week poll — yes/no voting with vote feedback loop for future proposals" },
      { type: "feat", description: "Auto-generating Weekly Team Insights on Team page load — persisted to AiInsight table, weekly dedup" },
      { type: "feat", description: "Post-Trade Analyzer — fire-and-forget AI analysis on trade processing, fairness badge inline" },
      { type: "feat", description: "Post-Waiver Analyzer — fire-and-forget AI analysis on waiver claim processing, bid grade + category impact" },
      { type: "feat", description: "Live Bid Advice upgraded — team-aware marginal value, knows roster, category needs, remaining player pool" },
      { type: "feat", description: "Keeper Recommendations enhanced with projected values, NL-only scarcity, injury awareness" },
      { type: "feat", description: "Draft Report added to sidebar nav (League section)" },
      { type: "security", description: "Waiver analysis moved into proper AIAnalysisService method with Zod validation (was bypassing via 'as any')" },
      { type: "perf", description: "Centralized CSV loading into cached singleton (server/src/lib/auctionValues.ts) — replaced 6 duplicate readFileSync sites" },
      { type: "perf", description: "Added 60-second timeout to Gemini LLM calls, max size on 5 in-memory caches" },
      { type: "refactor", description: "4-agent code review resolved all 14 findings (2 P1, 7 P2, 5 P3)" },
      { type: "refactor", description: "Extracted shared utilities: getWeekKey, gradeColor, isPitcher (CL added), auctionValues singleton" },
      { type: "docs", description: "AI Analysis System section added to CLAUDE.md — 8 features, data sources, prompt guidelines" },
    ],
  },
  {
    version: "0.38.0",
    date: "Mar 23, 2026",
    session: "Session 38",
    title: "Code Review P2 Cleanup: Context, Accessibility, SortableHeader Adoption",
    highlights: [
      "Added myTeamId to LeagueContext — eliminates 7 duplicate team-finding patterns, memoized context value",
      "SortableHeader now WAI-ARIA accessible with <button> in <th>, aria-sort, generic types, focus ring",
      "Adopted SortableHeader across 3 pages (Players, PlayerPoolTab, AddDropTab) — 30+ inline headers replaced",
      "9-agent deepened plan guided implementation — TypeScript, Performance, Architecture, Races, and more",
    ],
    changes: [
      { type: "refactor", description: "LeagueContext: myTeamId from merged outfieldMode fetch, useMemo on value object, useCallback on setLeagueId" },
      { type: "refactor", description: "Generic findMyTeam<T> helper — typed team ownership matching, single source of truth" },
      { type: "refactor", description: "LeagueDetail type now includes ownerships field — was untyped across 7 consumer files" },
      { type: "feat", description: "SortableHeader: WAI-ARIA <button> inside <th>, aria-sort on active column only, generic <K extends string>" },
      { type: "feat", description: "AbortController on AIHub generate callback — aborts previous request, cleans up on unmount" },
      { type: "refactor", description: "Adopted SortableHeader in Players.tsx, PlayerPoolTab.tsx, AddDropTab.tsx — 30+ inline sort headers replaced" },
      { type: "refactor", description: "Removed compact prop + TableCompactProvider/Context/useTableCompact dead code from table system" },
      { type: "docs", description: "splitTwoWayStats JSDoc: added in-place mutation warning" },
      { type: "docs", description: "9-agent deepened plan: docs/plans/2026-03-23-refactor-session-37-code-review-p2-cleanup-plan.md" },
    ],
  },
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
      { type: "security", description: "GET /leagues/:id no longer exposes passwordHash, resetToken, isAdmin, or payment handles — explicit select on owner relation" },
      { type: "docs", description: "5-agent code review: security sentinel, performance oracle, architecture strategist, TypeScript reviewer, simplicity reviewer" },
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
          {(entry.todoLink || entry.roadmapLink || entry.conceptLink) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 pl-3">
              <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Related:</span>
              {entry.todoLink && (
                <Link to={entry.todoLink} className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20">
                  → Todo
                </Link>
              )}
              {entry.roadmapLink && (
                <Link to={entry.roadmapLink} className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20">
                  → Roadmap
                </Link>
              )}
              {entry.conceptLink && (
                <Link to={entry.conceptLink} className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30 hover:bg-fuchsia-500/20">
                  → Concept
                </Link>
              )}
            </div>
          )}
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
        <AdminCrossNav />
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

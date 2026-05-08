// client/src/App.tsx
import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AuroraShell from "./components/aurora/AuroraShell";
const InjuredListPage = React.lazy(() => import("./features/players/pages/InjuredListPage"));
const AuctionLegacy = React.lazy(() => import("./features/auction/pages/AuctionLegacy"));

// Core routes — static imports (high-traffic, always needed)
import Home from "./pages/Home";
import MyTeamRedirect from "./pages/MyTeamRedirect";
import Season from "./features/periods/pages/Season";
import Team from "./features/teams/pages/Team";
import { ManagePanel } from "./features/teams/components/RosterHub/ManagePanel";
import WireListOwnerPage from "./features/wire-list/pages/WireListOwnerPage";
import WireListCommissionerPage from "./features/wire-list/pages/WireListCommissionerPage";
import TeamLegacy from "./features/teams/pages/TeamLegacy";
import TeamsIndex from "./features/teams/pages/TeamsIndex";
import Players from "./features/players/pages/Players";
import PlayerDetail from "./features/players/pages/PlayerDetail";
import ActivityPage from "./features/transactions/pages/ActivityPage";
import Login from "./features/auth/pages/Login";

// Non-critical routes — lazy-loaded (code-split chunks)
const Commissioner = React.lazy(() => import("./features/commissioner/pages/Commissioner"));
const Admin = React.lazy(() => import("./features/admin/pages/Admin"));
const AdminDashboard = React.lazy(() => import("./features/admin/pages/AdminDashboard"));
const AdminUsers = React.lazy(() => import("./features/admin/pages/AdminUsers"));
const TodoPage = React.lazy(() => import("./features/admin/pages/TodoPage"));
const ArchivePage = React.lazy(() => import("./features/archive/pages/ArchivePage"));
const Auction = React.lazy(() => import("./features/auction/pages/Auction"));
const AuctionResults = React.lazy(() => import("./features/auction/pages/AuctionResults"));
const AuctionValues = React.lazy(() => import("./features/auction/pages/AuctionValues"));
const KeeperSelection = React.lazy(() => import("./features/keeper-prep/pages/KeeperSelection"));
const Rules = React.lazy(() => import("./features/leagues/pages/Rules"));
const Profile = React.lazy(() => import("./features/auth/pages/Profile"));
const ProfilePage = React.lazy(() => import("./features/profiles/pages/ProfilePage"));
const Payouts = React.lazy(() => import("./features/periods/pages/Payouts"));
const Signup = React.lazy(() => import("./features/auth/pages/Signup"));
const ForgotPassword = React.lazy(() => import("./features/auth/pages/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./features/auth/pages/ResetPassword"));
const Tech = React.lazy(() => import("./pages/Tech"));
const Roadmap = React.lazy(() => import("./pages/Roadmap"));
const Changelog = React.lazy(() => import("./pages/Changelog"));
const Status = React.lazy(() => import("./pages/Status"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Docs = React.lazy(() => import("./pages/Docs"));
const GuidePage = React.lazy(() => import("./pages/Guide"));
const GuideAccount = React.lazy(() => import("./pages/guide/GuideAccount"));
const GuideAuction = React.lazy(() => import("./pages/guide/GuideAuction"));
const GuideFaq = React.lazy(() => import("./pages/guide/GuideFaq"));
const About = React.lazy(() => import("./pages/About"));
const AIHub = React.lazy(() => import("./features/ai/pages/AIHub"));
const DraftReportPage = React.lazy(() => import("./features/ai/pages/DraftReportPage"));
const WeeklyReport = React.lazy(() => import("./features/reports/pages/WeeklyReport"));
const CreateLeague = React.lazy(() => import("./features/leagues/pages/CreateLeague"));
const JoinLeague = React.lazy(() => import("./features/leagues/pages/JoinLeague"));
const DiscoverLeagues = React.lazy(() => import("./features/leagues/pages/DiscoverLeagues"));
const Draft = React.lazy(() => import("./features/draft/pages/Draft"));
const MatchupPage = React.lazy(() => import("./features/matchups/pages/Matchup"));
const TradingBlockPage = React.lazy(() => import("./features/trading-block/pages/TradingBlockPage"));
const BoardPage = React.lazy(() => import("./features/board/pages/BoardPage"));
const Pricing = React.lazy(() => import("./pages/Pricing"));
const Concepts = React.lazy(() => import("./pages/Concepts"));
const ProductBoard = React.lazy(() => import("./pages/ProductBoard"));
const SwapModePreview = React.lazy(() => import("./pages/design/SwapModePreview"));
const RosterHubV3Preview = React.lazy(() => import("./pages/design/RosterHubV3Preview"));
const DesignRosterHubDeferred = React.lazy(() => import("./pages/design/DesignRosterHubDeferred"));
// Chat removed — Board replaces it

import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuth } from "./auth/AuthProvider";
import NotFound from "./pages/NotFound";
import { RouteAnnouncer } from "./components/RouteAnnouncer";

/**
 * Handles unauthenticated routing. If the URL has a Supabase auth hash
 * (#access_token=...), wait for Supabase to process it before redirecting.
 * Otherwise redirect to /login immediately.
 */
function AuthRedirect() {
  const [waiting, setWaiting] = React.useState(() => window.location.hash.includes("access_token"));

  React.useEffect(() => {
    if (!waiting) return;
    // Give Supabase up to 5s to process the hash and trigger onAuthStateChange
    const timer = setTimeout(() => setWaiting(false), 5000);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (waiting) {
    return (
      <div className="min-h-screen bg-[var(--lg-bg-page)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return <Navigate to="/login" replace />;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--lg-bg-page)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <RouteAnnouncer />
      <Routes>
        {/* Public routes outside of AppShell (no auth required) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/discover" element={<Suspense fallback={<PageLoader />}><DiscoverLeagues /></Suspense>} />

        {/* Protected routes inside AuroraShell — Aurora design system's
            unified app chrome (floating Topbar + bottom Dock per the
            Aurora System.html design handoff). Replaces the legacy
            sidebar AppShell (preserved on disk in
            client/src/components/AppShell.tsx for rollback) across the
            entire authenticated site. */}
        <Route
          path="/*"
          element={
            user ? (
              <AuroraShell>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/season" element={<Season />} />
                    {/* Teams index — Explore section's "Teams" entry per
                        the Sitemap & Navigation design. Lists all teams in
                        the active league with cards linking to the existing
                        /teams/:teamCode roster page. */}
                    <Route path="/teams" element={<TeamsIndex />} />
                    {/* Aurora Team page (PR #139). Pre-Aurora preserved
                        at /teams/:teamCode/classic for trade asset selector,
                        watchlist, weekly insights history, period roster
                        viewer — features the Aurora pilot intentionally
                        doesn't port yet. */}
                    <Route path="/teams/:teamCode/classic" element={<TeamLegacy />} />
                    {/* Aurora roster-hub v3 sub-routes — replace the old modal
                        flow on Team page (per plan §0.5 refinement #2 "no
                        modals"). Each manages a focused mutation flow: claim
                        (free-agent add+drop), il-stash (place on IL +
                        replacement), il-activate (return from IL + drop).
                        Per todo #150, the panels mount as nested-route
                        children of <Team /> via React Router's <Outlet />.
                        Team owns the page chrome + shared state; ManagePanel
                        reads its inputs from `useOutletContext` and renders
                        the matching transactions panel for the URL `:mode`. */}
                    <Route path="/teams/:teamCode" element={<Team />}>
                      <Route path="manage/:mode" element={<ManagePanel />} />
                    </Route>
                    <Route path="/teams/:teamCode/wire-list" element={<WireListOwnerPage />} />
                    <Route path="/commissioner/:leagueId/wire-list" element={<WireListCommissionerPage />} />
                    {/* Canonical "My Team" — resolves myTeamCode from league
                        context, redirects to /teams/:code. Sidebar's My Team
                        shortcut (PR #132) and external bookmarks both land here. */}
                    <Route path="/my-team" element={<MyTeamRedirect />} />
                    <Route path="/players" element={<Players />} />
                    {/* Aurora Player Detail page (screen #5). PlayerDetailModal
                        still ships for inline use elsewhere (Auction, Team,
                        Trading Block, Watchlist, Board, Draft Report). */}
                    <Route path="/players/:mlbId" element={<PlayerDetail />} />
                    {/* League-wide IL page — sortable by AL/NL + by team. Linked from Standings hero. */}
                    <Route path="/injured-list" element={<InjuredListPage />} />
                    <Route path="/activity" element={<ActivityPage />} />
                    <Route path="/transactions" element={<Navigate to="/activity" replace />} />
                    <Route path="/trades" element={<Navigate to="/activity" replace />} />
                    <Route path="/trading-block" element={<Navigate to="/board" replace />} />
                    <Route path="/board" element={<BoardPage />} />
                    <Route path="/chat" element={<Navigate to="/board" replace />} />
                    <Route path="/leagues/:id/keepers" element={<KeeperSelection />} />
                    <Route path="/auction" element={<ErrorBoundary name="auction"><Auction /></ErrorBoundary>} />
                    {/* Live-floor escape hatch (PR-3 strangler-fig). Use this
                        if the Aurora live floor regresses mid-draft. */}
                    <Route path="/auction-classic" element={<ErrorBoundary name="auction-classic"><AuctionLegacy /></ErrorBoundary>} />
                    <Route path="/auction-results" element={<ErrorBoundary name="auction-results"><AuctionResults /></ErrorBoundary>} />
                    <Route path="/auction-values" element={<AuctionValues />} />
                    <Route path="/draft" element={<ErrorBoundary name="draft"><Draft /></ErrorBoundary>} />
                    <Route path="/matchup" element={<MatchupPage />} />
                    <Route path="/commissioner/:leagueId" element={<ErrorBoundary name="commissioner"><Commissioner /></ErrorBoundary>} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    <Route path="/admin/users" element={<AdminUsers />} />
                    <Route path="/todo" element={<TodoPage />} />
                    <Route path="/guide" element={<GuidePage />} />
                    <Route path="/guide/account" element={<GuideAccount />} />
                    <Route path="/guide/auction" element={<GuideAuction />} />
                    <Route path="/guide/faq" element={<GuideFaq />} />
                    <Route path="/archive" element={<ArchivePage />} />
                    <Route path="/period" element={<Navigate to="/season" replace />} />
                    <Route path="/leagues" element={<Navigate to="/" replace />} />
                    <Route path="/create-league" element={<CreateLeague />} />
                    <Route path="/join/:inviteCode" element={<JoinLeague />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/:userId" element={<ProfilePage />} />
                    <Route path="/profile/legacy" element={<Profile />} />
                    <Route path="/payouts" element={<Payouts />} />
                    <Route path="/rules" element={<Rules />} />
                    <Route path="/tech" element={<Tech />} />
                    <Route path="/roadmap" element={<Roadmap />} />
                    <Route path="/changelog" element={<Changelog />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/docs" element={<Docs />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/concepts" element={<Concepts />} />
                    <Route path="/community" element={<ProductBoard />} />
                    <Route path="/ai" element={<AIHub />} />
                    <Route path="/draft-report" element={<DraftReportPage />} />
                    {/* Aurora Weekly Report (screen #7). Net-new page —
                        consumes the existing /api/reports/:leagueId server
                        endpoint that survived the prior client-UI removal. */}
                    <Route path="/weekly-report" element={<WeeklyReport />} />
                    {/* Static design preview for the PR2 Swap Mode UI
                        (admin-gated inside the page). Plan reference:
                        docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md
                        §5B + §8. Ships components that PR2 will reuse. */}
                    <Route path="/design/swap-mode" element={<SwapModePreview />} />
                    {/* Legacy v2 roster-hub preview retired after v3 shipped
                        to the live Team page. Keep the URL as a bookmark-safe
                        redirect to the maintained v3 preview. */}
                    <Route path="/design/roster-hub" element={<Navigate to="/design/roster-hub-v3" replace />} />
                    {/* v3 design preview — adds the 5 user refinements
                        captured in §0.5 of the plan: consolidated stats
                        table, GP numbers in the merged Position+Eligibility
                        column, and inline sub-routes (no modals). PR2 will
                        wire `RosterHubV3` onto the real /teams/:code page. */}
                    <Route path="/design/roster-hub-v3" element={<RosterHubV3Preview />} />
                    {/* Direction-lock preview for the v3 deferred items —
                        drag-to-mutate (primary) + pending-changes save/revert
                        (secondary). Local state only, no backend wiring.
                        Reference: roster_hub_v3_shipped.md memory note. */}
                    <Route path="/design/roster-hub-deferred" element={<DesignRosterHubDeferred />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </AuroraShell>
            ) : (
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/create-league" element={<Navigate to="/signup" replace />} />
                  <Route path="*" element={<AuthRedirect />} />
                </Routes>
              </Suspense>
            )
          }
        />
      </Routes>
    </Suspense>
  );
}

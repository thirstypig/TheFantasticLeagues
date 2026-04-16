// client/src/App.tsx
import React, { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";

// Core routes — static imports (high-traffic, always needed)
import Home from "./pages/Home";
import Season from "./features/periods/pages/Season";
import Team from "./features/teams/pages/Team";
import Players from "./features/players/pages/Players";
import ActivityPage from "./features/transactions/pages/ActivityPage";
import Login from "./features/auth/pages/Login";

// Non-critical routes — lazy-loaded (code-split chunks)
const Commissioner = React.lazy(() => import("./features/commissioner/pages/Commissioner"));
const Admin = React.lazy(() => import("./features/admin/pages/Admin"));
const AdminUsers = React.lazy(() => import("./features/admin/pages/AdminUsers"));
const TodoPage = React.lazy(() => import("./features/admin/pages/TodoPage"));
const ArchivePage = React.lazy(() => import("./features/archive/pages/ArchivePage"));
const Auction = React.lazy(() => import("./features/auction/pages/Auction"));
const AuctionResults = React.lazy(() => import("./features/auction/pages/AuctionResults"));
const KeeperSelection = React.lazy(() => import("./features/keeper-prep/pages/KeeperSelection"));
const Rules = React.lazy(() => import("./features/leagues/pages/Rules"));
const Profile = React.lazy(() => import("./features/auth/pages/Profile"));
const ProfilePage = React.lazy(() => import("./features/profiles/pages/ProfilePage"));
const Payouts = React.lazy(() => import("./features/periods/pages/Payouts"));
const ReportPage = React.lazy(() => import("./features/reports/pages/ReportPage"));
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
// Chat removed — Board replaces it

import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuth } from "./auth/AuthProvider";

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
      <Routes>
        {/* Public routes outside of AppShell (no auth required) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/discover" element={<Suspense fallback={<PageLoader />}><DiscoverLeagues /></Suspense>} />

        {/* Protected routes inside AppShell */}
        <Route
          path="/*"
          element={
            user ? (
              <AppShell>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/season" element={<Season />} />
                    <Route path="/teams/:teamCode" element={<Team />} />
                    <Route path="/players" element={<Players />} />
                    <Route path="/activity" element={<ActivityPage />} />
                    <Route path="/report" element={<ReportPage />} />
                    <Route path="/report/:weekKey" element={<ReportPage />} />
                    <Route path="/transactions" element={<Navigate to="/activity" replace />} />
                    <Route path="/trades" element={<Navigate to="/activity" replace />} />
                    <Route path="/trading-block" element={<Navigate to="/board" replace />} />
                    <Route path="/board" element={<BoardPage />} />
                    <Route path="/chat" element={<Navigate to="/board" replace />} />
                    <Route path="/leagues/:id/keepers" element={<KeeperSelection />} />
                    <Route path="/auction" element={<ErrorBoundary name="auction"><Auction /></ErrorBoundary>} />
                    <Route path="/auction-results" element={<ErrorBoundary name="auction-results"><AuctionResults /></ErrorBoundary>} />
                    <Route path="/draft" element={<ErrorBoundary name="draft"><Draft /></ErrorBoundary>} />
                    <Route path="/matchup" element={<MatchupPage />} />
                    <Route path="/commissioner/:leagueId" element={<ErrorBoundary name="commissioner"><Commissioner /></ErrorBoundary>} />
                    <Route path="/admin" element={<Admin />} />
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
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
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

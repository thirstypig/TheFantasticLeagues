// client/src/App.tsx
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";

import Home from "./pages/Home";
import Season from "./features/periods/pages/Season";
import Team from "./features/teams/pages/Team";
import Players from "./features/players/pages/Players";
import ActivityPage from "./features/transactions/pages/ActivityPage";
import Login from "./features/auth/pages/Login";

import Commissioner from "./features/commissioner/pages/Commissioner";
import Admin from "./features/admin/pages/Admin";
import ArchivePage from "./features/archive/pages/ArchivePage";
import Auction from "./features/auction/pages/Auction";
import KeeperSelection from "./features/keeper-prep/pages/KeeperSelection";
import Rules from "./features/leagues/pages/Rules";
import Profile from "./features/auth/pages/Profile";
import Payouts from "./features/periods/pages/Payouts";
import Signup from "./features/auth/pages/Signup";
import ForgotPassword from "./features/auth/pages/ForgotPassword";
import ResetPassword from "./features/auth/pages/ResetPassword";

import Landing from "./features/auth/pages/Landing";
import Tech from "./pages/Tech";
import { useAuth } from "./auth/AuthProvider";

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
    <Routes>
      {/* Auth routes outside of AppShell */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes inside AppShell */}
      <Route
        path="/*"
        element={
          user ? (
            <AppShell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/season" element={<Season />} />
                <Route path="/teams/:teamCode" element={<Team />} />
                <Route path="/players" element={<Players />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/transactions" element={<Navigate to="/activity" replace />} />
                <Route path="/trades" element={<Navigate to="/activity" replace />} />
                <Route path="/leagues/:id/keepers" element={<KeeperSelection />} />
                <Route path="/auction" element={<Auction />} />
                <Route path="/commissioner/:leagueId" element={<Commissioner />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/guide" element={<Navigate to="/rules" replace />} />
                <Route path="/archive" element={<ArchivePage />} />
                {/* Redirects for removed routes */}
                <Route path="/period" element={<Navigate to="/season" replace />} />
                <Route path="/leagues" element={<Navigate to="/" replace />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/payouts" element={<Payouts />} />
                <Route path="/rules" element={<Rules />} />
                <Route path="/tech" element={<Tech />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          ) : (
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )
        }
      />
    </Routes>
  );
}

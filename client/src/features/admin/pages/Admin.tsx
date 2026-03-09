// client/src/pages/Admin.tsx
import React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";

import PageHeader from "../../../components/ui/PageHeader";
import AdminLeagueTools from "../components/AdminLeagueTools";

export default function Admin() {
  const { user } = useAuth();
  const { leagueId } = useLeague();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
       <PageHeader
          title="Admin"
          subtitle="Platform-level administration (not league commissioner tools)."
       />

       <div className="mt-8">
        {!user?.isAdmin ? (
          <div className="lg-card text-center text-sm text-[var(--lg-text-muted)]">
            Admin access required.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="lg-card space-y-4">
              <div className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)]">Platform Governance</div>
              <ul className="list-disc space-y-3 pl-5 text-sm text-[var(--lg-text-secondary)] leading-relaxed">
                <li>Global user controls (ban/disable, admin flag).</li>
                <li>League creation + emergency repair tools.</li>
                <li>Operational tools: logs, data refresh triggers, background job controls.</li>
              </ul>
            </div>

            <div className="lg-card bg-[var(--lg-accent)]/5 border-[var(--lg-accent)]/20">
              <div className="text-sm text-[var(--lg-text-primary)] font-medium">
                Note: Standard league configuration is managed via the{" "}
                <Link to={`/commissioner/${leagueId}`} className="text-[var(--lg-accent)] font-bold underline underline-offset-4 hover:brightness-110">
                  Commissioner
                </Link>
                {" "}page.
              </div>
            </div>

            <AdminLeagueTools />
          </div>
        )}
      </div>
    </div>
  );
}

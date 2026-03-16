import React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import PageHeader from "../../../components/ui/PageHeader";
import AdminLeagueTools from "../components/AdminLeagueTools";

export default function Admin() {
  const { user } = useAuth();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
       <PageHeader
          title="Admin"
          subtitle="Platform-level administration. All leagues, emergency tools, and bulk data operations."
       />

       <div className="mt-8">
        {!user?.isAdmin ? (
          <div className="lg-card p-16 text-center text-sm text-[var(--lg-text-muted)]">
            Admin access required.
          </div>
        ) : (
          <AdminLeagueTools />
        )}
      </div>
    </div>
  );
}

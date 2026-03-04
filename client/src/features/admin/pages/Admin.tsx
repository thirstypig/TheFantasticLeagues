// client/src/pages/Admin.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getMe, AuthUser } from "../../../api";

import PageHeader from "../../../components/ui/PageHeader";

export default function Admin() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const resp = await getMe();
        if (!mounted) return;
        setMe(resp.user);
      } catch (e: unknown) {
        if (!mounted) return;
        const errMsg = e instanceof Error ? e.message : "Failed to load /auth/me.";
        setError(errMsg);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-transparent">
       <PageHeader 
          title="Admin" 
          subtitle="Platform-level administration (not league commissioner tools)."
       />
       
       <div className="px-10 py-8 mx-auto max-w-4xl w-full">
        {loading ? (
          <div className="lg-card text-center text-sm text-[var(--lg-text-muted)] opacity-60">
            Loading…
          </div>
        ) : error ? (
          <div className="lg-card text-center text-sm text-[var(--lg-error)] bg-[var(--lg-error)]/5 border-[var(--lg-error)]/20">
            {error}
          </div>
        ) : !me ? (
          <div className="lg-card text-center text-sm text-[var(--lg-text-muted)]">
            You are not logged in.
          </div>
        ) : !me.isAdmin ? (
          <div className="lg-card text-center text-sm text-[var(--lg-text-muted)]">
            Admin access required.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="lg-card space-y-4">
              <div className="text-xl font-bold tracking-tight text-[var(--lg-text-heading)]">Platform Governance</div>
              <ul className="list-disc space-y-3 pl-5 text-sm text-[var(--lg-text-secondary)] leading-relaxed">
                <li>Global user controls (ban/disable, admin flag).</li>
                <li>League creation + emergency repair tools.</li>
                <li>Operational tools: logs, data refresh triggers, background job controls.</li>
              </ul>
            </div>

            <div className="lg-card bg-[var(--lg-accent)]/5 border-[var(--lg-accent)]/20">
              <div className="text-sm text-[var(--lg-text-primary)] font-medium">
                Note: Standard league configuration is managed via the{" "}
                <Link to="/leagues" className="text-[var(--lg-accent)] font-bold underline underline-offset-4 hover:brightness-110">
                  Leagues Module
                </Link>
                .
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

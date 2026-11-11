import React from "react";
import { useIsCommissioner } from "../../../hooks/useIsCommissioner";

/** Renders children for admins and the league's commissioners; everyone else sees a notice and nothing else. */
export function CommissionerOnly({ leagueId, children }: { leagueId: number; children: React.ReactNode }) {
  const allowed = useIsCommissioner(leagueId);
  if (!allowed) {
    return (
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <p style={{ margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>Commissioners only.</p>
      </div>
    );
  }
  return <>{children}</>;
}

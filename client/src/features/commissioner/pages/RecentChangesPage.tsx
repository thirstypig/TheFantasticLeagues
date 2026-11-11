// Read-only full list of commissioner audit actions (limit 50).
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { getLeaguePeriods, getRecentChanges, type HubPeriod, type RecentChange } from "../api";
import { describeChange } from "../lib/recentChangeCopy";
import { MUTED } from "../components/cardParts";
import { CommissionerOnly } from "../components/CommissionerOnly";

function RecentChangesPageBody() {
  const leagueId = Number(useParams().leagueId);
  const [changes, setChanges] = useState<RecentChange[] | null>(null);
  const [periods, setPeriods] = useState<HubPeriod[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    getRecentChanges(leagueId, 50).then((c) => live && setChanges(c), () => live && setError(true));
    // Period names are a nicety; copy falls back to "#id" without them.
    getLeaguePeriods(leagueId).then((p) => live && setPeriods(p), () => {});
    return () => { live = false; };
  }, [leagueId]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px 32px" }}>
      <Link
        to={`/commissioner/${leagueId}`}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 17, color: "var(--am-text-muted)" }}
      >
        ‹ Commissioner
      </Link>
      <SectionLabel>Recent changes</SectionLabel>
      <Glass padded={false}>
        {error ? (
          <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-negative)" }}>Couldn’t load recent changes.</p>
        ) : changes === null ? (
          <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>Loading…</p>
        ) : changes.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 17, color: "var(--am-text-muted)" }}>Nothing yet.</p>
        ) : (
          changes.map((c) => (
            <div key={c.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--am-border)", minHeight: 44 }}>
              <div style={{ fontSize: 17, color: "var(--am-text)" }}>{describeChange(c, periods)}</div>
              <div style={MUTED}>
                {c.userName ?? "System"} · {new Date(c.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </Glass>
      <p style={{ ...MUTED, marginTop: 12 }}>
        Older actions from before this feature may not appear.
      </p>
    </div>
  );
}

export default function RecentChangesPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><RecentChangesPageBody /></CommissionerOnly>;
}

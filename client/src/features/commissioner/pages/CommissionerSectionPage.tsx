// Job-route wrapper: renders ONE existing Commissioner pane under
// /commissioner/:leagueId/:section, without the top-level tab strip.
import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Commissioner, { type CommissionerProps } from "./Commissioner";

const SECTIONS: Record<string, Pick<CommissionerProps, "section" | "opsSubTab">> = {
  rosters:  { section: "ops", opsSubTab: "roster" },
  trades:   { section: "ops", opsSubTab: "trades" },
  money:    { section: "finances" },
  settings: { section: "settings" },
  owners:   { section: "people" },
  overview: { section: "overview" },
  archive:  { section: "archive" },
};

export default function CommissionerSectionPage() {
  const { leagueId, section } = useParams();
  const props = section && Object.prototype.hasOwnProperty.call(SECTIONS, section) ? SECTIONS[section] : null;
  if (!props) return <Navigate to={`/commissioner/${leagueId}`} replace />;

  return (
    <>
      <Link
        to={`/commissioner/${leagueId}`}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", fontSize: 17, color: "var(--am-text-muted)" }}
      >
        ‹ Commissioner
      </Link>
      <Commissioner key={section} {...props} hideTabs />
    </>
  );
}

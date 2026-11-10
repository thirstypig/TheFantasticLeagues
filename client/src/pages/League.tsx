import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Glass, SectionLabel } from "../components/aurora/atoms";
import { useLeague } from "../contexts/LeagueContext";
import { useSeasonGating } from "../hooks/useSeasonGating";
import { useCanAccessCommissioner } from "../hooks/useCanAccessCommissioner";
import { buildLeagueSections } from "../lib/navModel";

/** League tab landing page, shared by the desktop and mobile shells. */
export default function League() {
  const { leagueId, draftMode } = useLeague();
  const gating = useSeasonGating();
  const canAccessCommissioner = useCanAccessCommissioner();

  const sections = buildLeagueSections({
    leagueId,
    draftMode,
    seasonStatus: gating.seasonStatus,
    canAuction: gating.canAuction,
    canViewAuctionResults: gating.canViewAuctionResults,
    canKeepers: gating.canKeepers,
    isH2H: gating.isH2H,
    canAccessCommissioner,
  });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--am-text)", margin: 0 }}>League</h1>
      {sections.map((section) => (
        <Glass key={section.title} padded={false}>
          <SectionLabel style={{ padding: "12px 16px 0" }}>{section.title}</SectionLabel>
          {section.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: 48,
                padding: "0 16px",
                fontSize: 16,
                color: "var(--am-text)",
                textDecoration: "none",
                borderTop: "1px solid var(--am-border)",
              }}
            >
              <span>{link.label}</span>
              <ChevronRight size={18} color="var(--am-text-faint)" aria-hidden />
            </Link>
          ))}
        </Glass>
      ))}
    </div>
  );
}

import { useLeague } from "../../../contexts/LeagueContext";
import LeagueBoard from "../components/LeagueBoard";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";

export default function BoardPage() {
  const { leagueId } = useLeague();

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ League Board</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          League Board
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          Commissioner announcements, trade block, and league banter — all in one place.
        </div>
      </Glass>
      <LeagueBoard leagueId={leagueId} />
    </div>
  );
}

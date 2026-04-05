import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import LeagueBoard from "../components/LeagueBoard";

export default function BoardPage() {
  const { leagueId } = useLeague();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="League Board"
        subtitle="Cards, discussions, and league activity"
      />
      <LeagueBoard leagueId={leagueId} />
    </div>
  );
}

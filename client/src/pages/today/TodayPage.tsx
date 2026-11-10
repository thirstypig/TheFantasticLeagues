import { Link } from "react-router-dom";
import { useLeague } from "../../contexts/LeagueContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useTodayData } from "./useTodayData";
import { periodHeader, summarizeRank, wireReminder } from "./todayModel";
import { NewsSection, RankCard, Skeleton, StandingsSection, TonightSection, WireNote } from "./sections";
import "./today.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TodayPage() {
  const { leagueId, leagues, currentLeagueName, currentSeason, myTeamId, myTeamCode, myTeamResolved } = useLeague();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const hasTeam = myTeamId != null;
  const activeLeagueId = leagueId ? leagueId : null;
  const data = useTodayData(myTeamResolved ? activeLeagueId : null, hasTeam);

  if (activeLeagueId == null && leagues.length === 0) {
    return (
      <main className="today">
        <h1 className="today-title">Today</h1>
        <p className="today-quiet">You&apos;re not in a league yet.</p>
        <Link className="today-sec-link" to="/discover">
          Find a league ›
        </Link>
      </main>
    );
  }

  const now = new Date();
  const dateLabel = `${WEEKDAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const header = data.periods.status === "ok" ? periodHeader(data.periods.data, now) : null;
  // Phone shows the league name too: the MobileShell top bar already says
  // "Today", so the H1 is visually hidden there and this line carries context.
  const sub = [
    currentLeagueName ? (desktop ? `${currentLeagueName} ${currentSeason}` : currentLeagueName) : null,
    header?.name,
    header?.label,
    dateLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const summary =
    data.standings.status === "ok"
      ? summarizeRank(data.standings.data.rows, myTeamId, data.standings.data.periodNames)
      : null;
  const activePeriod = data.periods.status === "ok" ? header != null : null;
  const reminder =
    hasTeam && myTeamCode && data.wirePeriod.status === "ok" ? wireReminder(data.wirePeriod.data, now) : null;
  const code = myTeamCode ?? "";

  return (
    <main className="today">
      <header className="today-header">
        <h1 className="today-title today-sr-only">Today</h1>
        <div className="today-sub">{sub}</div>
      </header>
      <div className="today-grid">
        <div className="today-col">
          {reminder && <WireNote text={reminder.text} teamCode={code} />}
          <RankCard standings={data.standings} summary={summary} hasTeam={hasTeam} activePeriod={activePeriod} />
          {hasTeam && <NewsSection news={data.news} now={now} />}
          {hasTeam && code && activePeriod !== false && data.periods.status !== "error" &&
            (data.periods.status === "loading" ? (
              <Skeleton label="tonight" />
            ) : (
              <TonightSection tonight={data.tonight} teamCode={code} />
            ))}
        </div>
        <div className="today-col">
          <StandingsSection standings={data.standings} myTeamId={myTeamId} desktop={desktop} />
        </div>
      </div>
    </main>
  );
}

export default TodayPage;

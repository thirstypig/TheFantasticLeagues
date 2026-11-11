import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PlayerLink } from "../../components/shared/playerCard/PlayerCardProvider";
import {
  classifyNews,
  formatLine,
  orderTonight,
  standingsPreview,
  type MyPlayerToday,
  type NewsItem,
  type PlayerNewsTx,
  type RankSummary,
  type TodayStandingsRow,
} from "./todayModel";
import type { Source } from "./useTodayData";

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

export function Skeleton({ label }: { label: string }) {
  return <div className="today-skel" aria-busy="true" aria-label={`Loading ${label}`} />;
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="today-section" aria-label={title}>
      <div className="today-sec-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// ─── Wire List reminder ────────────────────────────────────────────────

export function WireNote({ text, teamCode }: { text: string; teamCode: string }) {
  return (
    <Link className="today-note" to={`/teams/${teamCode}/wire-list`}>
      <span aria-hidden="true">🗓</span>
      <span>
        <b>Adds &amp; drops:</b> {text}
      </span>
    </Link>
  );
}

// ─── Rank card ─────────────────────────────────────────────────────────

function gapText(gap: NonNullable<RankSummary["gap"]>): string {
  if (gap.kind === "tied") return `tied with ${gap.teamName}`;
  if (gap.kind === "ahead") return `${gap.points} ahead of ${gap.teamName} (2nd)`;
  return `${gap.points} behind ${gap.teamName}${gap.rank != null ? ` (${ordinal(gap.rank)})` : ""}`;
}

export function RankCard({
  standings,
  summary,
  hasTeam,
  activePeriod,
}: {
  standings: Source<unknown>;
  summary: RankSummary | null;
  hasTeam: boolean;
  /** null while the period list is loading; true/false once known. */
  activePeriod: boolean | null;
}) {
  if (standings.status === "loading") return <Skeleton label="rank" />;
  if (standings.status === "error") {
    return (
      <div className="today-card">
        <div className="today-meta">Standings are unavailable right now.</div>
      </div>
    );
  }
  if (!hasTeam || !summary) {
    return (
      <div className="today-card">
        <div className="today-meta">
          {hasTeam ? "Your rank shows up once scoring starts." : "You're not on a team in this league"}
        </div>
      </div>
    );
  }
  const { rank, trend, trendSince, gap, totalPoints, teamCount } = summary;
  let meta: string;
  if (activePeriod === false) {
    meta = `Final · ${ordinal(rank)} of ${teamCount}`;
  } else {
    meta = `${totalPoints} pts${gap ? ` · ${gapText(gap)}` : ""}`;
  }
  return (
    <div className="today-card">
      <div className="today-rank">
        <span className="today-rank-big">You&apos;re {ordinal(rank)}</span>
        {trend != null &&
          trendSince != null &&
          (trend > 0 ? (
            <span className="today-up">▲ {trend} since {trendSince}</span>
          ) : trend < 0 ? (
            <span className="today-down">▼ {Math.abs(trend)} since {trendSince}</span>
          ) : (
            <span className="today-flat">Same as {trendSince}</span>
          ))}
      </div>
      <div className="today-meta">{meta}</div>
    </div>
  );
}

// ─── Player news ───────────────────────────────────────────────────────

const ICON: Record<NewsItem["kind"], string> = {
  "il-placed": "✚",
  "il-activated": "✓",
  "sent-down": "↓",
  "called-up": "↑",
  traded: "⇄",
  claimed: "⇄",
  dfa: "✕",
  released: "✕",
};

export function NewsSection({ news, now }: { news: Source<PlayerNewsTx[]>; now: Date }) {
  if (news.status === "error") return null;
  const items = news.status === "ok" ? classifyNews(news.data, now) : [];
  return (
    <Section title="Your player news" right={<span className="today-sec-note">Past 7 days</span>}>
      {news.status === "loading" ? (
        <Skeleton label="player news" />
      ) : (
        <div className="today-card">
          {items.length === 0 ? (
            <div className="today-quiet">No news on your players in the past 7 days.</div>
          ) : (
            items.map((n) => (
              <div className="today-item" key={n.key}>
                <span className={`today-ic today-ic-${n.tone}`} aria-hidden="true">
                  {ICON[n.kind]}
                </span>
                <div className="today-item-body">
                  <div className="today-item-title">
                    {n.title}
                    {n.leavesNl && <span className="today-tag">Leaves the NL</span>}
                  </div>
                  {n.detail && <div className="today-item-detail">{n.detail}</div>}
                </div>
                <span className="today-when">{n.when}</span>
              </div>
            ))
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Tonight ───────────────────────────────────────────────────────────

export function TonightSection({
  tonight,
  teamCode,
}: {
  tonight: Source<MyPlayerToday[]>;
  teamCode: string;
}) {
  if (tonight.status === "error") return null;
  const total = tonight.status === "ok" ? tonight.data.length : 0;
  const { shown, more } = tonight.status === "ok" ? orderTonight(tonight.data) : { shown: [], more: 0 };
  return (
    <Section
      title="Tonight"
      right={
        tonight.status === "ok" && total > 0 ? (
          <Link className="today-sec-link" to={`/teams/${teamCode}`}>
            All {total} ›
          </Link>
        ) : undefined
      }
    >
      {tonight.status === "loading" ? (
        <Skeleton label="tonight" />
      ) : (
        <div className="today-card">
          {total === 0 ? (
            <div className="today-quiet">No games for your players today.</div>
          ) : (
            <>
              {shown.map((p) => {
                const live = p.gameStatus === "LIVE";
                const final = p.gameStatus === "FINAL";
                const desc = p.gameStateDesc ?? "";
                // PRE: the sub-line already carries the start time, so no chip.
                const chip = live ? (desc && desc !== "LIVE" ? `LIVE ${desc}` : "LIVE") : final ? "FINAL" : null;
                const status =
                  formatLine(p) ?? (live ? "" : final ? (desc !== "FINAL" ? desc : "") : desc);
                return (
                  <div className="today-pl" key={`${p.mlbId}-${p.playerName}`}>
                    <div>
                      <div className="today-pl-name" data-testid="tonight-name">
                        <PlayerLink mlbId={p.mlbId} name={p.playerName} />
                        {p.posPrimary && <span className="today-pos">{p.posPrimary}</span>}
                      </div>
                      <div className="today-pl-sub">
                        {p.mlbTeam} {p.homeAway === "home" ? "vs" : "@"} {p.opponent}
                        {status ? ` · ${status}` : ""}
                      </div>
                    </div>
                    {chip && <span className={live ? "today-chip today-chip-live" : "today-chip"}>{chip}</span>}
                  </div>
                );
              })}
              {more > 0 && <div className="today-more">{more} more playing</div>}
            </>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Standings ─────────────────────────────────────────────────────────

export function StandingsSection({
  standings,
  myTeamId,
  desktop,
}: {
  standings: Source<{ rows: TodayStandingsRow[]; periodNames: string[] }>;
  myTeamId: number | null;
  desktop: boolean;
}) {
  const seeAll = (
    <Link className="today-sec-link" to="/season">
      {desktop ? "See all & by category ›" : "See all ›"}
    </Link>
  );
  if (standings.status === "error") return null;
  if (standings.status === "loading") {
    return (
      <Section title="Standings" right={seeAll}>
        <Skeleton label="standings" />
      </Section>
    );
  }
  const rows = standings.data.rows;
  const { top, mine } = standingsPreview(rows, myTeamId, desktop ? rows.length : 5);
  const line = (r: (typeof top)[number]) => (
    <tr key={r.teamId} data-testid="standings-row" className={r.teamId === myTeamId ? "today-me" : undefined}>
      <td className="today-k">{r.rank}</td>
      <td>
        {r.teamName}
        {r.teamId === myTeamId ? " (you)" : ""}
      </td>
      <td className="today-r">{Math.round(r.totalPoints * 10) / 10}</td>
    </tr>
  );
  return (
    <Section title="Standings" right={seeAll}>
      <div className="today-card today-card-table">
        <table className="today-table">
          <tbody>
            {top.map(line)}
            {mine && (
              <>
                <tr className="today-sep" aria-hidden="true">
                  <td colSpan={3}>⋯</td>
                </tr>
                {line(mine)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

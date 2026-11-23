// Trophy case: every champion, then the all-time leaderboard of owners ranked
// by average finish. Tapping an owner opens their profile below the table —
// team names over the years, titles, and the players they kept most often.
// Rebuilt from the commissioner's workbooks, so it can be incomplete.
import React, { useEffect, useRef, useState } from "react";
import { getTrophyCase, type OwnerProfile, type TrophyCaseData } from "../api";
import { seasonRanges } from "../lib/seasonView";

const span = (from: number, to: number) => (from === to ? String(from) : `${from}–${to}`);

function Profile({ profile, keeperSeasons }: { profile: OwnerProfile; keeperSeasons: number[] }) {
  const firstKeeperYear = keeperSeasons[0];
  return (
    <>
      <div className="arc-detail-head">
        <h2>{profile.owner ?? profile.teams[0]?.name}</h2>
        <span className="arc-note">{profile.titleYears.length ? `${profile.titleYears.length} ${profile.titleYears.length === 1 ? "title" : "titles"}: ${profile.titleYears.join(", ")}` : "No titles yet"}</span>
      </div>
      <div className="arc-cols">
        <section className="arc-section" aria-label="Teams">
          <h3>Teams</h3>
          <ul className="arc-roster">
            {profile.teams.map((t) => (
              <li key={`${t.name}-${t.from}`}><span className="arc-pname">{t.name}</span><span className="arc-price">{span(t.from, t.to)}</span></li>
            ))}
          </ul>
        </section>
        <section className="arc-section" aria-label="Favorite keepers">
          <h3>Favorite keepers</h3>
          {profile.favoriteKeepers.length === 0 ? (
            <p className="arc-note">No player kept more than one season{firstKeeperYear ? ` since ${firstKeeperYear}` : ""}.</p>
          ) : (
            <ul className="arc-roster">
              {profile.favoriteKeepers.map((k) => (
                <li key={`${k.name}-${k.seasons[0]}`}>
                  <span className="arc-pname">
                    {k.mlbId ? <a href={`https://www.mlb.com/player/${k.mlbId}`} target="_blank" rel="noopener noreferrer">{k.name}</a> : k.name}
                    <span className="arc-teamname">{seasonRanges(k.seasons)}</span>
                  </span>
                  <span className="arc-price">{k.seasons.length} {k.seasons.length === 1 ? "season" : "seasons"}{k.possible ? " *" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {profile.favoriteKeepers.some((k) => k.possible) && (
        <p className="arc-note" style={{ fontSize: 13 }}>
          * Includes seasons without a keeper list in the workbook, where a keeper means the same team at the same price as last season — kept, or bought back for that price.
        </p>
      )}
    </>
  );
}

export default function TrophyCaseTab({ leagueId }: { leagueId: number }) {
  const [data, setData] = useState<TrophyCaseData | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    getTrophyCase(leagueId).then((d) => live && setData(d), () => live && setError(true));
    return () => { live = false; };
  }, [leagueId]);

  useEffect(() => {
    if (open) profileRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [open]);

  if (error) return <p role="alert" className="arc-error">Couldn’t load the trophy case. Reload to try again.</p>;
  if (!data) return <div className="arc-card arc-skeleton" aria-busy="true"><div /><div /><div /></div>;
  if (data.allTimeStandings.length === 0) return <p className="arc-note">No archived seasons yet.</p>;

  const profile = open ? data.profiles[open] : null;
  const years = data.championships.map((c) => c.year);

  return (
    <>
      <p className="arc-note" style={{ fontSize: 13 }}>
        Rebuilt from the commissioner’s workbooks{years.length ? ` (${Math.min(...years)}–${Math.max(...years)})` : ""}. Some seasons are missing sheets, so parts of this are incomplete or approximate.
      </p>

      <section aria-label="Champions">
        <h2 className="arc-section-title">Champions</h2>
        <div className="arc-banners">
          {[...data.championships].reverse().map((c) => (
            <div key={c.year} className="arc-card arc-banner">
              <span className="arc-banner-year">{c.year}</span>
              <span className="arc-owner">{c.owner ?? c.teamName}</span>
              {c.owner && <span className="arc-teamname">{c.teamName}</span>}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="All-time leaderboard">
        <h2 className="arc-section-title">All-time leaderboard</h2>
        <div className="arc-card arc-scroll">
          <table className="arc-table arc-board">
            <thead>
              <tr>
                <th className="arc-rank" scope="col">#</th>
                <th className="arc-team" scope="col">Owner</th>
                <th scope="col">Avg finish</th>
                <th scope="col">Titles</th>
                <th scope="col">Seasons</th>
              </tr>
            </thead>
            <tbody>
              {data.allTimeStandings.map((row, i) => {
                const isOpen = row.key === open;
                return (
                  <tr key={row.key} className={isOpen ? "is-open" : ""} onClick={() => setOpen(isOpen ? null : row.key)}>
                    <td className="arc-rank">{i + 1}</td>
                    <td className="arc-team">
                      <button type="button" className="arc-teambtn" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : row.key); }}>
                        <span className="arc-owner">{row.owner ?? row.teamName}</span>
                        {row.owner && <span className="arc-teamname">{row.teamNames.join(" · ")}</span>}
                      </button>
                    </td>
                    <td className="arc-total">{row.avgRank.toFixed(2)}</td>
                    <td>{row.championships || "—"}</td>
                    <td>{row.seasons}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="arc-note" style={{ fontSize: 13, marginTop: 8 }}>Average finishing place across every season played, best first. Tap an owner for their teams and favorite keepers.</p>
      </section>

      {profile && (
        <div ref={profileRef} className="arc-card arc-detail" aria-live="polite">
          <Profile profile={profile} keeperSeasons={data.keeperSeasons} />
        </div>
      )}
    </>
  );
}

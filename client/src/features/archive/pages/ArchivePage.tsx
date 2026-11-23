// Past-seasons archive (/archive), built from the commissioner's workbooks
// (2003–2025). A season opens on its final standings; tapping a team shows its
// draft and keepers, the moves at every meeting, and its final roster, below
// the table — no modal. Player stat lines arrive with the re-score.
//
// URL: ?season=2012&team=DDG (or &tab=trophy), so a link lands on the same view.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ArchiveRosterEntry, ArchiveSeasonListResponse, ArchiveSeasonResponse, ArchiveSeasonTeam } from "@shared/api/archiveSeason";
import { ApiError } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import TrophyCaseTab from "../components/TrophyCaseTab";
import { getArchiveHistory, getArchiveSeason } from "../historyApi";
import { fmtPoints, ordinal, playerName, priceLabel, seasonGaps, shortDate } from "../lib/seasonView";
import "../archive.css";

type Load<T> = { state: "loading" } | { state: "forbidden" } | { state: "error" } | { state: "ready"; data: T };

const failed = (err: unknown): Load<never> => ({ state: err instanceof ApiError && err.status === 403 ? "forbidden" : "error" });

function Who({ team }: { team: Pick<ArchiveSeasonTeam, "owner" | "name"> }) {
  return (
    <>
      <span className="arc-owner">{team.owner ?? team.name}</span>
      {team.owner && <span className="arc-teamname">{team.name}</span>}
    </>
  );
}

function Player({ e }: { e: ArchiveRosterEntry }) {
  const name = playerName(e);
  return e.mlbId
    ? <a href={`https://www.mlb.com/player/${e.mlbId}`} target="_blank" rel="noopener noreferrer" title={e.name !== name ? `Written “${e.name}”` : undefined}>{name}</a>
    : <>{name}</>;
}

function Roster({ entries, keeperLabel, prices }: { entries: ArchiveRosterEntry[]; keeperLabel?: string; prices?: boolean }) {
  return (
    <ul className="arc-roster">
      {entries.map((e, i) => (
        <li key={`${e.slot}-${e.name}-${i}`}>
          <span className="arc-slot">{e.slot}</span>
          <span className="arc-pname">
            <Player e={e} />
            {keeperLabel && e.keeper && <span className="arc-keeper">{keeperLabel}</span>}
          </span>
          {prices && <span className="arc-price">{priceLabel(e)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** "Apr 21 meeting · before period 2"; period 1 is the changes after the draft, at no meeting. */
function meetingLabel(period: number, meetingDate: string | null): string {
  if (period === 1) return "After the draft";
  const day = shortDate(meetingDate);
  return day ? `${day} meeting · before period ${period}` : `Before period ${period}`;
}

function TeamDetail({ season, team }: { season: ArchiveSeasonResponse; team: ArchiveSeasonTeam }) {
  const roster = season.rosters[team.code] ?? { draft: [], final: [] };
  const keeperLabel = season.keepersFromSheet ? "keeper" : "possible keeper";
  const keepers = roster.draft.filter((e) => e.keeper).length;
  const moves = season.moves
    .map((m) => ({ period: m.period, meetingDate: m.meetingDate, ...(m.byTeam[team.code] ?? { added: [], dropped: [] }) }))
    .filter((m) => m.added.length || m.dropped.length);

  return (
    <>
      <div className="arc-detail-head">
        <h2>{team.owner ?? team.name}</h2>
        <span className="arc-note">
          {team.owner ? `${team.name} · ` : ""}{team.rank ? `${ordinal(team.rank)}, ` : ""}{fmtPoints(team.total)} points
        </span>
      </div>
      {team.note && <p className="arc-note"><span className="arc-flag">Note: </span>{team.note}</p>}
      <div className="arc-cols">
        <section className="arc-section" aria-label="Draft day">
          <h3>Draft day{keepers ? ` · ${keepers} ${keepers === 1 ? keeperLabel : `${keeperLabel}s`}` : ""}</h3>
          {roster.draft.length
            ? <Roster entries={roster.draft} keeperLabel={keeperLabel} prices />
            : <p className="arc-note">The {season.year} workbook has no draft sheet.</p>}
          {!season.keepersFromSheet && keepers > 0 && (
            <p className="arc-note" style={{ marginTop: 6, fontSize: 13 }}>Possible keeper: on this team at the same price as last season — kept, or bought back for that price.</p>
          )}
        </section>
        <section className="arc-section" aria-label="Moves at each meeting">
          <h3>Moves at each meeting</h3>
          {!season.hasMoves ? (
            <p className="arc-note">The {season.year} workbook doesn’t have a roster for each meeting, so the moves aren’t known. Compare the draft and final rosters.</p>
          ) : moves.length === 0 ? (
            <p className="arc-note">No moves all season.</p>
          ) : moves.map((m) => (
            <div key={m.period} className="arc-meeting">
              <strong>{meetingLabel(m.period, m.meetingDate)}</strong>
              {m.added.map((e, i) => <div key={`a${i}`} className="arc-add">+ <Player e={e} /> <span className="arc-price">{e.slot}</span></div>)}
              {m.dropped.map((e, i) => <div key={`d${i}`} className="arc-drop">− <Player e={e} /></div>)}
            </div>
          ))}
        </section>
        <section className="arc-section" aria-label="End of season">
          <h3>End of season</h3>
          {roster.final.length
            ? <Roster entries={roster.final} />
            : <p className="arc-note">The {season.year} workbook has no final roster.</p>}
        </section>
      </div>
    </>
  );
}

function SeasonView({ season, openCode, setOpen }: { season: ArchiveSeasonResponse; openCode: string | null; setOpen: (code: string | null) => void }) {
  const detailRef = useRef<HTMLDivElement>(null);
  const open = season.teams.find((t) => t.code === openCode) ?? null;
  const champ = season.teams.find((t) => t.rank === 1);
  const periods = Array.from({ length: season.periodCount }, (_, i) => i + 1);
  const gaps = seasonGaps(season);

  useEffect(() => {
    if (open) detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [open]);

  return (
    <>
      {champ && (
        <div className="arc-card arc-champ">
          <span className="arc-note">{season.year} champion</span>
          <strong>{champ.owner ?? champ.name}</strong>
          {champ.owner && <span className="arc-note">{champ.name} · {fmtPoints(champ.total)} points</span>}
        </div>
      )}

      <p className="arc-note arc-hint">Tap a team to see its draft, its moves at each meeting and its final roster.</p>
      <div className="arc-card arc-scroll" role="region" aria-label={`${season.year} standings`} tabIndex={0}>
        <table className="arc-table">
          <thead>
            <tr>
              <th className="arc-rank" scope="col">#</th>
              <th className="arc-team" scope="col">Owner</th>
              {periods.map((p) => {
                const end = shortDate(season.periodEnds[p - 1]);
                return (
                  <th key={p} scope="col" title={end ? `Period ${p} ended ${end}` : undefined}>
                    P{p}{end && <span className="arc-th-date">{end}</span>}
                  </th>
                );
              })}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {season.teams.map((t) => {
              const isOpen = t.code === openCode;
              return (
                <tr key={t.code} className={isOpen ? "is-open" : ""} onClick={() => setOpen(isOpen ? null : t.code)}>
                  <td className="arc-rank">{t.rank ?? "—"}</td>
                  <td className="arc-team">
                    <button type="button" className="arc-teambtn" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? null : t.code); }}>
                      <Who team={t} />
                    </button>
                  </td>
                  {periods.map((p) => <td key={p}>{fmtPoints(t.points[p - 1] ?? null)}</td>)}
                  <td className="arc-total">{fmtPoints(t.total)}{t.note && <span className="arc-flag" title={t.note}> *</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="arc-note" style={{ fontSize: 13 }}>
        Points per scoring period as recorded in the commissioner’s workbook{season.periodEnds.some(Boolean) ? "; each date is the day that period ended, and the meeting that day set the next period’s rosters" : ""}.
        {season.teams.some((t) => t.note) ? " * The workbook’s numbers don’t add up here; tap the team for details." : ""}
      </p>
      <p className="arc-note arc-disclaimer" role="note">
        Rebuilt from the commissioner’s old workbooks, so some seasons are incomplete and may have mistakes.
        {gaps.length > 0 ? ` The ${season.year} workbook is missing ${gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}` : gaps[0]}.` : ""}
      </p>

      {open && (
        <div ref={detailRef} className="arc-card arc-detail" aria-live="polite">
          <TeamDetail season={season} team={open} />
        </div>
      )}
    </>
  );
}

export default function ArchivePage() {
  const { leagueId } = useLeague();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<Load<ArchiveSeasonListResponse>>({ state: "loading" });
  const [season, setSeason] = useState<Load<ArchiveSeasonResponse>>({ state: "loading" });

  const years = useMemo(() => (list.state === "ready" ? list.data.seasons.map((s) => s.year) : []), [list]);
  const asked = Number(params.get("season"));
  const year = years.includes(asked) ? asked : years[0] ?? null;
  const tab = params.get("tab") === "trophy" ? "trophy" : "season";
  const openCode = params.get("team");

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v == null ? p.delete(k) : p.set(k, v));
    setParams(p, { replace: true });
  };

  useEffect(() => {
    let live = true;
    getArchiveHistory().then((data) => live && setList({ state: "ready", data }), (err) => live && setList(failed(err)));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (year == null) return;
    let live = true;
    setSeason({ state: "loading" });
    getArchiveSeason(year).then((data) => live && setSeason({ state: "ready", data }), (err) => live && setSeason(failed(err)));
    return () => { live = false; };
  }, [year]);

  const header = (
    <header>
      <h1 className="arc-title">Archive</h1>
      <p className="arc-lede">Every OGBA season from the commissioner’s workbooks, 2003–2025.</p>
    </header>
  );

  if (list.state === "loading") return <div className="arc-page">{header}<div className="arc-card arc-skeleton" aria-busy="true"><div /><div /><div /></div></div>;
  if (list.state === "forbidden") return <div className="arc-page">{header}<p className="arc-lede">The archive is open to league members only.</p></div>;
  if (list.state === "error") return <div className="arc-page">{header}<p role="alert" className="arc-error">Couldn’t load the archive. Reload the page to try again.</p></div>;
  if (year == null) return <div className="arc-page">{header}<p className="arc-lede">No seasons have been archived yet.</p></div>;

  const idx = years.indexOf(year);
  const goTo = (y: number) => update({ season: String(y), team: null });

  return (
    <div className="arc-page">
      {header}
      <div className="arc-bar">
        {tab === "season" && (
          <>
            <button type="button" className="arc-step" aria-label="Previous season" disabled={idx >= years.length - 1} onClick={() => goTo(years[idx + 1])}>‹</button>
            <select className="arc-field" aria-label="Season" value={year} onChange={(e) => goTo(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" className="arc-step" aria-label="Next season" disabled={idx <= 0} onClick={() => goTo(years[idx - 1])}>›</button>
          </>
        )}
        <div className="arc-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={tab === "season"} onClick={() => update({ tab: null })}>Season</button>
          <button type="button" role="tab" aria-selected={tab === "trophy"} onClick={() => update({ tab: "trophy", team: null })}>Trophy case</button>
        </div>
      </div>

      {tab === "trophy" ? (
        <TrophyCaseTab leagueId={leagueId} />
      ) : season.state === "loading" ? (
        <div className="arc-card arc-skeleton" aria-busy="true"><div /><div /><div /></div>
      ) : season.state !== "ready" ? (
        <p role="alert" className="arc-error">Couldn’t load {year}. Try another season or reload.</p>
      ) : (
        <SeasonView season={season.data} openCode={openCode} setOpen={(code) => update({ team: code })} />
      )}
    </div>
  );
}

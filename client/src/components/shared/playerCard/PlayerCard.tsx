// Player card: bottom sheet below 768px, 400px right panel at 768px and up.
// The one player peek the app allows (no-modals rule): the desktop panel has no
// backdrop so the list behind stays usable.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { PlayerFace } from "../PlayerFace";
import { TeamLogo } from "../TeamLogo";
import {
  addWatchlist, getPlayerCard, getWatchlistMlbIds, removeWatchlist,
} from "./playerCardApi";
import type { GameRow, PlayerCardData, RangeKey, StatGroup, StatLine } from "./playerCardApi";
import "./playerCard.css";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "last7", label: "Last 7 days" },
  { key: "last14", label: "Last 14" },
  { key: "last30", label: "Last 30" },
  { key: "season", label: "Season" },
  { key: "lastSeason", label: "Last season" },
];

const COLS: Record<StatGroup, { label: string; key: string }[]> = {
  hitting: [
    { label: "AB", key: "atBats" }, { label: "R", key: "runs" }, { label: "HR", key: "homeRuns" },
    { label: "RBI", key: "rbi" }, { label: "SB", key: "stolenBases" }, { label: "AVG", key: "avg" },
  ],
  pitching: [
    { label: "IP", key: "inningsPitched" }, { label: "W", key: "wins" }, { label: "SV", key: "saves" },
    { label: "K", key: "strikeOuts" }, { label: "ERA", key: "era" }, { label: "WHIP", key: "whip" },
  ],
};

const cell = (line: StatLine | null | undefined, key: string) => String(line?.[key] ?? "-");

function formatNextGame(g: NonNullable<PlayerCardData["nextGame"]>, mlbTeam: string | null, now = new Date()): string {
  const start = new Date(g.startUtc);
  const time = start
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");
  const sameDay = start.toDateString() === now.toDateString();
  const when = sameDay ? "tonight" : start.toLocaleDateString([], { weekday: "short" });
  return g.home ? `${mlbTeam ?? ""} vs ${g.opp} ${when} ${time}`.trim() : `@${g.opp} ${when} ${time}`;
}

function defaultRange(card: PlayerCardData): RangeKey {
  const groups = Object.keys(card.splits.season ?? {}) as StatGroup[];
  const seasonEmpty = groups.length === 0 || groups.every((g) => !card.splits.season[g]);
  return seasonEmpty ? "lastSeason" : "season";
}

export function PlayerCard({ mlbId, onClose }: { mlbId: number; onClose: () => void }) {
  const { leagueId, myTeamId } = useLeague();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstMlbId = useRef(mlbId);
  const touchY = useRef<number | null>(null);
  const [card, setCard] = useState<PlayerCardData | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [range, setRange] = useState<RangeKey>("season");
  const [group, setGroup] = useState<StatGroup>("hitting");
  const [starred, setStarred] = useState(false);
  const [starBusy, setStarBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setCard(null);
    setError(false);
    getPlayerCard(mlbId, leagueId)
      .then((c) => {
        if (!live) return;
        setCard(c);
        setRange(defaultRange(c));
        setGroup(c.isTwoWay || !c.isPitcher ? "hitting" : "pitching");
      })
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, [mlbId, leagueId, nonce]);

  useEffect(() => {
    setStarred(false);
    if (!myTeamId) return;
    let live = true;
    getWatchlistMlbIds(myTeamId)
      .then((ids) => live && setStarred(ids.has(mlbId)))
      .catch(() => {});
    return () => { live = false; };
  }, [mlbId, myTeamId]);

  // Focus into the card on open; on a player swap, move it to the new heading.
  useEffect(() => {
    if (mlbId === firstMlbId.current) dialogRef.current?.focus();
    else headingRef.current?.focus();
  }, [mlbId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Phone sheet locks page scroll; the desktop panel leaves the list usable.
  useEffect(() => {
    if (isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isDesktop]);

  const onSheetKeyDown = (e: React.KeyboardEvent) => {
    if (isDesktop || e.key !== "Tab") return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const swipe = isDesktop
    ? {}
    : {
        onTouchStart: (e: React.TouchEvent) => { touchY.current = e.touches[0]?.clientY ?? null; },
        onTouchEnd: (e: React.TouchEvent) => {
          const start = touchY.current;
          touchY.current = null;
          const end = e.changedTouches[0]?.clientY;
          if (start != null && end != null && end - start > 80) onClose();
        },
      };

  const toggleStar = useCallback(async () => {
    if (!card || !myTeamId || card.playerId == null || starBusy) return;
    setStarBusy(true);
    try {
      if (starred) await removeWatchlist(myTeamId, card.playerId);
      else await addWatchlist(myTeamId, card.playerId);
      setStarred(!starred);
    } catch {
      /* leave state unchanged */
    } finally {
      setStarBusy(false);
    }
  }, [card, myTeamId, starred, starBusy]);

  const activeGroup: StatGroup = card ? (card.isTwoWay ? group : card.isPitcher ? "pitching" : "hitting") : "hitting";
  const line = card?.splits[range]?.[activeGroup] ?? null;
  const games: GameRow[] = card?.recent[activeGroup] ?? [];
  const pitching = activeGroup === "pitching";

  return (
    <>
      {!isDesktop && <div className="pc-backdrop" data-testid="pc-backdrop" onClick={onClose} />}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={card?.name || "Player"}
        tabIndex={-1}
        aria-modal={isDesktop ? undefined : true}
        onKeyDown={onSheetKeyDown}
        className={`pc ${isDesktop ? "pc-panel" : "pc-sheet"}`}
      >
        <div className="pc-head" {...swipe}>
          <PlayerFace mlbId={mlbId} name={card?.name ?? ""} size={60} />
          <div className="pc-id">
            <h2 className="pc-name" ref={headingRef} tabIndex={-1}>{card?.name ?? ""}</h2>
            {card && (
              <div className="pc-sub">
                <span>{card.pos}</span>
                {card.mlbTeam && <TeamLogo abbr={card.mlbTeam} size={22} />}
                <span>{card.fantasyTeam ? card.fantasyTeam.name : "Free agent"}</span>
              </div>
            )}
          </div>
          {card && myTeamId && card.playerId != null && (
            <button
              type="button"
              className="pc-icon"
              aria-label={starred ? "Remove from watchlist" : "Add to watchlist"}
              aria-pressed={starred}
              disabled={starBusy}
              onClick={toggleStar}
            >
              {starred ? "★" : "☆"}
            </button>
          )}
          <button type="button" className="pc-icon" aria-label="Close" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="pc-state">
            <p>Couldn&apos;t load stats. Try again.</p>
            <button type="button" className="pc-btn" onClick={() => setNonce((n) => n + 1)}>Retry</button>
          </div>
        )}
        {!card && !error && <div className="pc-state">Loading…</div>}

        {card && (
          <div className="pc-body">
            {card.nextGame && <div className="pc-next">{formatNextGame(card.nextGame, card.mlbTeam)}</div>}

            {card.isTwoWay && (
              <div className="pc-row" role="group" aria-label="Stat group">
                {(["hitting", "pitching"] as StatGroup[]).map((g) => (
                  <button key={g} type="button" className="pc-chip" aria-pressed={activeGroup === g} onClick={() => setGroup(g)}>
                    {g === "hitting" ? "Hitting" : "Pitching"}
                  </button>
                ))}
              </div>
            )}

            <div className="pc-row" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r.key} type="button" className="pc-chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>

            {line ? (
              <div className="pc-stats">
                {COLS[activeGroup].map((c) => (
                  <div key={c.label} className="pc-stat">
                    <span className="pc-stat-l">{c.label}</span>
                    <span className="pc-stat-v">{cell(line, c.key)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pc-state">No games yet</div>
            )}

            <h3 className="pc-cap">{pitching ? "Last 3 starts" : "Last 5 games"}</h3>
            {games.length === 0 ? (
              <div className="pc-state">No games yet</div>
            ) : (
              <table className="pc-games">
                <thead>
                  <tr>
                    {(pitching ? ["Date", "Opp", "IP", "H", "ER", "K"] : ["Date", "Opp", "H-AB", "HR", "RBI", "SB"]).map((h) => (
                      <th key={h} scope="col">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.date}>
                      <td>{g.date.slice(5).replace("-", "/")}</td>
                      <td>{g.home ? g.opp : `@${g.opp}`}</td>
                      {pitching ? (
                        <>
                          <td>{cell(g.line, "inningsPitched")}</td><td>{cell(g.line, "hits")}</td>
                          <td>{cell(g.line, "earnedRuns")}</td><td>{cell(g.line, "strikeOuts")}</td>
                        </>
                      ) : (
                        <>
                          <td>{`${cell(g.line, "hits")}-${cell(g.line, "atBats")}`}</td><td>{cell(g.line, "homeRuns")}</td>
                          <td>{cell(g.line, "rbi")}</td><td>{cell(g.line, "stolenBases")}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Link className="pc-full" to={`/players/${mlbId}`} onClick={onClose}>Full profile ›</Link>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Screen 11 · Team board (Style Bible). Every team's roster by position group.
 *
 * Desktop (>= 768px): a grid, teams as columns; rows are `Left · max` then
 * each position group. Phone (< 768px): a row of team chips and one team's
 * grouped card. Plain props so the live auction's phone "Board" tab, the
 * /auction/board route and the /auction-results page all reuse it.
 */
import React, { useState } from 'react';
import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import { PlayerLink } from '../../../../components/shared/playerCard/PlayerCardProvider';
import type { AuctionTeam, ClientAuctionState } from '../../hooks/useAuctionState';
import { boardGroups, teamNeeds, type BoardGroup, type BoardPlayer } from '../../lib/auctionSelectors';
import './teamBoard.css';

export interface TeamBoardProps {
  teams: AuctionTeam[];
  config: ClientAuctionState['config'];
  myTeamId?: number | null;
  /** 'live' during the auction, 'results' after it. */
  mode: 'live' | 'results';
  /** When given, team names become buttons (desktop) and the footnote shows. */
  onTeamClick?: (team: AuctionTeam) => void;
}

const PHONE_QUERY = '(max-width: 767px)';

export default function TeamBoard(props: TeamBoardProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  return isPhone ? <PhoneBoard {...props} /> : <DesktopBoard {...props} />;
}

const openLabel = (n: number) => (n > 1 ? `open ×${n}` : 'open');

function join<T>(items: T[], render: (item: T, i: number) => React.ReactNode): React.ReactNode[] {
  return items.flatMap((item, i) => (i === 0 ? [render(item, i)] : [' · ', render(item, i)]));
}

function Name({ p }: { p: BoardPlayer }) {
  return <PlayerLink mlbId={p.mlbId} name={p.name} />;
}

// ─── Desktop ─────────────────────────────────────────────────────────────────

function DesktopBoard({ teams, config, myTeamId, mode, onTeamClick }: TeamBoardProps) {
  const groupsByTeam = teams.map(t => boardGroups(t, config));
  const rowLabels = groupsByTeam[0]?.map(g => g.label) ?? [];

  return (
    <div className="tb" data-mode={mode}>
      <div className="tb-scroll">
        <table className="tb-grid">
          <thead>
            <tr>
              <th scope="col">Pos</th>
              {teams.map(t => (
                <th scope="col" key={t.id} className={t.id === myTeamId ? 'tb-me' : undefined}>
                  {onTeamClick ? (
                    <button type="button" className="tb-team-btn" onClick={() => onTeamClick(t)}>{t.name}</button>
                  ) : t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="tb-money">
              <td>Left · max</td>
              {teams.map(t => (
                <td key={t.id} className="tb-num">${t.budget} · ${t.maxBid}</td>
              ))}
            </tr>
            {rowLabels.map((label, gi) => (
              <tr key={label}>
                <td>{label}</td>
                {teams.map((t, ti) => (
                  <td key={t.id}><DesktopCell group={groupsByTeam[ti][gi]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onTeamClick && <p className="tb-foot">Click a team name for its full roster.</p>}
    </div>
  );
}

function DesktopCell({ group }: { group: BoardGroup | undefined }) {
  if (!group) return null;
  const parts: React.ReactNode[] = join(group.filled, (p, i) => (
    <React.Fragment key={i}><Name p={p} /> <span className="tb-num">{p.price}</span></React.Fragment>
  ));
  if (group.open > 0) {
    if (parts.length) parts.push(' · ');
    parts.push(<i key="open" className="tb-open">{openLabel(group.open)}</i>);
  }
  return <>{parts}</>;
}

// ─── Phone ───────────────────────────────────────────────────────────────────

function PhoneBoard({ teams, config, myTeamId, mode }: TeamBoardProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const selected =
    teams.find(t => t.id === picked) ?? teams.find(t => t.id === myTeamId) ?? teams[0];
  if (!selected) return null;

  const needs = teamNeeds(selected, config);
  const groups = boardGroups(selected, config);

  return (
    <div className="tb" data-mode={mode}>
      <div className="tb-chips" role="group" aria-label="Teams">
        {teams.map(t => (
          <button
            key={t.id}
            type="button"
            className={`tb-chip${t.id === selected.id ? ' on' : ''}`}
            aria-pressed={t.id === selected.id}
            onClick={() => setPicked(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="tb-box">
        <div>
          <h2 className="tb-left tb-num">${selected.budget} left</h2>
          <p className="tb-sub tb-num">Max bid ${selected.maxBid} · {selected.spotsLeft} spots open</p>
        </div>
        {needs && (
          <div className="tb-needs">
            <p className="tb-cap">Needs</p>
            <p className="tb-sub tb-strong">{needs}</p>
          </div>
        )}
      </div>

      <div className="tb-list">
        {groups.map(g => (
          <div className="tb-row" key={g.label} data-group={g.label}>
            <div className="tb-row-t">
              <b>{g.label}</b>
              {g.filled.length > 0 && (
                <small>
                  {join(g.filled, (p, i) => (
                    <React.Fragment key={i}><Name p={p} /> <span className="tb-num">${p.price}</span></React.Fragment>
                  ))}
                </small>
              )}
            </div>
            <span className={`tb-pill ${g.open > 0 ? 'alert' : 'good'}`}>{g.open > 0 ? `${g.open} open` : 'Full'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Screen 8 · players still available, by value, with search and `+ List`
 * (adds the player to my list, which the server puts up if my clock runs out).
 */
import React, { useMemo, useState } from 'react';
import type { PlayerSeasonStat } from '../../../../api';
import { PlayerLink } from '../../../../components/shared/playerCard/PlayerCardProvider';
import { playerHeadshotUrl } from '../../../../lib/mlbImages';
import type { AuctionTeam } from '../../hooks/useAuctionState';

/**
 * A projected value as shown on the auction screens: whole dollars, and
 * anything below $1 (negative projections included) as `$0`. Null shows
 * nothing. Sorting still uses the raw value.
 */
export const formatValue = (v: number | null | undefined): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return `$${v < 1 ? 0 : Math.round(v)}`;
};

export const playerValue = (p: PlayerSeasonStat): number | null => {
  const v = p.dollar_value ?? p.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Players nobody owns: not on a fantasy team in the stats feed and not won in
 * this auction. One row per mlbId (two-way players appear twice in the feed;
 * the higher value is kept). Sorted by value, highest first.
 */
export function availablePlayers(players: PlayerSeasonStat[], teams: AuctionTeam[]): PlayerSeasonStat[] {
  const taken = new Set<string>();
  for (const t of teams) for (const r of t.roster) taken.add(String(r.mlbId ?? r.playerId));
  const byId = new Map<string, PlayerSeasonStat>();
  for (const p of players) {
    if (!p.mlb_id || p.ogba_team_code || p.team || taken.has(String(p.mlb_id))) continue;
    const prev = byId.get(p.mlb_id);
    if (!prev || (playerValue(p) ?? -Infinity) > (playerValue(prev) ?? -Infinity)) byId.set(p.mlb_id, p);
  }
  return [...byId.values()].sort((a, b) => (playerValue(b) ?? -Infinity) - (playerValue(a) ?? -Infinity));
}

export interface MyListControls {
  has: (mlbId: number) => boolean;
  add: (mlbId: number) => unknown;
  remove: (mlbId: number) => unknown;
}

export interface PlayersPanelProps {
  /** Already filtered to available players (see `availablePlayers`). */
  players: PlayerSeasonStat[];
  /** Null when I have no team: no `+ List` buttons. */
  myList: MyListControls | null;
}

/** Rows rendered at once; search narrows the rest. */
const MAX_ROWS = 100;

/** First listed position (e.g. `SP`, `1B`). */
export const primaryPos = (p: PlayerSeasonStat) => (p.positions || (p.is_pitcher ? 'P' : '')).split(/[,/]/)[0]?.trim() ?? '';

/** Name search shared by the players panel and the "your turn" search. Empty query matches all. */
export function matchPlayers(players: PlayerSeasonStat[], query: string): PlayerSeasonStat[] {
  const q = query.trim().toLowerCase();
  return q ? players.filter(p => (p.player_name ?? '').toLowerCase().includes(q)) : players;
}

export default function PlayersPanel({ players, myList }: PlayersPanelProps) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => matchPlayers(players, query), [players, query]);
  const shown = matches.slice(0, MAX_ROWS);

  return (
    <>
      <input
        className="la-field"
        type="search"
        placeholder="Search"
        aria-label="Search players"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="la-list">
        {shown.map(p => {
          const id = Number(p.mlb_id);
          const v = playerValue(p);
          const abbr = p.mlb_team_abbr || p.mlb_team || '';
          const listed = myList?.has(id) ?? false;
          return (
            <div className="la-row" key={p.mlb_id}>
              <div className="la-l">
                <img className="la-face" src={playerHeadshotUrl(id)} alt="" loading="lazy" />
                <div className="la-t">
                  <b><PlayerLink mlbId={id} name={p.player_name ?? 'Unknown'} /></b>
                  <small className="la-num">{[primaryPos(p), abbr, formatValue(v)].filter(Boolean).join(' · ')}</small>
                </div>
              </div>
              <div className="la-row-r">
                {myList && (
                  <button
                    type="button"
                    className="la-btn sm"
                    aria-pressed={listed}
                    aria-label={listed ? `Remove ${p.player_name} from your list` : `Add ${p.player_name} to your list`}
                    onClick={() => void (listed ? myList.remove(id) : myList.add(id))}
                  >
                    {listed ? 'On list' : '+ List'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="la-row"><div className="la-t"><small>No players match.</small></div></div>
        )}
      </div>
      {matches.length > MAX_ROWS && <p className="la-foot">Search to see more.</p>}
    </>
  );
}

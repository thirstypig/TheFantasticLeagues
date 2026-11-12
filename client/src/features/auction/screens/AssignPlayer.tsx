/**
 * /auction/assign · Give a player to a team (Screen 10, commissioner fix for a
 * sale that went wrong). Pick an available player, a team and a price, then
 * POST /force-assign and go back to /auction. A sub-route, not a modal.
 *
 * Loads the same data as /auction through useAuctionPageData + useAuctionState.
 */
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlayerLink } from '../../../components/shared/playerCard/PlayerCardProvider';
import type { PlayerSeasonStat } from '../../../api';
import { useAuctionPageData } from '../hooks/useAuctionPageData';
import { useAuctionState } from '../hooks/useAuctionState';
import { availablePlayers, formatValue, matchPlayers, playerValue, primaryPos } from '../components/live/PlayersPanel';
import '../components/live/live.css';

/** Search results shown at once; typing narrows the rest. */
const MAX_RESULTS = 25;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="la-page" style={{ maxWidth: 640, padding: '16px 16px 32px' }}>
      <div className="la-head">
        <h1 className="la-title">Give a player to a team</h1>
        <Link to="/auction" className="la-link">‹ Back to the auction</Link>
      </div>
      {children}
    </div>
  );
}

export default function AssignPlayer() {
  const navigate = useNavigate();
  const { leagueId, players, isCommissioner, loading } = useAuctionPageData();
  const { state, actions } = useAuctionState(leagueId);

  const [query, setQuery] = useState('');
  const [player, setPlayer] = useState<PlayerSeasonStat | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [price, setPrice] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teams = state?.teams ?? [];
  // The player up for bid right now can't be assigned out from under the lot.
  const lotId = state?.nomination?.playerId ?? null;
  const pool = useMemo(
    () => availablePlayers(players, teams).filter(p => p.mlb_id !== lotId),
    [players, teams, lotId],
  );
  const results = useMemo(() => matchPlayers(pool, query).slice(0, MAX_RESULTS), [pool, query]);
  const team = teams.find(t => t.id === teamId) ?? null;

  if (loading || (leagueId && !state)) {
    return <Shell><p className="la-sub">Loading the auction…</p></Shell>;
  }
  if (!isCommissioner) {
    return <Shell><p className="la-sub">Commissioner only</p></Shell>;
  }
  if (!leagueId || !state) {
    return <Shell><p className="la-sub">Pick a league to join its auction.</p></Shell>;
  }

  const validate = (): string | null => {
    if (!player) return 'Pick a player';
    if (!team) return 'Pick a team';
    const raw = price.trim();
    if (!/^\d+$/.test(raw)) return 'Enter a whole number';
    const n = Number(raw);
    if (n < 1) return 'Price must be at least $1';
    if (n > team.maxBid) return `${team.name} can spend up to $${team.maxBid}`;
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const msg = validate();
    if (msg || !player || !team) { setError(msg); return; }
    setError(null);
    setBusy(true);
    try {
      await actions.forceAssign({
        teamId: team.id,
        playerId: player.mlb_id,
        playerName: player.player_name || 'Unknown',
        price: Number(price.trim()),
        positions: player.positions || (player.is_pitcher ? 'P' : 'UT'),
        team: player.mlb_team || '',
        isPitcher: Boolean(player.is_pitcher),
      });
      navigate('/auction');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not give the player to the team');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form className="la-col" onSubmit={submit} noValidate>
        <p className="la-sub" style={{ margin: 0 }}>For a sale that went wrong. It's logged like any other sale.</p>

        <div className="la-col yt-sec">
          <p className="la-cap">Player</p>
          <input
            className="la-field"
            type="search"
            placeholder="Search available players"
            aria-label="Search players"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="la-list" data-testid="assign-results">
            {results.map(p => {
              const id = Number(p.mlb_id);
              const v = playerValue(p);
              const on = player?.mlb_id === p.mlb_id;
              return (
                <div className="la-row" key={p.mlb_id}>
                  <div className="la-t">
                    <b><PlayerLink mlbId={id} name={p.player_name ?? 'Unknown'} /></b>
                    <small className="la-num">{[primaryPos(p), p.mlb_team_abbr || p.mlb_team || '', formatValue(v)].filter(Boolean).join(' · ')}</small>
                  </div>
                  <button
                    type="button"
                    className={`la-btn sm${on ? ' primary' : ''}`}
                    aria-pressed={on}
                    aria-label={`${on ? 'Picked' : 'Pick'} ${p.player_name ?? 'Unknown'}`}
                    onClick={() => setPlayer(on ? null : p)}
                  >
                    {on ? 'Picked' : 'Pick'}
                  </button>
                </div>
              );
            })}
            {results.length === 0 && (
              <div className="la-row"><div className="la-t"><small>No players match.</small></div></div>
            )}
          </div>
        </div>

        <div className="la-col yt-sec">
          <p className="la-cap">Team</p>
          <div className="la-list" role="group" aria-label="Team">
            {teams.map(t => (
              <button
                type="button"
                key={t.id}
                className="la-row ap-pick"
                aria-pressed={teamId === t.id}
                disabled={t.spotsLeft <= 0}
                onClick={() => setTeamId(t.id)}
              >
                <span className="la-t">
                  <b>{t.name}</b>
                  <small className="la-num">{`$${t.budget} left · ${t.spotsLeft} spots`}</small>
                </span>
                <span className="la-chip">{`max $${t.maxBid}`}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="ap-price">
          Price $
          <input
            className="la-input"
            type="text"
            inputMode="numeric"
            aria-label="Price"
            value={price}
            onChange={e => setPrice(e.target.value)}
          />
        </label>

        {error && <p className="la-err" role="alert">{error}</p>}

        <button type="submit" className="la-btn primary" disabled={busy}>Give player to team</button>
      </form>
    </Shell>
  );
}

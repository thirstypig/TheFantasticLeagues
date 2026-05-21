
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getCommissionerRosters, commissionerForceDrop } from '../api';
import RosterGrid from '../../roster/components/RosterGrid';
import AddDropPanel from '../../transactions/components/RosterMovesTab/AddDropPanel';
import CommissionerTradeTool from './CommissionerTradeTool';
import PlaceOnIlPanel from '../../transactions/components/RosterMovesTab/PlaceOnIlPanel';
import ActivateFromIlPanel from '../../transactions/components/RosterMovesTab/ActivateFromIlPanel';
import { enrichPlayersWithRosterState } from '../lib/enrichPlayersWithRosterState';
import { getPlayerSeasonStats, PlayerSeasonStat } from '../../../api';

type IlMode = 'place-il' | 'activate-il';

interface Team {
  id: number;
  name: string;
  code?: string | null;
  budget?: number | null;
  owner?: string | null;
}

interface RosterItem {
    id: number;
    teamId: number;
    assignedPosition?: string | null;
    player: {
        id: number;
        name: string;
        posPrimary: string;
        mlbId?: number;
    };
    price: number;
}

interface CommissionerRosterToolProps {
  leagueId: number;
  teams: Team[];
  onUpdate: () => void;
  showTrades?: boolean;
}

export default function CommissionerRosterTool({ leagueId, teams, onUpdate, showTrades = true }: CommissionerRosterToolProps) {
  const [rosters, setRosters] = useState<RosterItem[]>([]);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingAsTeamId, setActingAsTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [ilMode, setIlMode] = useState<IlMode>('place-il');
  const [stashPreselect, setStashPreselect] = useState<{ playerId: number; nonce: number } | null>(null);
  const [activatePreselect, setActivatePreselect] = useState<{ playerId: number; nonce: number } | null>(null);
  const ilCardRef = useRef<HTMLDivElement | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [forceDropPlayerId, setForceDropPlayerId] = useState<number | ''>('');
  const [forceDropPending, setForceDropPending] = useState(false);
  const [forceDropError, setForceDropError] = useState<string | null>(null);

  const fetchRosters = async () => {
    setLoading(true);
    try {
      const [rosterData, playerData] = await Promise.all([
        getCommissionerRosters(leagueId),
        getPlayerSeasonStats(leagueId),
      ]);
      setRosters(rosterData);
      setPlayers(playerData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) fetchRosters();
  }, [leagueId, refreshKey]);

  const handleUpdate = () => {
      setRefreshKey(prev => prev + 1);
      onUpdate();
  };

  const mlbStatusByPlayerId = useMemo(() => {
    const map = new Map<number, string | undefined>();
    for (const p of players) {
      const pid = (p as unknown as { id?: number }).id;
      if (pid) map.set(pid, (p as unknown as { mlbStatus?: string }).mlbStatus);
    }
    return map;
  }, [players]);

  function handlePlaceIlShortcut(item: RosterItem) {
    setActingAsTeamId(item.teamId);
    setIlMode('place-il');
    setStashPreselect({ playerId: item.player.id, nonce: Date.now() });
    requestAnimationFrame(() => {
      ilCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function handleActivateIlShortcut(item: RosterItem) {
    setActingAsTeamId(item.teamId);
    setIlMode('activate-il');
    setActivatePreselect({ playerId: item.player.id, nonce: Date.now() });
    requestAnimationFrame(() => {
      ilCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleForceDrop() {
    if (!actingAsTeamId || !forceDropPlayerId) return;
    setForceDropPending(true);
    setForceDropError(null);
    try {
      await commissionerForceDrop(leagueId, actingAsTeamId, Number(forceDropPlayerId), effectiveDate || undefined);
      setForceDropPlayerId('');
      handleUpdate();
    } catch (err: unknown) {
      setForceDropError(err instanceof Error ? err.message : 'Force drop failed');
    } finally {
      setForceDropPending(false);
    }
  }

  const playersWithRosterState = useMemo(
    () => enrichPlayersWithRosterState(players as any, rosters, teams),
    [players, rosters, teams],
  );

  if (error) {
    return <div style={{ color: 'var(--am-negative)', fontSize: 13, padding: 16 }}>Error loading rosters: {error}</div>;
  }

  return (
    <div className="cm-col" style={{ gap: 0 }}>

      {/* ── Acting As + Effective Date header ── */}
      <div className="cm-section-head" style={{ borderRadius: 0 }}>
        <div className="cm-row" style={{ gap: 24, flexWrap: 'wrap', flex: 1 }}>
          <div className="cm-col" style={{ gap: 4 }}>
            <span className="cm-cap">Acting As</span>
            <select
              className="cm-select"
              style={{ minWidth: 180 }}
              value={actingAsTeamId ?? ''}
              onChange={(e) => setActingAsTeamId(Number(e.target.value))}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="cm-col" style={{ gap: 4 }}>
            <span className="cm-cap">Effective Date</span>
            <div className="cm-row" style={{ gap: 8 }}>
              <input
                type="date"
                className="cm-input"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                style={{ width: 150 }}
              />
              {effectiveDate ? (
                <button type="button" className="cm-btn ghost sm" onClick={() => setEffectiveDate('')}>clear</button>
              ) : (
                <span className="cm-muted" style={{ fontSize: 11 }}>empty = tomorrow</span>
              )}
            </div>
          </div>
        </div>
        {actingAsTeamId && (
          <span className="cm-muted" style={{ fontSize: 12 }}>
            Acting on roster for <strong style={{ color: 'var(--am-text)' }}>{teams.find((t) => t.id === actingAsTeamId)?.name ?? `team ${actingAsTeamId}`}</strong>
          </span>
        )}
      </div>

      {/* ── Live Roster (single-team view) ── */}
      {actingAsTeamId && !loading && (() => {
        const actingTeam = teams.find((t) => t.id === actingAsTeamId);
        return actingTeam ? (
          <div style={{ borderBottom: '1px solid var(--am-border)' }}>
            <div className="cm-section-head" style={{ borderRadius: 0 }}>
              <span className="cm-h2">Live Rosters</span>
            </div>
            <div style={{ padding: '8px 0' }}>
              <RosterGrid
                teams={[actingTeam]}
                rosters={rosters.filter((r) => r.teamId === actingAsTeamId)}
                canRelease
                onRelease={handleUpdate}
                onPlaceIl={handlePlaceIlShortcut}
                onActivateIl={handleActivateIlShortcut}
                mlbStatusByPlayerId={mlbStatusByPlayerId}
                unbounded
              />
            </div>
          </div>
        ) : null;
      })()}

      {/* ── Add / Drop ── */}
      <div style={{ borderBottom: '1px solid var(--am-border)' }}>
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <div className="cm-col" style={{ gap: 2, flex: 1 }}>
            <span className="cm-h2">Add / Drop</span>
            <span className="cm-muted" style={{ fontSize: 11, fontWeight: 400 }}>
              Commissioner view — adds go to the Acting As team. In-season every add must pair with a drop. Effective date from the header above is used.
            </span>
          </div>
        </div>
        {loading || !actingAsTeamId ? (
          <div style={{ padding: '24px 14px', fontSize: 12, color: 'var(--am-text-muted)' }}>
            {loading ? "Loading players…" : "Select an Acting As team above."}
          </div>
        ) : (
          <div style={{ padding: 14 }}>
            <AddDropPanel
              key={`add-drop-${actingAsTeamId}`}
              leagueId={leagueId}
              teamId={actingAsTeamId}
              players={playersWithRosterState as unknown as any}
              onComplete={handleUpdate}
              effectiveDate={effectiveDate || undefined}
            />
          </div>
        )}
      </div>

      {/* ── IL Management ── */}
      <div ref={ilCardRef} style={{ borderBottom: '1px solid var(--am-border)' }}>
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <div className="cm-col" style={{ gap: 2, flex: 1 }}>
            <span className="cm-h2">IL Management</span>
            <span className="cm-muted" style={{ fontSize: 11, fontWeight: 400 }}>
              Place on IL pairs with a replacement add; Activate from IL pairs with a drop. Both commit atomically.
            </span>
          </div>
          <div className="cm-row" style={{ gap: 4 }}>
            <button
              type="button"
              className={`cm-btn sm ${ilMode === 'place-il' ? 'primary' : 'ghost'}`}
              onClick={() => setIlMode('place-il')}
            >
              Place on IL
            </button>
            <button
              type="button"
              className={`cm-btn sm ${ilMode === 'activate-il' ? 'primary' : 'ghost'}`}
              onClick={() => setIlMode('activate-il')}
            >
              Activate from IL
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          {!actingAsTeamId ? (
            <p style={{ fontSize: 11, color: 'var(--am-text-muted)' }}>Select an Acting As team above.</p>
          ) : ilMode === 'place-il' ? (
            <PlaceOnIlPanel
              key={`place-${actingAsTeamId}`}
              leagueId={leagueId}
              teamId={actingAsTeamId}
              players={playersWithRosterState as unknown as any}
              onComplete={handleUpdate}
              effectiveDate={effectiveDate || undefined}
              initialStashPlayerId={stashPreselect && stashPreselect.nonce ? stashPreselect.playerId : null}
            />
          ) : (
            <ActivateFromIlPanel
              key={`activate-${actingAsTeamId}`}
              leagueId={leagueId}
              teamId={actingAsTeamId}
              players={playersWithRosterState as unknown as any}
              onComplete={handleUpdate}
              effectiveDate={effectiveDate || undefined}
              initialActivatePlayerId={activatePreselect && activatePreselect.nonce ? activatePreselect.playerId : null}
            />
          )}
        </div>
      </div>

      {/* ── Force Drop ── */}
      <div style={{ borderBottom: '1px solid var(--am-border)' }}>
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <div className="cm-col" style={{ gap: 2, flex: 1 }}>
            <span className="cm-h2">Force Drop Player</span>
            <span className="cm-muted" style={{ fontSize: 11, fontWeight: 400 }}>
              Commissioner-only. Drops a player without requiring a simultaneous add. Use the effective date from the header above. Action is logged in the activity feed.
            </span>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          {!actingAsTeamId ? (
            <p style={{ fontSize: 11, color: 'var(--am-text-muted)' }}>Select an Acting As team above.</p>
          ) : (
            <div className="cm-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="cm-col" style={{ gap: 4 }}>
                <span className="cm-cap">Player to Drop</span>
                <select
                  className="cm-select"
                  style={{ minWidth: 220 }}
                  value={forceDropPlayerId}
                  onChange={(e) => setForceDropPlayerId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">— Select player —</option>
                  {rosters
                    .filter((r) => r.teamId === actingAsTeamId && r.assignedPosition !== 'IL')
                    .sort((a, b) => a.player.name.localeCompare(b.player.name))
                    .map((r) => (
                      <option key={r.id} value={r.player.id}>
                        {r.player.name} ({r.player.posPrimary} · {r.assignedPosition ?? 'BN'})
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="button"
                className="cm-btn danger"
                style={{ marginTop: 20 }}
                onClick={handleForceDrop}
                disabled={!forceDropPlayerId || forceDropPending}
              >
                {forceDropPending ? 'Dropping…' : 'Force Drop'}
              </button>
            </div>
          )}
          {forceDropError && (
            <p style={{ marginTop: 8, fontSize: 11, color: 'var(--am-negative)' }}>{forceDropError}</p>
          )}
        </div>
      </div>

      {/* ── Retroactive Trades (collapsible) ── */}
      {showTrades && (
        <details style={{ borderBottom: '1px solid var(--am-border)' }}>
          <summary className="cm-section-head" style={{ cursor: 'pointer', borderRadius: 0, listStyle: 'none' }}>
            <span className="cm-h2">Record Retroactive Trade</span>
            <span className="cm-chip" style={{ marginLeft: 8, fontSize: 10 }}>collapsible</span>
          </summary>
          <div style={{ padding: 14 }}>
            <CommissionerTradeTool leagueId={leagueId} teams={teams} />
          </div>
        </details>
      )}

      {/* ── All Teams Quick View (collapsible) ── */}
      <details>
        <summary className="cm-section-head" style={{ cursor: 'pointer', borderRadius: 0, listStyle: 'none' }}>
          <span className="cm-h2">All Teams Quick View</span>
          <span className="cm-chip" style={{ marginLeft: 8, fontSize: 10 }}>collapsible</span>
        </summary>
        <div style={{ padding: '8px 0' }}>
          <RosterGrid
            teams={teams}
            rosters={rosters}
            canRelease
            canEditPrice
            canEditPosition
            onRelease={handleUpdate}
            onPlaceIl={handlePlaceIlShortcut}
            onActivateIl={handleActivateIlShortcut}
            mlbStatusByPlayerId={mlbStatusByPlayerId}
          />
        </div>
      </details>

    </div>
  );
}

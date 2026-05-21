
import React, { useState, useEffect, useMemo } from 'react';
import { getCommissionerRosters, commissionerForceDrop } from '../api';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { ilStash } from '../../transactions/api';
import { isMlbIlStatus } from '../../../lib/mlbStatus';
import { enrichPlayersWithRosterState } from '../lib/enrichPlayersWithRosterState';
import { getPlayerSeasonStats, PlayerSeasonStat } from '../../../api';
import { reportError } from '../../../lib/errorBus';
import { extractServerError } from '../../../lib/extractServerError';

const POS_FILTERS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'MI', 'CM', 'OF', 'DH', 'P'] as const;

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
  player: { id: number; name: string; posPrimary: string; mlbId?: number };
  price: number;
}

interface CommissionerRosterToolProps {
  leagueId: number;
  teams: Team[];
  onUpdate: () => void;
  showTrades?: boolean;
}

function normalizePos(raw: string): string[] {
  return raw
    .split(/[,/| ]+/)
    .map(t => {
      const u = t.trim().toUpperCase();
      if (['LF', 'CF', 'RF'].includes(u)) return 'OF';
      if (['SP', 'RP', 'CL', 'TWP'].includes(u)) return 'P';
      return u;
    })
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i);
}

function matchesFilter(posStr: string, filter: string): boolean {
  if (filter === 'ALL') return true;
  const tokens = normalizePos(posStr);
  if (filter === 'P') return tokens.some(t => ['P', 'SP', 'RP', 'CL', 'TWP'].includes(t));
  if (filter === 'OF') return tokens.some(t => ['OF', 'LF', 'CF', 'RF'].includes(t));
  if (filter === 'MI') return tokens.some(t => ['MI', '2B', 'SS'].includes(t));
  if (filter === 'CM') return tokens.some(t => ['CM', '1B', '3B'].includes(t));
  return tokens.includes(filter);
}

function playerPos(p: any): string {
  const raw = p?.positions || p?.posPrimary || '';
  return normalizePos(raw).join(', ') || '-';
}

function playerName(p: any): string {
  return p?.player_name || p?.name || 'Unknown';
}

function slotLabel(slot: string | null | undefined): string {
  return slot || 'BN';
}

export default function CommissionerRosterTool({ leagueId, teams, onUpdate }: CommissionerRosterToolProps) {
  const [rosters, setRosters] = useState<RosterItem[]>([]);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingAsTeamId, setActingAsTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Add/Drop state
  const [adQuery, setAdQuery] = useState('');
  const [adPosFilter, setAdPosFilter] = useState('ALL');
  const [adAddId, setAdAddId] = useState<number | null>(null);   // DB Player.id
  const [adAddMlbId, setAdAddMlbId] = useState<number | null>(null);
  const [adDropId, setAdDropId] = useState<number | ''>('');     // DB Player.id (roster player)
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);

  // IL Stash state
  const [ilStashId, setIlStashId] = useState<number | ''>('');  // roster player to stash
  const [ilReplQuery, setIlReplQuery] = useState('');
  const [ilReplId, setIlReplId] = useState<number | null>(null);   // DB Player.id (FA replacement)
  const [ilReplMlbId, setIlReplMlbId] = useState<number | null>(null);
  const [ilSubmitting, setIlSubmitting] = useState(false);
  const [ilError, setIlError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rosterData, playerData] = await Promise.all([
        getCommissionerRosters(leagueId),
        getPlayerSeasonStats(leagueId),
      ]);
      setRosters(rosterData);
      setPlayers(playerData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (leagueId) fetchData(); }, [leagueId, refreshKey]);

  const handleUpdate = () => { setRefreshKey(k => k + 1); onUpdate(); };

  const playersEnriched = useMemo(
    () => enrichPlayersWithRosterState(players as any, rosters, teams),
    [players, rosters, teams],
  );

  // Players on acting team's roster
  const teamRoster = useMemo(
    () => rosters.filter(r => r.teamId === actingAsTeamId),
    [rosters, actingAsTeamId],
  );

  // Free agents: enriched players with no _dbTeamId
  const freeAgents = useMemo(
    () => (playersEnriched as any[]).filter(p => !p._dbTeamId),
    [playersEnriched],
  );

  // Filtered FA list for Add column
  const filteredFAs = useMemo(() => {
    const q = adQuery.toLowerCase();
    return freeAgents
      .filter(p => {
        const name = playerName(p).toLowerCase();
        if (q && !name.includes(q)) return false;
        if (adPosFilter !== 'ALL') {
          const pos = p?.positions || p?.posPrimary || '';
          if (!matchesFilter(pos, adPosFilter)) return false;
        }
        return true;
      })
      .slice(0, 60);
  }, [freeAgents, adQuery, adPosFilter]);

  // Filtered FA list for IL replacement column
  const filteredIlFAs = useMemo(() => {
    const q = ilReplQuery.toLowerCase();
    return freeAgents
      .filter(p => {
        const name = playerName(p).toLowerCase();
        return !q || name.includes(q);
      })
      .slice(0, 50);
  }, [freeAgents, ilReplQuery]);

  // IL-eligible roster players (MLB status is a valid IL designation)
  const mlbStatusByPlayerId = useMemo(() => {
    const map = new Map<number, string | undefined>();
    for (const p of playersEnriched as any[]) {
      if (p.id) map.set(p.id, p.mlbStatus);
    }
    return map;
  }, [playersEnriched]);

  const ilEligibleRoster = useMemo(
    () => teamRoster.filter(r => isMlbIlStatus(mlbStatusByPlayerId.get(r.player.id))),
    [teamRoster, mlbStatusByPlayerId],
  );

  async function handleAddDrop() {
    if (!actingAsTeamId || adAddId === null || adDropId === '') return;
    setAdSubmitting(true);
    setAdError(null);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/claim`, {
        method: 'POST',
        body: JSON.stringify({
          leagueId,
          teamId: actingAsTeamId,
          mlbId: adAddMlbId,
          playerId: adAddId,
          dropPlayerId: Number(adDropId),
          ...(effectiveDate ? { effectiveDate } : {}),
        }),
      });
      setAdAddId(null);
      setAdAddMlbId(null);
      setAdDropId('');
      setAdQuery('');
      handleUpdate();
    } catch (err: unknown) {
      setAdError(extractServerError(err, 'Add/Drop failed'));
      reportError(err, { source: 'commissioner-add-drop' });
    } finally {
      setAdSubmitting(false);
    }
  }

  async function handleIlStash() {
    if (!actingAsTeamId || ilStashId === '' || ilReplId === null) return;
    setIlSubmitting(true);
    setIlError(null);
    try {
      await ilStash({
        leagueId,
        teamId: actingAsTeamId,
        stashPlayerId: Number(ilStashId),
        addPlayerId: ilReplId,
        addMlbId: ilReplMlbId ?? undefined,
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      setIlStashId('');
      setIlReplId(null);
      setIlReplMlbId(null);
      setIlReplQuery('');
      handleUpdate();
    } catch (err: unknown) {
      setIlError(extractServerError(err, 'IL stash failed'));
      reportError(err, { source: 'commissioner-il-stash' });
    } finally {
      setIlSubmitting(false);
    }
  }

  if (error) {
    return <div style={{ color: 'var(--am-negative)', fontSize: 13, padding: 16 }}>Error loading rosters: {error}</div>;
  }

  const actingTeamName = teams.find(t => t.id === actingAsTeamId)?.name ?? '—';
  const selectedAddPlayer = adAddId != null ? (playersEnriched as any[]).find((p: any) => p.id === adAddId) : null;
  const selectedDropRosterItem = adDropId !== '' ? teamRoster.find(r => r.player.id === Number(adDropId)) : null;
  const selectedStashItem = ilStashId !== '' ? teamRoster.find(r => r.player.id === Number(ilStashId)) : null;
  const selectedIlReplPlayer = ilReplId != null ? (playersEnriched as any[]).find((p: any) => p.id === ilReplId) : null;

  const colStyle: React.CSSProperties = {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--am-border)',
  };
  const colLast: React.CSSProperties = { flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' };
  const colHead: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--am-surface-alt)',
    borderBottom: '1px solid var(--am-border)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--am-text-muted)',
  };
  const colBody: React.CSSProperties = { flex: 1, overflow: 'auto', maxHeight: 320 };
  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--am-border)',
    background: selected ? 'color-mix(in srgb, var(--am-accent) 12%, var(--am-surface))' : 'transparent',
    borderLeft: selected ? '2px solid var(--am-accent)' : '2px solid transparent',
  });

  return (
    <div className="cm-col" style={{ gap: 0 }}>

      {/* ── Header: team selector + effective date ── */}
      <div className="cm-section-head" style={{ borderRadius: 0, gap: 16, flexWrap: 'wrap' }}>
        <div className="cm-col" style={{ gap: 3 }}>
          <span className="cm-cap">Acting As</span>
          <select
            className="cm-select"
            style={{ minWidth: 180 }}
            value={actingAsTeamId ?? ''}
            onChange={e => { setActingAsTeamId(Number(e.target.value)); setAdAddId(null); setAdDropId(''); setIlStashId(''); setIlReplId(null); }}
          >
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="cm-col" style={{ gap: 3 }}>
          <span className="cm-cap">Effective Date</span>
          <div className="cm-row" style={{ gap: 8 }}>
            <input type="date" className="cm-input" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} style={{ width: 148 }} />
            {effectiveDate
              ? <button type="button" className="cm-btn ghost sm" onClick={() => setEffectiveDate('')}>clear</button>
              : <span className="cm-muted" style={{ fontSize: 11 }}>empty = tomorrow</span>}
          </div>
        </div>
      </div>

      {/* ── Roster table ── */}
      <div style={{ borderBottom: '1px solid var(--am-border)' }}>
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <span className="cm-h2 cm-grow">
            {loading ? 'Loading…' : `${actingTeamName} · ${teamRoster.length} players`}
          </span>
        </div>
        {teamRoster.length === 0 && !loading ? (
          <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--am-text-muted)' }}>No roster found.</div>
        ) : (
          <table className="cm-table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Player</th>
                <th>Pos</th>
                <th>Status</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {teamRoster.map(r => {
                const mlbStatus = mlbStatusByPlayerId.get(r.player.id);
                const isIl = r.assignedPosition === 'IL';
                const isGhostIl = isIl && !isMlbIlStatus(mlbStatus);
                return (
                  <tr key={r.id}>
                    <td><span className="cm-chip">{slotLabel(r.assignedPosition)}</span></td>
                    <td style={{ fontWeight: 600 }}>{r.player.name}</td>
                    <td style={{ color: 'var(--am-text-muted)', fontSize: 12 }}>{r.player.posPrimary}</td>
                    <td>
                      {isGhostIl
                        ? <span className="cm-chip neg">Ghost-IL</span>
                        : isIl
                          ? <span className="cm-chip warn">IL</span>
                          : isMlbIlStatus(mlbStatus)
                            ? <span className="cm-chip warn">MLB IL</span>
                            : <span className="cm-chip accent">Active</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!isIl && (
                        <button
                          type="button"
                          className="cm-btn ghost sm"
                          onClick={() => { setIlStashId(r.player.id); setIlReplId(null); document.getElementById('il-panel')?.scrollIntoView({ behavior: 'smooth' }); }}
                        >
                          IL
                        </button>
                      )}
                      <button
                        type="button"
                        className="cm-btn ghost sm"
                        onClick={() => { setAdDropId(r.player.id); document.getElementById('add-drop-panel')?.scrollIntoView({ behavior: 'smooth' }); }}
                      >
                        Drop
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Drop (3 columns) ── */}
      <div id="add-drop-panel" style={{ borderBottom: '1px solid var(--am-border)' }}>
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <span className="cm-h2">Add / Drop</span>
          {adError && <span style={{ fontSize: 11, color: 'var(--am-negative)', marginLeft: 12 }}>{adError}</span>}
        </div>
        <div style={{ display: 'flex', minHeight: 200 }}>
          {/* Col 1: Add (free agent) */}
          <div style={colStyle}>
            <div style={colHead}>
              <div className="cm-row" style={{ gap: 6, marginBottom: 6 }}>
                <input
                  className="cm-input"
                  style={{ flex: 1, fontSize: 11 }}
                  placeholder="Search by name…"
                  value={adQuery}
                  onChange={e => setAdQuery(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {POS_FILTERS.map(f => (
                  <button
                    key={f}
                    type="button"
                    className={`cm-btn sm ${adPosFilter === f ? 'primary' : 'ghost'}`}
                    style={{ padding: '2px 6px', fontSize: 10, minWidth: 0 }}
                    onClick={() => setAdPosFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={colBody}>
              {filteredFAs.length === 0 ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No free agents match.</div>
              ) : filteredFAs.map((p: any) => (
                <div
                  key={p.id || p.mlb_id}
                  style={rowStyle(adAddId === p.id)}
                  onClick={() => { setAdAddId(p.id); setAdAddMlbId(p.mlb_id ?? p.mlbId ?? null); }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName(p)}</div>
                    <div style={{ fontSize: 10, color: 'var(--am-text-muted)' }}>{playerPos(p)} · {p.mlbTeam || p.mlb_team || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Col 2: Drop (roster player) */}
          <div style={colStyle}>
            <div style={{ ...colHead, display: 'flex', alignItems: 'center' }}>Drop from roster</div>
            <div style={colBody}>
              {teamRoster.length === 0 ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No roster loaded.</div>
              ) : teamRoster.filter(r => r.assignedPosition !== 'IL').map(r => (
                <div
                  key={r.id}
                  style={rowStyle(Number(adDropId) === r.player.id)}
                  onClick={() => setAdDropId(r.player.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{r.player.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--am-text-muted)' }}>{r.player.posPrimary} · {slotLabel(r.assignedPosition)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Col 3: Confirm */}
          <div style={colLast}>
            <div style={colHead}>Confirm</div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12 }}>
                <div className="cm-cap" style={{ marginBottom: 4 }}>Adding</div>
                {selectedAddPlayer
                  ? <div style={{ fontWeight: 600 }}>{playerName(selectedAddPlayer)}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{playerPos(selectedAddPlayer)}</span></div>
                  : <div style={{ color: 'var(--am-text-faint)' }}>— select from left</div>}
              </div>
              <div style={{ fontSize: 12 }}>
                <div className="cm-cap" style={{ marginBottom: 4 }}>Dropping</div>
                {selectedDropRosterItem
                  ? <div style={{ fontWeight: 600 }}>{selectedDropRosterItem.player.name}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{selectedDropRosterItem.player.posPrimary}</span></div>
                  : <div style={{ color: 'var(--am-text-faint)' }}>— select from middle</div>}
              </div>
              <button
                type="button"
                className="cm-btn primary"
                style={{ marginTop: 8 }}
                disabled={adAddId === null || adDropId === '' || adSubmitting}
                onClick={handleAddDrop}
              >
                {adSubmitting ? 'Executing…' : 'Execute Add'}
              </button>
              <div style={{ fontSize: 10, color: 'var(--am-text-faint)' }}>
                Execute unlocks after the add/drop selection is made.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── IL Management (3 columns) ── */}
      <div id="il-panel">
        <div className="cm-section-head" style={{ borderRadius: 0 }}>
          <span className="cm-h2">IL Management</span>
          {ilError && <span style={{ fontSize: 11, color: 'var(--am-negative)', marginLeft: 12 }}>{ilError}</span>}
        </div>
        <div style={{ display: 'flex', minHeight: 200 }}>
          {/* Col 1: Stash player */}
          <div style={colStyle}>
            <div style={colHead}>Stash a player</div>
            <div style={colBody}>
              {teamRoster.filter(r => r.assignedPosition !== 'IL').length === 0 ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No active players.</div>
              ) : teamRoster.filter(r => r.assignedPosition !== 'IL').map(r => {
                const mlbStatus = mlbStatusByPlayerId.get(r.player.id);
                const eligible = isMlbIlStatus(mlbStatus);
                return (
                  <div
                    key={r.id}
                    style={{
                      ...rowStyle(Number(ilStashId) === r.player.id),
                      opacity: eligible ? 1 : 0.5,
                      cursor: eligible ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => eligible && setIlStashId(r.player.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{r.player.name}</div>
                      <div style={{ fontSize: 10, color: eligible ? 'var(--am-warning)' : 'var(--am-text-faint)' }}>
                        {eligible ? `MLB IL · ${mlbStatus}` : r.player.posPrimary}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Col 2: Add replacement */}
          <div style={colStyle}>
            <div style={colHead}>
              <input
                className="cm-input"
                style={{ width: '100%', fontSize: 11, marginBottom: 0 }}
                placeholder="Search replacement…"
                value={ilReplQuery}
                onChange={e => setIlReplQuery(e.target.value)}
              />
            </div>
            <div style={colBody}>
              {filteredIlFAs.length === 0 ? (
                <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No free agents match.</div>
              ) : filteredIlFAs.map((p: any) => (
                <div
                  key={p.id || p.mlb_id}
                  style={rowStyle(ilReplId === p.id)}
                  onClick={() => { setIlReplId(p.id); setIlReplMlbId(p.mlb_id ?? p.mlbId ?? null); }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName(p)}</div>
                    <div style={{ fontSize: 10, color: 'var(--am-text-muted)' }}>{playerPos(p)} · {p.mlbTeam || p.mlb_team || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Col 3: Confirm */}
          <div style={colLast}>
            <div style={colHead}>Confirm</div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12 }}>
                <div className="cm-cap" style={{ marginBottom: 4 }}>Stashing</div>
                {selectedStashItem
                  ? <div style={{ fontWeight: 600 }}>{selectedStashItem.player.name}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{selectedStashItem.player.posPrimary}</span></div>
                  : <div style={{ color: 'var(--am-text-faint)' }}>— select from left</div>}
              </div>
              <div style={{ fontSize: 12 }}>
                <div className="cm-cap" style={{ marginBottom: 4 }}>Replacement</div>
                {selectedIlReplPlayer
                  ? <div style={{ fontWeight: 600 }}>{playerName(selectedIlReplPlayer)}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{playerPos(selectedIlReplPlayer)}</span></div>
                  : <div style={{ color: 'var(--am-text-faint)' }}>— select from middle</div>}
              </div>
              <button
                type="button"
                className="cm-btn primary"
                style={{ marginTop: 8 }}
                disabled={ilStashId === '' || ilReplId === null || ilSubmitting}
                onClick={handleIlStash}
              >
                {ilSubmitting ? 'Confirming…' : 'Confirm Stash + Add'}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

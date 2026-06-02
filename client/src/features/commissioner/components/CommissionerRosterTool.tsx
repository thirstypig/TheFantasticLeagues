
import React, { useState, useEffect, useMemo } from 'react';
import { getCommissionerRosters, commissionerForceDrop } from '../api';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import { ilStash, ilActivate } from '../../transactions/api';
import TransactionResultModal, { type TransactionResult } from '../../transactions/components/TransactionResultModal';
import { isMlbIlStatus } from '../../../lib/mlbStatus';
import { enrichPlayersWithRosterState } from '../lib/enrichPlayersWithRosterState';
import { getPlayerSeasonStats, PlayerSeasonStat } from '../../../api';
import { reportError } from '../../../lib/errorBus';
import { extractServerError } from '../../../lib/extractServerError';
import { slotsFor, isSlotCode } from '../../../lib/positionEligibility';

const POS_FILTERS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'MI', 'CM', 'OF', 'DH', 'P'] as const;

const SLOT_ORDER = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CM', 'OF', 'DH', 'P', 'SP', 'RP', 'BN', 'IL'];
function slotRank(slot: string | null | undefined): number {
  const idx = SLOT_ORDER.indexOf((slot ?? 'BN').toUpperCase());
  return idx === -1 ? SLOT_ORDER.length : idx;
}

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
  const [slotChanges, setSlotChanges] = useState<Array<{ playerId: number; slot: string }>>([]);

  // IL Stash state
  const [ilStashId, setIlStashId] = useState<number | ''>('');  // roster player to stash
  const [ilReplQuery, setIlReplQuery] = useState('');
  const [ilReplId, setIlReplId] = useState<number | null>(null);   // DB Player.id (FA replacement)
  const [ilReplMlbId, setIlReplMlbId] = useState<number | null>(null);
  const [ilSubmitting, setIlSubmitting] = useState(false);
  const [ilError, setIlError] = useState<string | null>(null);

  // Post-commit confirmation modal — shared across all three drawers.
  // null = closed; populated by handlers after a successful submit.
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);

  // ── Activate-from-IL state (mirror of stash, but inverted) ──
  // ilMode toggles the right-side IL Management drawer between two flows:
  //   'stash'    — place an active-roster player on IL + add a FA replacement
  //   'activate' — bring an IL-slotted player back + drop an active player
  const [ilMode, setIlMode] = useState<'stash' | 'activate'>('stash');
  const [ilActId, setIlActId] = useState<number | ''>('');  // IL-slotted player to bring back
  const [ilActDropId, setIlActDropId] = useState<number | ''>('');  // active player to drop
  const [ilActSubmitting, setIlActSubmitting] = useState(false);
  const [ilActError, setIlActError] = useState<string | null>(null);

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

  // Players on acting team's roster, sorted by canonical slot order
  const teamRoster = useMemo(
    () => rosters
      .filter(r => r.teamId === actingAsTeamId)
      .slice()
      .sort((a, b) => slotRank(a.assignedPosition) - slotRank(b.assignedPosition)),
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

  // Full posList string per player ID (for slot-eligibility dropdowns)
  const posListByPlayerId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of playersEnriched as any[]) {
      if (p.id) map.set(p.id, p.positions || p.posPrimary || '');
    }
    return map;
  }, [playersEnriched]);

  // Reset slot changes whenever the drop selection changes
  useEffect(() => { setSlotChanges([]); }, [adDropId]);

  async function handleAddDrop() {
    if (!actingAsTeamId || adAddId === null || adDropId === '') return;
    setAdSubmitting(true);
    setAdError(null);
    try {
      const claimResp = await fetchJsonApi<{ appliedReassignments?: Array<{ playerId: number; playerName: string; oldSlot: string; newSlot: string }> }>(`${API_BASE}/transactions/claim`, {
        method: 'POST',
        body: JSON.stringify({
          leagueId,
          teamId: actingAsTeamId,
          mlbId: adAddMlbId,
          playerId: adAddId,
          dropPlayerId: Number(adDropId),
          ...(slotChanges.length > 0 ? { slotChanges } : {}),
          ...(effectiveDate ? { effectiveDate } : {}),
        }),
      });
      const addedName = playerName((playersEnriched as any[]).find(p => p.id === adAddId)) || 'player';
      const droppedName = teamRoster.find(r => r.player.id === Number(adDropId))?.player.name || 'player';
      setTxResult({
        title: 'Claim succeeded',
        primaryLine: `Added ${addedName}, dropped ${droppedName}.`,
        cascadeMoves: (claimResp.appliedReassignments ?? []).filter(r => r.playerId !== adAddId),
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

  async function handleIlActivate() {
    if (!actingAsTeamId || ilActId === '' || ilActDropId === '') return;
    setIlActSubmitting(true);
    setIlActError(null);
    try {
      const activateResp = await ilActivate({
        leagueId,
        teamId: actingAsTeamId,
        activatePlayerId: Number(ilActId),
        dropPlayerId: Number(ilActDropId),
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      const activatedName = teamRoster.find(r => r.player.id === Number(ilActId))?.player.name || 'player';
      const droppedName = teamRoster.find(r => r.player.id === Number(ilActDropId))?.player.name || 'player';
      const cascade = (activateResp.appliedReassignments ?? []).filter(r => r.playerId !== Number(ilActId));
      const activatedSlot = activateResp.appliedReassignments?.find(r => r.playerId === Number(ilActId))?.newSlot;
      setTxResult({
        title: 'IL activation complete',
        primaryLine: activatedSlot
          ? `Activated ${activatedName} to ${activatedSlot}, dropped ${droppedName}.`
          : `Activated ${activatedName}, dropped ${droppedName}.`,
        cascadeMoves: cascade,
      });
      setIlActId('');
      setIlActDropId('');
      handleUpdate();
    } catch (err: unknown) {
      setIlActError(extractServerError(err, 'IL activate failed'));
      reportError(err, { source: 'commissioner-il-activate' });
    } finally {
      setIlActSubmitting(false);
    }
  }

  async function handleIlStash() {
    if (!actingAsTeamId || ilStashId === '' || ilReplId === null) return;
    setIlSubmitting(true);
    setIlError(null);
    try {
      const stashResp = await ilStash({
        leagueId,
        teamId: actingAsTeamId,
        stashPlayerId: Number(ilStashId),
        addPlayerId: ilReplId,
        addMlbId: ilReplMlbId ?? undefined,
        ...(effectiveDate ? { effectiveDate } : {}),
      });
      const stashedName = teamRoster.find(r => r.player.id === Number(ilStashId))?.player.name || 'player';
      const addedName = playerName((playersEnriched as any[]).find(p => p.id === ilReplId)) || 'player';
      const cascade = (stashResp.appliedReassignments ?? []).filter(
        r => r.playerId !== Number(ilStashId) && r.playerId !== ilReplId,
      );
      setTxResult({
        title: 'IL stash complete',
        primaryLine: `Placed ${stashedName} on IL, added ${addedName}.`,
        cascadeMoves: cascade,
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

      {/* ── Two-column body: roster on left, action panels on right ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 500 }}>

        {/* ── LEFT: Roster table ── */}
        <div style={{ width: '38%', minWidth: 240, borderRight: '1px solid var(--am-border)', display: 'flex', flexDirection: 'column' }}>
          <div className="cm-section-head" style={{ borderRadius: 0 }}>
            <span className="cm-h2 cm-grow">
              {loading ? 'Loading…' : `${actingTeamName} · ${teamRoster.length} players`}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {teamRoster.length === 0 && !loading ? (
              <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--am-text-muted)' }}>No roster found.</div>
            ) : (
              <table className="cm-table dense">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Status</th>
                    <th style={{ width: 70 }}></th>
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
                            ? <span className="cm-chip neg">Activate Needed</span>
                            : isIl
                              ? <span className="cm-chip warn">IL</span>
                              : isMlbIlStatus(mlbStatus)
                                ? <span className="cm-chip warn">MLB IL</span>
                                : <span className="cm-chip accent">Active</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {isIl ? (
                              <button
                                type="button"
                                className="cm-btn ghost sm"
                                onClick={() => { setIlMode('activate'); setIlActId(r.player.id); setIlActDropId(''); }}
                              >
                                Activate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="cm-btn ghost sm"
                                onClick={() => { setIlMode('stash'); setIlStashId(r.player.id); setIlReplId(null); }}
                              >
                                IL
                              </button>
                            )}
                            <button
                              type="button"
                              className="cm-btn ghost sm"
                              onClick={() => setAdDropId(r.player.id)}
                            >
                              Drop
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── RIGHT: Add/Drop + IL Management stacked ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

          {/* ── Add / Drop (3 columns) ── */}
          <div id="add-drop-panel" style={{ borderBottom: '1px solid var(--am-border)', display: 'flex', flexDirection: 'column' }}>
            <div className="cm-section-head" style={{ borderRadius: 0 }}>
              <span className="cm-h2">Add / Drop</span>
              {adError && <span style={{ fontSize: 11, color: 'var(--am-negative)', marginLeft: 12 }}>{adError}</span>}
            </div>
            <div style={{ display: 'flex', flex: 1 }}>
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
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 400 }}>
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
                  {/* Slot rearrangement — appears once a drop player is chosen */}
                  {adDropId !== '' && (() => {
                    const editable = teamRoster.filter(r =>
                      r.assignedPosition !== 'IL' && r.player.id !== Number(adDropId)
                    );
                    if (editable.length === 0) return null;
                    const overrides = Object.fromEntries(slotChanges.map(c => [c.playerId, c.slot]));
                    const changedCount = slotChanges.length;
                    return (
                      <div style={{ borderTop: '1px solid var(--am-border)', paddingTop: 8 }}>
                        <div className="cm-cap" style={{ marginBottom: 6 }}>
                          Adjust slots (optional)
                          {changedCount > 0 && (
                            <span style={{ marginLeft: 8, background: 'color-mix(in srgb, var(--am-accent) 14%, var(--am-surface))', color: 'var(--am-accent)', border: '1px solid color-mix(in srgb, var(--am-accent) 35%, var(--am-border))', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                              {changedCount} moved
                            </span>
                          )}
                        </div>
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--am-text-faint)', paddingBottom: 4 }}>Player</th>
                              <th style={{ textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--am-text-faint)', paddingBottom: 4 }}>Now</th>
                              <th style={{ textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--am-text-faint)', paddingBottom: 4 }}>Move to</th>
                            </tr>
                          </thead>
                          <tbody>
                            {editable.map(r => {
                              const pid = r.player.id;
                              const currentSlot = slotLabel(r.assignedPosition);
                              const posList = posListByPlayerId.get(pid) || r.player.posPrimary;
                              const eligible = Array.from(slotsFor(posList)).sort(
                                (a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b)
                              );
                              const selectedSlot = overrides[pid] ?? currentSlot;
                              const changed = overrides[pid] != null && overrides[pid] !== currentSlot;
                              return (
                                <tr key={pid} style={{ background: changed ? 'color-mix(in srgb, var(--am-accent) 7%, transparent)' : 'transparent' }}>
                                  <td style={{ padding: '3px 4px 3px 0', fontWeight: 600, color: 'var(--am-text)' }}>
                                    {r.player.name}
                                    {changed && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--am-accent)' }}>✓</span>}
                                  </td>
                                  <td style={{ padding: '3px 6px 3px 0', color: changed ? 'var(--am-text-faint)' : 'var(--am-text-muted)', textDecoration: changed ? 'line-through' : 'none', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                                    {currentSlot}
                                  </td>
                                  <td style={{ padding: '3px 0' }}>
                                    <select
                                      className="cm-select"
                                      style={{ fontSize: 11, padding: '2px 6px' }}
                                      value={selectedSlot}
                                      onChange={e => {
                                        const next = slotChanges.filter(c => c.playerId !== pid);
                                        if (e.target.value !== currentSlot) next.push({ playerId: pid, slot: e.target.value });
                                        setSlotChanges(next);
                                      }}
                                    >
                                      {eligible.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {changedCount > 0 && (
                          <button type="button" style={{ marginTop: 4, fontSize: 10, color: 'var(--am-text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => setSlotChanges([])}>
                            Reset
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="cm-btn primary"
                      style={{ flex: 1 }}
                      disabled={adAddId === null || adDropId === '' || adSubmitting}
                      onClick={handleAddDrop}
                    >
                      {adSubmitting ? 'Executing…' : 'Execute Add'}
                    </button>
                    <button
                      type="button"
                      className="cm-btn ghost"
                      disabled={adSubmitting}
                      onClick={() => {
                        setAdAddId(null);
                        setAdAddMlbId(null);
                        setAdDropId('');
                        setAdQuery('');
                        setSlotChanges([]);
                        setAdError(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  {slotChanges.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--am-text-muted)' }}>
                      {slotChanges.length} slot adjustment{slotChanges.length !== 1 ? 's' : ''} will be applied before the claim.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── IL Management (3 columns) ──
              Two modes: 'stash' places a player on IL + brings up a FA;
              'activate' brings an IL player back + drops an active player.
              The mode toggle mirrors what was on chain-drop-candidates'
              ActivateFromIlPanel — adapted to main's cm-table design. */}
          <div id="il-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div className="cm-section-head" style={{ borderRadius: 0, gap: 12 }}>
              <span className="cm-h2">IL Management</span>
              <div className="cm-row" style={{ gap: 4, marginLeft: 'auto' }}>
                <button
                  type="button"
                  className={`cm-btn sm ${ilMode === 'stash' ? 'primary' : 'ghost'}`}
                  onClick={() => setIlMode('stash')}
                >
                  Place on IL
                </button>
                <button
                  type="button"
                  className={`cm-btn sm ${ilMode === 'activate' ? 'primary' : 'ghost'}`}
                  onClick={() => setIlMode('activate')}
                >
                  Activate from IL
                </button>
              </div>
              {ilMode === 'stash' && ilError && <span style={{ fontSize: 11, color: 'var(--am-negative)' }}>{ilError}</span>}
              {ilMode === 'activate' && ilActError && <span style={{ fontSize: 11, color: 'var(--am-negative)' }}>{ilActError}</span>}
            </div>
            <div style={{ display: ilMode === 'stash' ? 'flex' : 'none', flex: 1 }}>
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
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="cm-btn primary"
                      style={{ flex: 1 }}
                      disabled={ilStashId === '' || ilReplId === null || ilSubmitting}
                      onClick={handleIlStash}
                    >
                      {ilSubmitting ? 'Confirming…' : 'Confirm Stash + Add'}
                    </button>
                    <button
                      type="button"
                      className="cm-btn ghost"
                      disabled={ilSubmitting}
                      onClick={() => {
                        setIlStashId('');
                        setIlReplId(null);
                        setIlReplMlbId(null);
                        setIlReplQuery('');
                        setIlError(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Activate-from-IL drawer (mode === 'activate') ──
                Mirror of the Stash drawer above: pick an IL-slotted player,
                pick an active player to drop (filtered to slots the activated
                player can fill), confirm. Server (POST /transactions/il-activate)
                handles the slot inheritance and chain rearrangement. */}
            <div style={{ display: ilMode === 'activate' ? 'flex' : 'none', flex: 1 }}>
              {/* Col 1: IL-slotted player to activate */}
              <div style={colStyle}>
                <div style={colHead}>Bring back from IL</div>
                <div style={colBody}>
                  {teamRoster.filter(r => r.assignedPosition === 'IL').length === 0 ? (
                    <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No players currently on IL.</div>
                  ) : teamRoster.filter(r => r.assignedPosition === 'IL').map(r => (
                    <div
                      key={r.id}
                      style={rowStyle(Number(ilActId) === r.player.id)}
                      onClick={() => { setIlActId(r.player.id); setIlActDropId(''); }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{r.player.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--am-text-muted)' }}>
                          Eligible: {posListByPlayerId.get(r.player.id) || r.player.posPrimary}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Col 2: Active player to drop — eligibility-filtered.
                  Direct-fit slots (the activated player's eligible positions)
                  are shown without a "reshuffle" hint; non-direct slots are
                  flagged so the commissioner knows the chain will need to
                  rearrange. */}
              <div style={colStyle}>
                <div style={colHead}>Drop an active player</div>
                <div style={colBody}>
                  {(() => {
                    if (ilActId === '') {
                      return <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>Pick an IL player first.</div>;
                    }
                    const activatedPosList = posListByPlayerId.get(Number(ilActId)) || '';
                    const activatedSlots = slotsFor(activatedPosList);
                    const actives = teamRoster.filter(r => r.assignedPosition !== 'IL');
                    if (actives.length === 0) {
                      return <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--am-text-muted)' }}>No active players to drop.</div>;
                    }
                    // Sort by direct-fit first so the simplest path surfaces.
                    // `activatedSlots` is keyed on the narrow eligibility SlotCode
                    // (no SP/RP/BN/IL); guard with isSlotCode before .has().
                    const fits = (slot: string) =>
                      isSlotCode(slot) && activatedSlots.has(slot);
                    const sorted = actives.slice().sort((a, b) => {
                      const aSlot = a.assignedPosition ?? 'BN';
                      const bSlot = b.assignedPosition ?? 'BN';
                      const aFit = fits(aSlot) ? 0 : 1;
                      const bFit = fits(bSlot) ? 0 : 1;
                      return aFit - bFit || slotRank(aSlot) - slotRank(bSlot);
                    });
                    return sorted.map(r => {
                      const slot = r.assignedPosition ?? 'BN';
                      const direct = fits(slot);
                      return (
                        <div
                          key={r.id}
                          style={rowStyle(Number(ilActDropId) === r.player.id)}
                          onClick={() => setIlActDropId(r.player.id)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.player.name}</div>
                            <div style={{ fontSize: 10, color: direct ? 'var(--am-accent)' : 'var(--am-text-muted)' }}>
                              {slot}{direct ? ' · direct fit' : ' · reshuffle'}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Col 3: Confirm */}
              <div style={colLast}>
                <div style={colHead}>Confirm</div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12 }}>
                    <div className="cm-cap" style={{ marginBottom: 4 }}>Activating</div>
                    {(() => {
                      const ilRow = ilActId !== '' ? teamRoster.find(r => r.player.id === Number(ilActId)) : null;
                      return ilRow
                        ? <div style={{ fontWeight: 600 }}>{ilRow.player.name}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{posListByPlayerId.get(ilRow.player.id) || ilRow.player.posPrimary}</span></div>
                        : <div style={{ color: 'var(--am-text-faint)' }}>— select from left</div>;
                    })()}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    <div className="cm-cap" style={{ marginBottom: 4 }}>Dropping</div>
                    {(() => {
                      const dropRow = ilActDropId !== '' ? teamRoster.find(r => r.player.id === Number(ilActDropId)) : null;
                      return dropRow
                        ? <div style={{ fontWeight: 600 }}>{dropRow.player.name}<span style={{ fontWeight: 400, color: 'var(--am-text-muted)', marginLeft: 6 }}>{dropRow.assignedPosition}</span></div>
                        : <div style={{ color: 'var(--am-text-faint)' }}>— select from middle</div>;
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="cm-btn primary"
                      style={{ flex: 1 }}
                      disabled={ilActId === '' || ilActDropId === '' || ilActSubmitting}
                      onClick={handleIlActivate}
                    >
                      {ilActSubmitting ? 'Confirming…' : 'Confirm Activate + Drop'}
                    </button>
                    <button
                      type="button"
                      className="cm-btn ghost"
                      disabled={ilActSubmitting}
                      onClick={() => {
                        setIlActId('');
                        setIlActDropId('');
                        setIlActError(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>{/* end RIGHT */}
      </div>{/* end two-column body */}

      <TransactionResultModal result={txResult} onClose={() => setTxResult(null)} />
    </div>
  );
}

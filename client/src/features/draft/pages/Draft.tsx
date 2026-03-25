import React, { useState, useEffect, useMemo } from "react";
import { Clock, Pause, Play, RotateCcw, SkipForward, Zap, Search } from "lucide-react";
import { useDraftState } from "../hooks/useDraftState";
import { useLeague } from "../../../contexts/LeagueContext";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../contexts/ToastContext";
import { Button } from "../../../components/ui/button";
import PageHeader from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { POS_ORDER } from "../../../lib/baseballUtils";
import { getTeams } from "../../teams/api";
import { fetchJsonApi, API_BASE } from "../../../api/base";

export default function Draft() {
  const { leagueId } = useLeague();
  const { user } = useAuth();
  const { toast } = useToast();
  const { state, loading, error, pick, pause, resume, undo, skip, start, setAutoPick, complete } = useDraftState(leagueId);

  const [teams, setTeams] = useState<Record<number, string>>({});
  const [playerSearch, setPlayerSearch] = useState("");
  const [availablePlayers, setAvailablePlayers] = useState<{ id: number; name: string; posPrimary: string }[]>([]);
  const [picking, setPicking] = useState(false);

  // Load team names
  useEffect(() => {
    if (!leagueId) return;
    getTeams(leagueId).then(t => {
      const map: Record<number, string> = {};
      t.forEach((team: any) => { map[team.id] = team.name; });
      setTeams(map);
    }).catch(() => {});
  }, [leagueId]);

  // Load available players
  useEffect(() => {
    fetchJsonApi<{ players: { id: number; name: string; posPrimary: string }[] }>(
      `${API_BASE}/players?leagueId=${leagueId}&limit=2000`
    ).then(res => setAvailablePlayers(res.players || [])).catch(() => {});
  }, [leagueId]);

  // Timer countdown
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!state?.timerExpiresAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((state.timerExpiresAt! - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state?.timerExpiresAt]);

  const draftedSet = useMemo(() => new Set(state?.draftedPlayerIds || []), [state?.draftedPlayerIds]);

  const filteredPlayers = useMemo(() => {
    return availablePlayers
      .filter(p => !draftedSet.has(p.id))
      .filter(p => !playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase()))
      .sort((a, b) => {
        const ia = POS_ORDER.indexOf(a.posPrimary);
        const ib = POS_ORDER.indexOf(b.posPrimary);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .slice(0, 100);
  }, [availablePlayers, draftedSet, playerSearch]);

  const currentTeamId = state?.pickOrder?.[state.currentPickIndex];
  const currentTeamName = currentTeamId ? teams[currentTeamId] || `Team ${currentTeamId}` : "—";
  const isMyTurn = currentTeamId != null && teams[currentTeamId] != null; // simplified — real check would verify user ownership
  const isCommissioner = Boolean(user?.isAdmin);
  const currentRound = state ? Math.floor(state.currentPickIndex / state.config.teamOrder.length) + 1 : 0;
  const currentPickInRound = state ? (state.currentPickIndex % state.config.teamOrder.length) + 1 : 0;

  const handlePick = async (playerId: number) => {
    if (!currentTeamId || picking) return;
    setPicking(true);
    try {
      await pick(currentTeamId, playerId);
      toast("Pick made!", "success");
    } catch (err) {
      toast((err as Error)?.message || "Pick failed", "error");
    } finally {
      setPicking(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-10"><EmptyState icon={Zap} title="Draft not available" description={error} /></div>;
  if (!state) return <div className="max-w-3xl mx-auto px-4 py-10"><EmptyState icon={Zap} title="No draft session" description="The commissioner needs to initialize the draft." /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader title="Snake Draft" subtitle={`${state.config.totalRounds} rounds · ${state.config.teamOrder.length} teams · ${state.config.orderType}`} />

      {/* Draft Status Bar */}
      <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Status</div>
            <div className={`text-sm font-bold uppercase ${
              state.status === "active" ? "text-emerald-400" :
              state.status === "paused" ? "text-amber-400" :
              state.status === "completed" ? "text-blue-400" : "text-[var(--lg-text-muted)]"
            }`}>{state.status}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">On the Clock</div>
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{currentTeamName}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Round</div>
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{currentRound} of {state.config.totalRounds}</div>
          </div>
          {timeLeft !== null && state.status === "active" && (
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Timer</div>
              <div className={`text-lg font-bold tabular-nums ${timeLeft <= 10 ? "text-red-400 animate-pulse" : "text-[var(--lg-text-primary)]"}`}>
                <Clock size={14} className="inline -mt-0.5 mr-1" />{timeLeft}s
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Picks</div>
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{state.picks.length} / {state.pickOrder.length}</div>
          </div>
        </div>

        {/* Commissioner Controls */}
        {isCommissioner && (
          <div className="flex items-center gap-2 flex-wrap">
            {state.status === "waiting" && <Button size="sm" onClick={start}><Play size={12} /> Start</Button>}
            {state.status === "active" && <Button size="sm" variant="amber" onClick={pause}><Pause size={12} /> Pause</Button>}
            {state.status === "paused" && <Button size="sm" variant="emerald" onClick={resume}><Play size={12} /> Resume</Button>}
            {state.picks.length > 0 && state.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={undo}><RotateCcw size={12} /> Undo</Button>
            )}
            {state.status === "active" && (
              <Button size="sm" variant="outline" onClick={skip}><SkipForward size={12} /> Skip</Button>
            )}
            {state.status === "completed" && (
              <Button size="sm" onClick={complete}>Finalize Rosters</Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pick List (2/3 width) */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase text-[var(--lg-text-muted)] mb-3">Pick History</h3>
          {state.picks.length === 0 ? (
            <EmptyState icon={Zap} title="No picks yet" description="The draft will begin when the commissioner starts it." compact />
          ) : (
            <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
              <ThemedTable>
                <ThemedThead>
                  <ThemedTr>
                    <ThemedTh className="w-12">#</ThemedTh>
                    <ThemedTh className="w-16">Round</ThemedTh>
                    <ThemedTh>Team</ThemedTh>
                    <ThemedTh>Player</ThemedTh>
                    <ThemedTh className="w-12">Pos</ThemedTh>
                    <ThemedTh className="w-16">Auto</ThemedTh>
                  </ThemedTr>
                </ThemedThead>
                <tbody className="divide-y divide-[var(--lg-divide)]">
                  {[...state.picks].reverse().map(p => (
                    <ThemedTr key={p.pickNum}>
                      <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{p.pickNum}</ThemedTd>
                      <ThemedTd className="tabular-nums">{p.round}</ThemedTd>
                      <ThemedTd className="font-medium">{teams[p.teamId] || `Team ${p.teamId}`}</ThemedTd>
                      <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">{p.playerName || "SKIPPED"}</ThemedTd>
                      <ThemedTd className="text-[var(--lg-text-muted)]">{p.position || "—"}</ThemedTd>
                      <ThemedTd>{p.isAutoPick ? <span className="text-[10px] text-amber-400 font-bold">AUTO</span> : ""}</ThemedTd>
                    </ThemedTr>
                  ))}
                </tbody>
              </ThemedTable>
            </div>
          )}
        </div>

        {/* Player Pool (1/3 width) */}
        <div>
          <h3 className="text-sm font-semibold uppercase text-[var(--lg-text-muted)] mb-3">Available Players</h3>
          <div className="mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lg-text-muted)]" />
              <input
                type="text"
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full h-9 pl-8 pr-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-xs text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none focus:border-[var(--lg-accent)]"
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden max-h-[600px] overflow-y-auto">
            {filteredPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => handlePick(p.id)}
                disabled={state.status !== "active" || picking}
                className="w-full flex items-center justify-between px-3 py-2 text-xs border-b border-[var(--lg-border-faint)] last:border-0 hover:bg-[var(--lg-tint)] disabled:opacity-40 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[var(--lg-text-muted)] w-5 text-center flex-shrink-0">{p.posPrimary}</span>
                  <span className="font-medium text-[var(--lg-text-primary)] truncate">{p.name}</span>
                </div>
                {state.status === "active" && (
                  <span className="text-[10px] font-semibold text-[var(--lg-accent)] flex-shrink-0 ml-2">PICK</span>
                )}
              </button>
            ))}
            {filteredPlayers.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--lg-text-muted)]">No players match</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from "react";
import { Clock, Pause, Play, RotateCcw, SkipForward, Zap, Search, MessageSquare, Wifi, WifiOff } from "lucide-react";
import { useDraftState, type ChatMessage } from "../hooks/useDraftState";
import { useLeague } from "../../../contexts/LeagueContext";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../contexts/ToastContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import { Button } from "../../../components/ui/button";
import PageHeader from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { POS_ORDER } from "../../../lib/baseballUtils";
import DraftBoard from "../components/DraftBoard";
import { getTeams } from "../../teams/api";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { initDraft } from "../api";

type TabKey = "board" | "picks" | "chat";

export default function Draft() {
  const { leagueId } = useLeague();
  const { user } = useAuth();
  const { toast } = useToast();
  const gating = useSeasonGating();
  const {
    state, loading, error, connectionStatus,
    chatMessages, sendChat,
    pick, pause, resume, undo, skip, start, setAutoPick, complete, reset, refresh,
  } = useDraftState(leagueId);

  const [teams, setTeams] = useState<Record<number, string>>({});
  const [teamList, setTeamList] = useState<{ id: number; name: string }[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [availablePlayers, setAvailablePlayers] = useState<{ id: number; name: string; posPrimary: string; mlbTeam?: string }[]>([]);
  const [picking, setPicking] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("board");
  const [chatInput, setChatInput] = useState("");
  const [myTeamId, setMyTeamId] = useState<number | undefined>(undefined);

  // Load team names
  useEffect(() => {
    if (!leagueId) return;
    getTeams(leagueId).then(t => {
      const map: Record<number, string> = {};
      const list: { id: number; name: string }[] = [];
      t.forEach((team: any) => { map[team.id] = team.name; list.push({ id: team.id, name: team.name }); });
      setTeams(map);
      setTeamList(list);

      // Find my team
      if (user) {
        const mine = t.find((tm: any) =>
          tm.ownerUserId === user.id ||
          tm.ownerships?.some((o: any) => o.userId === user.id)
        );
        if (mine) setMyTeamId(mine.id);
      }
    }).catch(() => {});
  }, [leagueId, user]);

  // Load available players
  useEffect(() => {
    if (!leagueId) return;
    fetchJsonApi<{ players: { id: number; name: string; posPrimary: string; mlbTeam?: string }[] }>(
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
      .filter(p => posFilter === "ALL" || p.posPrimary === posFilter)
      .sort((a, b) => {
        const ia = POS_ORDER.indexOf(a.posPrimary);
        const ib = POS_ORDER.indexOf(b.posPrimary);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .slice(0, 150);
  }, [availablePlayers, draftedSet, playerSearch, posFilter]);

  const currentTeamId = state?.pickOrder?.[state.currentPickIndex];
  const currentTeamName = currentTeamId ? teams[currentTeamId] || `Team ${currentTeamId}` : "--";
  const isMyTurn = currentTeamId != null && currentTeamId === myTeamId;
  const isCommissioner = Boolean(user?.isAdmin) || Boolean(
    user?.memberships?.find((m: any) => m.leagueId === leagueId)?.role === "COMMISSIONER"
  );
  const currentRound = state ? Math.floor(state.currentPickIndex / state.config.teamOrder.length) + 1 : 0;

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

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput("");
  };

  // Commissioner init screen — only if no draft session exists and season is DRAFT
  if (!loading && !state && !error && isCommissioner && gating.canAuction) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <PageHeader title="Snake Draft" subtitle="Initialize the draft to get started." />
        <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6 mt-6">
          <h3 className="text-sm font-semibold text-[var(--lg-text-heading)] mb-4">Draft Setup</h3>
          <p className="text-xs text-[var(--lg-text-muted)] mb-4">
            Set the team order and start the snake draft. Teams pick in order, reversing each round.
          </p>
          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)] mb-1 block">Draft Order</label>
            <p className="text-xs text-[var(--lg-text-secondary)]">
              {teamList.map(t => t.name).join(" -> ") || "Loading teams..."}
            </p>
          </div>
          <Button
            onClick={async () => {
              if (!leagueId || teamList.length < 2) return;
              try {
                await initDraft({
                  leagueId,
                  teamOrder: teamList.map(t => t.id),
                  totalRounds: 23,
                  secondsPerPick: 120,
                  orderType: "SNAKE",
                });
                toast("Draft initialized!", "success");
                refresh();
              } catch (err) {
                toast((err as Error)?.message || "Init failed", "error");
              }
            }}
            disabled={teamList.length < 2}
          >
            Initialize Draft
          </Button>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="p-4 md:p-8 space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-2xl bg-[var(--lg-tint)]" />
      <div className="h-64 rounded-2xl bg-[var(--lg-tint)]" />
    </div>
  );

  if (error) return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <EmptyState icon={Zap} title="Draft not available" description={error} />
    </div>
  );

  if (!state) return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <EmptyState icon={Zap} title="No draft session" description="The commissioner needs to initialize the draft." />
    </div>
  );

  // Waiting screen for non-commissioners
  if (state.status === "waiting" && !isCommissioner) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Snake Draft</h2>
      <p className="text-sm text-[var(--lg-text-muted)]">Waiting for the commissioner to start the draft...</p>
    </div>
  );

  const positions = ["ALL", ...Array.from(new Set(availablePlayers.map(p => p.posPrimary)))
    .sort((a, b) => (POS_ORDER.indexOf(a) === -1 ? 99 : POS_ORDER.indexOf(a)) - (POS_ORDER.indexOf(b) === -1 ? 99 : POS_ORDER.indexOf(b)))];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <div className="flex items-center justify-between mb-4">
        <PageHeader
          title="Snake Draft"
          subtitle={`${state.config.totalRounds} rounds · ${state.config.teamOrder.length} teams · ${state.config.orderType}`}
        />
        <div className="flex items-center gap-1.5 text-[10px]">
          {connectionStatus === "connected" ? (
            <><Wifi size={12} className="text-emerald-400" /><span className="text-emerald-400 font-medium">Live</span></>
          ) : (
            <><WifiOff size={12} className="text-[var(--lg-text-muted)]" /><span className="text-[var(--lg-text-muted)]">Polling</span></>
          )}
        </div>
      </div>

      {/* Draft Status Bar */}
      <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
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
            <div className={`text-sm font-semibold ${isMyTurn ? "text-[var(--lg-accent)]" : "text-[var(--lg-text-primary)]"}`}>
              {isMyTurn ? "YOUR PICK!" : currentTeamName}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Round</div>
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{currentRound} of {state.config.totalRounds}</div>
          </div>
          {timeLeft !== null && state.status === "active" && (
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Timer</div>
              <div className={`text-lg font-bold tabular-nums ${timeLeft <= 10 ? "text-red-400 animate-pulse" : timeLeft <= 30 ? "text-amber-400" : "text-[var(--lg-text-primary)]"}`}>
                <Clock size={14} className="inline -mt-0.5 mr-1" />{timeLeft}s
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Picks</div>
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{state.picks.length} / {state.pickOrder.length}</div>
          </div>
        </div>

        {/* Commissioner/Owner Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {myTeamId && state.status === "active" && (
            <Button
              size="sm"
              variant={state.autoPickTeams.includes(myTeamId) ? "amber" : "outline"}
              onClick={() => setAutoPick(myTeamId, !state.autoPickTeams.includes(myTeamId))}
            >
              {state.autoPickTeams.includes(myTeamId) ? "Auto ON" : "Auto OFF"}
            </Button>
          )}
          {isCommissioner && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* My Turn Banner */}
      {isMyTurn && state.status === "active" && (
        <div className="rounded-xl border-2 border-[var(--lg-accent)] bg-[var(--lg-accent)]/10 p-3 mb-4 text-center">
          <span className="text-sm font-bold text-[var(--lg-accent)]">It is your turn to pick! Select a player from the pool below.</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--lg-border-faint)]">
        {(["board", "picks", "chat"] as TabKey[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-semibold uppercase border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[var(--lg-accent)] text-[var(--lg-accent)]"
                : "border-transparent text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
            }`}
          >
            {tab === "chat" && <MessageSquare size={12} className="inline -mt-0.5 mr-1" />}
            {tab}{tab === "chat" && chatMessages.length > 0 ? ` (${chatMessages.length})` : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Panel (2/3 width) */}
        <div className="lg:col-span-2">
          {activeTab === "board" && (
            <DraftBoard
              picks={state.picks}
              teamOrder={state.config.teamOrder}
              totalRounds={state.config.totalRounds}
              teams={teams}
              currentPickIndex={state.currentPickIndex}
              pickOrder={state.pickOrder}
              myTeamId={myTeamId}
            />
          )}

          {activeTab === "picks" && (
            <>
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
                        <ThemedTh className="w-[180px]">Team</ThemedTh>
                        <ThemedTh className="w-[220px]">Player</ThemedTh>
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
                          <ThemedTd className="text-[var(--lg-text-muted)]">{p.position || "--"}</ThemedTd>
                          <ThemedTd>{p.isAutoPick ? <span className="text-[10px] text-amber-400 font-bold">AUTO</span> : ""}</ThemedTd>
                        </ThemedTr>
                      ))}
                    </tbody>
                  </ThemedTable>
                </div>
              )}
            </>
          )}

          {activeTab === "chat" && (
            <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden flex flex-col h-[500px]">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-[var(--lg-text-muted)] text-center py-10">No messages yet. Say something!</p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-[var(--lg-text-primary)]">{msg.userName}: </span>
                      <span className="text-[var(--lg-text-secondary)]">{msg.text}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-[var(--lg-border-faint)] p-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSendChat(); }}
                  placeholder="Type a message..."
                  className="flex-1 h-8 px-3 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-xs text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] outline-none focus:border-[var(--lg-accent)]"
                />
                <Button size="sm" onClick={handleSendChat} disabled={!chatInput.trim()}>Send</Button>
              </div>
            </div>
          )}
        </div>

        {/* Player Pool (1/3 width) */}
        <div>
          <h3 className="text-sm font-semibold uppercase text-[var(--lg-text-muted)] mb-3">
            Available Players
            <span className="ml-2 text-[var(--lg-text-muted)] font-normal">({availablePlayers.length - draftedSet.size})</span>
          </h3>
          <div className="mb-3 space-y-2">
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
            <div className="flex flex-wrap gap-1">
              {positions.map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    posFilter === pos
                      ? "bg-[var(--lg-accent)] text-white"
                      : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden max-h-[600px] overflow-y-auto">
            {filteredPlayers.map(p => (
              <button
                key={p.id}
                onClick={() => handlePick(p.id)}
                disabled={state.status !== "active" || picking || !isMyTurn}
                className="w-full flex items-center justify-between px-3 py-2 text-xs border-b border-[var(--lg-border-faint)] last:border-0 hover:bg-[var(--lg-tint)] disabled:opacity-40 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] text-[var(--lg-text-muted)] w-6 text-center flex-shrink-0">{p.posPrimary}</span>
                  <span className="font-medium text-[var(--lg-text-primary)] truncate">{p.name}</span>
                  {p.mlbTeam && <span className="text-[10px] text-[var(--lg-text-muted)]">{p.mlbTeam}</span>}
                </div>
                {state.status === "active" && isMyTurn && (
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

import React, { useEffect, useState, useCallback } from "react";
import { ArrowLeftRight, Plus, X, Edit2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getTradingBlock, getMyTradingBlock, addToTradingBlock, updateTradingBlockItem, removeFromTradingBlock, type TradingBlockItem } from "../api";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Button } from "../../../components/ui/button";
import { useLeague } from "../../../contexts/LeagueContext";

interface TradingBlockPanelProps {
  /** If provided, shows only this team's block with edit controls */
  teamId?: number;
  /** If true, show league-wide trading block (read-only for other teams) */
  leagueWide?: boolean;
  /** Available roster players for quick-add (only when teamId is set) */
  rosterPlayers?: { id: number; name: string; posPrimary: string; mlbTeam: string | null }[];
}

export default function TradingBlockPanel({ teamId, leagueWide = false, rosterPlayers }: TradingBlockPanelProps) {
  const { leagueId, myTeamId } = useLeague();
  const [items, setItems] = useState<TradingBlockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addPlayerId, setAddPlayerId] = useState<number | null>(null);
  const [addAskingFor, setAddAskingFor] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit askingFor
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAskingFor, setEditAskingFor] = useState("");

  const isMyTeam = teamId === myTeamId;
  const effectiveTeamId = teamId ?? myTeamId;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (leagueWide) {
        const res = await getTradingBlock(leagueId);
        setItems(res.items ?? []);
      } else if (effectiveTeamId && isMyTeam) {
        const res = await getMyTradingBlock(effectiveTeamId);
        setItems(res.items ?? []);
      } else {
        // Non-owner viewing a team page — don't fetch (owner-only endpoint)
        setItems([]);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load trading block");
    } finally {
      setLoading(false);
    }
  }, [leagueId, effectiveTeamId, leagueWide, isMyTeam]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addPlayerId || !effectiveTeamId) return;
    try {
      setAdding(true);
      const item = await addToTradingBlock({ teamId: effectiveTeamId, playerId: addPlayerId, askingFor: addAskingFor || undefined });
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setAddPlayerId(null);
      setAddAskingFor("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (playerId: number) => {
    if (!effectiveTeamId) return;
    try {
      await removeFromTradingBlock(playerId, effectiveTeamId);
      setItems((prev) => prev.filter((i) => i.player.id !== playerId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveAskingFor = async (item: TradingBlockItem) => {
    try {
      await updateTradingBlockItem(item.id, { askingFor: editAskingFor || undefined });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, askingFor: editAskingFor || null } : i)));
      setEditingId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const availableToAdd = (rosterPlayers ?? []).filter(
    (p) => !items.some((i) => i.player?.id === p.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--lg-text-muted)]">
        <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
        Loading trading block...
      </div>
    );
  }

  // Group by team for league-wide view
  const grouped = leagueWide
    ? items.reduce((acc, item) => {
        const key = item.teamCode || String(item.teamId);
        if (!acc[key]) acc[key] = { teamName: item.teamName, teamCode: item.teamCode, items: [] };
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { teamName: string; teamCode: string; items: TradingBlockItem[] }>)
    : null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-[var(--lg-error)] bg-[var(--lg-error)]/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--lg-text-heading)]">
          <ArrowLeftRight size={16} />
          Trading Block {leagueWide ? "(League)" : `(${items.length})`}
        </div>
        {isMyTeam && (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={14} className="mr-1" />
            Add Player
          </Button>
        )}
      </div>

      {/* Quick-add form (own team only) */}
      {showAdd && isMyTeam && (
        <div className="lg-card p-4 space-y-3">
          <select
            value={addPlayerId ?? ""}
            onChange={(e) => setAddPlayerId(e.target.value ? Number(e.target.value) : null)}
            className="lg-input w-full text-xs"
            aria-label="Select a player to put on the trading block"
          >
            <option value="">Select a player from your roster...</option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.posPrimary}) — {p.mlbTeam || "FA"}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Looking for... (e.g. 'Need SP', 'Want SB')"
            value={addAskingFor}
            onChange={(e) => setAddAskingFor(e.target.value)}
            className="lg-input w-full"
            maxLength={200}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!addPlayerId || adding}>
              {adding ? "Adding..." : "Put on Block"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddPlayerId(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* League-wide view */}
      {leagueWide && grouped ? (
        Object.keys(grouped).length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] italic">
            No players on the trading block across the league.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([key, group]) => (
              <div key={key}>
                <h3 className="text-xs font-semibold text-[var(--lg-text-heading)] mb-2">
                  <Link to={`/teams/${group.teamCode}`} className="hover:text-[var(--lg-accent)] transition-colors">
                    {group.teamName}
                  </Link>
                </h3>
                <div className="overflow-x-auto">
                  <ThemedTable bare density="compact" zebra aria-label={`${group.teamName} trading block`}>
                    <ThemedThead>
                      <ThemedTr>
                        <ThemedTh frozen>Player</ThemedTh>
                        <ThemedTh>POS</ThemedTh>
                        <ThemedTh>MLB</ThemedTh>
                        <ThemedTh>Looking For</ThemedTh>
                      </ThemedTr>
                    </ThemedThead>
                    <tbody className="divide-y divide-[var(--lg-divide)]">
                      {group.items.map((item) => (
                        <ThemedTr key={item.id} className="hover:bg-[var(--lg-tint)] transition-colors">
                          <ThemedTd frozen>
                            <span className="font-semibold text-[11px]">{item.player?.name ?? "Unknown"}</span>
                          </ThemedTd>
                          <ThemedTd>
                            <span className="px-1 py-px rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {item.player?.posPrimary ?? "—"}
                            </span>
                          </ThemedTd>
                          <ThemedTd>
                            <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">{item.player?.mlbTeam || "FA"}</span>
                          </ThemedTd>
                          <ThemedTd>
                            <span className="text-[10px] text-[var(--lg-text-secondary)] italic">
                              {item.askingFor || "—"}
                            </span>
                          </ThemedTd>
                        </ThemedTr>
                      ))}
                    </tbody>
                  </ThemedTable>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Single-team view */
        items.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] italic">
            No players on the trading block. {isMyTeam ? "Add players you're willing to trade." : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ThemedTable bare density="compact" zebra aria-label="Trading block">
              <ThemedThead>
                <ThemedTr>
                  <ThemedTh frozen>Player</ThemedTh>
                  <ThemedTh>POS</ThemedTh>
                  <ThemedTh>MLB</ThemedTh>
                  <ThemedTh>Looking For</ThemedTh>
                  {isMyTeam && <ThemedTh align="center">Actions</ThemedTh>}
                </ThemedTr>
              </ThemedThead>
              <tbody className="divide-y divide-[var(--lg-divide)]">
                {items.map((item) => (
                  <ThemedTr key={item.id} className="hover:bg-[var(--lg-tint)] transition-colors">
                    <ThemedTd frozen>
                      <span className="font-semibold text-[11px]">{item.player?.name ?? "Unknown"}</span>
                    </ThemedTd>
                    <ThemedTd>
                      <span className="px-1 py-px rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {item.player?.posPrimary ?? "—"}
                      </span>
                    </ThemedTd>
                    <ThemedTd>
                      <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">{item.player?.mlbTeam || "FA"}</span>
                    </ThemedTd>
                    <ThemedTd>
                      {isMyTeam && editingId === item.id ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editAskingFor}
                            onChange={(e) => setEditAskingFor(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveAskingFor(item)}
                            className="lg-input text-[10px] py-0.5 px-1 w-32"
                            maxLength={200}
                            autoFocus
                          />
                          <button type="button" onClick={() => handleSaveAskingFor(item)} className="text-[var(--lg-accent)] text-[10px]">Save</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { if (isMyTeam) { setEditingId(item.id); setEditAskingFor(item.askingFor || ""); } }}
                          className={`text-[10px] text-[var(--lg-text-secondary)] italic max-w-[140px] truncate ${isMyTeam ? "hover:text-[var(--lg-accent)] cursor-pointer" : "cursor-default"}`}
                          title={item.askingFor || (isMyTeam ? "Set what you're looking for" : "")}
                        >
                          {item.askingFor || (isMyTeam ? <span className="opacity-40">+ asking for</span> : "—")}
                        </button>
                      )}
                    </ThemedTd>
                    {isMyTeam && (
                      <ThemedTd align="center">
                        <button
                          type="button"
                          onClick={() => handleRemove(item.player?.id ?? item.id)}
                          className="text-[var(--lg-text-muted)] hover:text-[var(--lg-error)] transition-colors"
                          title="Remove from trading block"
                        >
                          <X size={14} />
                        </button>
                      </ThemedTd>
                    )}
                  </ThemedTr>
                ))}
              </tbody>
            </ThemedTable>
          </div>
        )
      )}
    </div>
  );
}

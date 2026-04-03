import React, { useEffect, useState, useCallback } from "react";
import { Eye, Plus, X } from "lucide-react";
import { getWatchlist, addToWatchlist, updateWatchlistItem, removeFromWatchlist, type WatchlistItem } from "../api";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Button } from "../../../components/ui/button";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";

const TAG_OPTIONS = ["trade-target", "add-drop", "monitor"] as const;

interface WatchlistPanelProps {
  teamId: number;
}

export default function WatchlistPanel({ teamId }: WatchlistPanelProps) {
  const { myTeamId, leagueId } = useLeague();
  const isMyTeam = teamId === myTeamId;

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // All players cache (loaded once for search)
  const [allPlayers, setAllPlayers] = useState<{ id: number; name: string; posPrimary: string; mlbTeam: string | null }[]>([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  // Add player form
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addPlayerId, setAddPlayerId] = useState<number | null>(null);
  const [addPlayerName, setAddPlayerName] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Edit note inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    if (!isMyTeam) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await getWatchlist(teamId);
      setItems(res.items ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, [teamId, isMyTeam]);

  useEffect(() => { load(); }, [load]);

  // Load all players once when Add form opens (for client-side search)
  useEffect(() => {
    if (!showAdd || playersLoaded) return;
    (async () => {
      try {
        const res = await fetchJsonApi<any>(`${API_BASE}/players?leagueId=${leagueId}`);
        const mapped = (res.players ?? []).map((p: any) => ({
          id: Number(p._dbId ?? p.id ?? 0),
          name: p.player_name ?? p.name ?? "",
          posPrimary: (p.positions ?? p.posPrimary ?? "UT").toString().split(/[/,]/)[0] || "UT",
          mlbTeam: p.mlb_team ?? p.mlbTeam ?? null,
        })).filter((p: any) => p.id > 0 && p.name);
        setAllPlayers(mapped);
        setPlayersLoaded(true);
      } catch { /* player search won't work without API */ }
    })();
  }, [showAdd, playersLoaded, leagueId]);

  const handleAdd = async () => {
    if (!addPlayerId) return;
    try {
      setAdding(true);
      setError(null);
      const item = await addToWatchlist({ teamId, playerId: addPlayerId, note: addNote || undefined, tags: addTags.length ? addTags : undefined });
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setAddSearch("");
      setAddPlayerId(null);
      setAddPlayerName("");
      setAddNote("");
      setAddTags([]);
          } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (playerId: number) => {
    try {
      setError(null);
      await removeFromWatchlist(playerId, teamId);
      setItems((prev) => prev.filter((i) => i.playerId !== playerId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveNote = async (item: WatchlistItem) => {
    try {
      setError(null);
      await updateWatchlistItem(item.id, { note: editNote || undefined });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, note: editNote || null } : i)));
      setEditingId(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleTag = async (item: WatchlistItem, tag: string) => {
    const newTags = item.tags.includes(tag) ? item.tags.filter((t) => t !== tag) : [...item.tags, tag];
    try {
      setError(null);
      await updateWatchlistItem(item.id, { tags: newTags });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, tags: newTags } : i)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Client-side search: filter all players by name, exclude already-on-watchlist
  const searchLower = addSearch.toLowerCase();
  const filteredResults = addSearch.length >= 2
    ? allPlayers
        .filter((p) => p.name.toLowerCase().includes(searchLower))
        .filter((p) => !items.some((i) => i?.playerId === p.id))
        .slice(0, 10)
    : [];

  // Non-owners don't see watchlist at all (it's private)
  if (!isMyTeam) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--lg-text-muted)]">
        <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-3" />
        Loading watchlist...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-[var(--lg-error)] bg-[var(--lg-error)]/10 rounded-lg px-3 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--lg-text-heading)]">
          <Eye size={16} />
          Watchlist ({items.length})
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={14} className="mr-1" />
          Add Player
        </Button>
      </div>

      {/* Quick-add form */}
      {showAdd && (
        <div className="lg-card p-4 space-y-3">
          <input
            type="search"
            placeholder="Search any player by name..."
            value={addSearch}
            onChange={(e) => { setAddSearch(e.target.value); setAddPlayerId(null); setAddPlayerName(""); }}
            className="lg-input w-full"
            aria-label="Search players to add to watchlist"
          />
          {showAdd && !playersLoaded && <div className="text-[10px] text-[var(--lg-text-muted)] animate-pulse">Loading players...</div>}
          {addSearch.length >= 2 && filteredResults.length > 0 && !addPlayerId && (
            <div className="max-h-40 overflow-y-auto divide-y divide-[var(--lg-divide)] rounded-lg border border-[var(--lg-border-subtle)]">
              {filteredResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setAddPlayerId(p.id); setAddPlayerName(p.name); setAddSearch(p.name); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--lg-tint)] transition-colors text-[var(--lg-text-primary)]"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-2 text-[var(--lg-text-muted)]">{p.posPrimary} · {p.mlbTeam || "FA"}</span>
                </button>
              ))}
            </div>
          )}
          {addPlayerId && (
            <div className="text-xs text-[var(--lg-accent)] font-semibold">Selected: {addPlayerName}</div>
          )}
          <input
            type="text"
            placeholder="Note (optional)"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            className="lg-input w-full"
            maxLength={200}
          />
          <div className="flex gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setAddTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full border transition-colors ${addTags.includes(tag) ? "bg-[var(--lg-accent)] text-white border-[var(--lg-accent)]" : "text-[var(--lg-text-muted)] border-[var(--lg-border-subtle)] hover:border-[var(--lg-accent)]"}`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!addPlayerId || adding}>
              {adding ? "Adding..." : "Add to Watchlist"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddSearch(""); setAddPlayerId(null); setAddPlayerName(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Watchlist table */}
      {items.length === 0 ? (
        <div className="text-center py-8 text-xs text-[var(--lg-text-muted)] italic">
          No players on your watchlist yet. Add players you want to track.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ThemedTable bare density="compact" zebra aria-label="Watchlist">
            <ThemedThead>
              <ThemedTr>
                <ThemedTh frozen>Player</ThemedTh>
                <ThemedTh>POS</ThemedTh>
                <ThemedTh>MLB</ThemedTh>
                <ThemedTh>Tags</ThemedTh>
                <ThemedTh>Note</ThemedTh>
                <ThemedTh align="center">Remove</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {items.map((item) => (
                <ThemedTr key={item.id} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd frozen>
                    <span className="font-semibold text-[11px] text-[var(--lg-text-primary)]">{item.player?.name ?? "Unknown"}</span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="px-1 py-px rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {item.player?.posPrimary ?? "—"}
                    </span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">
                      {item.player?.mlbTeam || "FA"}
                    </span>
                  </ThemedTd>
                  <ThemedTd>
                    <div className="flex gap-1 flex-wrap">
                      {TAG_OPTIONS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(item, tag)}
                          className={`px-1.5 py-px text-[8px] font-bold uppercase rounded-full border transition-colors ${item.tags.includes(tag) ? "bg-[var(--lg-accent)] text-white border-[var(--lg-accent)]" : "text-[var(--lg-text-muted)] border-[var(--lg-border-subtle)] opacity-40 hover:opacity-100"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </ThemedTd>
                  <ThemedTd>
                    {editingId === item.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveNote(item)}
                          onBlur={() => handleSaveNote(item)}
                          className="lg-input text-[10px] py-0.5 px-1 w-32"
                          maxLength={200}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setEditingId(item.id); setEditNote(item.note || ""); }}
                        className="text-[10px] text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors max-w-[120px] truncate"
                        title={item.note || "Add note"}
                      >
                        {item.note || <span className="opacity-40 italic">+ note</span>}
                      </button>
                    )}
                  </ThemedTd>
                  <ThemedTd align="center">
                    <button
                      type="button"
                      onClick={() => handleRemove(item.playerId)}
                      className="text-[var(--lg-text-muted)] hover:text-[var(--lg-error)] transition-colors"
                      title="Remove from watchlist"
                    >
                      <X size={14} />
                    </button>
                  </ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      )}
    </div>
  );
}

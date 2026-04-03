import React, { useEffect, useState, useCallback } from "react";
import { Eye, Plus, X, Tag, StickyNote } from "lucide-react";
import { getWatchlist, addToWatchlist, updateWatchlistItem, removeFromWatchlist, type WatchlistItem } from "../api";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Button } from "../../../components/ui/button";

const TAG_OPTIONS = ["trade-target", "add-drop", "monitor"] as const;

interface WatchlistPanelProps {
  teamId: number;
  /** Available players for quick-add (from roster or search context) */
  availablePlayers?: { id: number; name: string; posPrimary: string; mlbTeam: string | null }[];
}

export default function WatchlistPanel({ teamId, availablePlayers }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add player form
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addPlayerId, setAddPlayerId] = useState<number | null>(null);
  const [addNote, setAddNote] = useState("");
  const [addTags, setAddTags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Edit note inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getWatchlist(teamId);
      setItems(res.items ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addPlayerId) return;
    try {
      setAdding(true);
      const item = await addToWatchlist({ teamId, playerId: addPlayerId, note: addNote || undefined, tags: addTags.length ? addTags : undefined });
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setAddSearch("");
      setAddPlayerId(null);
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
      await removeFromWatchlist(playerId, teamId);
      setItems((prev) => prev.filter((i) => i.playerId !== playerId));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveNote = async (item: WatchlistItem) => {
    try {
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
      await updateWatchlistItem(item.id, { tags: newTags });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, tags: newTags } : i)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filteredAvailable = (availablePlayers ?? []).filter(
    (p) => !items.some((i) => i?.playerId === p.id) && (!addSearch || p.name.toLowerCase().includes(addSearch.toLowerCase()))
  );

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
        <div className="text-xs text-[var(--lg-error)] bg-[var(--lg-error)]/10 rounded-lg px-3 py-2">{error}</div>
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
            placeholder="Search for a player..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            className="lg-input w-full"
            aria-label="Search players to add to watchlist"
          />
          {addSearch && filteredAvailable.length > 0 && (
            <div className="max-h-40 overflow-y-auto divide-y divide-[var(--lg-divide)] rounded-lg border border-[var(--lg-border-subtle)]">
              {filteredAvailable.slice(0, 10).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setAddPlayerId(p.id); setAddSearch(p.name); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--lg-tint)] transition-colors ${addPlayerId === p.id ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]" : "text-[var(--lg-text-primary)]"}`}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-2 text-[var(--lg-text-muted)]">{p.posPrimary} · {p.mlbTeam || "FA"}</span>
                </button>
              ))}
            </div>
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
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddSearch(""); setAddPlayerId(null); }}>
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
                <ThemedTh align="center">Actions</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {items.map((item) => (
                <ThemedTr key={item.id} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd frozen>
                    <span className="font-semibold text-[11px] text-[var(--lg-text-primary)]">{item.player.name}</span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="px-1 py-px rounded text-[8px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {item.player.posPrimary}
                    </span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">
                      {item.player.mlbTeam || "FA"}
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
                          className="lg-input text-[10px] py-0.5 px-1 w-32"
                          maxLength={200}
                          autoFocus
                        />
                        <button type="button" onClick={() => handleSaveNote(item)} className="text-[var(--lg-accent)] text-[10px]">Save</button>
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

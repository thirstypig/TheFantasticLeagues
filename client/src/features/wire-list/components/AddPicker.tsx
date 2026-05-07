/**
 * Inline FA picker for the Wire List Add list.
 *
 * Loads the league's player season stats once (already filtered server-side
 * to the league's stats source via `getLeagueStatsSource`). We further
 * filter to free agents — `ogba_team_code` empty/null — and exclude players
 * already in the team's Add list.
 */
import { useEffect, useMemo, useState } from "react";
import { getPlayerSeasonStats, type PlayerSeasonStat } from "../../../api";
import { ApiError } from "../../../api/base";
import { createAddEntry } from "../api";

interface Props {
  periodId: number;
  teamId: number;
  leagueId: number;
  /** Player IDs already in the Add list — filtered out of picker. */
  excludePlayerIds: Set<number>;
  onAdded: () => void;
  onClose: () => void;
}

export default function AddPicker({ periodId, teamId, leagueId, excludePlayerIds, onAdded, onClose }: Props) {
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getPlayerSeasonStats(leagueId)
      .then((all) => {
        // Free agents only: server emits empty string when not rostered.
        const fas = all.filter((p) => !p.ogba_team_code || p.ogba_team_code === "");
        setPlayers(fas);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [leagueId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => !excludePlayerIds.has(p.id))
      .filter((p) => !q || (p.player_name ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [players, query, excludePlayerIds]);

  async function handleAdd(playerId: number) {
    setBusy(playerId);
    setError(null);
    setErrorCode(null);
    try {
      await createAddEntry(periodId, { teamId, playerId });
      onAdded();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; code?: string } | null;
        setError(body?.error ?? err.message);
        setErrorCode(body?.code ?? null);
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{
      padding: 12, marginTop: 8,
      borderRadius: 10, background: "var(--am-surface)",
      border: "1px solid var(--am-border)",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search free agents…"
          style={{
            flex: 1, padding: "6px 10px", fontSize: 13,
            background: "var(--am-bg)", color: "var(--am-text)",
            border: "1px solid var(--am-border)", borderRadius: 6,
            outline: "none",
          }}
        />
        <button onClick={onClose} style={smallBtn}>Cancel</button>
      </div>
      {error && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 6, fontSize: 12,
          background: "color-mix(in srgb, #f87171 12%, transparent)",
          border: "1px solid color-mix(in srgb, #f87171 40%, transparent)",
          color: "var(--am-text)",
        }}>
          {error}{errorCode ? ` (${errorCode})` : ""}
        </div>
      )}
      <div style={{ marginTop: 8, maxHeight: 280, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--am-text-muted)" }}>Loading FAs…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--am-text-muted)" }}>
            {query ? "No matches." : "No FAs available."}
          </div>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => handleAdd(p.id)}
              disabled={busy !== null}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 8px", border: "none", background: "transparent",
                color: "var(--am-text)", textAlign: "left",
                cursor: busy === p.id ? "wait" : "pointer",
                opacity: busy !== null && busy !== p.id ? 0.4 : 1,
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--am-chip)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={posPillStyle}>{p.positions || p.posPrimary || "—"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{p.player_name ?? `#${p.id}`}</span>
              <span style={{ fontSize: 10, color: "var(--am-text-muted)" }}>{p.mlbTeam ?? p.mlb_team_abbr ?? "FA"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: "4px 10px", fontSize: 12, borderRadius: 6,
  background: "var(--am-chip)", color: "var(--am-text)",
  border: "1px solid var(--am-border)", cursor: "pointer",
};

const posPillStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 28, padding: "1px 6px", borderRadius: 4,
  background: "var(--am-chip-strong)", color: "var(--am-text)",
  fontFamily: "var(--am-mono)", fontSize: 10, fontWeight: 600,
  border: "1px solid var(--am-border)",
};

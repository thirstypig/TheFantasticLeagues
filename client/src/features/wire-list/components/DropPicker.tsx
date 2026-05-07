/**
 * Inline picker for the Wire List Drop list.
 *
 * Shows the team's current roster. Players already in the Drop list are
 * filtered out. The "acquired this period" hard-block is enforced
 * server-side; we surface the resulting `code: ACQUIRED_THIS_PERIOD` error
 * inline rather than pre-disabling rows, so the rule lives in one place.
 */
import { useEffect, useMemo, useState } from "react";
import { getTeamDetails } from "../../../api";
import { ApiError } from "../../../api/base";
import { createDropEntry } from "../api";

interface RosterRow {
  id: number;
  playerId: number;
  name: string;
  posPrimary: string;
  mlbTeam?: string | null;
}

interface Props {
  periodId: number;
  teamId: number;
  /** Player IDs already in the Drop list — filtered out of picker. */
  excludePlayerIds: Set<number>;
  onAdded: () => void;
  onClose: () => void;
}

export default function DropPicker({ periodId, teamId, excludePlayerIds, onAdded, onClose }: Props) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getTeamDetails(teamId)
      .then((d) => {
        setRoster(d.currentRoster.map((r) => ({
          id: r.id,
          playerId: r.playerId,
          name: r.name,
          posPrimary: r.posPrimary,
          mlbTeam: r.mlbTeam,
        })));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [teamId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster
      .filter((r) => !excludePlayerIds.has(r.playerId))
      .filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [roster, query, excludePlayerIds]);

  async function handleAdd(playerId: number) {
    setBusy(playerId);
    setError(null);
    setErrorCode(null);
    try {
      await createDropEntry(periodId, { teamId, playerId });
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
          placeholder="Search your roster…"
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
          <div style={{ padding: 12, fontSize: 12, color: "var(--am-text-muted)" }}>Loading roster…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--am-text-muted)" }}>
            {query ? "No matches." : "No roster players available."}
          </div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => handleAdd(r.playerId)}
              disabled={busy !== null}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 8px", border: "none", background: "transparent",
                color: "var(--am-text)", textAlign: "left",
                cursor: busy === r.playerId ? "wait" : "pointer",
                opacity: busy !== null && busy !== r.playerId ? 0.4 : 1,
                borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--am-chip)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={posPillStyle}>{r.posPrimary || "—"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
              <span style={{ fontSize: 10, color: "var(--am-text-muted)" }}>{r.mlbTeam ?? "—"}</span>
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

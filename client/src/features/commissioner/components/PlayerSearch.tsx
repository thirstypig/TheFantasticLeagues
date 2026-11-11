// Debounced free-agent search used by the meeting moves entry (and, later, the
// one-team fixes). Generic: it only reports the pick.
import React, { useEffect, useRef, useState } from "react";
import { PlayerFace } from "../../../components/shared/PlayerFace";
import { searchFreeAgents } from "../api";
import type { FreeAgent } from "../api";

export const FIELD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  boxSizing: "border-box",
  minHeight: 48,
  padding: "0 12px",
  borderRadius: 6,
  background: "var(--am-field)",
  border: "1px solid var(--am-field-line)",
  color: "var(--am-text)",
  fontSize: 17,
  fontFamily: "inherit",
};

export function PlayerSearch({
  leagueId,
  onPick,
  placeholder,
  excludeIds = [],
}: {
  leagueId: number;
  onPick: (fa: FreeAgent) => void;
  placeholder: string;
  excludeIds?: number[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FreeAgent[]>([]);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    const mine = ++seq.current;
    if (!text) {
      setResults([]);
      setFailed(false);
      return;
    }
    const t = setTimeout(() => {
      searchFreeAgents(leagueId, text).then(
        (r) => {
          if (seq.current !== mine) return;
          setFailed(false);
          setResults(r);
        },
        () => {
          if (seq.current !== mine) return;
          setFailed(true);
          setResults([]);
        },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [q, leagueId]);

  const shown = results.filter((r) => !excludeIds.includes(r.playerId));

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setQ(e.target.value)}
        style={FIELD}
      />
      {failed && <p style={{ margin: 0, fontSize: 15, color: "var(--am-negative)" }}>Couldn’t search. Try again.</p>}
      {shown.length > 0 && (
        <div data-testid="search-results" style={{ border: "1px solid var(--am-border)", borderRadius: 6, background: "var(--am-surface)" }}>
          {shown.map((fa) => (
            <button
              key={fa.playerId}
              type="button"
              onClick={() => onPick(fa)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "8px 12px",
                background: "transparent", border: 0, borderBottom: "1px solid var(--am-border)", color: "var(--am-text)",
                textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <PlayerFace mlbId={fa.mlbId} name={fa.name} size={40} />
              <span style={{ display: "grid", gap: 2 }}>
                <b style={{ fontSize: 17 }}>{fa.name}</b>
                <small style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
                  {[fa.pos, fa.mlbTeam].filter(Boolean).join(" · ")}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

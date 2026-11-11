// One move card: add search, drop chooser, Remove. Reused by the one-team fixes.
import React, { useState } from "react";
import { PlayerFace } from "../../../components/shared/PlayerFace";
import type { DraftMove, DraftPlayer } from "../lib/meetingDraft";
import { FIELD, PlayerSearch } from "./PlayerSearch";

const SMALL: React.CSSProperties = { fontSize: 13, color: "var(--am-text-muted)" };

function PlayerRow({ sign, color, p, detail, onClick }: { sign: "+" | "−"; color: string; p: DraftPlayer; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Change ${p.name}`}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "8px 0",
        background: "transparent", border: 0, textAlign: "left", cursor: "pointer", color: "var(--am-text)", fontFamily: "inherit",
      }}
    >
      <PlayerFace mlbId={p.mlbId} name={p.name} size={40} />
      <span style={{ display: "grid", gap: 2 }}>
        <b style={{ fontSize: 17, color }}>{`${sign} ${p.name}`}</b>
        <small style={SMALL}>{detail}</small>
      </span>
    </button>
  );
}

export function MoveEditor({
  index,
  move,
  leagueId,
  dropChoices,
  excludeAddIds,
  onChange,
  onRemove,
}: {
  index: number;
  move: DraftMove;
  leagueId: number;
  /** Roster players this move may drop (already minus IL and other drops). */
  dropChoices: DraftPlayer[];
  excludeAddIds: number[];
  onChange: (patch: Partial<Pick<DraftMove, "add" | "drop" | "error">>) => void;
  onRemove: () => void;
}) {
  const [changingAdd, setChangingAdd] = useState(false);
  const [choosingDrop, setChoosingDrop] = useState(false);

  return (
    <div data-testid="move-card" style={{ display: "grid", gap: 4, padding: 16, borderRadius: 8, background: "var(--am-surface)", border: "1px solid var(--am-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 44 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{`Move ${index + 1}`}</span>
        <button type="button" onClick={onRemove} style={{ minHeight: 44, minWidth: 44, background: "transparent", border: 0, fontSize: 15, color: "var(--am-accent)", cursor: "pointer", fontFamily: "inherit" }}>
          Remove
        </button>
      </div>

      {move.add && !changingAdd ? (
        <PlayerRow
          sign="+"
          color="var(--am-positive)"
          p={move.add}
          detail={[move.add.pos, move.add.mlbTeam, "free agent"].filter(Boolean).join(" · ")}
          onClick={() => setChangingAdd(true)}
        />
      ) : (
        <PlayerSearch
          leagueId={leagueId}
          placeholder="Add: search NL free agents"
          excludeIds={excludeAddIds}
          onPick={(fa) => {
            setChangingAdd(false);
            onChange({ add: { playerId: fa.playerId, name: fa.name, pos: fa.pos, mlbTeam: fa.mlbTeam, mlbId: fa.mlbId }, error: undefined });
          }}
        />
      )}

      {move.drop && !choosingDrop ? (
        <PlayerRow
          sign="−"
          color="var(--am-negative)"
          p={move.drop}
          detail={move.drop.pos}
          onClick={() => setChoosingDrop(true)}
        />
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {!choosingDrop ? (
            <button type="button" onClick={() => setChoosingDrop(true)} style={{ ...FIELD, justifyContent: "space-between", cursor: "pointer", color: "var(--am-text-muted)" }}>
              <span>Drop: choose a player ›</span>
            </button>
          ) : (
            <div data-testid="drop-options" style={{ border: "1px solid var(--am-border)", borderRadius: 6 }}>
              {dropChoices.length === 0 && <p style={{ margin: 0, padding: 12, fontSize: 15, color: "var(--am-text-muted)" }}>No one left to drop.</p>}
              {dropChoices.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => {
                    setChoosingDrop(false);
                    onChange({ drop: p, error: undefined });
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "8px 12px",
                    background: "transparent", border: 0, borderBottom: "1px solid var(--am-border)", color: "var(--am-text)",
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <PlayerFace mlbId={p.mlbId} name={p.name} size={40} />
                  <span style={{ display: "grid", gap: 2 }}>
                    <b style={{ fontSize: 17 }}>{p.name}</b>
                    <small style={SMALL}>{p.pos}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {move.error && <p role="alert" style={{ margin: "8px 0 0", fontSize: 15, color: "var(--am-negative)" }}>{move.error}</p>}
    </div>
  );
}

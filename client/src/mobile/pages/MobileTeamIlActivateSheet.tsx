/*
 * MobileTeamIlActivateSheet — bottom-sheet picker for activating an IL
 * player. Unlike the regular move sheet, the activate flow requires the
 * caller to pick a roster player to drop (the freed IL slot must be
 * paid for with a roster spot). Scrolls the active + bench list so the
 * user can pick any droppable player.
 *
 * Calls back into the parent with the chosen player; the parent owns
 * the ilActivate API call and optimistic UI re-partition.
 */
import { useEffect } from "react";
import type { RosterHubRow } from "@shared/api/teams";
import { Glyph } from "../atoms/Glyph";

interface MobileTeamIlActivateSheetProps {
  player: RosterHubRow;
  /** All non-IL roster rows the user could drop to make room. */
  dropCandidates: RosterHubRow[];
  onPick: (dropTarget: RosterHubRow) => void;
  onDismiss: () => void;
}

export function MobileTeamIlActivateSheet({
  player,
  dropCandidates,
  onPick,
  onDismiss,
}: MobileTeamIlActivateSheetProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <>
      <div
        data-testid="mobile-team-il-activate-backdrop"
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-label={`Activate ${player.playerName} from IL`}
        data-testid="mobile-team-il-activate-sheet"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: "var(--am-surface-strong)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          borderTop: "1px solid var(--am-border-strong)",
          borderRadius: "18px 18px 0 0",
          paddingTop: 14,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
          paddingLeft: 18,
          paddingRight: 18,
          maxHeight: "75vh",
          overflowY: "auto",
          color: "var(--am-text)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: 700,
                color: "var(--am-text-faint)",
                textTransform: "uppercase",
              }}
            >
              Activate from IL
            </div>
            <div
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 18,
                lineHeight: 1.1,
                marginTop: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {player.playerName}
            </div>
            <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 4 }}>
              {(player.mlbTeam ?? "—") + " · " + (player.posPrimary ?? "—") +
                " · pick a player to drop"}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            data-testid="mobile-team-il-activate-close"
            style={{
              background: "var(--am-chip-strong)",
              border: "1px solid var(--am-border)",
              borderRadius: 99,
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              color: "var(--am-text-muted)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Glyph kind="x" size={14} />
          </button>
        </div>

        <div
          style={{
            fontSize: 9.5,
            letterSpacing: 0.6,
            fontWeight: 700,
            color: "var(--am-text-faint)",
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          Drop a player
        </div>

        {dropCandidates.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--am-text-muted)", padding: "12px 0" }}>
            No droppable players. Bench someone first.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              border: "1px solid var(--am-border)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {dropCandidates.map((cand, i) => (
              <button
                key={cand.rosterId}
                type="button"
                onClick={() => onPick(cand)}
                data-testid="mobile-team-il-activate-drop-target"
                data-roster-id={cand.rosterId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  background: "transparent",
                  border: "none",
                  borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: "var(--am-text)",
                  minHeight: 44,
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: "var(--am-text)",
                    background: "var(--am-chip-strong)",
                    padding: "3px 0",
                    borderRadius: 5,
                    textAlign: "center",
                    border: "1px solid var(--am-border)",
                  }}
                >
                  {cand.assignedPosition ?? cand.posPrimary ?? "—"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cand.playerName}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
                    {(cand.mlbTeam ?? "—") + " · " + (cand.posPrimary ?? "—")}
                  </div>
                </div>
                <Glyph kind="chevR" size={14} />
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            fontSize: 10,
            color: "var(--am-text-faint)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          The activated player will take the dropped player's roster spot.
          Server picks the slot based on eligibility.
        </div>
      </div>
    </>
  );
}

/*
 * MobileTeamMoveSheet — bottom-sheet action picker for lineup edits.
 *
 * Triggered by the per-row "move" button on MobileTeam. Shows the
 * player's eligible slots (derived from posList) plus the always-
 * available "Bench" option. Selecting a slot calls back into the
 * parent with the chosen position string; the parent owns the API
 * call (updateRosterPosition) and the optimistic UI update.
 *
 * The sheet uses a backdrop overlay + slide-up panel — escapable by
 * tapping the backdrop, the X button, or pressing Escape.
 */
import { useEffect, useMemo } from "react";
import type { RosterHubRow } from "@shared/api/teams";
import { POS_ORDER } from "../../lib/baseballUtils";
import { mapPosition } from "../../lib/sports/baseball";
import { useLeague } from "../../contexts/LeagueContext";
import { Glyph } from "../atoms/Glyph";

interface MobileTeamMoveSheetProps {
  player: RosterHubRow;
  /** Called when the user picks a new slot for this player. */
  onPick: (slot: string) => void;
  onDismiss: () => void;
}

/**
 * Parse posList ("LF,1B,RF") → set of eligible slot codes. Outfield
 * sub-positions (LF/CF/RF) collapse to "OF" when the league's
 * `outfieldMode === "OF"`, mirroring how mapPosition normalizes
 * fielding data elsewhere in the app.
 */
function eligibleSlots(player: RosterHubRow, outfieldMode: string): Set<string> {
  const list = player.posList ?? player.posPrimary ?? player.position ?? "";
  const set = new Set<string>();
  for (const raw of list.split(",")) {
    const tok = raw.trim();
    if (!tok) continue;
    set.add(mapPosition(tok, outfieldMode));
  }
  // P chip implies SP+RP for pitchers (mirrors MobilePlayers filter logic).
  if (set.has("P") && player.isPitcher) {
    set.add("SP");
    set.add("RP");
  }
  return set;
}

export function MobileTeamMoveSheet({ player, onPick, onDismiss }: MobileTeamMoveSheetProps) {
  const { outfieldMode } = useLeague();
  // Esc-to-dismiss for accessibility / keyboard testing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const eligible = useMemo(() => eligibleSlots(player, outfieldMode), [player, outfieldMode]);
  const current = player.assignedPosition ?? player.posPrimary ?? null;

  // Build the slot menu — eligible primary positions in POS_ORDER, then
  // Bench at the end. SP / RP appear separately for pitchers since the
  // server stores them as distinct slot codes.
  const slotOptions = useMemo(() => {
    const slots: string[] = [];
    const order = player.isPitcher ? ["SP", "RP", "P"] : POS_ORDER;
    for (const pos of order) {
      if (eligible.has(pos)) slots.push(pos);
    }
    if (!slots.includes("BN")) slots.push("BN");
    return slots;
  }, [eligible, player.isPitcher]);

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="mobile-team-move-sheet-backdrop"
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 40,
        }}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label={`Move ${player.playerName}`}
        data-testid="mobile-team-move-sheet"
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
          maxHeight: "70vh",
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
              Move player
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
                (current ? ` · currently ${current}` : "")}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            data-testid="mobile-team-move-sheet-close"
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
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {slotOptions.map((slot) => {
            const isCurrent = slot === current;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => !isCurrent && onPick(slot)}
                disabled={isCurrent}
                data-testid="mobile-team-move-slot"
                data-slot={slot}
                style={{
                  padding: "12px 0",
                  borderRadius: 12,
                  background: isCurrent ? "var(--am-irid)" : "var(--am-chip)",
                  color: isCurrent ? "#fff" : "var(--am-text)",
                  border: "1px solid " + (isCurrent ? "transparent" : "var(--am-border)"),
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isCurrent ? "default" : "pointer",
                  fontFamily: "inherit",
                  minHeight: 44,
                  letterSpacing: 0.3,
                }}
              >
                {slot === "BN" ? "Bench" : slot}
                {isCurrent && (
                  <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2, opacity: 0.85 }}>
                    current
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--am-text-faint)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Eligibility based on{" "}
          <span style={{ color: "var(--am-text-muted)", fontWeight: 600 }}>
            {player.posList ?? player.posPrimary ?? "—"}
          </span>
          {". IL placement uses a separate flow."}
        </div>
      </div>
    </>
  );
}

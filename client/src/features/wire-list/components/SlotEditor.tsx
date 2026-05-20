/**
 * SlotEditor — collapsible slot rearrangement section for Wire List entries.
 *
 * Lets the owner specify which existing roster players should move to different
 * eligible slots before the waiver period is finalized. Mirrors the
 * SlotRearrangementSection in AddDropPanel but uses inline styles with
 * --am-* CSS tokens (no Tailwind) to match the Score Sheet design system.
 */
import React, { useState, useMemo } from "react";
import type { SlotChange } from "@shared/api/rosterMoves";
import { slotsFor } from "../../../lib/positionEligibility";

// Canonical slot order matching OGBA roster display.
const SLOT_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"] as const;

interface SlotEditorPlayer {
  id: number;
  name: string;
  posList: string | null;
  currentSlot: string;
}

interface SlotEditorProps {
  players: SlotEditorPlayer[];
  excludePlayerId?: number;
  value: SlotChange[];
  onChange: (changes: SlotChange[]) => void;
  disabled?: boolean;
}

export function SlotEditor({
  players,
  excludePlayerId,
  value,
  onChange,
  disabled = false,
}: SlotEditorProps) {
  const [open, setOpen] = useState(false);

  const editable = useMemo(
    () => players.filter((p) => p.id !== excludePlayerId),
    [players, excludePlayerId],
  );

  if (editable.length === 0) return null;

  // Build a lookup from playerId → override slot for the current value array.
  const overrides: Record<number, string> = {};
  for (const sc of value) {
    overrides[sc.playerId] = sc.slot;
  }

  function handleSlotChange(playerId: number, slot: string, currentSlot: string) {
    const next = { ...overrides };
    if (slot === currentSlot) {
      delete next[playerId];
    } else {
      next[playerId] = slot;
    }
    onChange(
      Object.entries(next).map(([pid, s]) => ({
        playerId: Number(pid),
        slot: s as SlotChange["slot"],
      })),
    );
  }

  function resetAll() {
    onChange([]);
  }

  const changedCount = value.length;

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--am-border)",
        marginTop: 4,
        overflow: "hidden",
      }}
    >
      {/* Collapsible header */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "var(--am-surface)",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              color: "var(--am-text-muted)",
              letterSpacing: "0.04em",
            }}
          >
            Adjust slot assignments
          </span>
          {changedCount > 0 && (
            <span
              style={{
                borderRadius: 999,
                background: "color-mix(in srgb, var(--am-accent) 20%, transparent)",
                padding: "1px 6px",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--am-accent)",
              }}
            >
              {changedCount} change{changedCount !== 1 ? "s" : ""}
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--am-text-muted)" }}>(optional)</span>
        </span>
        <span style={{ fontSize: 10, color: "var(--am-text-muted)" }} aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div
          style={{
            borderTop: "1px solid var(--am-border)",
            padding: "8px 10px 10px",
            background: "var(--am-bg)",
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "var(--am-text-muted)",
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Move existing roster players to different slots before the claim applies. Use this to
            free up a specific slot for the incoming player.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--am-border)",
                  }}
                >
                  {["Player", "Eligible", "Current", "Move to"].map((col) => (
                    <th
                      key={col}
                      style={{
                        paddingBottom: 6,
                        textAlign: "left",
                        paddingLeft: col === "Player" ? 0 : 8,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: "var(--am-text-muted)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editable.map((p) => {
                  const eligible: string[] = Array.from(slotsFor(p.posList)).sort(
                    (a, b) => {
                      const ai = SLOT_ORDER.indexOf(a as typeof SLOT_ORDER[number]);
                      const bi = SLOT_ORDER.indexOf(b as typeof SLOT_ORDER[number]);
                      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                    },
                  );
                  const currentSlot = p.currentSlot;
                  const selectedSlot = overrides[p.id] ?? currentSlot;
                  const changed = overrides[p.id] != null && overrides[p.id] !== currentSlot;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid var(--am-border-subtle)",
                        background: changed
                          ? "color-mix(in srgb, var(--am-accent) 5%, transparent)"
                          : undefined,
                      }}
                    >
                      {/* Player name */}
                      <td
                        style={{
                          padding: "6px 12px 6px 0",
                          fontWeight: 600,
                          color: "var(--am-text)",
                        }}
                      >
                        {p.name}
                        {changed && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9,
                              fontWeight: 400,
                              color: "var(--am-accent)",
                            }}
                          >
                            ✓ moved
                          </span>
                        )}
                      </td>

                      {/* Eligible slots */}
                      <td
                        style={{
                          padding: "6px 0 6px 8px",
                          color: "var(--am-text-muted)",
                        }}
                      >
                        {eligible.join(", ") || "—"}
                      </td>

                      {/* Current slot */}
                      <td style={{ padding: "6px 0 6px 8px" }}>
                        <span
                          style={{
                            borderRadius: 4,
                            border: "1px solid var(--am-border)",
                            padding: "1px 5px",
                            fontSize: 10,
                            fontFamily: "var(--am-mono)",
                            fontWeight: 600,
                            color: changed ? "var(--am-text-muted)" : "var(--am-text)",
                            textDecoration: changed ? "line-through" : "none",
                          }}
                        >
                          {currentSlot}
                        </span>
                      </td>

                      {/* Move-to select */}
                      <td style={{ padding: "6px 0 6px 8px" }}>
                        {eligible.length > 0 ? (
                          <select
                            value={selectedSlot}
                            disabled={disabled}
                            onChange={(e) => handleSlotChange(p.id, e.target.value, currentSlot)}
                            style={{
                              borderRadius: 4,
                              border: "1px solid var(--am-border)",
                              background: "var(--am-surface)",
                              padding: "2px 6px",
                              fontSize: 11,
                              color: "var(--am-text)",
                              outline: "none",
                              cursor: disabled ? "not-allowed" : "pointer",
                            }}
                          >
                            {eligible.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--am-text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {changedCount > 0 && (
            <button
              type="button"
              onClick={resetAll}
              disabled={disabled}
              style={{
                marginTop: 6,
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 10,
                color: "var(--am-text-muted)",
                textDecoration: "underline",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              Reset all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

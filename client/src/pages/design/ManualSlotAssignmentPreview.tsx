// client/src/pages/design/ManualSlotAssignmentPreview.tsx
//
// Static visual preview of the "manual slot assignment" UX for roster
// moves — specifically the IL Activate flow. The user wants to STOP
// auto-resolve from silently shuffling other players when activating
// a player from IL; instead, the cascade should be explicit, picked
// step-by-step by the commissioner/owner.
//
// Reference scenario: activate Andrew Vaughn (IL, eligible 1B/DH).
// The CM slot is occupied by Troy Johnston. The OF slots are full
// (Carroll/Acuña/Moniak/Benge/Reyes). Vaughn → CM displaces Johnston;
// Johnston (eligible 1B/OF/DH) → OF displaces an outfielder (the
// commissioner picks which); that outfielder is the drop.
//
// CRITICAL: NO BUSINESS LOGIC. All data is mocked, all "moves" are
// local React state for visual demonstration. No API calls, no Prisma,
// no real persistence. This page exists for UX validation BEFORE any
// backend or production UI work is committed.

import { useState } from "react";
import { Link } from "react-router-dom";

type Slot = "C" | "1B" | "2B" | "3B" | "SS" | "MI" | "CM" | "OF" | "DH" | "P" | "BN" | "IL";

interface MockPlayer {
  id: number;
  name: string;
  eligible: Slot[];        // slot codes the player can fill
  currentSlot: Slot;       // where they sit right now
}

// DLC-like roster fixture matching the real Vaughn scenario.
const INITIAL_ROSTER: MockPlayer[] = [
  { id: 1,  name: "Francisco Alvarez",  eligible: ["C", "DH"],          currentSlot: "C"  },
  { id: 2,  name: "William Contreras",  eligible: ["C", "DH"],          currentSlot: "C"  },
  { id: 3,  name: "Michael Busch",      eligible: ["1B", "DH"],         currentSlot: "1B" },
  { id: 4,  name: "Brice Turang",       eligible: ["2B", "MI", "DH"],   currentSlot: "2B" },
  { id: 5,  name: "Brady House",        eligible: ["3B", "CM", "DH"],   currentSlot: "3B" },
  { id: 6,  name: "Geraldo Perdomo",    eligible: ["SS", "MI", "DH"],   currentSlot: "SS" },
  { id: 7,  name: "Otto Lopez",         eligible: ["2B", "SS", "MI"],   currentSlot: "MI" },
  { id: 8,  name: "Troy Johnston",      eligible: ["1B", "CM", "OF", "DH"], currentSlot: "CM" },
  { id: 9,  name: "Felix Reyes",        eligible: ["OF", "1B"],         currentSlot: "OF" },
  { id: 10, name: "Ronald Acuña Jr.",   eligible: ["OF", "DH"],         currentSlot: "OF" },
  { id: 11, name: "Corbin Carroll",     eligible: ["OF", "DH"],         currentSlot: "OF" },
  { id: 12, name: "Mickey Moniak",      eligible: ["OF", "DH"],         currentSlot: "OF" },
  { id: 13, name: "Carson Benge",       eligible: ["OF"],               currentSlot: "OF" },
  { id: 14, name: "Shohei Ohtani",      eligible: ["DH"],               currentSlot: "DH" },
  { id: 99, name: "Andrew Vaughn",      eligible: ["1B", "DH"],         currentSlot: "IL" },
];

const SLOT_ORDER: Slot[] = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "BN", "IL"];

// Per-slot capacity (OGBA standard).
const CAPACITY: Record<Slot, number> = {
  C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1, P: 9, BN: 0, IL: 99,
};

interface PlannedMove {
  playerId: number;
  fromSlot: Slot;
  toSlot: Slot | "DROP";
}

export default function ManualSlotAssignmentPreview() {
  const [planned, setPlanned] = useState<PlannedMove[]>([]);
  // The current "step" in the cascade — which player is awaiting placement.
  const [pendingPlayerId, setPendingPlayerId] = useState<number | null>(99); // start with Vaughn
  const [pendingReason, setPendingReason] = useState<string>("Activating from IL — pick a slot");

  // Resolve roster state after applying `planned`.
  const projectedRoster: MockPlayer[] = INITIAL_ROSTER.map(p => {
    const move = planned.find(m => m.playerId === p.id);
    if (!move) return p;
    if (move.toSlot === "DROP") return { ...p, currentSlot: "IL" }; // hide
    return { ...p, currentSlot: move.toSlot };
  });

  const droppedIds = new Set(planned.filter(m => m.toSlot === "DROP").map(m => m.playerId));
  const visibleRoster = projectedRoster.filter(p => !droppedIds.has(p.id));

  // Count occupancy per slot after planned moves.
  const slotCount: Record<Slot, MockPlayer[]> = {} as any;
  for (const s of SLOT_ORDER) slotCount[s] = [];
  for (const p of visibleRoster) slotCount[p.currentSlot].push(p);

  const pendingPlayer = pendingPlayerId
    ? INITIAL_ROSTER.find(p => p.id === pendingPlayerId) ?? null
    : null;

  function handleSlotPick(targetSlot: Slot) {
    if (!pendingPlayer) return;
    if (!pendingPlayer.eligible.includes(targetSlot)) return;

    const fromSlot = projectedRoster.find(p => p.id === pendingPlayer.id)!.currentSlot;
    const occupants = slotCount[targetSlot];
    const cap = CAPACITY[targetSlot];

    // If targeting a slot with room, just assign — chain ends.
    if (occupants.length < cap) {
      setPlanned([...planned, { playerId: pendingPlayer.id, fromSlot, toSlot: targetSlot }]);
      setPendingPlayerId(null);
      setPendingReason("");
      return;
    }

    // Otherwise: one of the occupants must be displaced. For the preview
    // we pick the first one — the production UI would let the commissioner
    // pick which occupant to displace.
    const displaced = occupants[0];
    setPlanned([
      ...planned,
      { playerId: pendingPlayer.id, fromSlot, toSlot: targetSlot },
    ]);
    setPendingPlayerId(displaced.id);
    setPendingReason(`Displaced from ${targetSlot} by ${pendingPlayer.name} — pick a new slot or drop`);
  }

  function handleDrop() {
    if (!pendingPlayer) return;
    const fromSlot = projectedRoster.find(p => p.id === pendingPlayer.id)!.currentSlot;
    setPlanned([...planned, { playerId: pendingPlayer.id, fromSlot, toSlot: "DROP" }]);
    setPendingPlayerId(null);
    setPendingReason("");
  }

  function reset() {
    setPlanned([]);
    setPendingPlayerId(99);
    setPendingReason("Activating from IL — pick a slot");
  }

  const chainComplete = pendingPlayerId === null && planned.length > 0;
  const dropAccountedFor = planned.some(m => m.toSlot === "DROP");

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" style={{ fontSize: 12, color: "#6b7280" }}>← Back to app</Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Manual Slot Assignment — Design Preview
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 1.5 }}>
        Reference scenario: activate <strong>Andrew Vaughn</strong> from IL. Vaughn is
        eligible for 1B/DH. Click a slot in the right panel to assign him. If you pick a
        slot that's full, the displaced player becomes the next step in the chain. The
        last displaced player who can't find an eligible slot must be <strong>Dropped</strong>.
        Nothing here hits the server — purely a UX prototype.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT: Roster grid */}
        <div style={{ border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ background: "#f3f4f6", padding: "8px 12px", fontWeight: 600, fontSize: 13 }}>
            DLC roster (projected after planned moves)
          </div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 12px", width: 60 }}>Slot</th>
                <th style={{ textAlign: "left", padding: "6px 12px" }}>Player</th>
                <th style={{ textAlign: "left", padding: "6px 12px", width: 140 }}>Eligible</th>
                <th style={{ textAlign: "left", padding: "6px 12px", width: 100 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {SLOT_ORDER.flatMap(slot => {
                const players = slotCount[slot];
                if (players.length === 0) return [];
                return players.map(p => {
                  const isPending = p.id === pendingPlayerId;
                  const wasMoved = planned.some(m => m.playerId === p.id);
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        background: isPending ? "#fef3c7" : wasMoved ? "#d1fae5" : "transparent",
                      }}
                    >
                      <td style={{ padding: "6px 12px", fontFamily: "monospace", color: "#6b7280" }}>{slot}</td>
                      <td style={{ padding: "6px 12px", fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: "6px 12px", color: "#6b7280" }}>{p.eligible.join(", ")}</td>
                      <td style={{ padding: "6px 12px", fontSize: 11 }}>
                        {isPending ? "⏳ awaiting slot" : wasMoved ? "✓ planned" : ""}
                      </td>
                    </tr>
                  );
                });
              })}
              {planned.filter(m => m.toSlot === "DROP").map(m => {
                const p = INITIAL_ROSTER.find(x => x.id === m.playerId)!;
                return (
                  <tr key={`dropped-${p.id}`} style={{ borderBottom: "1px solid #f3f4f6", background: "#fee2e2" }}>
                    <td style={{ padding: "6px 12px", fontFamily: "monospace", color: "#991b1b" }}>DROP</td>
                    <td style={{ padding: "6px 12px", fontWeight: 600, textDecoration: "line-through" }}>{p.name}</td>
                    <td style={{ padding: "6px 12px", color: "#6b7280" }}>{p.eligible.join(", ")}</td>
                    <td style={{ padding: "6px 12px", fontSize: 11, color: "#991b1b" }}>✗ released</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* RIGHT: Planner */}
        <div style={{ border: "1px solid #d1d5db", borderRadius: 8 }}>
          <div style={{ background: "#f3f4f6", padding: "8px 12px", fontWeight: 600, fontSize: 13 }}>
            Plan the move
          </div>
          <div style={{ padding: 16 }}>
            {pendingPlayer ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280", letterSpacing: ".05em" }}>
                    Current step
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                    {pendingPlayer.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Eligible slots: <code>{pendingPlayer.eligible.join(", ")}</code>
                  </div>
                  <div style={{ fontSize: 12, color: "#92400e", marginTop: 6, padding: "6px 10px", background: "#fef3c7", borderRadius: 4 }}>
                    {pendingReason}
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {SLOT_ORDER.filter(s => s !== "IL" && s !== "BN" && s !== "P").map(slot => {
                    const eligible = pendingPlayer.eligible.includes(slot);
                    const count = slotCount[slot].length;
                    const cap = CAPACITY[slot];
                    const occupants = slotCount[slot].map(p => p.name).join(", ");
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!eligible}
                        onClick={() => handleSlotPick(slot)}
                        title={occupants ? `Occupied by: ${occupants}` : "Empty slot"}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid",
                          borderColor: eligible ? "#3b82f6" : "#e5e7eb",
                          borderRadius: 4,
                          background: eligible ? "white" : "#f9fafb",
                          color: eligible ? "#111827" : "#9ca3af",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: eligible ? "pointer" : "not-allowed",
                          opacity: eligible ? 1 : 0.5,
                        }}
                      >
                        {slot} <span style={{ fontWeight: 400 }}>({count}/{cap})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Drop option — only meaningful for the displaced player at the end of the chain */}
                {planned.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDrop}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #ef4444",
                      borderRadius: 4,
                      background: "white",
                      color: "#991b1b",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Drop {pendingPlayer.name} (end the chain)
                  </button>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {chainComplete && !dropAccountedFor && (
                  <div style={{ padding: 10, background: "#fef3c7", borderRadius: 4, marginBottom: 12, color: "#92400e" }}>
                    ⚠ Chain completed without a drop. In a real activate, you must drop someone to make room.
                  </div>
                )}
                {chainComplete && dropAccountedFor && (
                  <div style={{ padding: 10, background: "#d1fae5", borderRadius: 4, marginBottom: 12, color: "#065f46" }}>
                    ✓ Chain resolved. Review the planned moves below, then click Confirm to commit atomically.
                  </div>
                )}
              </div>
            )}

            {/* Planned moves list */}
            {planned.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280", letterSpacing: ".05em", marginBottom: 8 }}>
                  Planned moves
                </div>
                <ol style={{ paddingLeft: 16, fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                  {planned.map((m, i) => {
                    const p = INITIAL_ROSTER.find(x => x.id === m.playerId)!;
                    return (
                      <li key={i}>
                        <strong>{p.name}</strong>: <code>{m.fromSlot}</code> → {m.toSlot === "DROP" ? <span style={{ color: "#991b1b" }}><strong>DROP</strong></span> : <code>{m.toSlot}</code>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                disabled={!chainComplete || !dropAccountedFor}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: 4,
                  background: chainComplete && dropAccountedFor ? "#10b981" : "#d1d5db",
                  color: "white",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: chainComplete && dropAccountedFor ? "pointer" : "not-allowed",
                }}
              >
                Confirm all moves (atomic)
              </button>
              <button
                type="button"
                onClick={reset}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  background: "white",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Design rationale */}
      <div style={{ marginTop: 32, padding: 16, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Design rationale</div>
        <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, color: "#374151" }}>
          <li><strong>Explicit cascade</strong> replaces silent auto-resolve. The commissioner sees and controls every shift, not just the headline activate + drop.</li>
          <li><strong>Single atomic transaction</strong>. The "Confirm all moves" button commits the entire chain in one server call (no partial states).</li>
          <li><strong>Activity log faithfulness</strong>. Every step in the planned moves list becomes its own TransactionEvent — the audit history will read exactly as the user planned it.</li>
          <li><strong>Eligibility-gated buttons</strong>. Slots Vaughn can't fill (C, 2B, 3B, SS, MI, OF, P) are visibly disabled. Same for each subsequent displaced player.</li>
          <li><strong>Drop is the chain terminator</strong>. Once a displaced player has no legal slot (or the commissioner chooses to drop them), the chain ends and the move can commit.</li>
        </ul>

        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>Open questions for review</div>
        <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, color: "#374151" }}>
          <li>When a target slot has multiple occupants (e.g. C × 2, OF × 5), should the commissioner pick which occupant to displace? Current preview picks the first.</li>
          <li>Should the planner allow "free" slot moves (e.g. proactively move Johnston CM→OF before placing Vaughn) so the cascade isn't strictly forced?</li>
          <li>Should the "Drop" option be available at ANY point in the chain, or only when no legal slot is left?</li>
          <li>Owner-facing flow same as commissioner, or simpler? (Today owners use a different panel that delegates to auto-resolve.)</li>
        </ul>

        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>What this preview does NOT do</div>
        <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20, color: "#374151" }}>
          <li>No server call. The Confirm button is a no-op.</li>
          <li>No real eligibility validation against league rules — only static lookups against the mocked <code>eligible</code> arrays.</li>
          <li>No multi-occupant displacement choice (picks first occupant for now).</li>
          <li>No undo of an individual planned move — only full Reset.</li>
        </ul>
      </div>
    </div>
  );
}

// client/src/pages/design/SwapModePreview.tsx
//
// Static visual preview for the Swap Mode UI specified in
// `docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md` §5B and §8.
// This page exists so the user can see and click through PR2's design
// before PR2 commits to it.
//
// CRITICAL: NO BUSINESS LOGIC. All data is mocked, all "swaps" are
// local React state for visual demonstration. No API calls, no Prisma,
// no real persistence. The SwapMode subcomponents under
// `client/src/features/transactions/components/SwapMode/` are real
// PR2 components — this page just feeds them mock props.
//
// Admin-gated via the same isAdmin pattern as the existing /admin
// pages (see `Admin.tsx`).

import { useMemo, useState } from "react";
import { Glass, SectionLabel } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import { SwapMode } from "../../features/transactions/components/SwapMode";
import type {
  PendingSwap,
  PreviewState,
  SwapModePlayer,
  SwapModePositionGroup,
} from "../../features/transactions/components/SwapMode/types";
import "../../features/transactions/components/SwapMode/swapMode.css";

/* ─── Mock data ──────────────────────────────────────────────────────
 * 23 mock players covering realistic position diversity:
 * - 1 Catcher
 * - 4 Infielders for 1B/2B/3B/SS (multi-position eligibility on at
 *   least 2 of them so eligibility highlighting demos meaningfully)
 * - 3 Outfielders (1 with multi-position OF/2B eligibility)
 * - 3 Flex (MI / CM / DH) — note our SLOT_CODES uses "DH" not "UT" and
 *   "CM" not "CI" per `client/src/lib/sports/baseball.ts`. The plan's
 *   "MI/CI/UTIL" labels were design-intent; the slot codes here match
 *   the codebase reality.
 * - 9 Pitchers (mix of SP / RP designations in name only)
 * - 2 of the 23 marked isKeeper: true
 *
 * `posList` follows the existing comma-separated format consumed by
 * `slotsFor()` in `client/src/lib/positionEligibility.ts`.
 */
const MOCK_PLAYERS: SwapModePlayer[] = [
  // Catcher
  { rosterId: 1, playerId: 101, name: "Will Smith", posList: "C", mlbTeam: "LAD" },

  // Infield (4 players for 4 slots; multi-position on Turner & Bohm)
  { rosterId: 2, playerId: 102, name: "Vladimir Guerrero Jr.", posList: "1B", mlbTeam: "TOR" },
  { rosterId: 3, playerId: 103, name: "Trea Turner", posList: "2B,SS", mlbTeam: "PHI", isKeeper: true },
  { rosterId: 4, playerId: 104, name: "Alec Bohm", posList: "3B,1B", mlbTeam: "PHI" },
  { rosterId: 5, playerId: 105, name: "Bobby Witt Jr.", posList: "SS", mlbTeam: "KC" },

  // Outfield (3 — Mookie has multi-position OF/2B for the demo)
  { rosterId: 6, playerId: 106, name: "Mookie Betts", posList: "OF,2B", mlbTeam: "LAD", isKeeper: true },
  { rosterId: 7, playerId: 107, name: "Aaron Judge", posList: "OF", mlbTeam: "NYY" },
  { rosterId: 8, playerId: 108, name: "Juan Soto", posList: "OF", mlbTeam: "NYM" },

  // Flex (MI / CM / DH)
  { rosterId: 9, playerId: 109, name: "Marcus Semien", posList: "2B", mlbTeam: "TEX" }, // MI
  { rosterId: 10, playerId: 110, name: "Pete Alonso", posList: "1B", mlbTeam: "NYM" }, // CM
  { rosterId: 11, playerId: 111, name: "Shohei Ohtani", posList: "DH", mlbTeam: "LAD" }, // DH

  // Pitchers — 9 mix of SP/RP/CL (kind label only; all collapse to "P" slot).
  { rosterId: 12, playerId: 112, name: "Tarik Skubal", posList: "SP", mlbTeam: "DET", pitcherKind: "SP" },
  { rosterId: 13, playerId: 113, name: "Paul Skenes", posList: "SP", mlbTeam: "PIT", pitcherKind: "SP" },
  { rosterId: 14, playerId: 114, name: "Logan Gilbert", posList: "SP", mlbTeam: "SEA", pitcherKind: "SP" },
  { rosterId: 15, playerId: 115, name: "Zack Wheeler", posList: "SP", mlbTeam: "PHI", pitcherKind: "SP" },
  { rosterId: 16, playerId: 116, name: "Corbin Burnes", posList: "SP", mlbTeam: "ARI", pitcherKind: "SP" },
  { rosterId: 17, playerId: 117, name: "Spencer Strider", posList: "SP", mlbTeam: "ATL", pitcherKind: "SP" },
  { rosterId: 18, playerId: 118, name: "Edwin Díaz", posList: "RP", mlbTeam: "NYM", pitcherKind: "CL" },
  { rosterId: 19, playerId: 119, name: "Emmanuel Clase", posList: "RP", mlbTeam: "CLE", pitcherKind: "CL" },
  { rosterId: 20, playerId: 120, name: "Mason Miller", posList: "RP", mlbTeam: "ATH", pitcherKind: "RP" },

  // Three more so we hit 23 total — extra hitters that won't be used
  // for cell occupancy in the canonical layout but live in the player
  // pool to mirror real roster shapes.
  { rosterId: 21, playerId: 121, name: "Kyle Tucker", posList: "OF", mlbTeam: "CHC" },
  { rosterId: 22, playerId: 122, name: "Jose Ramirez", posList: "3B", mlbTeam: "CLE" },
  { rosterId: 23, playerId: 123, name: "Gunnar Henderson", posList: "SS,3B", mlbTeam: "BAL" },
];

/* Build the 5 position groups + slot occupancy. Captures the §8 layout:
 * Card 1: Catchers (1 slot)        — C
 * Card 2: Infield (4 slots)        — 1B / 2B / 3B / SS
 * Card 3: Outfield (3 slots)       — OF×3
 * Card 4: Flex (3 slots)           — MI / CM / DH
 * Card 5: Pitchers (9 slots)       — P×9
 */
function buildGroups(): SwapModePositionGroup[] {
  return [
    {
      key: "catchers",
      title: "Catchers",
      layout: "grid",
      slots: [{ code: "C", instanceIndex: 0, occupantRosterId: 1 }],
    },
    {
      key: "infield",
      title: "Infield",
      layout: "grid",
      slots: [
        { code: "1B", instanceIndex: 0, occupantRosterId: 2 },
        { code: "2B", instanceIndex: 0, occupantRosterId: 3 },
        { code: "3B", instanceIndex: 0, occupantRosterId: 4 },
        { code: "SS", instanceIndex: 0, occupantRosterId: 5 },
      ],
    },
    {
      key: "outfield",
      title: "Outfield",
      layout: "grid",
      slots: [
        { code: "OF", instanceIndex: 0, occupantRosterId: 6 },
        { code: "OF", instanceIndex: 1, occupantRosterId: 7 },
        { code: "OF", instanceIndex: 2, occupantRosterId: 8 },
      ],
    },
    {
      key: "flex",
      title: "Flex (MI / CM / DH)",
      layout: "grid",
      slots: [
        { code: "MI", instanceIndex: 0, occupantRosterId: 9 },
        { code: "CM", instanceIndex: 0, occupantRosterId: 10 },
        { code: "DH", instanceIndex: 0, occupantRosterId: 11 },
      ],
    },
    {
      key: "pitchers",
      title: "Pitchers",
      layout: "list-draggable",
      slots: [
        { code: "P", instanceIndex: 0, occupantRosterId: 12 },
        { code: "P", instanceIndex: 1, occupantRosterId: 13 },
        { code: "P", instanceIndex: 2, occupantRosterId: 14 },
        { code: "P", instanceIndex: 3, occupantRosterId: 15 },
        { code: "P", instanceIndex: 4, occupantRosterId: 16 },
        { code: "P", instanceIndex: 5, occupantRosterId: 17 },
        { code: "P", instanceIndex: 6, occupantRosterId: 18 },
        { code: "P", instanceIndex: 7, occupantRosterId: 19 },
        { code: "P", instanceIndex: 8, occupantRosterId: 20 },
      ],
    },
  ];
}

/* ─── Preview-state derivation ─────────────────────────────────────── */

interface PreviewSnapshot {
  selectedRosterId: number | null;
  pendingSwaps: PendingSwap[];
}

function snapshotForState(state: PreviewState): PreviewSnapshot {
  switch (state) {
    case "idle":
      return { selectedRosterId: null, pendingSwaps: [] };

    case "playerSelected":
      // Mookie Betts (rosterId 6) is OF,2B — selecting him glows OF
      // slots, the 2B slot, and MI (since 2B → MI). Everything else
      // dims. Demonstrates the eligibility-highlight pathway end-to-end.
      return { selectedRosterId: 6, pendingSwaps: [] };

    case "pendingSwapSingle":
      // Single tentative swap: Trea Turner (2B → SS), displacing Witt
      // (SS → MI). For the static demo we model just the source/dest
      // dashed iridescent outlines.
      return {
        selectedRosterId: null,
        pendingSwaps: [
          {
            id: "swap-1",
            sourceSlot: { code: "2B", instanceIndex: 0 },
            destSlot: { code: "SS", instanceIndex: 0 },
            movingRosterId: 3,
            displacedRosterId: 5,
          },
        ],
      };

    case "pendingSwapMultiple":
      // Three queued swaps showing a chain — visual breadth test for the
      // pending-state styling under load.
      return {
        selectedRosterId: null,
        pendingSwaps: [
          {
            id: "swap-1",
            sourceSlot: { code: "2B", instanceIndex: 0 },
            destSlot: { code: "SS", instanceIndex: 0 },
            movingRosterId: 3,
            displacedRosterId: 5,
          },
          {
            id: "swap-2",
            sourceSlot: { code: "OF", instanceIndex: 1 },
            destSlot: { code: "DH", instanceIndex: 0 },
            movingRosterId: 7,
            displacedRosterId: 11,
          },
          {
            id: "swap-3",
            sourceSlot: { code: "P", instanceIndex: 6 },
            destSlot: { code: "P", instanceIndex: 8 },
            movingRosterId: 18,
            displacedRosterId: 20,
          },
        ],
      };

    case "keeperFlag":
      // Same as idle — keepers are visually flagged regardless of state.
      // This entry just ensures the toggler labels cover it; the gold
      // ring + ★ render comes from the player's `isKeeper: true` field.
      return { selectedRosterId: null, pendingSwaps: [] };

    case "pitcherDragLayout":
      // No different in data shape; the drag-handle indicators come
      // from the Pitcher group's `layout: "list-draggable"`. The state
      // entry exists so the user can scroll the Pitcher card into view.
      return { selectedRosterId: null, pendingSwaps: [] };

    case "actionBar":
      // Three pending swaps + a labeled action bar. Shares the
      // "multiple swaps" data so users see the bar populated.
      return {
        selectedRosterId: null,
        pendingSwaps: [
          {
            id: "swap-1",
            sourceSlot: { code: "2B", instanceIndex: 0 },
            destSlot: { code: "SS", instanceIndex: 0 },
            movingRosterId: 3,
            displacedRosterId: 5,
          },
          {
            id: "swap-2",
            sourceSlot: { code: "OF", instanceIndex: 1 },
            destSlot: { code: "DH", instanceIndex: 0 },
            movingRosterId: 7,
            displacedRosterId: 11,
          },
          {
            id: "swap-3",
            sourceSlot: { code: "P", instanceIndex: 6 },
            destSlot: { code: "P", instanceIndex: 8 },
            movingRosterId: 18,
            displacedRosterId: 20,
          },
        ],
      };
  }
}

const PREVIEW_STATES: { value: PreviewState; label: string; blurb: string }[] = [
  { value: "idle", label: "1. Idle", blurb: "23 slots filled, no selection." },
  { value: "playerSelected", label: "2. Player selected", blurb: "Mookie Betts highlighted; eligible slots glow." },
  { value: "pendingSwapSingle", label: "3. Pending swap (single)", blurb: "Turner 2B → SS queued." },
  { value: "pendingSwapMultiple", label: "4. Pending swaps (3)", blurb: "Chain of 3 queued swaps." },
  { value: "keeperFlag", label: "5. Keeper flag", blurb: "Turner + Betts wear the gold ★ ring." },
  { value: "pitcherDragLayout", label: "6. Pitcher drag layout", blurb: "9 P cells with drag-handle hints." },
  { value: "actionBar", label: "7. Action bar (3 pending)", blurb: "Save lineup CTA active." },
];

/* ─── Page ─────────────────────────────────────────────────────────── */

export default function SwapModePreview() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  const [state, setState] = useState<PreviewState>("idle");
  const groups = useMemo(() => buildGroups(), []);
  const players = MOCK_PLAYERS;

  const snap = useMemo(() => snapshotForState(state), [state]);

  // Cell-click handler — preview-only behavior. If user clicks an
  // occupant in idle, we move into "playerSelected" with that rosterId
  // so the eligibility highlighting demos against any player.
  const onCellClick = (rosterId: number | null, _slotKey: string) => {
    if (rosterId == null) return;
    if (state === "idle" || state === "playerSelected" || state === "keeperFlag" || state === "pitcherDragLayout") {
      setState("playerSelected");
    }
    // Override the snapshot's selectedRosterId via local state.
    setSelectedOverride(rosterId);
  };

  const [selectedOverride, setSelectedOverride] = useState<number | null>(null);

  // When user moves between toggler states, drop the override so the
  // canonical state's snapshot drives the visual.
  const handleStateChange = (next: PreviewState) => {
    setSelectedOverride(null);
    setState(next);
  };

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Glass strong>
          <SectionLabel>✦ Design preview</SectionLabel>
          <h1
            style={{
              fontFamily: "var(--am-display)",
              fontSize: 30,
              fontWeight: 300,
              color: "var(--am-text)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Swap Mode preview
          </h1>
        </Glass>
        <Glass>
          <div
            style={{
              height: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--am-text-muted)",
              fontSize: 13,
            }}
          >
            Admin access required.
          </div>
        </Glass>
      </div>
    );
  }

  const effectiveSelectedId =
    selectedOverride != null && state === "playerSelected" ? selectedOverride : snap.selectedRosterId;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 80 }}>
      <Glass strong>
        <SectionLabel>✦ Design preview · admin only</SectionLabel>
        <h1
          style={{
            fontFamily: "var(--am-display)",
            fontSize: 32,
            fontWeight: 300,
            color: "var(--am-text)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Swap Mode — PR2 visual preview
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.6 }}>
          Static visual preview of the Swap Mode UI specified in <code>docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md</code>{" "}
          §5B and §8. <strong>No business logic</strong> — all data is mocked, all "swaps" are local React state.
          Use the floating control panel (top-right) to cycle through the seven canonical states. Clicking any
          occupant in the cards selects them and lights up their eligible slots, demonstrating the
          "valid slots light up" north star.
        </p>
      </Glass>

      <SwapMode
        groups={groups}
        players={players}
        selectedRosterId={effectiveSelectedId}
        pendingSwaps={snap.pendingSwaps}
        onCellClick={onCellClick}
        onReset={() => handleStateChange("idle")}
        onSave={() => {
          // Visual-only: pretend we saved by returning to idle. PR2 will
          // POST /api/teams/:teamId/lineup here.
          handleStateChange("idle");
        }}
      />

      {/* Floating state-toggler — fixed to viewport bottom-right so it
          rides above the action bar and the dock. */}
      <StateToggler value={state} onChange={handleStateChange} />
    </div>
  );
}

/* ─── State toggler ─────────────────────────────────────────────────── */

function StateToggler({ value, onChange }: { value: PreviewState; onChange: (s: PreviewState) => void }) {
  const current = PREVIEW_STATES.find((s) => s.value === value) ?? PREVIEW_STATES[0];
  return (
    <div
      style={{
        position: "fixed",
        top: 80,
        right: 18,
        zIndex: 40,
        width: 260,
        background: "var(--am-surface-strong)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 18,
        padding: 14,
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.06) inset",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--am-text-faint)",
          fontWeight: 600,
        }}
      >
        ✦ Preview state
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {PREVIEW_STATES.map((s) => {
          const active = s.value === value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
              style={{
                textAlign: "left",
                fontSize: 12,
                padding: "7px 10px",
                borderRadius: 10,
                border: "1px solid " + (active ? "var(--am-border-strong)" : "transparent"),
                background: active ? "var(--am-chip-strong)" : "transparent",
                color: active ? "var(--am-text)" : "var(--am-text-muted)",
                cursor: "pointer",
                fontWeight: active ? 600 : 500,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--am-text-faint)", lineHeight: 1.4, marginTop: 4 }}>{current.blurb}</div>
    </div>
  );
}

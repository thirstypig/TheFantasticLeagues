// client/src/pages/design/rosterHubScenarios/shared.tsx
//
// Shared visual primitives + helpers used by all four roster-hub
// deferred design scenarios. Extracted to avoid duplicating ~300
// lines of grid/row/pill code across scenario components.

import { useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { slotsFor, type SlotCode } from "../../../lib/positionEligibility";
import type { PreviewPlayer } from "./mockData";

export const HITTER_GRID = "200px 220px 56px 56px 64px 56px 64px 80px";
export const PITCHER_GRID = "200px 220px 60px 48px 56px 48px 64px 64px 80px";
export const FA_GRID = "180px 1fr 60px 60px 60px";

/* ─── Section + header ────────────────────────────────────────────── */

export function RosterSection({
  label,
  count,
  dimmed,
  role,
  tone = "neutral",
  children,
}: {
  label: string;
  count: number;
  dimmed: boolean;
  role: "hitter" | "pitcher" | "il";
  tone?: "neutral" | "il";
  children: React.ReactNode;
}) {
  const sectionLabel =
    role === "hitter" ? "Hitters" : role === "pitcher" ? "Pitchers" : "Injured List";
  return (
    <div
      style={{
        marginTop: 14,
        opacity: dimmed ? 0.4 : 1,
        transition: "opacity 160ms ease",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: tone === "il" ? "#fca5a5" : "var(--am-text-muted)",
          fontWeight: 600,
          background:
            tone === "il"
              ? "color-mix(in srgb, #ef4444 14%, transparent)"
              : "var(--am-surface-faint)",
          borderRadius: 10,
          marginBottom: 4,
          border: tone === "il" ? "1px solid rgba(239, 68, 68, 0.35)" : undefined,
        }}
      >
        {label} · {count} · {sectionLabel}
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({ role }: { role: "hitter" | "pitcher" }) {
  const cols =
    role === "hitter"
      ? ["Pos · Eligibility", "Player", "R", "HR", "RBI", "SB", "AVG", ""]
      : ["Pos · Eligibility", "Player", "IP", "W", "SV", "K", "ERA", "WHIP", ""];
  const grid = role === "hitter" ? HITTER_GRID : PITCHER_GRID;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: grid,
        gap: 0,
        padding: "8px 12px",
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "var(--am-text-muted)",
        fontWeight: 600,
        borderBottom: "1px solid var(--am-border)",
      }}
    >
      {cols.map((c, i) => (
        <div
          key={i}
          style={{
            textAlign: i >= 2 && i < cols.length - 1 ? "right" : "left",
            paddingRight: 8,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

/* ─── Pill + stats cells ─────────────────────────────────────────── */

export function PillCell({
  slot,
  posList,
  gp,
  onClick,
  dimmed = false,
}: {
  slot: PreviewPlayer["assignedSlot"];
  posList: string;
  gp?: Partial<Record<SlotCode, number>>;
  onClick?: () => void;
  dimmed?: boolean;
}) {
  const eligible = slotsFor(posList);
  const secondary: SlotCode[] = [];
  for (const s of eligible) {
    if (s !== slot) secondary.push(s);
  }
  const NO_GP = new Set<SlotCode>(["MI", "CM", "DH"]);
  const primaryLabel =
    slot === "IL"
      ? "IL"
      : NO_GP.has(slot as SlotCode) || gp?.[slot as SlotCode] == null
        ? slot
        : `${slot} (${gp[slot as SlotCode]})`;
  const isIl = slot === "IL";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", opacity: dimmed ? 0.5 : 1 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: "4px 10px",
          borderRadius: 99,
          background: isIl ? "#ef4444" : "var(--am-irid)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          border: "1px solid transparent",
          cursor: onClick ? "pointer" : "default",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {primaryLabel}
      </button>
      {secondary.length > 0 && (
        <span aria-hidden style={{ color: "var(--am-text-faint)", fontSize: 11 }}>
          ·
        </span>
      )}
      {secondary.map((s, i) => (
        <span
          key={s}
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--am-text-muted)",
            background: "var(--am-chip)",
            border: "1px solid var(--am-border)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {s}
          {!NO_GP.has(s) && gp?.[s] != null ? ` (${gp[s]})` : ""}
          {i < secondary.length - 1 && (
            <span aria-hidden style={{ marginLeft: 6, color: "var(--am-text-faint)" }}>
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function Stat({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: "right",
        paddingRight: 8,
        fontSize: 12,
        color: "var(--am-text-muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </div>
  );
}

export function fmt(v: number | string | undefined, digits = 0): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return digits > 0 ? n.toFixed(digits) : String(n);
}

export function fmtAvg(v: number | string | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const s = n.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

/* ─── Status indicators ─────────────────────────────────────────── */

export function PendingDot() {
  return (
    <span
      aria-label="Pending change"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 99,
        background: "#fbbf24",
        boxShadow: "0 0 6px rgba(251, 191, 36, 0.5)",
        marginRight: 6,
        verticalAlign: 1,
      }}
    />
  );
}

export function SavedDotInline() {
  return (
    <span
      aria-label="Just saved"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 99,
        background: "#22c55e",
        boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
        marginRight: 6,
        verticalAlign: 1,
      }}
    />
  );
}

export function IlBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        background: "rgba(239, 68, 68, 0.18)",
        color: "#fca5a5",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        border: "1px solid rgba(239, 68, 68, 0.35)",
        marginLeft: 6,
        verticalAlign: 2,
        textTransform: "uppercase",
      }}
      title={status}
    >
      {status}
    </span>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid currentColor",
        borderRightColor: "transparent",
        borderRadius: 99,
        animation: "amSpin 800ms linear infinite",
      }}
    />
  );
}

/* ─── Row (drag-aware) ──────────────────────────────────────────── */

export interface DragRowGridProps {
  player: PreviewPlayer;
  role: "hitter" | "pitcher";
  isPending?: boolean;
  isJustSaved?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  isShake?: boolean;
  isAnyDragging?: boolean;
  isIl?: boolean;
  onPillClick?: () => void;
  onRevert?: () => void;
  /** dnd-kit draggable+droppable id prefix override (default "drag-"/"drop-"). */
  dndPrefix?: { drag: string; drop: string };
  /** When true, this row's slot is highlighted as the target of an
   *  in-progress drop animation (used for IL stash + FA add). */
  isLandingTarget?: boolean;
}

export function DragRowGrid({
  player,
  role,
  isPending,
  isJustSaved,
  isDragging,
  isDropTarget,
  isShake,
  isAnyDragging,
  isIl,
  onPillClick,
  onRevert,
  dndPrefix = { drag: "drag-", drop: "drop-" },
  isLandingTarget,
}: DragRowGridProps) {
  const draggable = useDraggable({ id: `${dndPrefix.drag}${player.rosterId}` });
  const droppable = useDroppable({ id: `${dndPrefix.drop}${player.rosterId}` });

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      draggable.setNodeRef(el);
      droppable.setNodeRef(el);
    },
    [draggable, droppable],
  );

  const grid = role === "hitter" ? HITTER_GRID : PITCHER_GRID;
  const eligibleHighlight = isAnyDragging && isDropTarget;

  const baseStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: grid,
    alignItems: "center",
    gap: 0,
    padding: "8px 12px",
    borderBottom: "1px solid var(--am-border-faint, var(--am-border))",
    transition: "background 140ms ease, transform 200ms ease, outline-color 140ms ease",
    background: isLandingTarget
      ? "color-mix(in srgb, #fbbf24 18%, transparent)"
      : isDragging
        ? "color-mix(in srgb, #d62b9b 10%, transparent)"
        : eligibleHighlight && droppable.isOver
          ? "color-mix(in srgb, #00b894 12%, transparent)"
          : eligibleHighlight
            ? "color-mix(in srgb, #2f6df0 5%, transparent)"
            : isIl
              ? "color-mix(in srgb, #ef4444 5%, transparent)"
              : "transparent",
    outline: eligibleHighlight
      ? "1px solid rgba(74, 140, 255, 0.55)"
      : isLandingTarget
        ? "1px solid rgba(251, 191, 36, 0.7)"
        : isDragging
          ? "1px dashed rgba(214, 43, 155, 0.7)"
          : "1px solid transparent",
    outlineOffset: -1,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    transform: isShake ? "translateX(0)" : undefined,
    animation: isShake
      ? "amDragShake 380ms ease"
      : isLandingTarget
        ? "amSlotFill 280ms ease"
        : undefined,
  };

  const hStats = player.hitterStats;
  const pStats = player.pitcherStats;

  return (
    <div ref={setRefs} style={baseStyle} role="row" aria-label={`${player.name} — ${player.assignedSlot}`}>
      <div style={{ paddingRight: 8 }}>
        <PillCell
          slot={player.assignedSlot}
          posList={player.posList}
          gp={player.gamesPlayedByPosition}
          onClick={onPillClick}
          dimmed={false}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <button
          type="button"
          ref={draggable.setActivatorNodeRef}
          {...draggable.attributes}
          {...(draggable.listeners as React.HTMLAttributes<HTMLButtonElement>)}
          aria-label={`Drag ${player.name}. Press space to lift, arrows to move, space to drop, escape to cancel.`}
          style={{
            cursor: isDragging ? "grabbing" : "grab",
            background: "transparent",
            border: "1px solid var(--am-border)",
            borderRadius: 8,
            padding: "4px 6px",
            color: "var(--am-text-muted)",
            fontSize: 14,
            lineHeight: 1,
            touchAction: "none",
            userSelect: "none",
          }}
          title="Drag to move"
        >
          ⋮⋮
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--am-text)" }}>
            {isPending && <PendingDot />}
            {isJustSaved && !isPending && <SavedDotInline />}
            {player.isKeeper && (
              <span aria-label="Keeper" style={{ color: "#fbbf24", marginRight: 6 }}>
                ★
              </span>
            )}
            {player.name}
            {player.mlbStatus && <IlBadge status={player.mlbStatus} />}
          </span>
          <span style={{ fontSize: 11, color: "var(--am-text-faint)", letterSpacing: 0.4 }}>
            {(player.mlbTeam ?? "FA") + " · " + player.posPrimary}
          </span>
        </div>
      </div>
      {role === "hitter" ? (
        <>
          <Stat>{fmt(hStats?.R)}</Stat>
          <Stat>{fmt(hStats?.HR)}</Stat>
          <Stat>{fmt(hStats?.RBI)}</Stat>
          <Stat>{fmt(hStats?.SB)}</Stat>
          <Stat>{fmtAvg(hStats?.AVG)}</Stat>
        </>
      ) : (
        <>
          <Stat>{fmt(pStats?.IP, 1)}</Stat>
          <Stat>{fmt(pStats?.W)}</Stat>
          <Stat>{fmt(pStats?.SV)}</Stat>
          <Stat>{fmt(pStats?.K)}</Stat>
          <Stat>{fmt(pStats?.ERA, 2)}</Stat>
          <Stat>{fmt(pStats?.WHIP, 2)}</Stat>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
        {isPending && onRevert && (
          <button
            type="button"
            onClick={onRevert}
            aria-label={`Revert pending change for ${player.name}`}
            title="Revert"
            style={{
              background: "transparent",
              border: "1px solid var(--am-border)",
              borderRadius: 8,
              padding: "3px 7px",
              fontSize: 12,
              color: "var(--am-text-muted)",
              cursor: "pointer",
            }}
          >
            ↩
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Empty IL row (drop target) ────────────────────────────────── */

export function EmptyIlRow({
  index,
  role,
  isAnyDragging,
  isDropTarget,
  isLandingTarget,
}: {
  index: number;
  role: "hitter" | "pitcher";
  isAnyDragging?: boolean;
  isDropTarget?: boolean;
  isLandingTarget?: boolean;
}) {
  const droppable = useDroppable({ id: `il-empty-${index}` });
  const grid = role === "hitter" ? HITTER_GRID : PITCHER_GRID;
  const highlight = isAnyDragging && isDropTarget;
  return (
    <div
      ref={droppable.setNodeRef}
      style={{
        display: "grid",
        gridTemplateColumns: grid,
        alignItems: "center",
        padding: "10px 12px",
        border: highlight
          ? "1px dashed rgba(239, 68, 68, 0.7)"
          : "1px dashed rgba(239, 68, 68, 0.3)",
        borderRadius: 10,
        marginTop: 4,
        background: isLandingTarget
          ? "color-mix(in srgb, #fbbf24 18%, transparent)"
          : highlight && droppable.isOver
            ? "color-mix(in srgb, #ef4444 12%, transparent)"
            : "transparent",
        color: "rgba(252, 165, 165, 0.7)",
        fontSize: 12,
        fontStyle: "italic",
        animation: isLandingTarget ? "amSlotFill 280ms ease" : undefined,
      }}
    >
      <span style={{ gridColumn: "1 / -1", textAlign: "center" }}>
        {highlight ? "Drop here to stash on IL" : "— IL slot empty —"}
      </span>
    </div>
  );
}

/* ─── Toast banner ──────────────────────────────────────────────── */

export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--am-surface-strong)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 12,
        padding: "10px 16px",
        fontSize: 13,
        color: "var(--am-text)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        zIndex: 100,
      }}
    >
      {message}
    </div>
  );
}

export function SaveBanner({
  tone,
  message,
  icon,
}: {
  tone: "neutral" | "success" | "error";
  message: string;
  icon?: React.ReactNode;
}) {
  const palette =
    tone === "success"
      ? { bg: "color-mix(in srgb, #22c55e 12%, transparent)", border: "rgba(34,197,94,0.5)" }
      : tone === "error"
        ? { bg: "color-mix(in srgb, #ef4444 12%, transparent)", border: "rgba(239,68,68,0.5)" }
        : { bg: "color-mix(in srgb, #2f6df0 8%, transparent)", border: "rgba(74,140,255,0.4)" };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        marginBottom: 12,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        fontSize: 12.5,
        color: "var(--am-text)",
      }}
      role="status"
      aria-live="polite"
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}

/* ─── Inline keyframes (registered once per page load) ──────────── */

if (typeof document !== "undefined" && !document.getElementById("am-drag-shake-style")) {
  const s = document.createElement("style");
  s.id = "am-drag-shake-style";
  s.textContent = `
@keyframes amDragShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes amSpin {
  to { transform: rotate(360deg); }
}
@keyframes amSlotFill {
  0% { background-color: color-mix(in srgb, #fbbf24 32%, transparent); }
  100% { background-color: color-mix(in srgb, #fbbf24 8%, transparent); }
}
@keyframes amSlideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
`;
  document.head.appendChild(s);
}

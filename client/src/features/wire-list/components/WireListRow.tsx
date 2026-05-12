import React from "react";
import type { WaiverDropMode } from "../api";
import { WaiverDropModeToggle } from "./WaiverDropModeToggle";

interface WireListRowProps {
  rank: number;
  playerName: string;
  playerPos: string;
  playerTeam: string;
  isPending: boolean;
  isReadOnly: boolean;
  compact?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  // For drop rows only:
  dropMode?: WaiverDropMode;
  onDropModeChange?: (m: WaiverDropMode) => void;
}

export function WireListRow({
  rank,
  playerName,
  playerPos,
  playerTeam,
  isPending,
  isReadOnly,
  compact = false,
  onMoveUp,
  onMoveDown,
  onRemove,
  isFirst = false,
  isLast = false,
  dropMode,
  onDropModeChange,
}: WireListRowProps) {
  const btnSize = compact ? 32 : 26;
  const rowPadH = compact ? "8px 14px" : "8px 6px";

  const arrowBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: btnSize,
    height: btnSize,
    borderRadius: compact ? 8 : 6,
    background: "var(--am-chip)",
    color: "var(--am-text)",
    border: "1px solid var(--am-border)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 11,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const removeBtnStyle: React.CSSProperties = {
    width: btnSize,
    height: btnSize,
    borderRadius: compact ? 8 : 6,
    background: "transparent",
    color: "var(--am-text-muted)",
    border: "1px solid var(--am-border)",
    cursor: "pointer",
    fontSize: compact ? 16 : 14,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: rowPadH,
        borderBottom: !isLast ? "1px solid var(--am-border-subtle)" : undefined,
        opacity: isPending ? 0.5 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      {/* Priority / rank badge */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 24,
          height: 24,
          borderRadius: 6,
          background: "var(--am-chip)",
          color: "var(--am-text-muted)",
          fontFamily: "var(--am-mono)",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Position pill */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: compact ? "2px 6px" : "2px 8px",
          borderRadius: 6,
          background: "var(--am-chip-strong)",
          color: "var(--am-text)",
          fontFamily: "var(--am-mono)",
          fontSize: 11,
          fontWeight: 600,
          border: "1px solid var(--am-border)",
          flexShrink: 0,
        }}
      >
        {playerPos || "—"}
      </span>

      {/* Player name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 13 : undefined,
            fontWeight: 500,
            color: "var(--am-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {playerName}
        </div>
        <div style={{ fontSize: compact ? 10 : 11, color: "var(--am-text-muted)" }}>
          {playerTeam}
        </div>
      </div>

      {/* Drop mode toggle (drops only) */}
      {dropMode !== undefined && onDropModeChange && (
        <WaiverDropModeToggle
          value={dropMode}
          disabled={isReadOnly || isPending}
          onChange={onDropModeChange}
          compact={compact}
        />
      )}

      {/* Reorder + remove controls */}
      {!isReadOnly && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            style={arrowBtnStyle(isFirst)}
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            style={arrowBtnStyle(isLast)}
            aria-label="Move down"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            style={removeBtnStyle}
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

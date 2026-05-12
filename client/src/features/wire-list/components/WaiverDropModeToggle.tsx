import React from "react";
import type { WaiverDropMode } from "../api";

interface WaiverDropModeToggleProps {
  value: WaiverDropMode;
  disabled: boolean;
  onChange: (m: WaiverDropMode) => void;
  compact?: boolean;
}

export function WaiverDropModeToggle({ value, disabled, onChange, compact = false }: WaiverDropModeToggleProps) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 6, overflow: "hidden",
      border: "1px solid var(--am-border)",
    }}>
      {(["RELEASE", "IL_STASH"] as WaiverDropMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => !disabled && value !== m && onChange(m)}
          disabled={disabled}
          style={{
            padding: compact ? "5px 8px" : "4px 8px",
            fontSize: 10, fontWeight: 600, lineHeight: 1,
            background: value === m ? "var(--am-accent)" : "transparent",
            color: value === m ? "var(--am-bg)" : "var(--am-text-muted)",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {m === "RELEASE" ? "REL" : "IL"}
        </button>
      ))}
    </div>
  );
}

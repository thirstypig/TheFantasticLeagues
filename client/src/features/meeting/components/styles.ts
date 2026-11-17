// Style Bible button/row styles for the meeting screens. Mirrors the
// commissioner cardParts values (not imported: ADR-015 feature isolation).
import type React from "react";

export const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 48,
  padding: "10px 16px",
  borderBottom: "1px solid var(--am-border)",
  color: "var(--am-text)",
  fontSize: 17,
};

export const PRIMARY: React.CSSProperties = {
  minHeight: 48,
  padding: "0 16px",
  borderRadius: 6,
  border: "1px solid var(--am-accent)",
  background: "var(--am-accent)",
  color: "var(--am-on-accent)",
  fontSize: 17,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

export const SECONDARY: React.CSSProperties = {
  ...PRIMARY,
  border: "1px solid var(--am-border-strong)",
  background: "transparent",
  color: "var(--am-text)",
};

/** Square 44px icon button (reorder arrows). */
export const ICON: React.CSSProperties = {
  ...SECONDARY,
  minHeight: 44,
  minWidth: 44,
  padding: 0,
};

export const MUTED: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
export const ERROR: React.CSSProperties = { margin: 0, fontSize: 15, color: "var(--am-negative)" };

export const disabled = (style: React.CSSProperties, off: boolean): React.CSSProperties =>
  off ? { ...style, opacity: 0.5, cursor: "not-allowed" } : style;

export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

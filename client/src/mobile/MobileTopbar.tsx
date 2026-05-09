import React from "react";

interface MobileTopbarProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onLeadingClick?: () => void;
  onTrailingClick?: () => void;
}

export function MobileTopbar({
  title,
  subtitle,
  leading,
  trailing,
  onLeadingClick,
  onTrailingClick,
}: MobileTopbarProps) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        padding: "8px 16px 10px",
        background: "linear-gradient(180deg, var(--am-bg) 0%, var(--am-bg) 60%, transparent 100%)",
        backdropFilter: "blur(14px) saturate(180%)",
        WebkitBackdropFilter: "blur(14px) saturate(180%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          type="button"
          onClick={onLeadingClick}
          aria-hidden={!leading}
          tabIndex={leading ? 0 : -1}
          style={{
            width: 32,
            minHeight: 32,
            fontSize: 18,
            color: "var(--am-text)",
            background: "transparent",
            border: "none",
            cursor: onLeadingClick ? "pointer" : "default",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            visibility: leading ? "visible" : "hidden",
          }}
        >
          {leading}
        </button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--am-text)", lineHeight: 1.2 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 10.5, color: "var(--am-text-faint)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onTrailingClick}
          aria-hidden={!trailing}
          tabIndex={trailing ? 0 : -1}
          style={{
            width: 32,
            minHeight: 32,
            fontSize: 16,
            color: "var(--am-text-muted)",
            background: "transparent",
            border: "none",
            cursor: onTrailingClick ? "pointer" : "default",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            visibility: trailing ? "visible" : "hidden",
          }}
        >
          {trailing}
        </button>
      </div>
    </div>
  );
}

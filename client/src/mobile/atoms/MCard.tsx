import React from "react";

interface MCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padded?: boolean;
  strong?: boolean;
}

export function MCard({ children, style, padded = true, strong = false }: MCardProps) {
  return (
    <div
      style={{
        borderRadius: 18,
        background: strong ? "var(--am-surface-strong)" : "var(--am-surface)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: "1px solid var(--am-border)",
        padding: padded ? 14 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function MIridRing({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 22,
        padding: 1.5,
        background: "var(--am-ring)",
        ...style,
      }}
    >
      <div style={{ borderRadius: 21, background: "var(--am-bg)" }}>{children}</div>
    </div>
  );
}

export function MChip({ children, strong = false, color }: { children: React.ReactNode; strong?: boolean; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 500,
        background: strong ? "var(--am-chip-strong)" : "var(--am-chip)",
        border: "1px solid " + (strong ? "var(--am-border-strong)" : "var(--am-border)"),
        color: color || "var(--am-text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function MDot({ color = "var(--am-positive)" }: { color?: string }) {
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: color }} />;
}

export function MLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        letterSpacing: 1.1,
        fontWeight: 600,
        color: "var(--am-text-faint)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export function MIridText({ children, size = 20, weight = 600 }: { children: React.ReactNode; size?: number; weight?: number }) {
  return (
    <span
      style={{
        fontFamily: "var(--am-display)",
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1,
        backgroundImage: "var(--am-irid)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: -0.5,
      }}
    >
      {children}
    </span>
  );
}

interface MStatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  big?: boolean;
}

export function MStat({ label, value, sub, big = false }: MStatProps) {
  return (
    <div
      style={{
        padding: big ? "12px 14px" : "10px 12px",
        borderRadius: 14,
        background: "var(--am-surface-faint)",
        border: "1px solid var(--am-border)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 600,
          color: "var(--am-text-faint)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--am-display)",
          fontSize: big ? 26 : 20,
          lineHeight: 1,
          color: "var(--am-text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ marginTop: 3, fontSize: 10, color: "var(--am-text-muted)" }}>{sub}</div>}
    </div>
  );
}

interface MSectionProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  onActionClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function MSection({ title, action, onActionClick, children, style }: MSectionProps) {
  return (
    <div style={style}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
        <MLabel>{title}</MLabel>
        {action && (
          <span
            onClick={onActionClick}
            style={{
              fontSize: 11,
              color: "var(--am-accent)",
              fontWeight: 600,
              cursor: onActionClick ? "pointer" : "default",
            }}
          >
            {action}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface MAICardProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  cta?: React.ReactNode;
  onCtaClick?: () => void;
}

export function MAICard({ icon = "✦", title, body, cta, onCtaClick }: MAICardProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: 12,
        borderRadius: 14,
        background: "var(--am-ai-strip)",
        border: "1px solid var(--am-border)",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          flexShrink: 0,
          background: "var(--am-irid)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--am-text)", lineHeight: 1.3 }}>{title}</div>
        {body && (
          <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{body}</div>
        )}
      </div>
      {cta && (
        <button
          type="button"
          onClick={onCtaClick}
          style={{
            padding: "4px 10px",
            borderRadius: 99,
            fontSize: 10.5,
            fontWeight: 600,
            background: "var(--am-chip-strong)",
            border: "1px solid var(--am-border-strong)",
            color: "var(--am-text)",
            flexShrink: 0,
            cursor: onCtaClick ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          {cta}
        </button>
      )}
    </div>
  );
}

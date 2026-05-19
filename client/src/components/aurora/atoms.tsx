/*
 * Score Sheet atoms — React primitives for the Score Sheet design system.
 *
 * Token values come from aurora.css (scoped to .aurora-theme). The atom
 * API surface is unchanged from the Aurora era so no callsite in the app
 * needs to be updated — only the token values and styles in this file
 * change to match the Score Sheet aesthetic.
 */
import React, { CSSProperties } from "react";
import { NavLink } from "react-router-dom";

// ─── AmbientBg ───
// Score Sheet is flat / paper-like — no gradient glows. This component
// is kept as a no-op so existing callsites (AuroraShell) don't break.
export function AmbientBg({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--am-bg)",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

// ─── Glass ───
// Score Sheet card: solid surface, 1px border, 6px radius, no blur.
// The `strong` prop uses the alt/zebra shade.
export function Glass({
  children,
  style,
  padded = true,
  strong = false,
  className = "",
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  padded?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={"am-glass " + className}
      style={{
        background: strong ? "var(--am-surface-alt)" : "var(--am-surface)",
        border: "1px solid var(--am-border)",
        borderRadius: 6,
        padding: padded ? 16 : 0,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── IridescentRing ───
// Score Sheet: plain border wrapper (iridescent gradient removed).
export function IridescentRing({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 8,
        padding: 1,
        background: "var(--am-border)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Dot ───
export function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: 99,
        background: color,
      }}
    />
  );
}

// ─── Chip ───
export function Chip({
  children,
  strong,
  color,
  style,
}: {
  children: React.ReactNode;
  strong?: boolean;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        background: strong ? "var(--am-chip-strong)" : "var(--am-chip)",
        color: color || "var(--am-text-muted)",
        border: "1px solid var(--am-border)",
        letterSpacing: 0.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── SectionLabel ───
export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: "var(--am-text-faint)",
        fontWeight: 700,
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── IridText ───
// Score Sheet: renders with accent color instead of iridescent gradient.
export function IridText({
  children,
  size = 36,
  weight = 600,
  family = "var(--am-display)",
  style,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: number;
  family?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: family,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1,
        color: "var(--am-accent)",
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Sparkline ───
export function Sparkline({
  data,
  w = 120,
  h = 36,
}: {
  data: number[];
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline
        fill="none"
        stroke="var(--am-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

// ─── AIStrip ───
export interface AIStripItem {
  icon: string;
  title: string;
  body: string;
  cta: string;
}

export function AIStrip({
  subtitle,
  items,
}: {
  subtitle: string;
  items: AIStripItem[];
}) {
  return (
    <div
      style={{
        background: "var(--am-surface-alt)",
        border: "1px solid var(--am-border)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <SectionLabel style={{ marginBottom: 0 }}>AI suggestions</SectionLabel>
        <span style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{subtitle}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: 10,
              borderRadius: 4,
              background: "var(--am-surface)",
              border: "1px solid var(--am-border)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                flexShrink: 0,
                background: "var(--am-accent)",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                color: "#fff",
              }}
            >
              {it.icon}
            </span>
            <div style={{ fontSize: 12, lineHeight: 1.4, flex: 1 }}>
              <div style={{ color: "var(--am-text)", fontWeight: 500 }}>{it.title}</div>
              <div style={{ color: "var(--am-text-muted)", marginTop: 2 }}>{it.body}</div>
              <div
                style={{
                  marginTop: 6,
                  display: "inline-block",
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 4,
                  border: "1px solid var(--am-border-strong)",
                  color: "var(--am-text-muted)",
                }}
              >
                {it.cta}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Topbar ───
// Kept for backward compat; AuroraShell no longer mounts this — the new
// sticky header is inline in AuroraShell.tsx.
export function Topbar({
  title = "The Fantastic Leagues",
  subtitle,
  right,
  onLogoClick,
  onAvatarClick,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onLogoClick?: () => void;
  onAvatarClick?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 18px",
        height: 56,
        background: "var(--am-surface)",
        borderBottom: "1px solid var(--am-border-strong)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: onLogoClick ? "pointer" : "default" }}
        onClick={onLogoClick}
      >
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "var(--am-accent)",
            display: "grid",
            placeItems: "center",
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}
        >
          F
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--am-text)", whiteSpace: "nowrap" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--am-text-faint)" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {right}
        <button
          type="button"
          aria-label="Account menu"
          onClick={onAvatarClick}
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "var(--am-chip)",
            border: "1px solid var(--am-border)",
            cursor: "pointer",
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--am-text-muted)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Dock ───
// Kept for backward compat; AuroraShell now uses inline horizontal nav.
export interface DockItem {
  key: string;
  label: string;
  glyph: string;
  to: string;
}

export function Dock({
  items,
  extra,
}: {
  items: DockItem[];
  extra?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "0 8px",
        alignItems: "stretch",
        height: "100%",
      }}
    >
      {items.map((it) => (
        <NavLink
          key={it.key}
          to={it.to}
          end={it.to === "/"}
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
            borderBottom: isActive ? "2px solid var(--am-accent)" : "2px solid transparent",
            textDecoration: "none",
            whiteSpace: "nowrap",
          })}
        >
          {it.label}
        </NavLink>
      ))}
      {extra}
    </div>
  );
}

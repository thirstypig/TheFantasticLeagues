/*
 * Aurora atoms — React port of the design's primitives from
 * `aurora-atoms.jsx` in the handoff bundle. Tokens consumed via
 * CSS variables in `aurora.css` (scoped to `.aurora-theme`).
 *
 * One file for simplicity during the pilot; if Aurora rolls out
 * further, atoms should split per-file.
 */
import React, { CSSProperties } from "react";
import { NavLink } from "react-router-dom";

// ─── AmbientBg ───
// Full-bleed background with three radial-glow layers + grain. Pin
// `position: relative` on the parent so this absolutely-positioned
// layer sits beneath your content.
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
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--am-glow-1)" }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--am-glow-2)" }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--am-glow-3)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          mixBlendMode: "overlay",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  );
}

// ─── Glass ───
// Glassmorphism surface card. `strong` uses the heavier opacity surface
// (for hero / focus content); default is the standard surface.
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
        background: strong ? "var(--am-surface-strong)" : "var(--am-surface)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
        border: "1px solid var(--am-border)",
        borderRadius: 24,
        boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 12px 40px rgba(0,0,0,0.18)",
        padding: padded ? 20 : 0,
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
// 1px iridescent border wrapping its child. Pair with `Glass` to get
// the signature "ringed glass card" focus treatment.
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
        borderRadius: 26,
        padding: 1,
        background: "var(--am-ring)",
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
        borderRadius: 99,
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
// Small uppercase eyebrow above a section.
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
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: "var(--am-text-faint)",
        fontWeight: 600,
        marginBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── IridText ───
// Iridescent gradient text, used for hero numbers (points, etc.).
// Falls back to a plain text fill when the browser can't background-clip.
export function IridText({
  children,
  size = 36,
  weight = 300,
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
        background: "var(--am-irid)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Sparkline ───
// 1-D series rendered with the iridescent gradient stroke. `data` is
// numeric series; auto-scales to width × height. Returns `null` for
// empty input rather than rendering a flat line.
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
  // Random suffix avoids gradient id collisions when multiple
  // sparklines mount in the same tree.
  const id = "am-sp-" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--am-cardinal)" />
          <stop offset="1" stopColor="var(--am-accent)" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={"url(#" + id + ")"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

// ─── AIStrip ───
// Woven AI-suggestion strip designed to live inside a hero card. Each
// item shows an icon, title, body, and CTA button.
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
        background: "var(--am-ai-strip)",
        border: "1px solid var(--am-border)",
        borderRadius: 16,
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
        <SectionLabel style={{ marginBottom: 0 }}>✦ AI suggestions</SectionLabel>
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
              borderRadius: 12,
              background: "var(--am-surface-faint)",
              border: "1px solid var(--am-border)",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                flexShrink: 0,
                background: "var(--am-irid)",
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
                  borderRadius: 99,
                  border: "1px solid var(--am-border-strong)",
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
// Floating top strip per the Aurora System.html spec. Iridescent square
// logo on the left, league display name + subtitle, right-side chip slot,
// iridescent avatar disc. Absolute-positioned over the AmbientBg.
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
        position: "absolute",
        top: 16,
        left: 18,
        right: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 20,
        gap: 12,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, cursor: onLogoClick ? "pointer" : "default", minWidth: 0 }}
        onClick={onLogoClick}
      >
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "var(--am-irid)",
            boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--am-display)",
              fontSize: 18,
              lineHeight: 1,
              letterSpacing: -0.2,
              color: "var(--am-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 11,
                color: "var(--am-text-faint)",
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {right}
        <button
          type="button"
          aria-label="Account menu"
          onClick={onAvatarClick}
          style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            background: "var(--am-irid)",
            border: "1px solid var(--am-border-strong)",
            cursor: "pointer",
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}

// ─── Dock ───
// Floating bottom-center nav per the Aurora System.html spec. Items
// route via React Router NavLink; the optional `extra` slot lets the
// shell add a "More" overflow trigger after the last item.
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
        position: "fixed",
        bottom: 22,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 6,
        padding: 6,
        background: "var(--am-surface-strong)",
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
        border: "1px solid var(--am-border-strong)",
        borderRadius: 22,
        boxShadow: "0 18px 50px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.08) inset",
        zIndex: 30,
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
            gap: 8,
            padding: "10px 14px",
            borderRadius: 16,
            fontSize: 13,
            fontWeight: 500,
            color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
            background: isActive ? "var(--am-chip-strong)" : "transparent",
            border: "1px solid " + (isActive ? "var(--am-border-strong)" : "transparent"),
            textDecoration: "none",
          })}
        >
          {({ isActive }) => (
            <>
              <span
                style={{
                  fontSize: 14,
                  background: isActive ? "var(--am-irid)" : "transparent",
                  WebkitBackgroundClip: isActive ? "text" : undefined,
                  WebkitTextFillColor: isActive ? "transparent" : undefined,
                }}
              >
                {it.glyph}
              </span>
              {it.label}
            </>
          )}
        </NavLink>
      ))}
      {extra}
    </div>
  );
}

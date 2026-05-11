/* Aurora Mobile — phone/tablet frames + density-tuned atoms.
   Built specifically for small screens: cards over tables, bottom dock,
   sticky compact topbar, horizontal scroll strips, sheet-style AI cards. */

const MM = window.MOCK;
const MM2 = window.MOCK2;

/* ============================================================
   PHONE / TABLET FRAMES — minimal chrome so Aurora bg shows
   ============================================================ */

function PhoneFrame({ palette, mode, children, width = 390, height = 844 }) {
  const vars = window.ambientVarsFor(palette, mode);
  return (
    <div style={{
      width, height,
      borderRadius: 52, padding: 5,
      background: mode === "dark"
        ? "linear-gradient(140deg,#2a2a30,#0a0a0e 60%)"
        : "linear-gradient(140deg,#dadce2,#9ea3ad 60%)",
      boxShadow: "0 50px 90px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.25)",
      position: "relative",
    }}>
      <div style={{
        ...vars,
        width: "100%", height: "100%",
        borderRadius: 47, overflow: "hidden",
        position: "relative",
        background: "var(--am-bg)",
        backgroundImage: "var(--am-glow-1), var(--am-glow-2), var(--am-glow-3)",
      }}>
        {/* status bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 50, zIndex: 30,
          padding: "16px 32px 0", display: "flex", justifyContent: "space-between",
          fontSize: 15, fontWeight: 600, color: "var(--am-text)",
          fontFamily: "-apple-system,system-ui",
        }}>
          <span>9:41</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <span>●●●●●</span>
            <span>5G</span>
            <span style={{
              display: "inline-block", width: 22, height: 11, borderRadius: 3,
              border: "1px solid var(--am-text)", padding: 1,
            }}>
              <span style={{ display: "block", width: "85%", height: "100%", background: "var(--am-text)", borderRadius: 1 }} />
            </span>
          </span>
        </div>
        {/* dynamic island */}
        <div style={{
          position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)",
          width: 122, height: 36, borderRadius: 22, background: "#000", zIndex: 40,
        }} />
        {/* content area */}
        <div style={{ position: "absolute", inset: 0, paddingTop: 50, paddingBottom: 0, overflow: "hidden" }}>
          {children}
        </div>
        {/* home indicator */}
        <div style={{
          position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
          width: 134, height: 5, borderRadius: 3,
          background: mode === "dark" ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.4)", zIndex: 50,
        }} />
      </div>
    </div>
  );
}

function TabletFrame({ palette, mode, children, width = 1024, height = 768 }) {
  const vars = window.ambientVarsFor(palette, mode);
  return (
    <div style={{
      width, height,
      borderRadius: 28, padding: 8,
      background: mode === "dark"
        ? "linear-gradient(140deg,#2a2a30,#0a0a0e 60%)"
        : "linear-gradient(140deg,#dadce2,#9ea3ad 60%)",
      boxShadow: "0 50px 90px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.25)",
      position: "relative",
    }}>
      <div style={{
        ...vars,
        width: "100%", height: "100%",
        borderRadius: 22, overflow: "hidden",
        position: "relative",
        background: "var(--am-bg)",
        backgroundImage: "var(--am-glow-1), var(--am-glow-2), var(--am-glow-3)",
      }}>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   MOBILE ATOMS — tighter scale than desktop
   ============================================================ */

function MCard({ children, style, padded = true, strong = false }) {
  return (
    <div style={{
      borderRadius: 18,
      background: strong ? "var(--am-surface-strong)" : "var(--am-surface)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      border: "1px solid var(--am-border)",
      padding: padded ? 14 : 0,
      ...style,
    }}>{children}</div>
  );
}

function MIridRing({ children, style }) {
  return (
    <div style={{
      borderRadius: 22, padding: 1.5,
      background: "var(--am-ring)",
      ...style,
    }}>
      <div style={{ borderRadius: 21, background: "var(--am-bg)" }}>{children}</div>
    </div>
  );
}

function MChip({ children, strong = false, color }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 99,
      fontSize: 10.5, fontWeight: 500,
      background: strong ? "var(--am-chip-strong)" : "var(--am-chip)",
      border: "1px solid " + (strong ? "var(--am-border-strong)" : "var(--am-border)"),
      color: color || "var(--am-text-muted)",
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function MDot({ color = "var(--am-positive)" }) {
  return <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: color }} />;
}

function MLabel({ children }) {
  return (
    <div style={{
      fontSize: 9.5, letterSpacing: 1.1, fontWeight: 600,
      color: "var(--am-text-faint)", textTransform: "uppercase",
    }}>{children}</div>
  );
}

function MIridText({ children, size = 20, weight = 600 }) {
  return (
    <span style={{
      fontFamily: "var(--am-display)",
      fontSize: size, fontWeight: weight, lineHeight: 1,
      backgroundImage: "var(--am-irid)",
      WebkitBackgroundClip: "text", backgroundClip: "text",
      WebkitTextFillColor: "transparent", color: "transparent",
      fontVariantNumeric: "tabular-nums", letterSpacing: -0.5,
    }}>{children}</span>
  );
}

function MSparkline({ data, w = 100, h = 28 }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / range) * (h - 4) - 2]);
  const d = "M " + pts.map(p => p.join(" ")).join(" L ");
  const area = d + " L " + w + " " + h + " L 0 " + h + " Z";
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={"ms" + w + h} x1="0" x2="1">
          <stop offset="0" stopColor="#2af0c8" />
          <stop offset="0.5" stopColor="#b14bff" />
          <stop offset="1" stopColor="#ff4dd2" />
        </linearGradient>
      </defs>
      <path d={area} fill={"url(#ms" + w + h + ")"} opacity="0.18" />
      <path d={d} fill="none" stroke={"url(#ms" + w + h + ")"} strokeWidth="1.5" />
    </svg>
  );
}

/* Compact sticky topbar */
function MTopbar({ title, leading, trailing, subtitle }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      padding: "8px 16px 10px",
      background: "linear-gradient(180deg, var(--am-bg) 0%, var(--am-bg) 60%, transparent 100%)",
      backdropFilter: "blur(14px) saturate(180%)",
      WebkitBackdropFilter: "blur(14px) saturate(180%)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 32, fontSize: 18, color: "var(--am-text)" }}>{leading || ""}</div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--am-text)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10.5, color: "var(--am-text-faint)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ width: 32, textAlign: "right", fontSize: 16, color: "var(--am-text-muted)" }}>{trailing || ""}</div>
      </div>
    </div>
  );
}

/* 5-tab bottom dock — solid, high-contrast, big touch targets */
function MTabBar({ active = "Home", role = "manager" }) {
  // Commissioner sees "Commish" instead of "AI" (AI moves into More sheet)
  const tabs = role === "commish"
    ? [
        { k: "Home",    label: "Home",    glyph: "home" },
        { k: "Players", label: "Players", glyph: "players" },
        { k: "Standings", label: "Standings", glyph: "trophy" },
        { k: "Commish", label: "Commish", glyph: "shield" },
        { k: "More",    label: "More",    glyph: "more" },
      ]
    : [
        { k: "Home",    label: "Home",    glyph: "home" },
        { k: "Players", label: "Players", glyph: "players" },
        { k: "Standings", label: "Standings", glyph: "trophy" },
        { k: "AI",      label: "Coach",   glyph: "ai" },
        { k: "More",    label: "More",    glyph: "more" },
      ];
  // Solid backdrop — much more visible than glass
  const isDark = getComputedStyle(document.documentElement).getPropertyValue("--am-bg") || "";
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30,
      paddingTop: 8, paddingBottom: 26,
      background: "var(--am-surface-strong)",
      backdropFilter: "blur(40px) saturate(200%)",
      WebkitBackdropFilter: "blur(40px) saturate(200%)",
      borderTop: "1px solid var(--am-border-strong)",
      boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
      display: "flex", justifyContent: "space-around", alignItems: "stretch",
    }}>
      {tabs.map(t => {
        const on = t.k === active;
        return (
          <div key={t.k} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            padding: "6px 4px",
            position: "relative",
          }}>
            {on && (
              <span style={{
                position: "absolute", top: 0, left: "30%", right: "30%", height: 3,
                borderRadius: 99, background: "var(--am-irid)",
              }} />
            )}
            <div style={{
              color: on ? "var(--am-text)" : "var(--am-text-muted)",
              transform: on ? "scale(1.05)" : "scale(1)",
            }}><Glyph kind={t.glyph} size={24} /></div>
            <div style={{
              fontSize: 10.5, fontWeight: on ? 700 : 500, letterSpacing: 0.1,
              color: on ? "var(--am-text)" : "var(--am-text-muted)",
            }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* Tiny inline glyphs (stroked, monoline) */
function Glyph({ kind, size = 18 }) {
  const c = "currentColor";
  const sw = 1.7;
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "home":     return <svg {...common}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>;
    case "matchup":  return <svg {...common}><path d="M5 4h6v16H5zM13 4h6v16h-6z" /><path d="M11 12h2" /></svg>;
    case "players":  return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></svg>;
    case "ai":       return <svg {...common}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg>;
    case "me":       return <svg {...common}><circle cx="12" cy="9" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></svg>;
    case "search":   return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>;
    case "filter":   return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
    case "back":     return <svg {...common}><path d="M15 6l-6 6 6 6" /></svg>;
    case "more":     return <svg {...common}><circle cx="5" cy="7" r="1" fill={c} /><circle cx="5" cy="12" r="1" fill={c} /><circle cx="5" cy="17" r="1" fill={c} /><path d="M10 7h10M10 12h10M10 17h6" /></svg>;
    case "moreDots": return <svg {...common}><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></svg>;
    case "shield":  return <svg {...common}><path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6z" /></svg>;
    case "chevD":   return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>;
    case "chevR":   return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
    case "sort":    return <svg {...common}><path d="M7 4v16M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3" /></svg>;
    case "sortUp":  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 6l6 8H6z" /></svg>;
    case "sortDn":  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 18l-6-8h12z" /></svg>;
    case "x":       return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "check":   return <svg {...common}><path d="M5 12l5 5L20 7" /></svg>;
    case "cog":     return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
    case "trade":   return <svg {...common}><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>;
    case "calendar":return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
    case "trophy":  return <svg {...common}><path d="M8 4h8v4a4 4 0 1 1-8 0V4zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 16h6l1 4H8z" /></svg>;
    case "spark":    return <svg {...common}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /></svg>;
    case "bell":     return <svg {...common}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" /><path d="M10 21h4" /></svg>;
    case "plus":     return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "star":     return <svg {...common}><path d="M12 3l2.5 5.5L20 9.5l-4.2 4 1 5.7L12 16.7 7.2 19.2l1-5.7-4.2-4 5.5-1z" /></svg>;
    case "starOn":   return <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--am-accent)"><path d="M12 3l2.5 5.5L20 9.5l-4.2 4 1 5.7L12 16.7 7.2 19.2l1-5.7-4.2-4 5.5-1z" /></svg>;
    default:         return null;
  }
}

/* Stat pill — for hero stat grids */
function MStat({ label, value, sub, big = false }) {
  return (
    <div style={{
      padding: big ? "12px 14px" : "10px 12px",
      borderRadius: 14,
      background: "var(--am-surface-faint)",
      border: "1px solid var(--am-border)",
    }}>
      <div style={{ fontSize: 9, letterSpacing: 1, fontWeight: 600, color: "var(--am-text-faint)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: "var(--am-display)", fontSize: big ? 26 : 20, lineHeight: 1, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ marginTop: 3, fontSize: 10, color: "var(--am-text-muted)" }}>{sub}</div>}
    </div>
  );
}

/* AI suggestion card — single, tappable, sheet-style */
function MAICard({ icon = "✦", title, body, cta }) {
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: 12, borderRadius: 14,
      background: "var(--am-ai-strip)",
      border: "1px solid var(--am-border)",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 8, flexShrink: 0,
        background: "var(--am-irid)", color: "#fff",
        display: "grid", placeItems: "center", fontSize: 13,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--am-text)", lineHeight: 1.3 }}>{title}</div>
        {body && <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{body}</div>}
      </div>
      {cta && (
        <span style={{
          padding: "4px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 600,
          background: "var(--am-chip-strong)", border: "1px solid var(--am-border-strong)",
          color: "var(--am-text)", flexShrink: 0,
        }}>{cta}</span>
      )}
    </div>
  );
}

/* Segmented control — tabs inside a card */
function MSegmented({ options, active, onChange }) {
  return (
    <div style={{
      display: "flex", padding: 3, gap: 2, borderRadius: 12,
      background: "var(--am-chip)", border: "1px solid var(--am-border)",
    }}>
      {options.map(o => {
        const on = o === active;
        return (
          <div key={o} style={{
            flex: 1, padding: "6px 0", textAlign: "center",
            fontSize: 11.5, fontWeight: on ? 600 : 500,
            color: on ? "var(--am-text)" : "var(--am-text-muted)",
            background: on ? "var(--am-surface-strong)" : "transparent",
            borderRadius: 9,
          }}>{o}</div>
        );
      })}
    </div>
  );
}

/* Section title + action */
function MSection({ title, action, children, style }) {
  return (
    <div style={style}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
        <MLabel>{title}</MLabel>
        {action && <span style={{ fontSize: 11, color: "var(--am-accent)", fontWeight: 600 }}>{action}</span>}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, {
  PhoneFrame, TabletFrame,
  MCard, MIridRing, MChip, MDot, MLabel, MIridText, MSparkline,
  MTopbar, MTabBar, Glyph, MStat, MAICard, MSegmented, MSection,
});

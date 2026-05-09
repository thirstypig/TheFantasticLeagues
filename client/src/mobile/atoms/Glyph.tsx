import React from "react";

export type GlyphKind =
  | "home" | "matchup" | "players" | "ai" | "me"
  | "search" | "filter" | "back" | "more" | "moreDots"
  | "shield" | "chevD" | "chevR" | "sort" | "sortUp" | "sortDn"
  | "x" | "check" | "cog" | "trade" | "calendar" | "trophy"
  | "spark" | "bell" | "plus" | "star" | "starOn";

interface GlyphProps {
  kind: GlyphKind;
  size?: number;
}

const STROKE = 1.7;

export function Glyph({ kind, size = 18 }: GlyphProps): React.ReactElement | null {
  const c = "currentColor";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: c,
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "home":
      return <svg {...common}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>;
    case "matchup":
      return <svg {...common}><path d="M5 4h6v16H5zM13 4h6v16h-6z" /><path d="M11 12h2" /></svg>;
    case "players":
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></svg>;
    case "ai":
      return <svg {...common}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></svg>;
    case "me":
      return <svg {...common}><circle cx="12" cy="9" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></svg>;
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>;
    case "filter":
      return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
    case "back":
      return <svg {...common}><path d="M15 6l-6 6 6 6" /></svg>;
    case "more":
      return <svg {...common}><circle cx="5" cy="7" r="1" fill={c} /><circle cx="5" cy="12" r="1" fill={c} /><circle cx="5" cy="17" r="1" fill={c} /><path d="M10 7h10M10 12h10M10 17h6" /></svg>;
    case "moreDots":
      return <svg {...common}><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3l8 3v6c0 4.5-3.4 8.4-8 9-4.6-.6-8-4.5-8-9V6z" /></svg>;
    case "chevD":
      return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>;
    case "chevR":
      return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
    case "sort":
      return <svg {...common}><path d="M7 4v16M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3" /></svg>;
    case "sortUp":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 6l6 8H6z" /></svg>;
    case "sortDn":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 18l-6-8h12z" /></svg>;
    case "x":
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "check":
      return <svg {...common}><path d="M5 12l5 5L20 7" /></svg>;
    case "cog":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
    case "trade":
      return <svg {...common}><path d="M4 8h14l-3-3M20 16H6l3 3" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
    case "trophy":
      return <svg {...common}><path d="M8 4h8v4a4 4 0 1 1-8 0V4zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 16h6l1 4H8z" /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" /></svg>;
    case "bell":
      return <svg {...common}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" /><path d="M10 21h4" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "star":
      return <svg {...common}><path d="M12 3l2.5 5.5L20 9.5l-4.2 4 1 5.7L12 16.7 7.2 19.2l1-5.7-4.2-4 5.5-1z" /></svg>;
    case "starOn":
      return <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--am-accent)"><path d="M12 3l2.5 5.5L20 9.5l-4.2 4 1 5.7L12 16.7 7.2 19.2l1-5.7-4.2-4 5.5-1z" /></svg>;
    default:
      return null;
  }
}

/*
 * MobileLayoutGate — single switch that picks the app chrome based on
 * viewport width. The gate intentionally does NOT swap routes; the
 * route tree stays identical so deep links keep working. The mobile
 * shell instead reads `useLocation()` and substitutes a mobile twin
 * page when one exists, otherwise it falls through to the desktop
 * child unchanged.
 *
 *   ≥ 768px → desktopChrome (AuroraShell) wraps the route tree
 *   ≤ 767px → MobileShell wraps the route tree
 *
 * Both chromes consume the same children (the protected `<Routes>`)
 * and both live inside the same provider stack (Auth, League, Theme),
 * so every page hook keeps working unchanged.
 */
import React from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { MobileShell } from "./MobileShell";

interface MobileLayoutGateProps {
  children: React.ReactNode;
  /**
   * The desktop chrome component (typically `AuroraShell`). Receives the
   * route tree as `children` when the viewport is wider than 767px.
   */
  desktopChrome: React.ComponentType<{ children: React.ReactNode }>;
}

export function MobileLayoutGate({ children, desktopChrome: DesktopChrome }: MobileLayoutGateProps) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  if (isMobile) return <MobileShell>{children}</MobileShell>;
  return <DesktopChrome>{children}</DesktopChrome>;
}

/*
 * StatTile + StatTileSkeleton — Aurora chrome port.
 *
 * Used in AdminDashboard's stat tile grid. Outer chrome moves to Glass
 * with `--am-chip` hover state; hero number renders via IridText (the
 * standard hero-number Aurora atom); labels/sublabels use `--am-text-muted`
 * and `--am-text-faint`; trend ▲/▼ use `--am-positive` / `--am-negative`.
 * MiniSparkline is preserved as-is — its API is not touched.
 */
import React, { useState, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { MiniSparkline } from "./MiniSparkline";
import { Glass, IridText } from "../../../components/aurora/atoms";

interface SparklinePoint {
  week: string;
  value: number;
}

interface InsightData {
  analysis: string;
  action: string;
  priority: "high" | "medium" | "low";
  generatedBy: "rules" | "ai";
}

interface StatTileProps {
  id: string;
  label: string;
  formattedValue: string;
  delta: number;
  tooltip: string;
  subtitle: string;
  sparkline: SparklinePoint[];
  href: string;
  status: "populated" | "empty" | "loading";
  insight?: InsightData;
}

const INSIGHT_TONE: Record<InsightData["priority"], { bg: string; border: string }> = {
  high: { bg: "rgba(213, 94, 0, 0.06)", border: "rgba(213, 94, 0, 0.22)" },
  medium: { bg: "rgba(230, 159, 0, 0.06)", border: "rgba(230, 159, 0, 0.22)" },
  low: { bg: "rgba(0, 114, 178, 0.06)", border: "rgba(0, 114, 178, 0.22)" },
};

function StatTileInner({
  label,
  formattedValue,
  delta,
  tooltip,
  subtitle,
  sparkline,
  href,
  status,
  insight,
}: StatTileProps) {
  const isEmpty = status === "empty";
  const [hovered, setHovered] = useState(false);

  const glassStyle: CSSProperties = {
    background: hovered ? "var(--am-chip)" : undefined,
    transition: "background 160ms ease",
    opacity: isEmpty ? 0.6 : 1,
    borderStyle: isEmpty ? "dashed" : undefined,
    cursor: "pointer",
  };

  return (
    <Link
      to={href}
      title={tooltip}
      style={{ textDecoration: "none", display: "block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Glass style={glassStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--am-text-muted)",
            }}
          >
            {label}
          </span>
          <DeltaBadge delta={delta} />
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div>
              <IridText size={28}>{isEmpty ? "---" : formattedValue}</IridText>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--am-text-faint)",
                marginTop: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {isEmpty ? "Collecting data..." : subtitle}
            </div>
          </div>

          {sparkline.length > 1 && !isEmpty && (
            <div style={{ width: 80, height: 32, flexShrink: 0 }}>
              <MiniSparkline data={sparkline} />
            </div>
          )}
        </div>

        {insight && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 11,
              lineHeight: 1.5,
              background: INSIGHT_TONE[insight.priority].bg,
              border: `1px solid ${INSIGHT_TONE[insight.priority].border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              {insight.generatedBy === "ai" && (
                <Sparkles
                  size={12}
                  style={{ marginTop: 2, flexShrink: 0, color: "var(--am-text-faint)", opacity: 0.7 }}
                />
              )}
              <div>
                <p style={{ color: "var(--am-text-muted)", margin: 0 }}>{insight.analysis}</p>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 6 }}>
                  <ArrowRight size={12} style={{ marginTop: 2, flexShrink: 0, color: "var(--am-accent)" }} />
                  <p style={{ fontWeight: 500, color: "var(--am-text)", margin: 0 }}>{insight.action}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Glass>
    </Link>
  );
}

export const StatTile = React.memo(StatTileInner);

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
  const tone = isPositive ? "var(--am-positive)" : "var(--am-negative)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 99,
        color: tone,
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 28%, transparent)`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {isPositive ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

export function StatTileSkeleton() {
  return (
    <Glass style={{ animation: "am-pulse 1.6s ease-in-out infinite" } as CSSProperties} aria-hidden="true">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ height: 10, width: 80, borderRadius: 4, background: "var(--am-surface-faint)" }} />
        <div style={{ height: 18, width: 48, borderRadius: 99, background: "var(--am-surface-faint)" }} />
      </div>
      <div style={{ height: 28, width: 96, borderRadius: 6, background: "var(--am-surface-faint)", marginBottom: 8 }} />
      <div style={{ height: 10, width: 128, borderRadius: 4, background: "var(--am-surface-faint)" }} />
      <style>{`@keyframes am-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }`}</style>
    </Glass>
  );
}

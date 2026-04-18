import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { MiniSparkline } from "./MiniSparkline";

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

const INSIGHT_COLORS = {
  high: "bg-[#D55E00]/5 border-[#D55E00]/15",
  medium: "bg-[#E69F00]/5 border-[#E69F00]/15",
  low: "bg-[#0072B2]/5 border-[#0072B2]/15",
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

  return (
    <Link
      to={href}
      className={`block lg-card p-5 transition-all hover:shadow-lg group ${
        isEmpty ? "border-dashed opacity-60" : ""
      }`}
      title={tooltip}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--lg-text-muted)]">
          {label}
        </span>
        <DeltaBadge delta={delta} />
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div
            className="text-3xl font-bold tracking-tight text-[var(--lg-text-heading)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {isEmpty ? "---" : formattedValue}
          </div>
          <div className="text-xs text-[var(--lg-text-muted)] mt-1 truncate">
            {isEmpty ? "Collecting data..." : subtitle}
          </div>
        </div>

        {sparkline.length > 1 && !isEmpty && (
          <div className="w-20 h-8 shrink-0">
            <MiniSparkline data={sparkline} />
          </div>
        )}
      </div>

      {insight && (
        <div className={`mt-3 rounded-md p-2.5 text-xs leading-relaxed border ${INSIGHT_COLORS[insight.priority]}`}>
          <div className="flex items-start gap-1.5">
            {insight.generatedBy === "ai" && (
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-[var(--lg-text-muted)] opacity-60" />
            )}
            <div>
              <p className="text-[var(--lg-text-muted)]">{insight.analysis}</p>
              <div className="flex items-start gap-1 mt-1.5">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-[var(--lg-accent)]" />
                <p className="font-medium text-[var(--lg-text-primary)]">{insight.action}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Link>
  );
}

export const StatTile = React.memo(StatTileInner);

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const isPositive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
        isPositive
          ? "text-[var(--lg-positive)] bg-[var(--lg-positive)]/10"
          : "text-[var(--lg-negative)] bg-[var(--lg-negative)]/10"
      }`}
    >
      {isPositive ? "▲" : "▼"} {Math.abs(delta)}%
    </span>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="lg-card p-5 animate-pulse" aria-hidden="true">
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 w-20 rounded bg-[var(--lg-tint-hover)]" />
        <div className="h-5 w-12 rounded-full bg-[var(--lg-tint-hover)]" />
      </div>
      <div className="h-8 w-24 rounded bg-[var(--lg-tint-hover)] mb-2" />
      <div className="h-3 w-32 rounded bg-[var(--lg-tint-hover)]" />
    </div>
  );
}

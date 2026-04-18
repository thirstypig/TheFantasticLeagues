import React from "react";

interface FunnelStage {
  label: string;
  count: number;
  percent: number;
}

interface FunnelBarProps {
  label: string;
  stages: FunnelStage[];
}

function FunnelBarInner({ label, stages }: FunnelBarProps) {
  return (
    <div className="lg-card p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--lg-text-muted)] mb-4">
        {label}
      </h3>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const isFirst = i === 0;
          const dropOff = isFirst ? null : stages[i - 1].count - stage.count;
          return (
            <div key={stage.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-[var(--lg-text-primary)]">{stage.label}</span>
                <span className="text-[var(--lg-text-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {stage.count.toLocaleString()}
                  {!isFirst && dropOff != null && dropOff > 0 && (
                    <span className="text-[var(--lg-negative)] ml-1.5">
                      −{dropOff}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--lg-tint)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--lg-accent)] transition-all"
                  style={{ width: `${Math.max(stage.percent, 2)}%` }}
                />
              </div>
              <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                {stage.percent}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const FunnelBar = React.memo(FunnelBarInner);

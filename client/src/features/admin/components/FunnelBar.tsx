/*
 * FunnelBar — Aurora chrome port.
 *
 * Used in AdminDashboard's conversion funnels section. Outer chrome moves
 * to Glass; track uses `--am-surface-faint`, fill uses the iridescent
 * gradient (`--am-irid`). Step labels muted; conversion percentages render
 * via IridText (size 11 — the bigger numeric per the brief). Drop-off
 * indicator is a small chip with `--am-negative` accent.
 */
import React from "react";
import { Glass, IridText } from "../../../components/aurora/atoms";

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
    <Glass>
      <h3
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--am-text-muted)",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        {label}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((stage, i) => {
          const isFirst = i === 0;
          const dropOff = isFirst ? null : stages[i - 1].count - stage.count;
          return (
            <div key={stage.label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--am-text)" }}>{stage.label}</span>
                <span
                  style={{
                    color: "var(--am-text-muted)",
                    fontVariantNumeric: "tabular-nums",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {stage.count.toLocaleString()}
                  {!isFirst && dropOff != null && dropOff > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "1px 6px",
                        borderRadius: 99,
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--am-negative)",
                        background: "color-mix(in srgb, var(--am-negative) 12%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--am-negative) 28%, transparent)",
                      }}
                    >
                      −{dropOff}
                    </span>
                  )}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 99,
                  background: "var(--am-surface-faint)",
                  overflow: "hidden",
                  border: "1px solid var(--am-border)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(stage.percent, 2)}%`,
                    background: "var(--am-irid)",
                    borderRadius: 99,
                    transition: "width 240ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 2,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <IridText size={11}>{stage.percent}%</IridText>
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

export const FunnelBar = React.memo(FunnelBarInner);

import React from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { SparklinePoint } from "../types";

function MiniSparklineInner({ data }: { data: SparklinePoint[] }) {
  // Per-instance gradient ID. Hard-coding `id="sparkFill"` collides when
  // multiple sparklines render on the same screen — every <Area> ends up
  // referencing the FIRST gradient on the page.
  const reactId = React.useId();
  const gradientId = `sparkFill-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={150}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lg-accent)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--lg-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--lg-accent)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const MiniSparkline = React.memo(MiniSparklineInner);

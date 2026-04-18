import React from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklinePoint {
  week: string;
  value: number;
}

function MiniSparklineInner({ data }: { data: SparklinePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={150}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lg-accent)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--lg-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--lg-accent)"
          strokeWidth={1.5}
          fill="url(#sparkFill)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const MiniSparkline = React.memo(MiniSparklineInner);

import React from "react";

interface MSparklineProps {
  data: number[];
  w?: number;
  h?: number;
}

export function MSparkline({ data, w = 100, h = 28 }: MSparklineProps) {
  if (!data.length) return <svg width={w} height={h} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1 || 1)) * w,
    h - ((v - min) / range) * (h - 4) - 2,
  ]);
  const d = "M " + pts.map((p) => p.join(" ")).join(" L ");
  const area = d + " L " + w + " " + h + " L 0 " + h + " Z";
  // Stable per-instance gradient id so multiple sparklines on a page don't collide.
  const gid = React.useId();
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0" stopColor="#2af0c8" />
          <stop offset="0.5" stopColor="#b14bff" />
          <stop offset="1" stopColor="#ff4dd2" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} opacity="0.18" />
      <path d={d} fill="none" stroke={`url(#${gid})`} strokeWidth="1.5" />
    </svg>
  );
}

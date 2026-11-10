import React, { useState } from "react";
import { playerHeadshotUrl } from "../../lib/mlbImages";

type FaceSize = 30 | 40 | 60 | 84;

const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p && !SUFFIXES.has(p.toLowerCase()));
  if (parts.length === 0) return "";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const FONT_BY_SIZE: Record<FaceSize, number> = { 30: 13, 40: 13, 60: 17, 84: 24 };

export function PlayerFace({
  mlbId,
  name,
  size = 40,
}: {
  mlbId?: number | string | null;
  name: string;
  size?: FaceSize;
}) {
  const [failed, setFailed] = useState(false);
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--am-chip)",
    border: "1px solid var(--am-border)",
    flexShrink: 0,
  };

  if (mlbId == null || mlbId === "" || failed) {
    return (
      <span
        aria-hidden="true"
        style={{
          ...base,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--am-text-muted)",
          fontSize: FONT_BY_SIZE[size],
          fontWeight: 600,
          boxSizing: "border-box",
        }}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <img
      src={playerHeadshotUrl(mlbId, size > 60 ? 426 : 213)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...base, objectFit: "cover", objectPosition: "50% 15%", boxSizing: "border-box" }}
    />
  );
}

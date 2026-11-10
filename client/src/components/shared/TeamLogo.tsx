import React, { useState } from "react";
import { teamLogoUrl } from "../../lib/mlbImages";

export function TeamLogo({
  abbr,
  size = 22,
  showCode = true,
}: {
  abbr: string;
  size?: number;
  showCode?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = teamLogoUrl(abbr);
  const showImg = !!url && !failed;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {showImg && (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: "#fff",
            border: "1px solid var(--am-border)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          <img
            src={url!}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            style={{ width: "70%", height: "70%", objectFit: "contain" }}
          />
        </span>
      )}
      {(showCode || !showImg) && (
        <span style={{ fontSize: 13, color: "var(--am-text)" }}>{abbr}</span>
      )}
    </span>
  );
}

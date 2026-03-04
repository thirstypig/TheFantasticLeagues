// client/src/components/AuctionTab.tsx
import React from "react";

/**
 * Auction UI is intentionally deferred.
 * This placeholder keeps builds green while we finalize the auction engine.
 */
export default function AuctionTab() {
  return (
    <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-6">
      <div className="text-xl font-semibold text-white">Auction</div>
      <div className="mt-2 text-sm text-white/70">
        Auction features are paused for now. This placeholder keeps the client build passing.
      </div>
    </div>
  );
}

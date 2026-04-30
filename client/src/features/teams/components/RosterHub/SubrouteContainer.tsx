// client/src/features/teams/components/RosterHub/SubrouteContainer.tsx
//
// v3 refinement #2 — sub-route container that REPLACES the consolidated
// roster table when the user is "in" a focused flow (claim / IL stash /
// IL activate / drop). The Team page header (team name + period
// selector) stays visible above. A "← Back to roster" pill at the top
// of this container navigates back.
//
// In PR2 this is a real `<Route>` mount under `/teams/:code/manage/*`.
// In the v3 preview it's a state-controlled inline replacement —
// clicking an action menu item flips the table out and this container
// in. No React Router involvement at preview time, so the back button
// is a callback rather than a link.

import type { ReactNode } from "react";
import { Glass, SectionLabel } from "../../../../components/aurora/atoms";

interface SubrouteContainerProps {
  /** Title displayed at the top of the container ("Add free agent", etc.). */
  title: string;
  /** Short blurb under the title — typically the route's purpose. */
  blurb: string;
  /** Click handler for the "← Back to roster" pill. */
  onBack: () => void;
  /** Inner content — usually one of the panel mocks. */
  children: ReactNode;
}

export function SubrouteContainer({ title, blurb, onBack, children }: SubrouteContainerProps) {
  return (
    <Glass padded={false} style={{ overflow: "visible" }}>
      <div style={{ padding: 16 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to roster"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 99,
            border: "1px solid var(--am-border)",
            background: "var(--am-chip)",
            color: "var(--am-text-muted)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 12,
            minHeight: 32,
          }}
        >
          <span aria-hidden>←</span>
          <span>Back to roster</span>
        </button>
        <SectionLabel>✦ {title}</SectionLabel>
        <p style={{ margin: 0, fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.5 }}>
          {blurb}
        </p>
        <div style={{ marginTop: 16 }}>{children}</div>
      </div>
    </Glass>
  );
}

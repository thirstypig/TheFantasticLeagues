// client/src/pages/design/DesignRosterHubDeferred.tsx
//
// Entry point for the Roster Hub deferred-items design preview.
//
// Hosts FOUR scenarios via a top-of-page tab switcher:
//
//   1. Hub mutations          (default — original PR #198 preview)
//   2. Free agent add/drop    (side panel, drag FA → roster)
//   3. IL management          (stash + activate via drag)
//   4. Complex batch          (multi-step pending changes list)
//
// Each scenario lives in its own file under
// `./rosterHubScenarios/DesignScenario{Hub,FA,IL,Complex}.tsx` so a
// reviewer can read them independently. Mock data + shared visual
// primitives (rows, pills, badges) live in `./rosterHubScenarios/`.
//
// The active scenario is persisted in the URL via `?scenario=` so a
// reviewer can deep-link to a specific state. The page is admin-gated.

import { useSearchParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../components/aurora/atoms";
import { useAuth } from "../../auth/AuthProvider";
import "../../features/teams/components/RosterHub/rosterHub.css";

import { DesignScenarioHub } from "./rosterHubScenarios/DesignScenarioHub";
import { DesignScenarioFA } from "./rosterHubScenarios/DesignScenarioFA";
import { DesignScenarioIL } from "./rosterHubScenarios/DesignScenarioIL";
import { DesignScenarioComplex } from "./rosterHubScenarios/DesignScenarioComplex";

type ScenarioKey = "hub" | "fa" | "il" | "complex";

const SCENARIOS: { key: ScenarioKey; label: string; subtitle: string }[] = [
  { key: "hub", label: "Hub mutations", subtitle: "drag-to-mutate + pending save/revert" },
  { key: "fa", label: "Free agent add/drop", subtitle: "side panel · drag FA → slot" },
  { key: "il", label: "IL management", subtitle: "stash + activate · red INJURED badge" },
  { key: "complex", label: "Complex batch", subtitle: "multi-step pending changes list" },
];

function isScenarioKey(s: string | null | undefined): s is ScenarioKey {
  return s === "hub" || s === "fa" || s === "il" || s === "complex";
}

export default function DesignRosterHubDeferred() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("scenario");
  const active: ScenarioKey = isScenarioKey(raw) ? raw : "hub";

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Glass strong>
          <SectionLabel>✦ Design preview · admin only</SectionLabel>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, margin: 0 }}>
            Roster Hub Deferred Items
          </h1>
        </Glass>
        <Glass>
          <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
            Admin access required.
          </div>
        </Glass>
      </div>
    );
  }

  const setActive = (k: ScenarioKey) => {
    const next = new URLSearchParams(searchParams);
    if (k === "hub") next.delete("scenario");
    else next.set("scenario", k);
    setSearchParams(next, { replace: true });
  };

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        paddingBottom: 80,
        minHeight: "100svh",
      }}
    >
      <Glass strong>
        <SectionLabel>✦ Design preview · roster hub deferred + extended</SectionLabel>
        <h1
          style={{
            fontFamily: "var(--am-display)",
            fontSize: 32,
            fontWeight: 300,
            color: "var(--am-text)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Design Preview — Roster Hub Deferred Items
        </h1>
        <p style={{ marginTop: 10, fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.6 }}>
          Direction lock for <strong>drag-to-mutate</strong>, <strong>FA add/drop</strong>,{" "}
          <strong>IL management</strong>, and <strong>complex multi-step batches</strong>. Each
          scenario is a separate, navigable preview state. Backend wiring follows after sign-off
          per scenario. NO live API calls — all local mock state.
        </p>
      </Glass>

      <ScenarioSwitcher active={active} onChange={setActive} />

      {active === "hub" && <DesignScenarioHub />}
      {active === "fa" && <DesignScenarioFA />}
      {active === "il" && <DesignScenarioIL />}
      {active === "complex" && <DesignScenarioComplex />}
    </div>
  );
}

function ScenarioSwitcher({
  active,
  onChange,
}: {
  active: ScenarioKey;
  onChange: (k: ScenarioKey) => void;
}) {
  return (
    <Glass padded={false}>
      <div
        role="tablist"
        aria-label="Design scenario"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${SCENARIOS.length}, 1fr)`,
          gap: 0,
          padding: 4,
        }}
      >
        {SCENARIOS.map((s) => {
          const isActive = active === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onChange(s.key)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: isActive ? "var(--am-irid)" : "transparent",
                color: isActive ? "#fff" : "var(--am-text)",
                border: "1px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 140ms ease, color 140ms ease",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{s.label}</div>
              <div
                style={{
                  fontSize: 11,
                  color: isActive ? "rgba(255,255,255,0.85)" : "var(--am-text-muted)",
                  marginTop: 2,
                  lineHeight: 1.3,
                }}
              >
                {s.subtitle}
              </div>
            </button>
          );
        })}
      </div>
    </Glass>
  );
}

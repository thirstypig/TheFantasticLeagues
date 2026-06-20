/**
 * Sport League Selector
 * Phase 2: Multi-sport league creation flow
 *
 * Two-step flow:
 * Step 1: Select Sport (MLB, NFL, NBA)
 * Step 2: Select Format (Snake Draft, Auction Draft, H2H coming soon)
 *
 * Hands off to /create-league with URL params: ?sport=MLB&draftMode=AUCTION
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Lock } from "lucide-react";

type Sport = "MLB" | "NFL" | "NBA" | null;
type Format = "SNAKE" | "AUCTION" | "H2H" | null;

export function SportLeagueSelectorPreview() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedSport, setSelectedSport] = useState<Sport>(null);
  const [selectedFormat, setSelectedFormat] = useState<Format>(null);

  const canProceedStep1 = selectedSport !== null;
  const canCreateLeague = selectedSport !== null && selectedFormat !== null;

  const handleCreateLeague = () => {
    if (!canCreateLeague) return;

    // Map Format to draftMode for API
    const draftModeMap: Record<Exclude<Format, null>, string> = {
      "SNAKE": "DRAFT",
      "AUCTION": "AUCTION",
      "H2H": "H2H", // Not yet supported
    };

    const draftMode = selectedFormat ? draftModeMap[selectedFormat] : undefined;
    const params = new URLSearchParams();
    if (selectedSport) params.append("sport", selectedSport);
    if (draftMode) params.append("draftMode", draftMode);

    nav(`/create-league?${params.toString()}`);
  };

  return (
    <div className="aurora-theme min-h-screen p-4 sm:p-8" style={{ background: "var(--am-bg)" }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "30px", fontWeight: 700, color: "var(--am-text)", marginBottom: "8px" }}>
            Create a League
          </h1>
          <p style={{ color: "var(--am-text-muted)" }}>
            Step {step} of 2 — {step === 1 ? "Select a sport" : "Choose your format"}
          </p>
        </div>

        {/* Progress indicator */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          <div
            style={{
              height: "8px",
              flex: 1,
              borderRadius: "4px",
              backgroundColor: step >= 1 ? "var(--am-accent)" : "var(--am-surface-alt)",
              transition: "background-color 0.15s"
            }}
          />
          <div
            style={{
              height: "8px",
              flex: 1,
              borderRadius: "4px",
              backgroundColor: step >= 2 ? "var(--am-accent)" : "var(--am-surface-alt)",
              transition: "background-color 0.15s"
            }}
          />
        </div>

        {/* Step 1: Select Sport */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-3">
              {/* MLB Option */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  border: `2px solid ${selectedSport === "MLB" ? "var(--am-accent)" : "var(--am-border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: selectedSport === "MLB" ? "color-mix(in srgb, var(--am-accent) 8%, transparent)" : "white",
                  transition: "border-color 0.15s, background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (selectedSport !== "MLB") {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--am-accent) 8%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSport !== "MLB") {
                    e.currentTarget.style.borderColor = "var(--am-border)";
                    e.currentTarget.style.backgroundColor = "white";
                  }
                }}
              >
                <input
                  type="radio"
                  name="sport"
                  value="MLB"
                  checked={selectedSport === "MLB"}
                  onChange={() => setSelectedSport("MLB")}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text)" }}>Major League Baseball</div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>30 teams • Active season</div>
                </div>
              </label>

              {/* NFL Option */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  border: `2px solid ${selectedSport === "NFL" ? "var(--am-accent)" : "var(--am-border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: selectedSport === "NFL" ? "color-mix(in srgb, var(--am-accent) 8%, transparent)" : "white",
                  transition: "border-color 0.15s, background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (selectedSport !== "NFL") {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--am-accent) 8%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSport !== "NFL") {
                    e.currentTarget.style.borderColor = "var(--am-border)";
                    e.currentTarget.style.backgroundColor = "white";
                  }
                }}
              >
                <input
                  type="radio"
                  name="sport"
                  value="NFL"
                  checked={selectedSport === "NFL"}
                  onChange={() => setSelectedSport("NFL")}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text)" }}>National Football League</div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>32 teams • Regular season</div>
                </div>
              </label>

              {/* NBA Option */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  border: `2px solid ${selectedSport === "NBA" ? "var(--am-accent)" : "var(--am-border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  backgroundColor: selectedSport === "NBA" ? "color-mix(in srgb, var(--am-accent) 8%, transparent)" : "white",
                  transition: "border-color 0.15s, background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (selectedSport !== "NBA") {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--am-accent) 8%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSport !== "NBA") {
                    e.currentTarget.style.borderColor = "var(--am-border)";
                    e.currentTarget.style.backgroundColor = "white";
                  }
                }}
              >
                <input
                  type="radio"
                  name="sport"
                  value="NBA"
                  checked={selectedSport === "NBA"}
                  onChange={() => setSelectedSport("NBA")}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text)" }}>National Basketball Association</div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>30 teams • Regular season</div>
                </div>
              </label>
            </div>

            {/* Next Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "24px", borderTop: "1px solid var(--am-border)" }}>
              <button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 24px",
                  backgroundColor: canProceedStep1 ? "var(--am-accent)" : "var(--am-surface-alt)",
                  color: canProceedStep1 ? "#fff" : "var(--am-text-faint)",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 500,
                  cursor: canProceedStep1 ? "pointer" : "not-allowed",
                  transition: "opacity 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (canProceedStep1) e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Next <ChevronRight style={{ width: "16px", height: "16px" }} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Format */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Coming Soon notice for NFL/NBA */}
            {(selectedSport === "NFL" || selectedSport === "NBA") && (
              <div style={{ padding: "16px", backgroundColor: "var(--am-surface-alt)", border: "1px solid var(--am-border)", borderRadius: "8px" }}>
                <p style={{ fontSize: "14px", color: "var(--am-text-muted)" }}>
                  <strong>{selectedSport} league creation</strong> is coming soon.
                  You can view the {selectedSport} dashboard now, or check back later to create a league.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {/* Snake Draft Option */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  border: `2px solid ${selectedFormat === "SNAKE" ? "var(--am-accent)" : selectedSport !== "MLB" ? "var(--am-border)" : "#d1d5db"}`,
                  borderRadius: "8px",
                  backgroundColor: selectedFormat === "SNAKE"
                    ? "color-mix(in srgb, var(--am-accent) 8%, transparent)"
                    : selectedSport !== "MLB" ? "var(--am-surface-alt)" : "white",
                  cursor: selectedSport !== "MLB" ? "not-allowed" : "pointer",
                  opacity: selectedSport !== "MLB" ? 0.5 : 1,
                  pointerEvents: selectedSport !== "MLB" ? "none" : "auto",
                  transition: "border-color 0.15s, background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (selectedSport === "MLB") {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--am-accent) 8%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSport === "MLB" && selectedFormat !== "SNAKE") {
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.backgroundColor = "white";
                  }
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value="SNAKE"
                  checked={selectedFormat === "SNAKE"}
                  onChange={() => setSelectedFormat("SNAKE")}
                  disabled={selectedSport !== "MLB"}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text)" }}>Snake Draft</div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>Traditional draft order alternating each round</div>
                </div>
                {(selectedSport === "NFL" || selectedSport === "NBA") && (
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", backgroundColor: "var(--am-surface-alt)", color: "var(--am-text-faint)", padding: "4px 8px", borderRadius: "4px" }}>
                    <Lock style={{ width: "12px", height: "12px" }} /> Coming Soon
                  </span>
                )}
              </label>

              {/* Auction Draft Option */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "16px",
                  border: `2px solid ${selectedFormat === "AUCTION" ? "var(--am-accent)" : selectedSport !== "MLB" ? "var(--am-border)" : "#d1d5db"}`,
                  borderRadius: "8px",
                  backgroundColor: selectedFormat === "AUCTION"
                    ? "color-mix(in srgb, var(--am-accent) 8%, transparent)"
                    : selectedSport !== "MLB" ? "var(--am-surface-alt)" : "white",
                  cursor: selectedSport !== "MLB" ? "not-allowed" : "pointer",
                  opacity: selectedSport !== "MLB" ? 0.5 : 1,
                  pointerEvents: selectedSport !== "MLB" ? "none" : "auto",
                  transition: "border-color 0.15s, background-color 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (selectedSport === "MLB") {
                    e.currentTarget.style.borderColor = "var(--am-accent)";
                    e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--am-accent) 8%, transparent)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedSport === "MLB" && selectedFormat !== "AUCTION") {
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.backgroundColor = "white";
                  }
                }}
              >
                <input
                  type="radio"
                  name="format"
                  value="AUCTION"
                  checked={selectedFormat === "AUCTION"}
                  onChange={() => setSelectedFormat("AUCTION")}
                  disabled={selectedSport !== "MLB"}
                  style={{ cursor: "pointer" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text)" }}>Auction Draft</div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>Bid for players with a shared salary cap budget</div>
                </div>
                {(selectedSport === "NFL" || selectedSport === "NBA") && (
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", backgroundColor: "var(--am-surface-alt)", color: "var(--am-text-faint)", padding: "4px 8px", borderRadius: "4px" }}>
                    <Lock style={{ width: "12px", height: "12px" }} /> Coming Soon
                  </span>
                )}
              </label>

              {/* Head-to-Head Option (Disabled) */}
              <div style={{ display: "flex", alignItems: "center", padding: "16px", border: "2px solid var(--am-border)", borderRadius: "8px", backgroundColor: "var(--am-surface-alt)", opacity: 0.6, cursor: "not-allowed" }}>
                <input
                  type="radio"
                  name="format"
                  value="H2H"
                  disabled
                  style={{ cursor: "not-allowed" }}
                />
                <div style={{ marginLeft: "16px", flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--am-text-faint)", display: "flex", alignItems: "center", gap: "8px" }}>
                    Head-to-Head
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", backgroundColor: "var(--am-surface-alt)", color: "var(--am-text-faint)", padding: "4px 8px", borderRadius: "4px" }}>
                      <Lock style={{ width: "12px", height: "12px" }} /> Coming Soon
                    </span>
                  </div>
                  <div style={{ fontSize: "14px", color: "var(--am-text-muted)", marginTop: "4px" }}>Weekly matchups with category scoring</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "24px", borderTop: "1px solid var(--am-border)", gap: "16px" }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: "8px 24px",
                  backgroundColor: "var(--am-surface-alt)",
                  color: "var(--am-text)",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background-color 0.15s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--am-border)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--am-surface-alt)"}
              >
                Back
              </button>

              <div style={{ display: "flex", gap: "12px" }}>
                {/* View Dashboard button for NFL/NBA */}
                {(selectedSport === "NFL" || selectedSport === "NBA") && (
                  <button
                    onClick={() => nav(selectedSport === "NFL" ? "/nfl" : "/nba")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 24px",
                      backgroundColor: "var(--am-accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "opacity 0.15s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    View {selectedSport} Dashboard <ChevronRight style={{ width: "16px", height: "16px" }} />
                  </button>
                )}

                {/* Create League button */}
                <button
                  onClick={handleCreateLeague}
                  disabled={selectedSport !== "MLB" || !canCreateLeague}
                  style={{
                    padding: "8px 32px",
                    backgroundColor: selectedSport !== "MLB" ? "var(--am-surface-alt)" : "var(--am-accent)",
                    color: selectedSport !== "MLB" ? "var(--am-text-faint)" : "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 500,
                    cursor: selectedSport !== "MLB" ? "not-allowed" : "pointer",
                    transition: "opacity 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSport === "MLB" && canCreateLeague) {
                      e.currentTarget.style.opacity = "0.9";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  {selectedSport === "NFL" || selectedSport === "NBA"
                    ? "Create League - Coming Soon"
                    : "Create League"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Debug Info (remove in production) */}
      <div style={{ marginTop: "64px", maxWidth: "640px", margin: "64px auto 0", padding: "16px", backgroundColor: "var(--am-surface-alt)", borderRadius: "8px", border: "1px solid var(--am-border)", fontSize: "14px", fontFamily: "monospace", color: "var(--am-text-muted)" }}>
        <div>Sport: {selectedSport || "none"}</div>
        <div>Format: {selectedFormat || "none"}</div>
        <div>Step: {step}</div>
      </div>
    </div>
  );
}

export default SportLeagueSelectorPreview;

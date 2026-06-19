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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Create a League
          </h1>
          <p className="text-gray-600">
            Step {step} of 2 — {step === 1 ? "Select a sport" : "Choose your format"}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex gap-2 mb-8">
          <div
            className={`h-2 flex-1 rounded-full transition-colors ${
              step >= 1 ? "bg-blue-600" : "bg-gray-300"
            }`}
          />
          <div
            className={`h-2 flex-1 rounded-full transition-colors ${
              step >= 2 ? "bg-blue-600" : "bg-gray-300"
            }`}
          />
        </div>

        {/* Step 1: Select Sport */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-3">
              {/* MLB Option */}
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors" style={{borderColor: selectedSport === "MLB" ? "#2563eb" : "#d1d5db", backgroundColor: selectedSport === "MLB" ? "#eff6ff" : "white"}}>
                <input
                  type="radio"
                  name="sport"
                  value="MLB"
                  checked={selectedSport === "MLB"}
                  onChange={() => setSelectedSport("MLB")}
                  className="w-5 h-5 text-blue-600 cursor-pointer"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">Major League Baseball</div>
                  <div className="text-sm text-gray-600">30 teams • Active season</div>
                </div>
              </label>

              {/* NFL Option */}
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors" style={{borderColor: selectedSport === "NFL" ? "#2563eb" : "#d1d5db", backgroundColor: selectedSport === "NFL" ? "#eff6ff" : "white"}}>
                <input
                  type="radio"
                  name="sport"
                  value="NFL"
                  checked={selectedSport === "NFL"}
                  onChange={() => setSelectedSport("NFL")}
                  className="w-5 h-5 text-blue-600 cursor-pointer"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">National Football League</div>
                  <div className="text-sm text-gray-600">32 teams • Regular season</div>
                </div>
              </label>

              {/* NBA Option */}
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors" style={{borderColor: selectedSport === "NBA" ? "#2563eb" : "#d1d5db", backgroundColor: selectedSport === "NBA" ? "#eff6ff" : "white"}}>
                <input
                  type="radio"
                  name="sport"
                  value="NBA"
                  checked={selectedSport === "NBA"}
                  onChange={() => setSelectedSport("NBA")}
                  className="w-5 h-5 text-blue-600 cursor-pointer"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">National Basketball Association</div>
                  <div className="text-sm text-gray-600">30 teams • Regular season</div>
                </div>
              </label>
            </div>

            {/* Next Button */}
            <div className="flex justify-end pt-6 border-t border-gray-200">
              <button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Format */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3">
              {/* Snake Draft Option */}
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors" style={{borderColor: selectedFormat === "SNAKE" ? "#2563eb" : "#d1d5db", backgroundColor: selectedFormat === "SNAKE" ? "#eff6ff" : "white"}}>
                <input
                  type="radio"
                  name="format"
                  value="SNAKE"
                  checked={selectedFormat === "SNAKE"}
                  onChange={() => setSelectedFormat("SNAKE")}
                  className="w-5 h-5 text-blue-600 cursor-pointer"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">Snake Draft</div>
                  <div className="text-sm text-gray-600">Traditional draft order alternating each round</div>
                </div>
              </label>

              {/* Auction Draft Option */}
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors" style={{borderColor: selectedFormat === "AUCTION" ? "#2563eb" : "#d1d5db", backgroundColor: selectedFormat === "AUCTION" ? "#eff6ff" : "white"}}>
                <input
                  type="radio"
                  name="format"
                  value="AUCTION"
                  checked={selectedFormat === "AUCTION"}
                  onChange={() => setSelectedFormat("AUCTION")}
                  className="w-5 h-5 text-blue-600 cursor-pointer"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-900">Auction Draft</div>
                  <div className="text-sm text-gray-600">Bid for players with a shared salary cap budget</div>
                </div>
              </label>

              {/* Head-to-Head Option (Disabled) */}
              <div className="flex items-center p-4 border-2 border-gray-300 rounded-lg bg-gray-100 opacity-60 cursor-not-allowed">
                <input
                  type="radio"
                  name="format"
                  value="H2H"
                  disabled
                  className="w-5 h-5 text-gray-400 cursor-not-allowed"
                />
                <div className="ml-4 flex-1">
                  <div className="font-semibold text-gray-600 flex items-center gap-2">
                    Head-to-Head
                    <span className="flex items-center gap-1 text-xs bg-gray-300 text-gray-700 px-2 py-1 rounded">
                      <Lock className="w-3 h-3" /> Coming Soon
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">Weekly matchups with category scoring</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-6 border-t border-gray-200">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-2 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateLeague}
                disabled={!canCreateLeague}
                className="px-8 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Create League
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Debug Info (remove in production) */}
      <div className="mt-16 max-w-2xl mx-auto p-4 bg-gray-100 rounded border border-gray-300 text-sm font-mono text-gray-700">
        <div>Sport: {selectedSport || "none"}</div>
        <div>Format: {selectedFormat || "none"}</div>
        <div>Step: {step}</div>
      </div>
    </div>
  );
}

export default SportLeagueSelectorPreview;

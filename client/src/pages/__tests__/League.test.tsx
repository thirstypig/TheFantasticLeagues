import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../../contexts/LeagueContext", () => ({ useLeague: vi.fn() }));
vi.mock("../../hooks/useSeasonGating", () => ({ useSeasonGating: vi.fn() }));

import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../../contexts/LeagueContext";
import { useSeasonGating } from "../../hooks/useSeasonGating";
import League from "../League";

function setup(opts: { role?: "OWNER" | "COMMISSIONER"; isAdmin?: boolean }) {
  vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: !!opts.isAdmin } } as any);
  vi.mocked(useLeague).mockReturnValue({
    leagueId: 7,
    draftMode: "AUCTION",
    leagues: [{ id: 7, access: { type: "MEMBER", role: opts.role ?? "OWNER" } }],
  } as any);
  vi.mocked(useSeasonGating).mockReturnValue({
    seasonStatus: "IN_SEASON",
    canAuction: false,
    canViewAuctionResults: true,
    canKeepers: false,
    isH2H: false,
  } as any);
}

function renderLeague() {
  return render(
    <MemoryRouter initialEntries={["/league"]}>
      <League />
    </MemoryRouter>,
  );
}

describe("League page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows owner links for an in-season auction league, without Commissioner or Auction", () => {
    setup({ role: "OWNER" });
    renderLeague();
    expect(screen.getByRole("heading", { name: "League" })).toBeInTheDocument();
    for (const label of [
      "Standings", "Teams", "Activity", "Rules", "Payouts", "Archive",
      "Auction results", "Auction values",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: /^Commissioner/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Auction" })).toBeNull();
  });

  it("links Standings to /season", () => {
    setup({ role: "OWNER" });
    renderLeague();
    expect(screen.getByRole("link", { name: /Standings/ })).toHaveAttribute("href", "/season");
  });

  it("shows the Commissioner row for a commissioner, linking to the league hub", () => {
    setup({ role: "COMMISSIONER" });
    renderLeague();
    expect(screen.getByRole("link", { name: /^Commissioner/ })).toHaveAttribute("href", "/commissioner/7");
  });
});

describe("/more redirect", () => {
  it("App routes /more to /league", async () => {
    // Mirror of the App.tsx route; also asserts the source line exists.
    const fs = await import("node:fs");
    const src = fs.readFileSync(require("node:path").resolve(__dirname, "../../App.tsx"), "utf8");
    expect(src).toContain('<Route path="/more" element={<Navigate to="/league" replace />} />');
    expect(src).toContain('<Route path="/league" element={<League />} />');

    function Where() {
      return <div data-testid="where">{useLocation().pathname}</div>;
    }
    const { Navigate } = await import("react-router-dom");
    render(
      <MemoryRouter initialEntries={["/more"]}>
        <Routes>
          <Route path="/more" element={<Navigate to="/league" replace />} />
          <Route path="/league" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("where")).toHaveTextContent("/league");
  });
});

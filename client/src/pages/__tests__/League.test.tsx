import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("../../contexts/LeagueContext", () => ({ useLeague: vi.fn() }));
vi.mock("../../hooks/useSeasonGating", () => ({ useSeasonGating: vi.fn() }));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn(() => false) }));

import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../../contexts/LeagueContext";
import { useSeasonGating } from "../../hooks/useSeasonGating";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import League from "../League";
import appSource from "../../App.tsx?raw";
import { Navigate } from "react-router-dom";

function setup(opts: { role?: "OWNER" | "COMMISSIONER"; isAdmin?: boolean; noMembership?: boolean }) {
  vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: !!opts.isAdmin } } as any);
  vi.mocked(useLeague).mockReturnValue({
    leagueId: 7,
    draftMode: "AUCTION",
    leagues: opts.noMembership ? [] : [{ id: 7, access: { type: "MEMBER", role: opts.role ?? "OWNER" } }],
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

  it("insets the page 16px on mobile only", () => {
    setup({ role: "OWNER" });
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const { unmount } = renderLeague();
    expect(screen.getByRole("heading", { name: "League" }).parentElement).toHaveStyle({
      paddingLeft: "16px",
      paddingRight: "16px",
    });
    unmount();

    vi.mocked(useMediaQuery).mockReturnValue(false);
    renderLeague();
    const wrapper = screen.getByRole("heading", { name: "League" }).parentElement!;
    expect(wrapper.style.paddingLeft).toBe("");
    expect(wrapper.style.paddingRight).toBe("");
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

  it("shows the Commissioner row for an admin who is only an OWNER of the league", () => {
    setup({ role: "OWNER", isAdmin: true });
    renderLeague();
    expect(screen.getByRole("link", { name: /^Commissioner/ })).toHaveAttribute("href", "/commissioner/7");
  });

  it("shows the Commissioner row for an admin with no membership in the league", () => {
    setup({ isAdmin: true, noMembership: true });
    renderLeague();
    expect(screen.getByRole("link", { name: /^Commissioner/ })).toHaveAttribute("href", "/commissioner/7");
  });
});

describe("/more redirect", () => {
  it("App routes /more to /league", () => {
    // Guard that App.tsx still declares the redirect and the League route.
    expect(appSource).toContain('<Route path="/more" element={<Navigate to="/league" replace />} />');
    expect(appSource).toContain('<Route path="/league" element={<League />} />');

    function Where() {
      return <div data-testid="where">{useLocation().pathname}</div>;
    }
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

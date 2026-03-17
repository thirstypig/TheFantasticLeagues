import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock auth
vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

// Mock child component
vi.mock("../components/AdminLeagueTools", () => ({
  default: () => <div data-testid="admin-league-tools">AdminLeagueTools</div>,
}));

import { useAuth } from "../../../auth/AuthProvider";
import Admin from "../pages/Admin";

function renderPage() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>
  );
}

describe("Admin", () => {
  it("renders page header", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    expect(screen.getByText(/Platform-level administration/)).toBeInTheDocument();
  });

  it("shows AdminLeagueTools for admin users", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: true } } as any);
    renderPage();
    expect(screen.getByTestId("admin-league-tools")).toBeInTheDocument();
  });

  it("shows access denied for non-admin users", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: false } } as any);
    renderPage();
    expect(screen.getByText("Admin access required.")).toBeInTheDocument();
  });

  it("shows access denied when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    renderPage();
    expect(screen.getByText("Admin access required.")).toBeInTheDocument();
  });

  it("does not render AdminLeagueTools for non-admin", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { isAdmin: false } } as any);
    renderPage();
    expect(screen.queryByTestId("admin-league-tools")).not.toBeInTheDocument();
  });
});

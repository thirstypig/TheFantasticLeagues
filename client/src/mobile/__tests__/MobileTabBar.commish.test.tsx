import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MobileShell } from "../MobileShell";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, isAdmin: false }, loading: false }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: () => {} }),
}));

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    leagues: [{ id: 20, access: { type: "MEMBER", role: "COMMISSIONER" } }],
    myTeamId: 101,
    myTeamCode: "LDY",
  }),
}));

vi.mock("../pages/MobileStandings", () => ({
  MobileStandings: () => <div>Mobile Standings</div>,
}));

describe("MobileTabBar — commissioner role", () => {
  it("swaps the AI tab for a Commish tab when the user is a commissioner", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileShell>
          <div>content</div>
        </MobileShell>
      </MemoryRouter>,
    );
    const dock = screen.getByTestId("mobile-tab-bar");
    expect(dock.querySelector('[data-tab-key="Commish"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="AI"]')).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AuroraShell from "../AuroraShell";

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    preference: "system",
    setPreference: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    setLeagueId: vi.fn(),
    leagues: [{ id: 20, name: "OGBA", access: { type: "MEMBER", role: "OWNER" } }],
    draftMode: null,
    myTeamCode: "LDY",
    currentSeason: 2026,
  }),
}));

vi.mock("../../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, name: "James", isAdmin: false }, logout: vi.fn() }),
}));

vi.mock("../../../hooks/useSeasonGating", () => ({
  useSeasonGating: () => ({}),
}));

describe("AuroraShell", () => {
  it("renders no theme toggle (theme is controlled from Profile)", () => {
    render(
      <MemoryRouter>
        <AuroraShell>
          <div />
        </AuroraShell>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    // Sanity: the popover is open (otherwise the absence check below is vacuous).
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(
      screen.queryAllByRole("button", { name: /switch to (light|dark) theme|light theme|dark theme/i }),
    ).toHaveLength(0);
  });
});

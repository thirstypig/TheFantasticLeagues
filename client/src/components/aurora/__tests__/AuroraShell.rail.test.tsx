import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AuroraShell from "../AuroraShell";

let isAdmin = false;

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", preference: "system", setPreference: vi.fn(), toggleTheme: vi.fn() }),
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
  useAuth: () => ({ user: { id: 1, email: "j@x.com", isAdmin }, logout: vi.fn() }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuroraShell>
        <div />
      </AuroraShell>
    </MemoryRouter>,
  );
}

describe("AuroraShell left rail", () => {
  it("has exactly 4 tab links in spec order", () => {
    renderAt("/");
    const rail = screen.getByRole("navigation", { name: "Main navigation" });
    const links = within(rail).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Today", "My Team", "Players", "League"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/teams/LDY", "/players", "/league"]);
  });

  it("renders no sport or hidden-page links", () => {
    renderAt("/");
    for (const name of ["MLB", "NFL", "NBA", "AI", "Board", "More"]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("marks League current on /season", () => {
    renderAt("/season");
    expect(screen.getByRole("link", { name: "League" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
  });

  it("account popover hides Admin for non-admins", () => {
    isAdmin = false;
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Help & Guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  });

  it("account popover shows Admin for admins", () => {
    isAdmin = true;
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });
});

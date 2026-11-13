import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuroraShell, { leagueOptionLabel } from "../AuroraShell";

let isAdmin = false;

vi.mock("../../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", preference: "system", setPreference: vi.fn(), toggleTheme: vi.fn() }),
}));
vi.mock("../../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    setLeagueId: vi.fn(),
    leagues: [
      { id: 20, name: "OGBA", season: 2026, access: { type: "MEMBER", role: "OWNER" } },
      { id: 1, name: "OGBA", season: 2025, access: { type: "MEMBER", role: "OWNER" } },
    ],
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
  beforeEach(() => {
    isAdmin = false;
  });

  it("publishes zero shell insets (no top bar, no bottom bar on desktop)", () => {
    const { container } = renderAt("/");
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--shell-top-inset")).toBe("0px");
    expect(root.style.getPropertyValue("--shell-bottom-inset")).toBe("0px");
  });

  it("lets the nav region scroll so short windows never clip the account button", () => {
    renderAt("/");
    const rail = screen.getByRole("navigation", { name: "Main navigation" });
    expect(rail.style.overflowY).toBe("auto");
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

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

describe("Switch League labels", () => {
  it("names each league with its season so same-named years are told apart", () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("button", { name: "OGBA · 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OGBA · 2025" })).toBeInTheDocument();
  });

  it("falls back to the bare name when a league has no season", () => {
    expect(leagueOptionLabel({ name: "OGBA", season: null })).toBe("OGBA");
  });
});

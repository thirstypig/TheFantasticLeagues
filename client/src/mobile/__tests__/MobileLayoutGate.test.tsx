import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileLayoutGate } from "../MobileLayoutGate";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, isAdmin: false }, loading: false }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: () => {} }),
}));

vi.mock("../../contexts/LeagueContext", () => ({
  useLeague: () => ({
    leagueId: 20,
    leagues: [{ id: 20, access: { type: "MEMBER", role: "OWNER" } }],
    myTeamId: 101,
    myTeamCode: "LDY",
  }),
}));

vi.mock("../pages/MobileStandings", () => ({
  MobileStandings: () => <div data-testid="mobile-standings">Mobile Standings</div>,
}));

function DesktopChrome({ children }: { children: React.ReactNode }) {
  return <div data-testid="desktop-chrome">{children}</div>;
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  if (originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  }
  vi.resetModules();
});

describe("MobileLayoutGate", () => {
  it("renders the desktop chrome when the viewport is wider than 767px", () => {
    setMatchMedia(false);
    render(
      <MemoryRouter initialEntries={["/season"]}>
        <MobileLayoutGate desktopChrome={DesktopChrome}>
          <div data-testid="desktop-content">Desktop content</div>
        </MobileLayoutGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("desktop-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-content")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-shell")).not.toBeInTheDocument();
  });

  it("renders the mobile shell when the viewport matches mobile breakpoint", () => {
    setMatchMedia(true);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileLayoutGate desktopChrome={DesktopChrome}>
          <div data-testid="desktop-content">Desktop content</div>
        </MobileLayoutGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-tab-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-chrome")).not.toBeInTheDocument();
  });

  it("substitutes MobileStandings for /season on mobile", () => {
    setMatchMedia(true);
    render(
      <MemoryRouter initialEntries={["/season"]}>
        <MobileLayoutGate desktopChrome={DesktopChrome}>
          <div data-testid="desktop-content">Desktop content (should be hidden)</div>
        </MobileLayoutGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-standings")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-content")).not.toBeInTheDocument();
  });

  it("falls through to the desktop child for routes without a mobile twin", () => {
    setMatchMedia(true);
    render(
      <MemoryRouter initialEntries={["/board"]}>
        <MobileLayoutGate desktopChrome={DesktopChrome}>
          <div data-testid="desktop-content">Board desktop</div>
        </MobileLayoutGate>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mobile-shell")).toBeInTheDocument();
    expect(screen.getByTestId("desktop-content")).toBeInTheDocument();
  });

  it("shows the unified tab dock for any role", () => {
    setMatchMedia(true);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MobileLayoutGate desktopChrome={DesktopChrome}>
          <div>content</div>
        </MobileLayoutGate>
      </MemoryRouter>,
    );
    const dock = screen.getByTestId("mobile-tab-bar");
    // Unified tab set: role-conditional tabs (AI, Commish) replaced by fixed 5.
    expect(dock.querySelector('[data-tab-key="Home"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="MyTeam"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="More"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="AI"]')).toBeNull();
    expect(dock.querySelector('[data-tab-key="Commish"]')).toBeNull();
  });
});

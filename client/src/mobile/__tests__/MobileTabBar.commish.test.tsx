/**
 * MobileTabBar — tab set and active-state tests.
 *
 * Regression targets:
 *  1. Unified tab set: all 5 tabs always present, no role-conditional hiding.
 *  2. My Team tab active-state scoping (P1 fix): only active on the user's own
 *     team path, not on any other /teams/* path.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { MobileTabBar } from "../MobileTabBar";

function renderBar(pathname: string, myTeamCode?: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileTabBar myTeamCode={myTeamCode} />
    </MemoryRouter>,
  );
}

describe("MobileTabBar — unified tab set", () => {
  it("always shows all 5 tabs regardless of role", () => {
    renderBar("/");
    const dock = screen.getByTestId("mobile-tab-bar");
    expect(dock.querySelector('[data-tab-key="Home"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="Players"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="MyTeam"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="Standings"]')).not.toBeNull();
    expect(dock.querySelector('[data-tab-key="More"]')).not.toBeNull();
  });

  it("does not render Commish or AI tabs (removed in unified nav)", () => {
    renderBar("/");
    const dock = screen.getByTestId("mobile-tab-bar");
    expect(dock.querySelector('[data-tab-key="Commish"]')).toBeNull();
    expect(dock.querySelector('[data-tab-key="AI"]')).toBeNull();
  });
});

describe("MobileTabBar — My Team active-state scoping (P1 fix)", () => {
  it("marks My Team active when on the user's own team path", () => {
    renderBar("/teams/LDY", "LDY");
    const tab = screen.getByTestId("mobile-tab-bar").querySelector('[data-tab-key="MyTeam"]');
    expect(tab?.getAttribute("aria-current")).toBe("page");
  });

  it("does NOT mark My Team active when on a different team's path", () => {
    // Before the fix, startsWith("/teams/") matched any team — this is the regression case.
    renderBar("/teams/AWAY", "LDY");
    const tab = screen.getByTestId("mobile-tab-bar").querySelector('[data-tab-key="MyTeam"]');
    expect(tab?.getAttribute("aria-current")).toBeNull();
  });

  it("does NOT mark My Team active when myTeamCode is not set", () => {
    renderBar("/teams/LDY");
    const tab = screen.getByTestId("mobile-tab-bar").querySelector('[data-tab-key="MyTeam"]');
    expect(tab?.getAttribute("aria-current")).toBeNull();
  });

  it("marks Home active on /", () => {
    renderBar("/", "LDY");
    const tab = screen.getByTestId("mobile-tab-bar").querySelector('[data-tab-key="Home"]');
    expect(tab?.getAttribute("aria-current")).toBe("page");
  });

  it("marks Standings active on /season", () => {
    renderBar("/season", "LDY");
    const tab = screen.getByTestId("mobile-tab-bar").querySelector('[data-tab-key="Standings"]');
    expect(tab?.getAttribute("aria-current")).toBe("page");
  });
});

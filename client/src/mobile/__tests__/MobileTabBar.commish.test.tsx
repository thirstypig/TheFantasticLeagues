/**
 * MobileTabBar — four-tab set and active-state tests.
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

function tab(key: string) {
  return screen.getByTestId("mobile-tab-bar").querySelector(`[data-tab-key="${key}"]`);
}

describe("MobileTabBar — four-tab set", () => {
  it("shows exactly Today, My Team, Players, League", () => {
    renderBar("/", "LDY");
    const buttons = Array.from(screen.getByTestId("mobile-tab-bar").querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Today", "My Team", "Players", "League"]);
    expect(buttons.map((b) => b.getAttribute("data-tab-key"))).toEqual(["today", "myTeam", "players", "league"]);
  });

  it("gives every tab a 44px minimum touch target", () => {
    renderBar("/", "LDY");
    for (const b of screen.getByTestId("mobile-tab-bar").querySelectorAll("button")) {
      expect((b as HTMLElement).style.minHeight).toBe("44px");
      expect((b as HTMLElement).style.minWidth).toBe("44px");
    }
  });
});

describe("MobileTabBar — active state", () => {
  it("marks My Team active on the user's own team path", () => {
    renderBar("/teams/LDY", "LDY");
    expect(tab("myTeam")?.getAttribute("aria-current")).toBe("page");
    expect(tab("league")?.getAttribute("aria-current")).toBeNull();
  });

  it("marks League (not My Team) active on another team's path", () => {
    renderBar("/teams/SKD", "LDY");
    expect(tab("league")?.getAttribute("aria-current")).toBe("page");
    expect(tab("myTeam")?.getAttribute("aria-current")).toBeNull();
  });

  it("marks Today active on /", () => {
    renderBar("/", "LDY");
    expect(tab("today")?.getAttribute("aria-current")).toBe("page");
  });

  it("marks League active on /season", () => {
    renderBar("/season", "LDY");
    expect(tab("league")?.getAttribute("aria-current")).toBe("page");
  });

  it("marks no tab active on a hidden page", () => {
    renderBar("/ai", "LDY");
    expect(screen.getByTestId("mobile-tab-bar").querySelector("[aria-current]")).toBeNull();
  });
});

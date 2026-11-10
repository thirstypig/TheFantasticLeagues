import { describe, it, expect } from "vitest";
import { playerHeadshotUrl, teamLogoUrl } from "../mlbImages";

describe("mlbImages", () => {
  it("builds headshot url with default width", () => {
    const u = playerHeadshotUrl(660271);
    expect(u).toContain("/people/660271/headshot/67/current");
    expect(u).toContain("w_213");
  });
  it("supports width and generic", () => {
    expect(playerHeadshotUrl(1, 426)).toContain("w_426");
    expect(playerHeadshotUrl("generic")).toContain("/people/generic/headshot/67/current");
  });
  it("builds team logo urls", () => {
    expect(teamLogoUrl("LAD")).toBe("https://www.mlbstatic.com/team-logos/119.svg");
    expect(teamLogoUrl("AZ")).toMatch(/\/109\.svg$/);
    expect(teamLogoUrl("FA")).toBeNull();
  });
});

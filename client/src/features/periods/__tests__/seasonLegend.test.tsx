import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { deltaHeader, periodShortLabel, SeasonLegend } from "../pages/Season";

describe("Season page change column + legend", () => {
  it("names the previous period in the change header", () => {
    expect(deltaHeader(["Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6", "Period 7"])).toBe("vs P6");
  });

  it("falls back to the date abbreviation for date-named periods", () => {
    expect(deltaHeader(["Mar 23 – Apr 5", "Apr 6 – Apr 19"])).toBe("vs Mar 23");
  });

  it("uses a neutral header when there is nothing to compare", () => {
    expect(deltaHeader([])).toBe("Change");
    expect(deltaHeader(["Period 1"])).toBe("Change");
  });

  it("shortens only exact 'Period N' names", () => {
    expect(periodShortLabel("Period 12")).toBe("P12");
    expect(periodShortLabel("Period 6 (short)")).toBe("Period 6");
  });

  it("explains both cell highlights", () => {
    render(<SeasonLegend />);
    expect(screen.getByText(/Best score that period/)).toBeTruthy();
    expect(screen.getByText(/Within 80% of the best/)).toBeTruthy();
  });
});

import { describe, it, expect } from "vitest";
import { coverageTable } from "../coverage-summary.mjs";

const summary = (pct) => ({
  total: { lines: { pct }, statements: { pct: pct - 1 }, branches: { pct: pct - 8 }, functions: { pct: pct + 4 } },
});

describe("coverageTable", () => {
  it("renders one row per package with all four metrics in header order", () => {
    const out = coverageTable([{ name: "server", summary: summary(45.66) }]);
    expect(out).toContain("| | lines | statements | branches | functions |");
    expect(out).toContain("| server | 45.66% | 44.66% | 37.66% | 49.66% |");
  });

  it("reports n/a for a package whose summary file was never written", () => {
    const out = coverageTable([{ name: "client", summary: null }]);
    expect(out).toContain("| client | n/a | n/a | n/a | n/a |");
  });
});

import { describe, it, expect } from "vitest";
import { formatRuleValue } from "../components/RulesEditor";

describe("RulesEditor read-only values", () => {
  it("puts the dollar sign first", () => {
    expect(formatRuleValue("1", "$")).toBe("$1");
    expect(formatRuleValue("400", "$")).toBe("$400");
  });
  it("keeps other units after the number", () => {
    expect(formatRuleValue("30", "s")).toBe("30s");
    expect(formatRuleValue("50", "%")).toBe("50%");
  });
  it("leaves unitless values alone", () => {
    expect(formatRuleValue("50")).toBe("50");
  });
});

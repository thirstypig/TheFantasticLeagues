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

import { bothCategoryHalvesEmpty } from "../components/RulesEditor";

describe("RulesEditor both-halves-empty note", () => {
  it("is true only when both lists are stored as []", () => {
    expect(bothCategoryHalvesEmpty("[]", "[]")).toBe(true);
    expect(bothCategoryHalvesEmpty("[]", '["W"]')).toBe(false);
    expect(bothCategoryHalvesEmpty('["R"]', "[]")).toBe(false);
  });
  it("treats a missing or unparseable rule as not empty", () => {
    expect(bothCategoryHalvesEmpty(undefined, "[]")).toBe(false);
    expect(bothCategoryHalvesEmpty("oops", "[]")).toBe(false);
  });
});

import { categoryIconStyle } from "../components/RulesEditor";

describe("RulesEditor section icons", () => {
  it("fill with the theme's muted text colour via a mask, not a fixed white filter", () => {
    const s = categoryIconStyle("/x.svg");
    expect(s.background).toBe("var(--am-text-muted)");
    expect(String(s.mask)).toContain('url("/x.svg")');
    expect(s.filter).toBeUndefined();
  });
});

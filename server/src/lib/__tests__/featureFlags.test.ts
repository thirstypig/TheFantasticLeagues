import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enforceRosterRules } from "../featureFlags.js";

describe("enforceRosterRules", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ENFORCE_ROSTER_RULES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to true when unset", () => {
    expect(enforceRosterRules()).toBe(true);
  });

  it("defaults to true when empty string", () => {
    process.env.ENFORCE_ROSTER_RULES = "";
    expect(enforceRosterRules()).toBe(true);
  });

  it("treats 'true' as true", () => {
    process.env.ENFORCE_ROSTER_RULES = "true";
    expect(enforceRosterRules()).toBe(true);
  });

  it("treats 'false' as false", () => {
    process.env.ENFORCE_ROSTER_RULES = "false";
    expect(enforceRosterRules()).toBe(false);
  });

  it("treats '0' / 'no' / 'off' as false (case-insensitive)", () => {
    for (const v of ["0", "no", "off", "FALSE", "NO", "Off"]) {
      process.env.ENFORCE_ROSTER_RULES = v;
      expect(enforceRosterRules(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it("treats any other value as true (fail safe)", () => {
    process.env.ENFORCE_ROSTER_RULES = "maybe";
    expect(enforceRosterRules()).toBe(true);
  });
});

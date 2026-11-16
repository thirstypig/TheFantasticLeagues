import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    leagueRule: { findFirst: vi.fn() },
    season: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../../../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/auditLog.js", () => ({ writeAuditLog: vi.fn() }));

import {
  assertValidRuleValue,
  BACKFILL_RULE_KEYS,
  CommissionerService,
  InvalidRuleValueError,
} from "../services/CommissionerService.js";
import { DEFAULT_RULES } from "../../../lib/sportConfig.js";

beforeEach(() => vi.clearAllMocks());

describe("meeting rules validation", () => {
  it("rejects a turn_seconds value outside 60/120/180", () => {
    expect(() => assertValidRuleValue("meeting", "turn_seconds", "90")).toThrow(InvalidRuleValueError);
    expect(() => assertValidRuleValue("meeting", "turn_seconds", "90")).toThrow(/Clock per turn must be one of/);
  });
  it("accepts every allowed value", () => {
    for (const v of ["60", "120", "180"]) expect(() => assertValidRuleValue("meeting", "turn_seconds", v)).not.toThrow();
    for (const v of ["0", "1", "5"]) expect(() => assertValidRuleValue("meeting", "overtime_fee", v)).not.toThrow();
    for (const k of ["live", "can_add_time"]) {
      for (const v of ["true", "false"]) expect(() => assertValidRuleValue("meeting", k, v)).not.toThrow();
    }
  });
  it("rejects bad overtime_fee, live and can_add_time values", () => {
    expect(() => assertValidRuleValue("meeting", "overtime_fee", "2")).toThrow(InvalidRuleValueError);
    expect(() => assertValidRuleValue("meeting", "live", "yes")).toThrow(InvalidRuleValueError);
    expect(() => assertValidRuleValue("meeting", "can_add_time", "")).toThrow(InvalidRuleValueError);
  });
});

describe("meeting rules seed and backfill", () => {
  it("backfills all four keys", () => {
    for (const key of ["live", "turn_seconds", "can_add_time", "overtime_fee"]) {
      expect(BACKFILL_RULE_KEYS).toContainEqual({ category: "meeting", key });
    }
  });
  it("seeds the four rows with off-by-default values", () => {
    const m = DEFAULT_RULES.filter((r) => r.category === "meeting");
    expect(Object.fromEntries(m.map((r) => [r.key, r.value]))).toEqual({
      live: "false", turn_seconds: "120", can_add_time: "true", overtime_fee: "0",
    });
  });
});

describe("assertRulesEditable for meeting", () => {
  it("does not throw in-season with locked rules, without querying", async () => {
    mockPrisma.leagueRule.findFirst.mockResolvedValue({ id: 1, isLocked: true });
    mockPrisma.season.findFirst.mockResolvedValue({ id: 2, status: "IN_SEASON" });
    await expect(new CommissionerService().assertRulesEditable(1, ["meeting"])).resolves.toBeUndefined();
    expect(mockPrisma.leagueRule.findFirst).not.toHaveBeenCalled();
  });
});

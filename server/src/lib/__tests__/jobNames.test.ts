import { describe, it, expect } from "vitest";
import * as jobNames from "../jobNames.js";

/**
 * The job name is a JOIN KEY: the cron writes JobRun rows under it, and the
 * dead-man's switch looks for successful runs under it. If a name is tracked
 * but has no expectation, nothing ever alarms on it — a silently disabled
 * alarm, which is the precise failure todo #299 exists to remove.
 */
describe("job name registry", () => {
  const declared = Object.entries(jobNames)
    .filter(([k, v]) => k.startsWith("JOB_") && typeof v === "string")
    .map(([, v]) => v as string);

  it("every declared job name has a freshness expectation", () => {
    const expected = new Set(jobNames.JOB_EXPECTATIONS.map((e) => e.job));
    const missing = declared.filter((j) => !expected.has(j));
    expect(missing, `these jobs would never alarm: ${missing.join(", ")}`).toEqual([]);
  });

  it("every expectation refers to a declared job name — catches typos", () => {
    const known = new Set(declared);
    const unknown = jobNames.JOB_EXPECTATIONS.map((e) => e.job).filter((j) => !known.has(j));
    expect(unknown, `expectations for non-existent jobs: ${unknown.join(", ")}`).toEqual([]);
  });

  it("declares no duplicate job names", () => {
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("every expectation window is positive", () => {
    for (const e of jobNames.JOB_EXPECTATIONS) expect(e.maxAgeHours).toBeGreaterThan(0);
  });
});

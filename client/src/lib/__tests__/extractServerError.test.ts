import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractServerError } from "../extractServerError";

describe("extractServerError", () => {
  it("returns the fallback when err is null / undefined / a primitive", () => {
    expect(extractServerError(null, "fallback")).toBe("fallback");
    expect(extractServerError(undefined, "fallback")).toBe("fallback");
    expect(extractServerError(42, "fallback")).toBe("fallback");
    expect(extractServerError("string", "fallback")).toBe("fallback");
  });

  it("prefers serverMessage when present and non-empty", () => {
    const err = { serverMessage: "Roster cap exceeded", message: "ignored" };
    expect(extractServerError(err, "fallback")).toBe("Roster cap exceeded");
  });

  it("falls back to .message when serverMessage is missing or empty", () => {
    expect(extractServerError({ message: "raw error" }, "fallback")).toBe("raw error");
    expect(extractServerError({ serverMessage: "  ", message: "raw error" }, "fallback")).toBe("raw error");
    expect(extractServerError({ serverMessage: "", message: "raw error" }, "fallback")).toBe("raw error");
  });

  it("falls back to the fallback when neither serverMessage nor message is set", () => {
    expect(extractServerError({}, "fallback")).toBe("fallback");
    expect(extractServerError({ other: "field" }, "fallback")).toBe("fallback");
  });

  // ── ZodError classification (PR #308 follow-up) ────────────────────

  it("flags a ZodError as client-side validation failure with the field path", () => {
    const schema = z.object({ leagueId: z.number().int().positive() });
    let caught: unknown = null;
    try {
      schema.parse({ leagueId: "not-a-number" });
    } catch (err) {
      caught = err;
    }
    const msg = extractServerError(caught, "Roster rules are not satisfied.");
    expect(msg).toMatch(/^Client validation failed at "leagueId":/);
    expect(msg).toContain("This is a bug — please report.");
  });

  it("flags a ZodError without a field path when the issue path is empty", () => {
    // Top-level type mismatch produces an empty path.
    const schema = z.object({ foo: z.string() });
    let caught: unknown = null;
    try {
      schema.parse("not an object");
    } catch (err) {
      caught = err;
    }
    const msg = extractServerError(caught, "fallback");
    expect(msg).toMatch(/^Client validation failed:/);
    expect(msg).toContain("This is a bug — please report.");
  });

  it("does NOT relabel a ZodError as the server-side fallback", () => {
    // The whole point: a schema-drift bug from a client helper would have
    // previously been silently rendered as "Roster rules are not satisfied"
    // — making client-side bugs masquerade as server-side rule failures.
    const schema = z.object({ teamId: z.number().int() });
    let caught: unknown = null;
    try {
      schema.parse({ teamId: 1.5 });
    } catch (err) {
      caught = err;
    }
    expect(extractServerError(caught, "Roster rules are not satisfied.")).not.toBe(
      "Roster rules are not satisfied.",
    );
  });

  it("handles duck-typed ZodError shape without instanceof (multi-zod-bundle safety)", () => {
    // If two zod copies bundle into the same page, `instanceof ZodError`
    // can return false even for genuine zod throws. The detector uses
    // `name === "ZodError"` + `Array.isArray(issues)` instead.
    const fakeZodError = {
      name: "ZodError",
      issues: [{ path: ["foo", "bar"], message: "Required" }],
    };
    const msg = extractServerError(fakeZodError, "fallback");
    expect(msg).toBe('Client validation failed at "foo.bar": Required. This is a bug — please report.');
  });
});

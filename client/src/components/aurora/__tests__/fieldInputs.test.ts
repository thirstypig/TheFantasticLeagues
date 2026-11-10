import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text checks (source scan, not rendering): inputs must use the Field tokens.
 *  - commissioner.css `.cm-input, .cm-select` rule uses var(--am-field) + var(--am-field-line)
 *  - auth pages and the six auction files declare no input style with
 *    `var(--am-surface-faint)` as background (checked per line containing an input-ish style).
 */
const src = (rel: string) => readFileSync(resolve(__dirname, "../../../", rel), "utf8");

describe("Field rule reaches non-.lg-input inputs", () => {
  it(".cm-input, .cm-select uses Field background and border", () => {
    const m = /\.cm-input,\s*\.cm-select\s*\{([^}]*)\}/.exec(src("features/commissioner/commissioner.css"));
    expect(m).not.toBeNull();
    expect(m![1]).toContain("background: var(--am-field)");
    expect(m![1]).toContain("var(--am-field-line)");
  });

  it.each(["Login", "Signup", "ForgotPassword", "ResetPassword"])(
    "%s: surface-faint cards use --am-border; only Signup's error alert is --am-negative",
    (name) => {
      const text = src(`features/auth/pages/${name}.tsx`);
      // Matches 928b3e12 reality: the error alerts in ForgotPassword/ResetPassword are
      // --am-border cards, not negative. Signup's error alert (~line 348) is the only negative one.
      const borders = [...text.matchAll(/background: "var\(--am-surface-faint\)",\n\s*(border[^\n]*)/g)].map(
        (m) => m[1],
      );
      const negative = borders.filter((b) => b.includes("--am-negative")).length;
      expect(negative, `${name} negative-bordered faint cards`).toBe(name === "Signup" ? 1 : 0);
      for (const b of borders) {
        if (!b.includes("--am-negative")) expect(b).toContain("--am-border");
      }
      expect(text).toContain("var(--am-field)");
    },
  );

  it("auth pages use Field only on their input style", () => {
    // Expected field-line counts include input border + focus/blur handlers on the input.
    const expected: Record<string, { field: number; fieldLine: number }> = {
      Login: { field: 1, fieldLine: 1 },
      Signup: { field: 1, fieldLine: 4 },
      ForgotPassword: { field: 1, fieldLine: 2 },
      ResetPassword: { field: 1, fieldLine: 1 },
    };
    for (const [name, counts] of Object.entries(expected)) {
      const text = src(`features/auth/pages/${name}.tsx`);
      expect(text.match(/var\(--am-field\)/g)?.length ?? 0, `${name} --am-field`).toBe(counts.field);
      expect(text.match(/var\(--am-field-line\)/g)?.length ?? 0, `${name} --am-field-line`).toBe(
        counts.fieldLine,
      );
    }
  });
});

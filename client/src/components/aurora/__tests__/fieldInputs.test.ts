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
    "%s: surface-faint cards never carry the Field border",
    (name) => {
      const text = src(`features/auth/pages/${name}.tsx`);
      // Non-input cards use --am-surface-faint + --am-border; Field border is input-only.
      for (const m of text.matchAll(/background: "var\(--am-surface-faint\)",\n\s*(border[^\n]*)/g)) {
        expect(m[1]).not.toContain("--am-field-line");
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

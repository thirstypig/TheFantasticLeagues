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
    "%s has no surface-faint background or am-border on inputs",
    (name) => {
      const text = src(`features/auth/pages/${name}.tsx`);
      // The only allowed surface-faint background is Signup's error alert (negative border).
      for (const m of text.matchAll(/background: "var\(--am-surface-faint\)",\n\s*(border[^\n]*)/g)) {
        expect(m[1]).toContain("--am-negative");
      }
      expect(text).toContain("var(--am-field)");
    },
  );
});

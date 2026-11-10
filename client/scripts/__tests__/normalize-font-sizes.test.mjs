import { describe, it, expect } from "vitest";
import { snapPx, rewriteSource } from "../normalize-font-sizes.mjs";

describe("snapPx", () => {
  it.each([[8,13],[10.5,13],[13,13],[14,15],[16,17],[18,17],[20,17],[22,24],[30,32],[34,32],[48,48]])(
    "%s -> %s", (a, b) => expect(snapPx(a)).toBe(b));
});

describe("rewriteSource", () => {
  const tsx = (s) => rewriteSource(s, "tsx");
  it("arbitrary classes", () => {
    expect(tsx('className="text-[10px] font-bold"').text).toBe('className="text-xs font-bold"');
    expect(tsx('className="text-[14px]"').text).toBe('className="text-sm"');
  });
  it("fontSize numbers", () => {
    expect(tsx('style={{ fontSize: 11, color: "x" }}').text).toBe('style={{ fontSize: 13, color: "x" }}');
    expect(tsx("style={{ fontSize: compact ? 10 : 16 }}").text).toBe("style={{ fontSize: compact ? 13 : 17 }}");
    expect(tsx("tick={{ fontSize: 10 }}").text).toBe("tick={{ fontSize: 13 }}");
    expect(tsx("fontSize: '0.7rem'").text).toBe("fontSize: 13");
  });
  it("leaves variables alone", () => {
    expect(tsx("fontSize: size").changes).toBe(0);
    expect(tsx('fontSize: "var(--lg-font-size-sm)"').changes).toBe(0);
  });
  it("css", () => {
    expect(rewriteSource(".x{font-size:11px}", "css").text).toBe(".x{font-size:13px}");
    expect(rewriteSource(".x{font-size: 48px}", "css").changes).toBe(0);
    expect(rewriteSource(".x{--lg-font-size-xs: 11px}", "css").changes).toBe(0);
  });
});

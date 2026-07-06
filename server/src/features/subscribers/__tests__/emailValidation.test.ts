import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmailFormat, isDisposableEmail } from "../lib/emailValidation.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jimmy.C316@Gmail.com  ")).toBe("jimmy.c316@gmail.com");
  });
  it("handles null/undefined safely", () => {
    expect(normalizeEmail(undefined as any)).toBe("");
    expect(normalizeEmail(null as any)).toBe("");
  });
});

describe("isValidEmailFormat", () => {
  it("accepts normal addresses", () => {
    for (const e of ["a@b.co", "jimmy.c316@gmail.com", "first+tag@sub.domain.io"]) {
      expect(isValidEmailFormat(e), e).toBe(true);
    }
  });
  it("rejects malformed addresses", () => {
    for (const e of ["", "no-at-sign", "@nope.com", "user@", "user@nodot", "a b@c.com", "two@@at.com"]) {
      expect(isValidEmailFormat(e), e).toBe(false);
    }
  });
  it("rejects absurdly long input", () => {
    expect(isValidEmailFormat("a".repeat(250) + "@b.com")).toBe(false);
  });
});

describe("isDisposableEmail", () => {
  it("blocks known throwaway domains", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@guerrillamail.com")).toBe(true);
  });
  it("allows normal providers", () => {
    for (const e of ["me@gmail.com", "me@icloud.com", "me@companymail.io"]) {
      expect(isDisposableEmail(e), e).toBe(false);
    }
  });
});

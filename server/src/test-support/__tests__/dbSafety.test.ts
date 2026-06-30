import { describe, it, expect } from "vitest";
import { isLocalThrowawayDbUrl } from "../dbSafety.js";

// This helper gates DESTRUCTIVE (unscoped deleteMany) integration suites. A
// false positive here means a test wipes a real database. Each case below
// encodes a concrete regression: the listed URL must NOT be treated as a
// throwaway local DB, or the production league gets erased.
describe("isLocalThrowawayDbUrl", () => {
  it("returns true for a localhost Postgres URL", () => {
    expect(isLocalThrowawayDbUrl("postgresql://postgres:pw@localhost:5432/postgres")).toBe(true);
  });

  it("returns true for a 127.0.0.1 Postgres URL (the local Supabase default)", () => {
    expect(isLocalThrowawayDbUrl("postgresql://postgres:pw@127.0.0.1:54322/postgres")).toBe(true);
  });

  it("returns false for the prod Supabase pooler host", () => {
    expect(
      isLocalThrowawayDbUrl(
        "postgresql://postgres.oaogpsshewmcazhehryl:pw@aws-1-us-west-1.pooler.supabase.com:6543/postgres",
      ),
    ).toBe(false);
  });

  it("returns false for the staging cloud project host", () => {
    expect(
      isLocalThrowawayDbUrl("postgresql://postgres:pw@db.kfxdgcxiawwhzooexqtm.supabase.co:5432/postgres"),
    ).toBe(false);
  });

  it("returns false for undefined / empty so CI (no DATABASE_URL) skips", () => {
    expect(isLocalThrowawayDbUrl(undefined)).toBe(false);
    expect(isLocalThrowawayDbUrl(null)).toBe(false);
    expect(isLocalThrowawayDbUrl("")).toBe(false);
  });

  it("does not match a remote host that merely contains 'localhost' in its name", () => {
    expect(isLocalThrowawayDbUrl("postgresql://u:p@notlocalhost.example.com:5432/db")).toBe(false);
    expect(isLocalThrowawayDbUrl("postgresql://u:p@localhost.evil.com:5432/db")).toBe(false);
  });

  it("does not match when only the database NAME contains 'localhost' on a remote host", () => {
    expect(isLocalThrowawayDbUrl("postgresql://u:p@prod.supabase.co:5432/localhost_db")).toBe(false);
  });

  // Regression: a substring `.test(/@localhost/)` matched these as "local" and
  // would have wiped prod. Host-parsing resolves the host after the LAST `@`.
  it("does not match @localhost embedded in the password (multi-@ userinfo)", () => {
    expect(
      isLocalThrowawayDbUrl("postgresql://user:p@localhost:5432@db.prod.supabase.co:5432/postgres"),
    ).toBe(false);
  });

  it("does not match @localhost embedded in a query parameter", () => {
    expect(
      isLocalThrowawayDbUrl(
        "postgresql://postgres:pw@db.prod.supabase.co:6543/postgres?application_name=svc@localhost:1",
      ),
    ).toBe(false);
  });
});

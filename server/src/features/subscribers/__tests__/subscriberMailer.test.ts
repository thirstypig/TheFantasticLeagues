import { describe, it, expect } from "vitest";
import { confirmUrl, unsubscribeUrl } from "../lib/subscriberMailer.js";

// These lock the mailer↔route contract: the emailed link MUST point at the
// server pages `GET /confirm?token=` and `GET /unsubscribe?token=` (pagesRouter).
// If the path or query-param name drifts, the confirmation flow silently breaks
// and no other test catches it (pagesRouter tests hit those routes directly and
// never verify the mailer generates the same URL).

describe("confirmUrl", () => {
  it("points at /confirm with the token as the `token` query param", () => {
    expect(confirmUrl("abc123")).toMatch(/^https?:\/\/[^/]+\/confirm\?token=abc123$/);
  });
  it("URL-encodes tokens containing unsafe characters", () => {
    expect(confirmUrl("a b/c=")).toContain("/confirm?token=a%20b%2Fc%3D");
  });
});

describe("unsubscribeUrl", () => {
  it("points at /unsubscribe with the token as the `token` query param", () => {
    expect(unsubscribeUrl("tok_9-Z")).toMatch(/^https?:\/\/[^/]+\/unsubscribe\?token=tok_9-Z$/);
  });
  it("does not collide with the confirm path", () => {
    expect(unsubscribeUrl("x")).not.toContain("/confirm");
  });
});

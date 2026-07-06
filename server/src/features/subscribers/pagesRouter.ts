// Root-mounted public pages for the emailed links. Must be registered BEFORE
// the SPA catch-all (app.get("*")) so /confirm and /unsubscribe render these
// server pages instead of the React app shell.
import { Router } from "express";
import { confirmByToken, unsubscribeByToken } from "./service.js";
import { confirmedPage, expiredPage, invalidPage, unsubscribedPage } from "./lib/subscriberPages.js";

export const subscriberPagesRouter = Router();

function tokenFrom(q: unknown): string {
  return typeof q === "string" ? q : "";
}

// GET /confirm?token=...  → flips pending → confirmed, renders a friendly page.
subscriberPagesRouter.get("/confirm", async (req, res) => {
  const html = await confirmByToken(tokenFrom(req.query.token))
    .then((r) => (r === "confirmed" ? confirmedPage() : r === "expired" ? expiredPage() : invalidPage()))
    .catch(() => invalidPage());
  res.status(200).type("html").send(html);
});

// GET /unsubscribe?token=...  → sets status=unsubscribed (idempotent).
subscriberPagesRouter.get("/unsubscribe", async (req, res) => {
  const html = await unsubscribeByToken(tokenFrom(req.query.token))
    .then((r) => (r === "unsubscribed" ? unsubscribedPage() : invalidPage()))
    .catch(() => invalidPage());
  res.status(200).type("html").send(html);
});

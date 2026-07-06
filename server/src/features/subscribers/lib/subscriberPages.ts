// Server-rendered landing pages for the emailed confirm / unsubscribe links.
// On-brand (Score Sheet: warm paper, outfield-green accent, Inter) but simple —
// self-contained HTML, no scripts, no auth.

const MARKETING_URL = "https://thefantasticleagues.com";

function shell(title: string, opts: { emoji: string; heading: string; body: string; ctaHref?: string; ctaText?: string; accent?: string }): string {
  const accent = opts.accent ?? "#16794e"; // outfield green
  const cta = opts.ctaHref
    ? `<a href="${opts.ctaHref}" style="display:inline-block;margin-top:24px;background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">${opts.ctaText ?? "Go"}</a>`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — The Fantastic Leagues</title>
</head>
<body style="margin:0;background:#f4f1ea;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="background:#fff;max-width:440px;width:100%;padding:40px 32px;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center">
      <div style="font-size:44px;line-height:1">${opts.emoji}</div>
      <h1 style="font-size:22px;margin:16px 0 8px">${opts.heading}</h1>
      <p style="font-size:15px;line-height:1.55;color:#4b5563;margin:0">${opts.body}</p>
      ${cta}
    </div>
  </div>
</body></html>`;
}

export const confirmedPage = () => shell("Confirmed", {
  emoji: "🎉", heading: "You're confirmed!",
  body: "Your email is on the list. We'll only send the occasional update — no spam, ever.",
  ctaHref: MARKETING_URL, ctaText: "Back to The Fantastic Leagues",
});

export const expiredPage = () => shell("Link expired", {
  emoji: "⏳", heading: "This link has expired",
  body: "Confirmation links are good for 24 hours. No problem — just sign up again and we'll send a fresh one.",
  ctaHref: MARKETING_URL, ctaText: "Sign up again",
});

export const invalidPage = () => shell("Link not valid", {
  emoji: "🔗", heading: "This link isn't valid anymore",
  body: "It may have already been used. If you've already confirmed, you're all set — nothing more to do.",
  ctaHref: MARKETING_URL, ctaText: "Visit The Fantastic Leagues",
});

export const unsubscribedPage = () => shell("Unsubscribed", {
  emoji: "👋", heading: "You've been unsubscribed",
  body: "You won't receive any more emails from us. Changed your mind? You can always sign up again.",
  ctaHref: MARKETING_URL, ctaText: "Back to the site", accent: "#6b7280",
});

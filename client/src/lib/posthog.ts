// client/src/lib/posthog.ts
// PostHog analytics — thin wrapper for init + helpers (lazy-loaded)

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com";

let ph: typeof import("posthog-js").default | null = null;

export function initPostHog() {
  if (ph || !POSTHOG_KEY) return;
  import("posthog-js").then((mod) => {
    mod.default.init(POSTHOG_KEY!, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // we fire manually on route change (SPA)
      capture_pageleave: true,
      autocapture: false, // all key actions tracked manually
    });
    ph = mod.default;
  });
}

/** Identify the logged-in user. Call on login / session restore. */
export function identifyUser(user: {
  id: string;
  email: string;
  name?: string | null;
  isAdmin: boolean;
}) {
  ph?.identify(user.id, {
    email: user.email,
    name: user.name ?? undefined,
    is_admin: user.isAdmin,
  });
}

/** Reset identity on logout. */
export function resetUser() {
  ph?.reset();
}

/** Track a custom event. */
export function track(event: string, properties?: Record<string, unknown>) {
  ph?.capture(event, properties);
}

/** Fire a $pageview — call on every route change. */
export function trackPageview() {
  ph?.capture("$pageview");
}

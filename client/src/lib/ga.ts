// client/src/lib/ga.ts
// Google Analytics 4 — thin wrapper for init + helpers (lazy script injection)

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initGA() {
  if (initialized || !GA_MEASUREMENT_ID || typeof window === "undefined") return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  // send_page_view: false — SPA, we fire manually on route change
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

/** Identify the logged-in user. Call on login / session restore. */
export function identifyUser(user: {
  id: string;
  email: string;
  name?: string | null;
  isAdmin: boolean;
}) {
  if (!initialized || !GA_MEASUREMENT_ID) return;
  window.gtag("config", GA_MEASUREMENT_ID, { user_id: user.id });
  window.gtag("set", "user_properties", { is_admin: user.isAdmin });
}

/** Reset identity on logout. */
export function resetUser() {
  if (!initialized || !GA_MEASUREMENT_ID) return;
  window.gtag("config", GA_MEASUREMENT_ID, { user_id: null });
}

/** Track a custom event. */
export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  window.gtag("event", event, properties);
}

/** Fire a page_view — call on every route change. */
export function trackPageview() {
  if (!initialized || !GA_MEASUREMENT_ID) return;
  window.gtag("event", "page_view", {
    page_path: window.location.pathname + window.location.search,
    page_location: window.location.href,
    page_title: document.title,
  });
}

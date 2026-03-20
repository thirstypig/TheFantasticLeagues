// client/src/components/PostHogTracker.tsx
// Fires $pageview on every route change and syncs user identity.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { identifyUser, resetUser, trackPageview } from "../lib/posthog";

export function PostHogTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const prevUserId = useRef<string | null>(null);

  // Track pageviews on route change
  useEffect(() => {
    trackPageview();
  }, [location.pathname, location.search]);

  // Identify / reset on auth change
  useEffect(() => {
    if (user && user.id !== prevUserId.current) {
      identifyUser(user);
      prevUserId.current = user.id;
    } else if (!user && prevUserId.current) {
      resetUser();
      prevUserId.current = null;
    }
  }, [user]);

  return null;
}

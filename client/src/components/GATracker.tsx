// client/src/components/GATracker.tsx
// Fires GA4 page_view on every route change and syncs user identity.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { identifyUser, resetUser, trackPageview } from "../lib/ga";

export function GATracker() {
  const location = useLocation();
  const { user } = useAuth();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    trackPageview();
  }, [location.pathname, location.search]);

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

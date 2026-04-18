import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Announces route changes to screen readers via an aria-live region.
 * Mount once inside BrowserRouter. On each pathname change, updates
 * a visually-hidden live region so assistive tech reads the new page title.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Slight delay so the new page title has time to render
    const timer = setTimeout(() => {
      const title = document.title || "Page loaded";
      if (ref.current) ref.current.textContent = title;
    }, 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}

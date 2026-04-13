import { useEffect, useState, useCallback } from "react";
import { subscribeErrors, type SurfacedError } from "../lib/errorBus";
import ErrorToast from "./ErrorToast";

/**
 * Mounts once at the root of the app. Listens to the error bus and renders
 * a stack of dismissible toasts in the top-right corner.
 *
 * Keeps the surfaced errors in local state (bounded to 5) so a burst of
 * errors does not fill the screen.
 */

const MAX_TOASTS = 5;

export default function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<SurfacedError[]>([]);

  useEffect(() => {
    return subscribeErrors((err) => {
      setErrors((prev) => {
        // Dedupe: if the same requestId is already surfaced, replace in place
        // rather than stacking duplicates from retry loops.
        const existingIdx = err.requestId
          ? prev.findIndex((e) => e.requestId === err.requestId)
          : -1;
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = err;
          return next;
        }
        const next = [err, ...prev].slice(0, MAX_TOASTS);
        return next;
      });
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <>
      {children}
      {errors.length > 0 && (
        <div
          aria-live="polite"
          aria-label="Error notifications"
          className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2"
        >
          {errors.map((err) => (
            <ErrorToast key={err.id} error={err} onDismiss={() => dismiss(err.id)} />
          ))}
        </div>
      )}
    </>
  );
}

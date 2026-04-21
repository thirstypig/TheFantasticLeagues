// client/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LeagueProvider } from "./contexts/LeagueContext";
import { PostHogTracker } from "./components/PostHogTracker";
import { GATracker } from "./components/GATracker";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ErrorProvider from "./components/ErrorProvider";
import { initPostHog } from "./lib/posthog";
import { initGA } from "./lib/ga";
import { applyPersistedPalette } from "./lib/colorLabPalettes";

// Reapply any Color Lab preview the user picked before this reload. Must
// run before React renders to avoid a flash of unstyled (default) colors.
applyPersistedPalette();

// Initialize analytics before render
initPostHog();
initGA();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary name="root">
      <ErrorProvider>
        <BrowserRouter>
          <AuthProvider>
            <ThemeProvider>
              <ToastProvider>
                <LeagueProvider>
                  <PostHogTracker />
                  <GATracker />
                  <App />
                </LeagueProvider>
              </ToastProvider>
            </ThemeProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker for PWA installability
// updateViaCache: 'none' forces the browser to bypass HTTP cache when checking for SW updates
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

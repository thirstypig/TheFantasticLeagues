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
import { initPostHog } from "./lib/posthog";

// Initialize PostHog before render
initPostHog();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <LeagueProvider>
              <PostHogTracker />
              <App />
            </LeagueProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

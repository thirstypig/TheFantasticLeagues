// client/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";

import { AuthProvider } from "./auth/AuthProvider";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LeagueProvider } from "./contexts/LeagueContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <LeagueProvider>
            <App />
          </LeagueProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

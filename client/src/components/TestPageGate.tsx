// Test pages (the NBA and NFL dashboards): mock-ups with made-up data, kept
// for building the multi-sport product. Only site admins can open them, and
// they always say they're tests, so nobody mistakes them for a real league.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function TestPageGate({ name, children }: { name: string; children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px", color: "var(--am-text)" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Not available</h1>
        <p style={{ margin: "8px 0 0", fontSize: 17, color: "var(--am-text-muted)" }}>
          This page is a test and isn’t open to league members. <Link to="/" style={{ color: "var(--am-accent)" }}>Back to Today</Link>
        </p>
      </div>
    );
  }
  return (
    <>
      <div
        role="note"
        style={{
          margin: "0 auto", maxWidth: 1100, padding: "10px 16px", fontSize: 15, fontWeight: 600,
          color: "var(--am-text)", background: "var(--am-chip)", borderBottom: "1px solid var(--am-border)",
        }}
      >
        Test page ({name}): sample data, not a real league. Only site admins can see this.
      </div>
      {children}
    </>
  );
}

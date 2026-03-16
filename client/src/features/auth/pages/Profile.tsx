import React, { useState, useEffect } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { updateProfile } from "../api";
import PageHeader from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/button";
import { useToast } from "../../../contexts/ToastContext";

export default function Profile() {
  const { me, refresh } = useAuth();
  const { toast } = useToast();
  const user = me?.user;

  const [name, setName] = useState(user?.name || "");
  const [venmoHandle, setVenmoHandle] = useState(user?.venmoHandle || "");
  const [zelleHandle, setZelleHandle] = useState(user?.zelleHandle || "");
  const [paypalHandle, setPaypalHandle] = useState(user?.paypalHandle || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setVenmoHandle(user.venmoHandle || "");
      setZelleHandle(user.zelleHandle || "");
      setPaypalHandle(user.paypalHandle || "");
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({
        name: name || undefined,
        venmoHandle: venmoHandle || null,
        zelleHandle: zelleHandle || null,
        paypalHandle: paypalHandle || null,
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="p-4">Please log in.</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader title="Profile" subtitle="Manage your account details and payment methods." />

      <div className="mt-8 space-y-8">
        {/* Display Info */}
        <div className="lg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] uppercase tracking-tight">
            Account Info
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">
                Email
              </label>
              <div className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-muted)]">
                {user.email}
              </div>
            </div>

            {user.avatarUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={user.avatarUrl}
                  alt={user.name || "Avatar"}
                  className="h-12 w-12 rounded-xl border border-[var(--lg-border-subtle)]"
                />
                <span className="text-xs text-[var(--lg-text-muted)]">Avatar from login provider</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="lg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] uppercase tracking-tight">
            Payment Methods
          </h2>
          <p className="text-xs text-[var(--lg-text-muted)]">
            Add your payment handles so league members can settle payouts easily.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">
                Venmo
              </label>
              <input
                type="text"
                value={venmoHandle}
                onChange={(e) => setVenmoHandle(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                placeholder="@username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">
                Zelle
              </label>
              <input
                type="text"
                value={zelleHandle}
                onChange={(e) => setZelleHandle(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                placeholder="Phone or email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">
                PayPal
              </label>
              <input
                type="text"
                value={paypalHandle}
                onChange={(e) => setPaypalHandle(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                placeholder="Email or @username"
              />
            </div>
          </div>
        </div>

        {/* League Memberships (read-only) */}
        {user.memberships && user.memberships.length > 0 && (
          <div className="lg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] uppercase tracking-tight">
              League Memberships
            </h2>
            <div className="space-y-2">
              {user.memberships.map((m) => (
                <div
                  key={m.leagueId}
                  className="flex items-center justify-between bg-[var(--lg-tint)] rounded-xl px-4 py-3"
                >
                  <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                    {m.league?.name || `League #${m.leagueId}`}
                  </span>
                  <span
                    className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                      m.role === "COMMISSIONER"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={saving} variant="default" className="px-8">
            {saving ? "Saving..." : "Save Profile"}
          </Button>
          {saved && (
            <span className="text-sm font-medium text-emerald-400 animate-in fade-in">
              Saved!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { usePushSubscription } from "../hooks/usePushSubscription";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../api";

const PREF_LABELS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: "tradeProposal", label: "Trade Proposals" },
  { key: "tradeResult", label: "Trade Results" },
  { key: "waiverResult", label: "Waiver Results" },
  { key: "lineupReminder", label: "Lineup Reminders" },
  { key: "commissionerAnnounce", label: "Commissioner Announcements" },
  { key: "boardReply", label: "Board Replies" },
];

export default function NotificationSettings() {
  const { isSupported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushSubscription();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const handleTogglePush = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [isSubscribed, subscribe, unsubscribe]);

  const handlePrefChange = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      if (!prefs) return;
      setSaving(true);
      try {
        const updated = await updateNotificationPreferences({ [key]: value });
        setPrefs(updated);
      } catch {
        // revert optimistic update
      } finally {
        setSaving(false);
      }
    },
    [prefs],
  );

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-[var(--lg-border-faint)] p-4">
        <h3 className="text-base font-semibold text-[var(--lg-text)]">Push Notifications</h3>
        <p className="mt-2 text-sm text-[var(--lg-text-muted)]">
          Push notifications are not supported in this browser.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] p-4 space-y-4">
      <h3 className="text-base font-semibold text-[var(--lg-text)]">Push Notifications</h3>

      {/* Status + Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--lg-text)]">
            Status:{" "}
            {loading
              ? "Checking..."
              : permission === "denied"
                ? "Blocked by browser"
                : isSubscribed
                  ? "Enabled"
                  : "Disabled"}
          </p>
          {permission === "denied" && (
            <p className="text-xs text-[var(--lg-text-muted)] mt-1">
              Notifications are blocked. Update your browser site settings to allow them.
            </p>
          )}
        </div>
        <button
          onClick={handleTogglePush}
          disabled={loading || permission === "denied"}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSubscribed
              ? "bg-[var(--lg-surface-alt)] text-[var(--lg-text)] hover:bg-[var(--lg-surface-hover)]"
              : "bg-[var(--lg-accent)] text-white hover:opacity-90"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? "..." : isSubscribed ? "Disable" : "Enable Push Notifications"}
        </button>
      </div>

      {/* Notification type toggles */}
      {isSubscribed && (
        <div className="border-t border-[var(--lg-border-faint)] pt-4 space-y-3">
          <p className="text-sm font-medium text-[var(--lg-text)]">Notification Types</p>
          {prefsLoading ? (
            <p className="text-sm text-[var(--lg-text-muted)]">Loading preferences...</p>
          ) : (
            prefs &&
            PREF_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[var(--lg-text)]">{label}</span>
                <button
                  role="switch"
                  aria-checked={prefs[key]}
                  disabled={saving}
                  onClick={() => handlePrefChange(key, !prefs[key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    prefs[key] ? "bg-[var(--lg-accent)]" : "bg-[var(--lg-surface-alt)]"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      prefs[key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

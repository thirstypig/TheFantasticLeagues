import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider";
import { useToast } from "../../../contexts/ToastContext";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { Button } from "../../../components/ui/button";
import {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  type ProfileResponse,
  type UserProfileData,
} from "../api";
import { NotificationSettings } from "../../notifications";

const MLB_TEAMS = [
  "AZ", "ATL", "BAL", "BOS", "CHC", "CWS", "CIN", "CLE", "COL", "DET",
  "HOU", "KC", "LAA", "LAD", "MIA", "MIL", "MIN", "NYM", "NYY", "OAK",
  "PHI", "PIT", "SD", "SF", "SEA", "STL", "TB", "TEX", "TOR", "WSH",
];

const EXPERIENCE_LEVELS = [
  { value: "1-3", label: "1-3 years" },
  { value: "3-5", label: "3-5 years" },
  { value: "5-10", label: "5-10 years" },
  { value: "10+", label: "10+ years" },
];

const FORMAT_OPTIONS = ["ROTO", "H2H", "KEEPER", "DYNASTY", "POINTS"];

function Initials({ name, size = 64 }: { name: string | null; size?: number }) {
  const letters = (name || "?")
    .split(" ")
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
  return (
    <div
      className="rounded-xl bg-[var(--lg-accent)]/15 text-[var(--lg-accent)] font-semibold flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {letters}
    </div>
  );
}

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const { me, isAdmin } = useAuth();
  const { toast } = useToast();

  const meId = me?.user?.id; // string | undefined
  const isOwnProfile = !paramUserId || (meId != null && paramUserId === String(meId));
  const targetUserId = paramUserId ? Number(paramUserId) : (meId ? Number(meId) : undefined);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ProfileResponse | null>(null);

  // Edit form state
  const [bio, setBio] = useState("");
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [preferredFormats, setPreferredFormats] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [venmo, setVenmo] = useState("");
  const [paypal, setPaypal] = useState("");
  const [zelle, setZelle] = useState("");
  const [cashapp, setCashapp] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const resp = isOwnProfile
          ? await getMyProfile()
          : await getPublicProfile(targetUserId as number);
        if (!mounted) return;
        setData(resp);

        // Populate form
        if (resp.profile && isOwnProfile) {
          const p = resp.profile;
          setBio(p.bio || "");
          setFavoriteTeam(p.favoriteTeam || "");
          setExperienceLevel(p.experienceLevel || "");
          setPreferredFormats(p.preferredFormats || []);
          setTimezone(p.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "");
          setIsPublic(p.isPublic !== false);
          const handles = p.paymentHandles;
          if (handles) {
            setVenmo(handles.venmo || "");
            setPaypal(handles.paypal || "");
            setZelle(handles.zelle || "");
            setCashapp(handles.cashapp || "");
          }
        }
      } catch {
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [targetUserId, isOwnProfile]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: UserProfileData = {
        bio: bio || null,
        favoriteTeam: favoriteTeam || null,
        experienceLevel: experienceLevel || null,
        preferredFormats,
        timezone: timezone || null,
        isPublic,
        paymentHandles: (venmo || paypal || zelle || cashapp)
          ? { venmo: venmo || undefined, paypal: paypal || undefined, zelle: zelle || undefined, cashapp: cashapp || undefined }
          : null,
      };
      await updateMyProfile(payload);
      toast("Profile saved!", "success");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to save profile", "error");
    } finally {
      setSaving(false);
    }
  }

  function toggleFormat(fmt: string) {
    setPreferredFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Glass><div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>Loading profile…</div></Glass>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Glass><div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>Profile not found.</div></Glass>
      </div>
    );
  }

  const profile = data.profile;
  const user = data.user;

  // Public view (non-own profile)
  if (!isOwnProfile) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Glass strong>
          <SectionLabel>✦ Profile</SectionLabel>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 28, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>{user.name || "User Profile"}</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>Fantasy league member</div>
        </Glass>

        <div className="mt-8 space-y-6">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name || ""} className="w-16 h-16 rounded-xl border border-[var(--lg-border-subtle)]" />
            ) : (
              <Initials name={user.name} />
            )}
            <div>
              <div className="text-lg font-semibold text-[var(--lg-text-heading)]">{user.name || "Anonymous"}</div>
              {profile?.favoriteTeam && (
                <div className="text-sm text-[var(--lg-text-muted)]">Favorite team: {profile.favoriteTeam}</div>
              )}
            </div>
          </div>

          {isAdmin && profile && (profile as any).isPublic === false && (
            <div className="lg-card p-3 border-amber-500/30 bg-amber-500/5">
              <div className="text-xs text-amber-300 font-semibold mb-0.5">Admin override — private profile</div>
              <div className="text-[11px] text-[var(--lg-text-muted)]">
                This user marked their profile private. You can see it because you&rsquo;re an admin.
                Regular users see only the name + avatar.
              </div>
            </div>
          )}

          {profile && ((profile as any).isPublic !== false || isAdmin) ? (
            <>
              {profile.bio && (
                <div className="lg-card p-5">
                  <div className="text-sm text-[var(--lg-text-secondary)]">{profile.bio}</div>
                </div>
              )}

              <div className="lg-card p-5 space-y-3">
                {profile.experienceLevel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--lg-text-muted)]">Experience</span>
                    <span className="text-[var(--lg-text-primary)]">{profile.experienceLevel} years</span>
                  </div>
                )}
                {profile.preferredFormats && profile.preferredFormats.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--lg-text-muted)]">Preferred Formats</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {profile.preferredFormats.map((f) => (
                        <span key={f} className="rounded-full bg-[var(--lg-accent)]/10 px-2 py-0.5 text-xs text-[var(--lg-accent)]">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment handles (only visible if same league) */}
              {profile.paymentHandles && (
                <div className="lg-card p-5">
                  <h3 className="text-sm font-semibold text-[var(--lg-text-heading)] mb-2">Payment Methods</h3>
                  <div className="space-y-1 text-sm">
                    {(profile.paymentHandles as any).venmo && <div className="text-[var(--lg-text-secondary)]">Venmo: {(profile.paymentHandles as any).venmo}</div>}
                    {(profile.paymentHandles as any).paypal && <div className="text-[var(--lg-text-secondary)]">PayPal: {(profile.paymentHandles as any).paypal}</div>}
                    {(profile.paymentHandles as any).zelle && <div className="text-[var(--lg-text-secondary)]">Zelle: {(profile.paymentHandles as any).zelle}</div>}
                    {(profile.paymentHandles as any).cashapp && <div className="text-[var(--lg-text-secondary)]">CashApp: {(profile.paymentHandles as any).cashapp}</div>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="lg-card p-5 text-center text-sm text-[var(--lg-text-muted)]">
              This profile is private.
            </div>
          )}

          {/* League History */}
          {data.leagueHistory.length > 0 && (
            <div className="lg-card p-5">
              <h3 className="text-sm font-semibold text-[var(--lg-text-heading)] mb-3">League History</h3>
              <div className="space-y-2">
                {data.leagueHistory.map((lh) => (
                  <div key={`${lh.leagueId}-${lh.season}`} className="flex items-center justify-between bg-[var(--lg-tint)] rounded-lg px-3 py-2">
                    <span className="text-sm text-[var(--lg-text-primary)]">{lh.leagueName} ({lh.season})</span>
                    <span className="text-xs text-[var(--lg-text-muted)] uppercase">{lh.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Own profile — edit mode
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Profile</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 28, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>My Profile</h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>Manage your public profile and payment methods.</div>
      </Glass>

      <div className="mt-8 space-y-8">
        {/* Avatar + Identity */}
        <div className="lg-card p-6">
          <div className="flex items-center gap-4 mb-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name || ""} className="w-16 h-16 rounded-xl border border-[var(--lg-border-subtle)]" />
            ) : (
              <Initials name={user.name} />
            )}
            <div>
              <div className="text-lg font-semibold text-[var(--lg-text-heading)]">{user.name || "Anonymous"}</div>
              <div className="text-sm text-[var(--lg-text-muted)]">{(user as any).email}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                placeholder="Tell us about yourself (200 chars max)"
              />
              <div className="text-right text-xs text-[var(--lg-text-muted)] mt-0.5">{bio.length}/200</div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Favorite MLB Team</label>
              <select
                value={favoriteTeam}
                onChange={(e) => setFavoriteTeam(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
              >
                <option value="">Select...</option>
                {MLB_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Fantasy Experience</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)]"
              >
                <option value="">Select...</option>
                {EXPERIENCE_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Preferred Formats</label>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => toggleFormat(fmt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      preferredFormats.includes(fmt)
                        ? "bg-[var(--lg-accent)]/15 text-[var(--lg-accent)] border border-[var(--lg-accent)]/30"
                        : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-subtle)]"
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Public Profile</label>
              <button
                onClick={() => setIsPublic(!isPublic)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  isPublic
                    ? "bg-green-500/15 text-green-500"
                    : "bg-[var(--lg-tint-hover)] text-[var(--lg-text-muted)]"
                }`}
              >
                {isPublic ? "Public" : "Private"}
              </button>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="lg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] uppercase tracking-tight">
            Payment Methods
          </h2>
          <p className="text-xs text-[var(--lg-text-muted)]">
            Add your payment handles so league members can settle payouts easily. These are only visible to members of your leagues.
          </p>

          <div className="space-y-3">
            {[
              { label: "Venmo", value: venmo, set: setVenmo, placeholder: "@username" },
              { label: "PayPal", value: paypal, set: setPaypal, placeholder: "Email or @username" },
              { label: "Zelle", value: zelle, set: setZelle, placeholder: "Phone or email" },
              { label: "CashApp", value: cashapp, set: setCashapp, placeholder: "$cashtag" },
            ].map((h) => (
              <div key={h.label}>
                <label className="block text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">{h.label}</label>
                <input
                  type="text"
                  value={h.value}
                  onChange={(e) => h.set(e.target.value)}
                  className="w-full bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl px-4 py-2.5 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all"
                  placeholder={h.placeholder}
                />
              </div>
            ))}
          </div>
        </div>

        {/* League History */}
        {data.leagueHistory.length > 0 && (
          <div className="lg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] uppercase tracking-tight">
              League History
            </h2>
            <div className="space-y-2">
              {data.leagueHistory.map((lh) => (
                <div
                  key={`${lh.leagueId}-${lh.season}`}
                  className="flex items-center justify-between bg-[var(--lg-tint)] rounded-xl px-4 py-3"
                >
                  <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                    {lh.leagueName} ({lh.season})
                  </span>
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                    lh.role === "COMMISSIONER"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"
                  }`}>
                    {lh.role}
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
        </div>

        {/* Notification Settings */}
        <div className="mt-10 pt-8 border-t border-[var(--lg-border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Push Notifications</h2>
          <NotificationSettings />
        </div>
      </div>
    </div>
  );
}

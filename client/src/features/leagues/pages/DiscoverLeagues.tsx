import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getPublicLeagues, type PublicLeagueListItem } from "../api";
import { useAuth } from "../../../auth/AuthProvider";
import "../../../components/aurora/aurora.css";
import { AmbientBg, Glass, IridText, SectionLabel, Chip } from "../../../components/aurora/atoms";

export default function DiscoverLeagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<PublicLeagueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    getPublicLeagues()
      .then(res => setLeagues(res.leagues || []))
      .catch(() => setLeagues([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? leagues.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    : leagues;

  return (
    <div
      className="aurora-theme dark"
      style={{ position: "relative", minHeight: "100svh", background: "var(--am-bg)" }}
    >
      <AmbientBg />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "60px 20px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        {/* Top-right auth link */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "var(--am-text)",
              minWidth: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "var(--am-irid)",
                boxShadow: "0 6px 20px rgba(255,80,80,0.28)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--am-display)",
                fontSize: 15,
                letterSpacing: -0.2,
                color: "var(--am-text)",
              }}
            >
              The Fantastic Leagues
            </span>
          </Link>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {user ? (
              <Link
                to="/"
                style={{
                  fontSize: 13,
                  color: "var(--am-text-muted)",
                  textDecoration: "none",
                }}
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  style={{
                    fontSize: 13,
                    color: "var(--am-text-muted)",
                    textDecoration: "none",
                  }}
                >
                  Already have an account? Sign in →
                </Link>
                <Link
                  to="/signup"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--am-text)",
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: 99,
                    background: "var(--am-chip-strong)",
                    border: "1px solid var(--am-border-strong)",
                  }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Hero */}
        <Glass strong style={{ marginBottom: 24 }}>
          <SectionLabel>✦ Discover</SectionLabel>
          <IridText size={40} weight={300}>
            Public leagues
          </IridText>
          <div style={{ marginTop: 8, fontSize: 14, color: "var(--am-text-muted)" }}>
            Browse open and public fantasy baseball leagues. Find a league, request to join, and start drafting.
          </div>

          {/* Search */}
          <div style={{ marginTop: 18 }}>
            <input
              type="text"
              placeholder="Search leagues..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%",
                maxWidth: 440,
                padding: "10px 14px",
                borderRadius: 12,
                background: "var(--am-surface-faint)",
                border: "1px solid var(--am-border)",
                color: "var(--am-text)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
        </Glass>

        {/* Cards */}
        {loading ? (
          <Glass>
            <div style={{ color: "var(--am-text-muted)", textAlign: "center", padding: "32px 0" }}>
              Loading leagues...
            </div>
          </Glass>
        ) : filtered.length === 0 ? (
          <Glass>
            <div style={{ textAlign: "center", padding: "40px 16px" }}>
              <SectionLabel style={{ marginBottom: 8 }}>✦ Empty</SectionLabel>
              <div style={{ fontSize: 16, color: "var(--am-text)", marginBottom: 6 }}>
                {search ? "No leagues match your search." : "No public leagues yet."}
              </div>
              <div style={{ fontSize: 13, color: "var(--am-text-muted)", marginBottom: 18 }}>
                {search ? "Try a different name." : "Check back soon — leagues are forming all the time."}
              </div>
              {user && (
                <Link
                  to="/create-league"
                  style={{
                    display: "inline-block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--am-text)",
                    textDecoration: "none",
                    padding: "8px 16px",
                    borderRadius: 99,
                    background: "var(--am-chip-strong)",
                    border: "1px solid var(--am-border-strong)",
                  }}
                >
                  Create your own league →
                </Link>
              )}
            </div>
          </Glass>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {filtered.map(league => (
              <Glass key={league.id}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--am-display)",
                          fontSize: 18,
                          fontWeight: 400,
                          color: "var(--am-text)",
                          lineHeight: 1.2,
                        }}
                      >
                        {league.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--am-text-faint)", marginTop: 4 }}>
                        {league.season} season · {league.scoringFormat || "Roto"} · {league.draftMode || "Auction"}
                      </div>
                    </div>
                    <Chip strong>{league.visibility === "OPEN" ? "Open" : "Public"}</Chip>
                  </div>

                  {league.description && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--am-text-muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {league.description}
                    </div>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    <Chip>
                      {league.teamsFilled}/{league.maxTeams} teams
                    </Chip>
                    {league.commissioner && <Chip>Commish: {league.commissioner}</Chip>}
                    <Chip>{league.entryFee ? `$${league.entryFee} entry` : "Free"}</Chip>
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 8,
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--am-text-muted)",
                      }}
                    >
                      View →
                    </span>
                  </div>
                </div>
              </Glass>
            ))}
          </div>
        )}

        {/* Bottom escape link */}
        {!user && (
          <div style={{ marginTop: 32, textAlign: "center" }}>
            <Link
              to="/login"
              style={{
                fontSize: 13,
                color: "var(--am-text-muted)",
                textDecoration: "none",
              }}
            >
              Already have an account? Sign in →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

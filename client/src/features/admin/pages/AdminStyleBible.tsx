import { useAuth } from "../../../auth/AuthProvider";

const BIBLE_URL = "/style-bible/index.html";

export default function AdminStyleBible() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);

  if (!isAdmin) {
    return <div style={{ padding: 24, fontSize: 15 }}>Admins only.</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Style Bible</h1>
        <a href={BIBLE_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15 }}>
          Open full page ›
        </a>
      </div>
      <iframe
        title="Style Bible"
        src={BIBLE_URL}
        style={{ width: "100%", height: "calc(100vh - 140px)", border: 0 }}
      />
    </div>
  );
}

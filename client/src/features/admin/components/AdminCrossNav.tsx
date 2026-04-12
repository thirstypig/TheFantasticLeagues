import { Link, useLocation } from "react-router-dom";

/**
 * Cross-link nav used on /todo, /roadmap, /concepts, /changelog.
 * Highlights the current page and links to the other three.
 */
export default function AdminCrossNav() {
  const { pathname } = useLocation();

  const links = [
    { to: "/todo", label: "Todo", hint: "tasks" },
    { to: "/roadmap", label: "Roadmap", hint: "direction" },
    { to: "/concepts", label: "Concepts", hint: "ideas" },
    { to: "/changelog", label: "Changelog", hint: "history" },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--lg-text-muted)] mt-2">
      <span className="opacity-60">See:</span>
      {links.map((l, i) => {
        const isActive = pathname === l.to;
        return (
          <span key={l.to} className="flex items-center gap-2">
            {isActive ? (
              <span className="font-semibold text-[var(--lg-text-primary)]">
                {l.label} <span className="opacity-50">({l.hint})</span>
              </span>
            ) : (
              <Link
                to={l.to}
                className="hover:text-[var(--lg-accent)] transition-colors underline underline-offset-2 decoration-dotted"
              >
                {l.label} <span className="opacity-50">({l.hint})</span>
              </Link>
            )}
            {i < links.length - 1 && <span className="opacity-30">·</span>}
          </span>
        );
      })}
    </nav>
  );
}

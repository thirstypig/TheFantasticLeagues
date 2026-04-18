import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-[var(--lg-text-heading)] mb-4">404</h1>
      <p className="text-lg text-[var(--lg-text-secondary)] mb-8">
        This page doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="px-6 py-3 rounded-xl bg-[var(--lg-accent)] text-white font-medium hover:opacity-90 transition-opacity"
      >
        Go Home
      </Link>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";

interface TeamNameLinkProps {
  /** Team ID or team code used in the URL */
  teamId: string | number;
  name: string;
  /** Extra classes merged onto the <Link> */
  className?: string;
}

/**
 * Consistent clickable team-name link used in standings / stats tables.
 */
export function TeamNameLink({ teamId, name, className }: TeamNameLinkProps) {
  return (
    <Link
      to={`/teams/${teamId}`}
      className={`font-semibold text-[var(--lg-text-primary)] text-[11px] hover:text-[var(--lg-accent)] transition-colors tracking-tight ${className ?? ""}`}
    >
      {name}
    </Link>
  );
}

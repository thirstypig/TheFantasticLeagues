// client/src/components/ui/EmptyState.tsx
import React from "react";
import { Link } from "react-router-dom";
import { type LucideIcon } from "lucide-react";
import { Button } from "./button";

type EmptyStateAction =
  | { kind: "link"; label: string; to: string }
  | { kind: "button"; label: string; onClick: () => void };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  children?: React.ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, children, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? "py-8" : "py-16"}`}>
      <div className="w-12 h-12 rounded-2xl bg-[var(--lg-tint)] flex items-center justify-center mb-4">
        <Icon size={24} className="text-[var(--lg-text-muted)] opacity-60" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[var(--lg-text-muted)] max-w-xs leading-relaxed">{description}</p>
      )}
      {children ? (
        <div className="mt-4">{children}</div>
      ) : action?.kind === "link" ? (
        <Link to={action.to} className="mt-4">
          <Button variant="outline" size="sm">{action.label}</Button>
        </Link>
      ) : action?.kind === "button" ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

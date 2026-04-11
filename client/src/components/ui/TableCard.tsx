// client/src/components/ui/TableCard.tsx
import React from "react";

type Align = "left" | "center" | "right";

function alignCls(a: Align) {
  if (a === "left") return "text-left";
  if (a === "right") return "text-right";
  return "text-center";
}

/**
 * TableCard
 * - Consistent shell for all tables using liquid glass design
 * - Exports small primitives for consistent th/td styling
 */
export function TableCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "overflow-hidden rounded-3xl liquid-glass transition-all duration-300",
        className ?? "",
      ].join(" ")}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <table className={["min-w-full text-xs", className ?? ""].join(" ")}>{children}</table>;
}

export function THead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead className={["bg-[var(--lg-table-header-bg)] border-b border-[var(--lg-table-border)]", className ?? ""].join(" ")}>
      {children}
    </thead>
  );
}

export function TBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <tbody className={className}>{children}</tbody>;
}

export function Tr({
  children,
  className,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <tr 
      className={["hover:bg-[var(--lg-table-row-hover)] transition-colors duration-150 border-b border-[var(--lg-table-border)] last:border-0", className ?? ""].join(" ")} 
      onClick={onClick} 
      title={title}
    >
      {children}
    </tr>
  );
}

export function Th({
  children,
  className,
  align = "center",
  w,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  align?: Align;
  w?: number;
  title?: string;
}) {
  return (
    <th
      title={title}
      style={w ? { width: w } : undefined}
      className={[
        "px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]",
        alignCls(align),
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "center",
}: {
  children: React.ReactNode;
  className?: string;
  align?: Align;
}) {
  return (
    <td
      className={[
        "px-1.5 py-0.5 align-middle text-[var(--lg-text-primary)] text-xs tabular-nums",
        alignCls(align),
        className ?? "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

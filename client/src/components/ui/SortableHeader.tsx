import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "./table";

interface SortableHeaderProps {
  /** Column key used for sort comparison */
  sortKey: string;
  /** Currently active sort key */
  activeSortKey: string;
  /** Current sort direction */
  sortDesc: boolean;
  /** Callback when header is clicked */
  onSort: (key: string) => void;
  /** Header label */
  children: React.ReactNode;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Additional class names */
  className?: string;
  /** Title/tooltip text */
  title?: string;
}

/**
 * SortableHeader — a table header cell with sort indicators.
 * Replaces inline sort logic repeated across Players, StatsTables, AuctionValues, etc.
 */
export function SortableHeader({
  sortKey,
  activeSortKey,
  sortDesc,
  onSort,
  children,
  align = "left",
  className,
  title,
}: SortableHeaderProps) {
  const isActive = activeSortKey === sortKey;
  const alignClass = { left: "text-left", center: "text-center", right: "text-right" }[align];

  const SortIcon = isActive ? (sortDesc ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <TableHead
      onClick={() => onSort(sortKey)}
      title={title}
      className={cn(
        alignClass,
        "cursor-pointer select-none hover:text-[var(--lg-accent)] transition-colors",
        isActive && "text-[var(--lg-accent)]",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <SortIcon size={12} className={cn("flex-shrink-0", isActive ? "opacity-80" : "opacity-30")} />
      </span>
    </TableHead>
  );
}

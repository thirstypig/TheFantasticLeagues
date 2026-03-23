import * as React from "react"

import { cn } from "@/lib/utils"

// ─── Table density system ──────────────────────────────────────────────────
// compact:     28-32px rows, 12px font — auction panels, embedded tables
// default:     36-40px rows, 13px font — players, standings, stats
// comfortable: 44-48px rows, 15px font — summary tables, team overview (original)

export type TableDensity = "compact" | "default" | "comfortable";

const TableDensityContext = React.createContext<TableDensity>("comfortable");
export const useTableDensity = () => React.useContext(TableDensityContext);
export function TableDensityProvider({ density, children }: { density: TableDensity; children: React.ReactNode }) {
  return <TableDensityContext.Provider value={density}>{children}</TableDensityContext.Provider>;
}

// Backwards-compatible aliases for existing compact usage
const TableCompactContext = React.createContext(false);
export const useTableCompact = () => React.useContext(TableCompactContext);
export function TableCompactProvider({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return (
    <TableCompactContext.Provider value={compact}>
      <TableDensityProvider density={compact ? "compact" : "comfortable"}>
        {children}
      </TableDensityProvider>
    </TableCompactContext.Provider>
  );
}

const headStyles: Record<TableDensity, string> = {
  compact: "px-1.5 py-1.5 text-left align-middle text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]",
  default: "h-9 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
  comfortable: "h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
};

const cellStyles: Record<TableDensity, string> = {
  compact: "px-1.5 py-1 align-middle text-sm text-[var(--lg-text-primary)] tabular-nums",
  default: "px-3 py-1.5 align-middle text-[13px] leading-5 text-[var(--lg-text-primary)] tabular-nums [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
  comfortable: "px-3 py-3 align-middle text-[15px] leading-5 text-[var(--lg-text-primary)] tabular-nums [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
};

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-[var(--lg-table-header-bg)] [&_tr]:border-b [&_tr]:border-[var(--lg-table-border)]",
      className
    )}
    {...props}
  />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-[var(--lg-table-border)] bg-[var(--lg-table-header-bg)] font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => {
  const density = useTableDensity();
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[var(--lg-table-border)] transition-colors hover:bg-[var(--lg-table-row-hover)] data-[state=selected]:bg-[var(--lg-table-row-hover)]",
        density === "compact" && "hover:bg-[var(--lg-tint)]",
        className
      )}
      {...props}
    />
  );
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const density = useTableDensity();
  return (
    <th
      ref={ref}
      className={cn(headStyles[density], className)}
      {...props}
    />
  );
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const density = useTableDensity();
  return (
    <td
      ref={ref}
      className={cn(cellStyles[density], className)}
      {...props}
    />
  );
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-[var(--lg-text-muted)]", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

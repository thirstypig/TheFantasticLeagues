import * as React from "react"

import { cn } from "@/lib/utils"

// Context for compact table mode — tighter padding for embedded panels (auction, etc.)
const TableCompactContext = React.createContext(false);
export const useTableCompact = () => React.useContext(TableCompactContext);
export function TableCompactProvider({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return <TableCompactContext.Provider value={compact}>{children}</TableCompactContext.Provider>;
}

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
  const compact = useTableCompact();
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-[var(--lg-table-border)] transition-colors hover:bg-[var(--lg-table-row-hover)] data-[state=selected]:bg-[var(--lg-table-row-hover)]",
        compact && "hover:bg-[var(--lg-tint)]",
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
  const compact = useTableCompact();
  return (
    <th
      ref={ref}
      className={cn(
        compact
          ? "px-1.5 py-1.5 text-left align-middle text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]"
          : "h-10 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  );
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const compact = useTableCompact();
  return (
    <td
      ref={ref}
      className={cn(
        compact
          ? "px-1.5 py-1 align-middle text-sm text-[var(--lg-text-primary)] tabular-nums"
          : "px-3 py-3 align-middle text-[15px] leading-5 text-[var(--lg-text-primary)] tabular-nums [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
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

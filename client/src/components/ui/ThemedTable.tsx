import React from 'react';
import { cn } from '@/lib/utils';
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableDensityProvider,
  type TableDensity,
} from './table';

/* ── Frozen-column styles ─────────────────────────────────────────────── */
const frozenThClass =
  'sticky left-0 z-20 bg-[var(--lg-table-header-sticky-bg)] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-[var(--lg-border-subtle)]';
const frozenTdClass =
  'sticky left-0 z-[5] bg-[var(--lg-table-sticky-col-bg)] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-[var(--lg-border-subtle)]';

interface ThemedTableProps {
  children: React.ReactNode;
  className?: string;
  /** Set to true if this table is already inside a styled container */
  bare?: boolean;
  /** Table density tier: "compact" | "default" | "comfortable" */
  density?: TableDensity;
  /** Apply zebra striping (alternating row backgrounds) */
  zebra?: boolean;
  /** Accessible label describing the table contents */
  'aria-label'?: string;
  /** Visible caption rendered below the table */
  caption?: string;
  /**
   * Mobile-scroll floor in pixels. Default 600 suits 10+ column tables
   * (players, period matrix). Tables with ≤5 short columns should pass a
   * smaller value (320) or `0` so they hug content and don't force scroll.
   */
  minWidth?: number;
}

/**
 * ThemedTable - Wraps shadcn Table with optional liquid-glass container.
 * Set `bare={true}` if already inside a glass container.
 * Set `density` for fine-grained control: "compact" | "default" | "comfortable".
 * Set `zebra={true}` for alternating row backgrounds.
 */
export function ThemedTable({ children, className = '', bare = false, density = "compact", zebra = false, caption, minWidth = 600, ...rest }: ThemedTableProps) {
  const zebraClass = zebra ? "lg-table" : "";
  const ariaLabel = rest['aria-label'];
  // `w-full` + `table-layout: fixed` together mean the table fills its
  // container AND columns with explicit widths keep them — unspecified
  // columns share the remainder evenly. This beats `table-layout: auto`
  // where one unconstrained column (e.g. Player Name) absorbs all leftover
  // space and dwarfs the stats next to it.
  const tableStyle: React.CSSProperties = { tableLayout: "fixed" };
  if (minWidth > 0) tableStyle.minWidth = `${minWidth}px`;

  const tableEl = (
    <table
      style={tableStyle}
      className={cn("w-full caption-bottom text-sm", zebraClass, bare ? className : "")}
      aria-label={ariaLabel}
    >
      {children}
      {caption && (
        <caption className="mt-2 text-[10px] text-[var(--lg-text-muted)] text-left px-1">
          {caption}
        </caption>
      )}
    </table>
  );

  return (
    <TableDensityProvider density={density}>
      {bare ? tableEl : (
        <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
          {tableEl}
        </div>
      )}
    </TableDensityProvider>
  );
}

interface ThemedTheadProps {
  children: React.ReactNode;
  className?: string;
  /** Pin header to top of scroll container */
  sticky?: boolean;
}

export function ThemedThead({ children, className = '', sticky = false }: ThemedTheadProps) {
  return (
    <TableHeader
      className={cn(
        sticky && 'sticky top-0 z-10 bg-[var(--lg-table-header-sticky-bg)] border-b border-[var(--lg-border-subtle)]',
        className
      )}
    >
      {children}
    </TableHeader>
  );
}

export function ThemedTbody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <TableBody className={className}>{children}</TableBody>;
}

interface ThemedThProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  onClick?: () => void;
  title?: string;
  /** Freeze this header cell to the left edge on horizontal scroll */
  frozen?: boolean;
  scope?: 'col' | 'row';
}

export function ThemedTh({ children, className = '', align = 'left', onClick, title, frozen = false, scope }: ThemedThProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align];

  return (
    <TableHead
      onClick={onClick}
      title={title}
      scope={scope}
      className={cn(
        alignClass,
        onClick && 'cursor-pointer hover:text-[var(--lg-accent)]',
        frozen && frozenThClass,
        className
      )}
    >
      {children}
    </TableHead>
  );
}

interface ThemedTrProps {
  children: React.ReactNode;
  className?: string;
  isOdd?: boolean;
  onClick?: () => void;
  /**
   * Optional ref forwarded to the underlying `<tr>`. Used by dnd-kit
   * (useDraggable / useDroppable need a stable DOM node). Kept narrow
   * and opt-in so existing callers don't pay a render-prop cost.
   */
  innerRef?: React.Ref<HTMLTableRowElement>;
  /** Additional HTML attrs (data-*, aria-*, role) merged onto the <tr>. */
  extraProps?: React.HTMLAttributes<HTMLTableRowElement>;
  /** Inline style — used for drag transforms / drop highlights. */
  style?: React.CSSProperties;
}

export function ThemedTr({
  children,
  className = '',
  onClick,
  innerRef,
  extraProps,
  style,
}: ThemedTrProps) {
  return (
    <TableRow
      ref={innerRef}
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer', className)}
      style={style}
      {...extraProps}
    >
      {children}
    </TableRow>
  );
}

interface ThemedTdProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  colSpan?: number;
  /** Freeze this cell to the left edge on horizontal scroll */
  frozen?: boolean;
}

export function ThemedTd({ children, className = '', align = 'left', colSpan, frozen = false }: ThemedTdProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align];

  return (
    <TableCell colSpan={colSpan} className={cn(alignClass, frozen && frozenTdClass, className)}>
      {children}
    </TableCell>
  );
}

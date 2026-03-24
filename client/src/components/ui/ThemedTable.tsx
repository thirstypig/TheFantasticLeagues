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

interface ThemedTableProps {
  children: React.ReactNode;
  className?: string;
  /** Set to true if this table is already inside a styled container */
  bare?: boolean;
  /** Table density tier: "compact" | "default" | "comfortable" */
  density?: TableDensity;
  /** Apply zebra striping (alternating row backgrounds) */
  zebra?: boolean;
}

/**
 * ThemedTable - Wraps shadcn Table with optional liquid-glass container.
 * Set `bare={true}` if already inside a glass container.
 * Set `density` for fine-grained control: "compact" | "default" | "comfortable".
 * Set `zebra={true}` for alternating row backgrounds.
 */
export function ThemedTable({ children, className = '', bare = false, density = "comfortable", zebra = false }: ThemedTableProps) {
  const zebraClass = zebra ? "lg-table" : "";

  const tableEl = (
    <table className={cn("w-full caption-bottom text-sm", zebraClass, bare ? className : "")}>
      {children}
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
}

export function ThemedTh({ children, className = '', align = 'left', onClick, title }: ThemedThProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align];

  return (
    <TableHead
      onClick={onClick}
      title={title}
      className={cn(
        alignClass,
        onClick && 'cursor-pointer hover:text-[var(--lg-accent)]',
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
}

export function ThemedTr({ children, className = '', onClick }: ThemedTrProps) {
  return (
    <TableRow
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer', className)}
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
}

export function ThemedTd({ children, className = '', align = 'left', colSpan }: ThemedTdProps) {
  const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' }[align];

  return (
    <TableCell colSpan={colSpan} className={cn(alignClass, className)}>
      {children}
    </TableCell>
  );
}

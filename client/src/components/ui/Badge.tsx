/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20",
        secondary:
          "bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)]",
        destructive:
          "bg-[var(--lg-error)] text-white shadow-lg shadow-red-500/20",
        success:
          "bg-[var(--lg-success)] text-white shadow-lg shadow-emerald-500/20",
        warning:
          "bg-[var(--lg-warning)] text-white shadow-lg shadow-amber-500/20",
        outline: "text-[var(--lg-text-primary)] border border-[var(--lg-border-subtle)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

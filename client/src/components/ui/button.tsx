import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all text-sm font-bold",
        destructive:
          "bg-[var(--lg-error)] text-white shadow-sm hover:brightness-110",
        outline:
          "liquid-glass border-[var(--lg-glass-border)] hover:bg-[var(--lg-glass-bg-hover)] text-[var(--lg-text-primary)] font-bold",
        secondary:
          "bg-[var(--lg-glass-bg)] text-[var(--lg-text-primary)] border border-[var(--lg-glass-border)] hover:bg-[var(--lg-glass-bg-hover)] font-bold",
        ghost: "hover:bg-[var(--lg-glass-bg-hover)] text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)] font-medium",
        link: "text-[var(--lg-accent)] underline-offset-4 hover:underline",
        amber: "bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 font-bold tracking-wide uppercase text-xs",
        emerald: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold tracking-wide uppercase text-xs",
        red: "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-bold tracking-wide uppercase text-xs",
      },
      size: {
        default: "h-11 px-6 py-2 rounded-2xl",
        sm: "h-9 rounded-xl px-4 text-xs",
        lg: "h-12 rounded-3xl px-10 text-base",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

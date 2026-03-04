import * as React from "react"
import { cn } from "@/lib/utils"

interface ToggleGroupProps {
  options: { label: string; value: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ToggleGroup({ options, value, onChange, className }: ToggleGroupProps) {
  return (
    <div className={cn("lg-card p-1 inline-flex gap-1 bg-[var(--lg-tint)] border-[var(--lg-border-subtle)]", className)}>
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-200",
              isActive
                ? "bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20"
                : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

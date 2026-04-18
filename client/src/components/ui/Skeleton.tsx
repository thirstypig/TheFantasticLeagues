/**
 * Skeleton — shimmer placeholder for loading states.
 * Respects prefers-reduced-motion (animation disabled via index.css).
 */

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--lg-tint-hover)] ${className}`}
      aria-hidden="true"
    />
  );
}

/** Full-page skeleton matching the common PageHeader + table layout */
export function PageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10" role="status" aria-label="Loading">
      {/* Header */}
      <div className="py-4 md:py-8 mb-4 md:mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      {/* Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

/** Card grid skeleton (for Home page sections) */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="lg-card p-6 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

export default Skeleton;

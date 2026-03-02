import { Skeleton } from '@/components/ui/skeleton'

export function ReportSkeleton() {
  return (
    <div className="space-y-4 motion-safe:animate-[section-in_0.4s_var(--ease-out)_both]">
      {/* Hairstyle card skeleton */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>

      {/* Eyebrow comparison skeleton */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>

      {/* Contouring guide skeleton */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Glasses card skeleton */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>

      {/* Insights skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>

      {/* Physiognomy skeleton */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  )
}

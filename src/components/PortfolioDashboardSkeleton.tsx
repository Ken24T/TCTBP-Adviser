import { Skeleton, SkeletonCard, SkeletonMetric, SkeletonText } from './primitives'

export function PortfolioDashboardSkeleton() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex flex-col lg:flex-row lg:items-end gap-6 justify-between">
        <div className="max-w-2xl">
          <Skeleton height="0.75rem" width="8rem" className="mb-2" />
          <Skeleton height="3.5rem" width="70%" className="mb-3" />
          <SkeletonText width="80%" />
        </div>
        <Skeleton height="2.5rem" width="8rem" />
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonMetric key={index} />
        ))}
      </section>

      <SkeletonCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <Skeleton height="2.75rem" width="100%" className="md:max-w-md" />
          <Skeleton height="2rem" width="60%" />
        </div>
        <Skeleton height="0.75rem" width="30%" />
      </SkeletonCard>

      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton height="0.75rem" width="6rem" />
          <Skeleton height="1.75rem" width="12rem" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <RepoCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RepoCardSkeleton() {
  return (
    <SkeletonCard className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <SkeletonText lines={2} className="flex-1" />
        <Skeleton height="1.5rem" width="4rem" className="shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <SkeletonText lines={2} />
        <SkeletonText lines={2} />
        <SkeletonText lines={2} />
      </div>
      <Skeleton height="4rem" width="100%" />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton height="1.25rem" width="4.5rem" />
        <Skeleton height="1.25rem" width="5.5rem" />
      </div>
      <Skeleton height="1.5rem" width="100%" />
      <Skeleton height="2rem" width="6rem" />
    </SkeletonCard>
  )
}

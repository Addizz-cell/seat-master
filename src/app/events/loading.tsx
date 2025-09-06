import { Skeleton } from "@/components/ui/skeleton";
import { EventGridSkeleton } from "@/components/events/EventGridSkeleton";

export default function EventsLoading() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Page Header Skeleton */}
      <div className="bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container py-8 md:py-12">
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
      </div>

      {/* Filters Skeleton */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur border-b">
        <div className="container py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-10 w-full max-w-md" />
            <div className="hidden md:flex gap-3">
              <Skeleton className="h-10 w-[160px]" />
              <Skeleton className="h-10 w-[160px]" />
            </div>
          </div>
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="container py-8 flex-1">
        <EventGridSkeleton count={12} />
      </div>
    </div>
  );
}

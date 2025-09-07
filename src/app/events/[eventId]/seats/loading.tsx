import { Skeleton } from "@/components/ui/skeleton";

export default function SeatsLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="w-9 h-9 rounded-md" />
            <div className="flex-1">
              <Skeleton className="w-48 h-5 mb-2" />
              <Skeleton className="w-64 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="container py-6">
        <div className="space-y-6">
          {/* Stage Skeleton */}
          <div className="flex justify-center">
            <Skeleton className="w-48 h-12 rounded-b-[100px]" />
          </div>

          {/* Legend Skeleton */}
          <div className="flex justify-center gap-4 py-4 border-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded" />
                <Skeleton className="w-16 h-4" />
              </div>
            ))}
          </div>

          {/* Sections Skeleton */}
          {Array.from({ length: 3 }).map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-3">
              <div className="flex items-center gap-4 px-4">
                <Skeleton className="w-24 h-4" />
                <div className="flex-1 h-px bg-border" />
                <Skeleton className="w-16 h-4" />
              </div>

              {/* Rows */}
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-4" />
                  <div className="flex gap-1.5 justify-center flex-1">
                    {Array.from({ length: 10 }).map((_, seatIndex) => (
                      <Skeleton
                        key={seatIndex}
                        className="w-10 h-10 rounded-t-lg"
                      />
                    ))}
                  </div>
                  <Skeleton className="w-8 h-4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function EventDetailLoading() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        {/* Back Button Skeleton */}
        <Skeleton className="h-9 w-32 mb-6" />

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Image Skeleton */}
            <div className="overflow-hidden rounded-xl">
              <AspectRatio ratio={16 / 9}>
                <Skeleton className="h-full w-full" />
              </AspectRatio>
            </div>

            {/* Title and Badges Skeleton */}
            <div>
              <div className="flex gap-2 mb-3">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-10 w-3/4" />
            </div>

            {/* Info Grid Skeleton */}
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-4 rounded-lg bg-muted/50">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                </div>
              ))}
            </div>

            {/* Separator */}
            <Skeleton className="h-px w-full" />

            {/* Description Skeleton */}
            <div>
              <Skeleton className="h-7 w-48 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>

          {/* Right Column - Sidebar Skeleton (Desktop) */}
          <div className="hidden lg:block">
            <Card>
              <CardHeader className="pb-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-3 w-16 ml-auto" />
                </div>
              </CardContent>
              <CardFooter>
                <Skeleton className="h-11 w-full" />
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar Skeleton */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-background border-t p-4">
        <div className="container flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-7 w-20" />
          </div>
          <Skeleton className="h-11 w-32" />
        </div>
      </div>

      {/* Spacer for mobile bottom bar */}
      <div className="h-24 lg:hidden" />
    </div>
  );
}

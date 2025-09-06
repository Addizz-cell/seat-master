import { Suspense } from "react";
import type { Metadata } from "next";
import { getEvents, getFilterFacets } from "@/lib/data";
import { EventFilters } from "@/components/events/EventFilters";
import { EventGrid } from "@/components/events/EventGrid";
import { EventGridSkeleton } from "@/components/events/EventGridSkeleton";
import { Pagination } from "@/components/events/Pagination";
import { EmptyState } from "@/components/events/EmptyState";
import type { EventCategory } from "@/types";

export const metadata: Metadata = {
  title: "Events",
  description: "Browse and book tickets for concerts, sports, theater, and more.",
};

interface EventsPageProps {
  searchParams: Promise<{
    query?: string;
    city?: string;
    category?: string;
    page?: string;
  }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 0;
  const filters = {
    query: params.query,
    city: params.city,
    category: params.category as EventCategory | undefined,
    page,
    limit: 12,
  };

  const hasFilters = !!(params.query || params.city || params.category);

  const [eventsData, facets] = await Promise.all([
    getEvents(filters),
    getFilterFacets(),
  ]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Page Header */}
      <div className="bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container py-8 md:py-12">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Browse Events
          </h1>
          <p className="mt-2 text-muted-foreground">
            Discover and book tickets for upcoming events
          </p>
        </div>
      </div>

      {/* Filters */}
      <EventFilters facets={facets} />

      {/* Events Grid */}
      <div className="container py-8 flex-1">
        <Suspense fallback={<EventGridSkeleton count={12} />}>
          {eventsData.items.length > 0 ? (
            <div className="space-y-8">
              <EventGrid events={eventsData.items} />
              <Pagination
                currentPage={eventsData.pagination.page}
                totalPages={eventsData.pagination.totalPages}
                total={eventsData.pagination.total}
                limit={eventsData.pagination.limit}
              />
            </div>
          ) : (
            <EmptyState hasFilters={hasFilters} />
          )}
        </Suspense>
      </div>
    </div>
  );
}

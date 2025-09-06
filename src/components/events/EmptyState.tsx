"use client";

import { useRouter } from "next/navigation";
import { CalendarX2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  hasFilters?: boolean;
}

export function EmptyState({ hasFilters = false }: EmptyStateProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-6 mb-6">
        <CalendarX2 className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No events found</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        {hasFilters
          ? "We couldn't find any events matching your filters. Try adjusting your search criteria."
          : "There are no events available at the moment. Check back soon for new listings!"}
      </p>
      {hasFilters && (
        <Button onClick={() => router.push("/events")} variant="outline">
          Clear all filters
        </Button>
      )}
    </div>
  );
}

"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FilterFacets } from "@/lib/data";
import type { EventCategory } from "@/types";

interface EventFiltersProps {
  facets: FilterFacets;
}

const categoryLabels: Record<EventCategory, string> = {
  CONCERT: "Concerts",
  SPORTS: "Sports",
  THEATER: "Theater",
  MOVIE: "Movies",
};

export function EventFilters({ facets }: EventFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const query = searchParams.get("query") || "";
  const city = searchParams.get("city") || "";
  const category = searchParams.get("category") || "";

  const activeFilterCount = [query, city, category].filter(Boolean).length;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset to page 0 when filters change
      params.delete("page");

      startTransition(() => {
        router.push(`/events?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.push("/events");
    });
  }, [router]);

  // Debounced search handler
  const handleSearch = useCallback(
    (value: string) => {
      const timeoutId = setTimeout(() => {
        updateParams({ query: value || null });
      }, 300);
      return () => clearTimeout(timeoutId);
    },
    [updateParams]
  );

  const FilterControls = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div
      className={cn(
        "flex gap-3",
        isMobile ? "flex-col" : "flex-row items-center"
      )}
    >
      {/* City Filter */}
      <Select
        value={city}
        onValueChange={(value) => updateParams({ city: value === "all" ? null : value })}
      >
        <SelectTrigger className={cn("w-full", !isMobile && "w-[160px]")}>
          <SelectValue placeholder="All Cities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cities</SelectItem>
          {facets.cities.map((c) => (
            <SelectItem key={c.city} value={c.city}>
              {c.city} ({c.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Category Filter */}
      <Select
        value={category}
        onValueChange={(value) => updateParams({ category: value === "all" ? null : value })}
      >
        <SelectTrigger className={cn("w-full", !isMobile && "w-[160px]")}>
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {facets.categories.map((c) => (
            <SelectItem key={c.category} value={c.category}>
              {categoryLabels[c.category]} ({c.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className={cn("gap-1", isMobile && "w-full")}
        >
          <X className="h-4 w-4" />
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "sticky top-16 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b transition-opacity",
        isPending && "opacity-70"
      )}
    >
      <div className="container py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search events..."
              defaultValue={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Desktop Filters */}
          <div className="hidden md:flex">
            <FilterControls />
          </div>

          {/* Mobile Filter Button */}
          <div className="flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="flex-1 gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto">
                <SheetHeader>
                  <SheetTitle>Filter Events</SheetTitle>
                </SheetHeader>
                <Separator className="my-4" />
                <FilterControls isMobile />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  );
}

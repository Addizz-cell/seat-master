"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, MapPin, Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SeatMap } from "@/components/seats/SeatMap";
import { SelectionSummary } from "@/components/seats/SelectionSummary";
import { useSeatUpdates } from "@/hooks/useSeatUpdates";
import type { SeatMapData, SeatStatus } from "@/types";

interface SeatSelectionClientProps {
  eventId: string;
  eventName: string;
  eventDate: Date;
  venueName: string;
  userId: string;
}

export function SeatSelectionClient({
  eventId,
  eventName,
  eventDate,
  venueName,
  userId,
}: SeatSelectionClientProps) {
  const router = useRouter();
  const [seatMapData, setSeatMapData] = useState<SeatMapData | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch seat map data
  const fetchSeatMap = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/seats`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to load seat map");
      }

      setSeatMapData(result.data);
    } catch (e) {
      console.error("[SeatSelectionClient] Error fetching seats:", e);
      setError(e instanceof Error ? e.message : "Failed to load seat map");
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  // Initial fetch
  useEffect(() => {
    fetchSeatMap();
  }, [fetchSeatMap]);

  // Handle real-time seat updates
  const handleSeatUpdate = useCallback(
    (
      updates: Array<{
        id: string;
        seatNumber: string;
        status: SeatStatus;
        previousStatus?: SeatStatus;
      }> | undefined
    ) => {
      if (!updates || !seatMapData) return;

      // Update seat map data with new statuses
      setSeatMapData((prev) => {
        if (!prev) return prev;

        const newSections = prev.sections.map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            seats: row.seats.map((seat) => {
              const update = updates.find((u) => u.id === seat.id);
              if (update) {
                return {
                  ...seat,
                  status: update.status,
                  isSelectable: update.status === "AVAILABLE",
                };
              }
              return seat;
            }),
          })),
        }));

        // Recalculate stats
        let availableSeats = 0;
        let reservedSeats = 0;
        let bookedSeats = 0;

        for (const section of newSections) {
          for (const row of section.rows) {
            for (const seat of row.seats) {
              if (seat.status === "AVAILABLE") availableSeats++;
              else if (seat.status === "RESERVED") reservedSeats++;
              else if (seat.status === "BOOKED") bookedSeats++;
            }
          }
        }

        return {
          ...prev,
          sections: newSections,
          stats: {
            ...prev.stats,
            availableSeats,
            reservedSeats,
            bookedSeats,
          },
        };
      });

      // Remove any selected seats that are no longer available
      for (const update of updates) {
        if (
          selectedSeats.has(update.id) &&
          update.status !== "AVAILABLE"
        ) {
          setSelectedSeats((prev) => {
            const next = new Set(prev);
            next.delete(update.id);
            return next;
          });
        }
      }
    },
    [seatMapData, selectedSeats]
  );

  // SSE connection for real-time updates
  const { isConnected, error: sseError, reconnect } = useSeatUpdates({
    eventId,
    enabled: !isLoading && !!seatMapData,
    onSeatUpdate: handleSeatUpdate,
    selectedSeats,
  });

  // Handle selection change
  const handleSelectionChange = useCallback((seats: Set<string>) => {
    setSelectedSeats(seats);
  }, []);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedSeats(new Set());
  }, []);

  // Continue to checkout
  const handleContinue = useCallback(async () => {
    if (selectedSeats.size === 0) return;

    setIsProcessing(true);

    try {
      // Store selected seats and navigate to checkout
      const seatIds = Array.from(selectedSeats).join(",");
      router.push(`/events/${eventId}/checkout?seats=${seatIds}`);
    } catch (e) {
      console.error("[SeatSelectionClient] Error navigating to checkout:", e);
      toast.error("Failed to proceed to checkout");
      setIsProcessing(false);
    }
  }, [selectedSeats, eventId, router]);

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            {/* Back Button */}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/events/${eventId}`}>
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to event</span>
              </Link>
            </Button>

            {/* Event Info */}
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold truncate">{eventName}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(eventDate)} at {formatTime(eventDate)}
                </span>
                <span className="hidden sm:flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {venueName}
                </span>
              </div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {sseError ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reconnect}
                  className="text-destructive"
                >
                  <WifiOff className="h-4 w-4 mr-1" />
                  Reconnect
                </Button>
              ) : isConnected ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                  <span className="hidden sm:inline">Live</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="hidden sm:inline">Connecting...</span>
                </span>
              )}

              {/* Refresh Button */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={fetchSeatMap}
                disabled={isLoading}
                className="text-muted-foreground"
              >
                <RefreshCw
                  className={cn("h-4 w-4", isLoading && "animate-spin")}
                />
                <span className="sr-only">Refresh seat map</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchSeatMap}>Try Again</Button>
          </div>
        ) : isLoading ? (
          <SeatMapSkeleton />
        ) : seatMapData ? (
          <SeatMap
            data={seatMapData}
            selectedSeats={selectedSeats}
            onSelectionChange={handleSelectionChange}
          />
        ) : null}
      </div>

      {/* Selection Summary Footer */}
      {seatMapData && (
        <SelectionSummary
          data={seatMapData}
          selectedSeats={selectedSeats}
          onClearSelection={handleClearSelection}
          onContinue={handleContinue}
          isLoading={isProcessing}
        />
      )}
    </div>
  );
}

function SeatMapSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stage Skeleton */}
      <div className="flex justify-center">
        <Skeleton className="w-48 h-12 rounded-b-[100px]" />
      </div>

      {/* Legend Skeleton */}
      <div className="flex justify-center gap-4 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="w-16 h-4" />
          </div>
        ))}
      </div>

      {/* Sections Skeleton */}
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="space-y-3">
          <div className="flex items-center gap-4 px-4">
            <Skeleton className="w-24 h-4" />
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Rows */}
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex items-center gap-3">
              <Skeleton className="w-8 h-4" />
              <div className="flex gap-1.5 justify-center flex-1">
                {Array.from({ length: 12 }).map((_, seatIndex) => (
                  <Skeleton key={seatIndex} className="w-10 h-10 rounded-t-lg" />
                ))}
              </div>
              <Skeleton className="w-8 h-4" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

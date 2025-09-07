"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Seat } from "./Seat";
import { SeatLegend } from "./SeatLegend";
import type { SeatMapData, SeatMapSeat } from "@/types";

const MAX_SELECTION = 10;

interface SeatMapProps {
  data: SeatMapData;
  selectedSeats: Set<string>;
  onSelectionChange: (seats: Set<string>) => void;
  className?: string;
}

export function SeatMap({
  data,
  selectedSeats,
  onSelectionChange,
  className,
}: SeatMapProps) {
  const handleSeatSelect = useCallback(
    (seatId: string) => {
      const newSelection = new Set(selectedSeats);

      if (newSelection.has(seatId)) {
        // Deselect
        newSelection.delete(seatId);
      } else {
        // Check max selection limit
        if (newSelection.size >= MAX_SELECTION) {
          toast.error(`Maximum ${MAX_SELECTION} seats allowed`, {
            description: "Please deselect a seat before selecting another.",
          });
          return;
        }
        // Select
        newSelection.add(seatId);
      }

      onSelectionChange(newSelection);
    },
    [selectedSeats, onSelectionChange]
  );

  // Get all seats flattened for lookup
  const seatsById = useMemo(() => {
    const map = new Map<string, SeatMapSeat>();
    for (const section of data.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          map.set(seat.id, seat);
        }
      }
    }
    return map;
  }, [data]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Stage */}
      <div className="flex justify-center">
        <div className="relative px-16 py-4 rounded-b-[100px] bg-gradient-to-b from-muted to-muted/50 border-x-2 border-b-2 border-muted-foreground/20">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            Stage
          </span>
          {/* Stage lighting effect */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-8 bg-gradient-to-b from-primary/20 to-transparent rounded-full blur-xl" />
        </div>
      </div>

      {/* Legend */}
      <SeatLegend className="justify-center py-4 border-y" />

      {/* Seat Map Container - Scrollable on mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="min-w-fit mx-auto space-y-8">
          {data.sections.map((section) => (
            <div key={section.section} className="space-y-3">
              {/* Section Header */}
              <div className="flex items-center gap-4 px-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {section.section}
                </h3>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {section.seatType}
                </span>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <div
                    key={`${section.section}-${row.row}`}
                    className="flex items-center gap-3"
                  >
                    {/* Row Label */}
                    <div className="w-8 text-center">
                      <span className="text-sm font-medium text-muted-foreground">
                        {row.row}
                      </span>
                    </div>

                    {/* Seats */}
                    <div className="flex gap-1.5 justify-center flex-1">
                      {row.seats.map((seat, index) => {
                        // Add gap in the middle (aisle simulation)
                        const middleIndex = Math.floor(row.seats.length / 2);
                        const hasAisle = index === middleIndex && row.seats.length > 6;

                        return (
                          <div
                            key={seat.id}
                            className={cn("flex", hasAisle && "ml-4")}
                          >
                            <Seat
                              id={seat.id}
                              seatNumber={seat.seatNumber}
                              status={seat.status}
                              seatType={seat.seatType}
                              price={seat.price}
                              isSelected={selectedSeats.has(seat.id)}
                              onSelect={handleSeatSelect}
                              disabled={!seat.isSelectable}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Row Label (mirror) */}
                    <div className="w-8 text-center">
                      <span className="text-sm font-medium text-muted-foreground">
                        {row.row}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-6 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{data.stats.availableSeats}</strong> available
        </span>
        <span>
          <strong className="text-foreground">{data.stats.reservedSeats}</strong> reserved
        </span>
        <span>
          <strong className="text-foreground">{data.stats.bookedSeats}</strong> booked
        </span>
      </div>
    </div>
  );
}

export { MAX_SELECTION };

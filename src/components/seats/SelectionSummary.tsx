"use client";

import { useMemo } from "react";
import { ShoppingCart, ArrowRight, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SeatMapData, SeatMapSeat } from "@/types";

interface SelectionSummaryProps {
  data: SeatMapData;
  selectedSeats: Set<string>;
  onClearSelection: () => void;
  onContinue: () => void;
  isLoading?: boolean;
  className?: string;
}

export function SelectionSummary({
  data,
  selectedSeats,
  onClearSelection,
  onContinue,
  isLoading = false,
  className,
}: SelectionSummaryProps) {
  // Get selected seat details and calculate total
  const { selectedSeatDetails, totalPrice } = useMemo(() => {
    const details: SeatMapSeat[] = [];
    let total = 0;

    for (const section of data.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (selectedSeats.has(seat.id)) {
            details.push(seat);
            total += parseFloat(seat.price);
          }
        }
      }
    }

    // Sort by seat number for consistent display
    details.sort((a, b) => a.seatNumber.localeCompare(b.seatNumber));

    return { selectedSeatDetails: details, totalPrice: total };
  }, [data, selectedSeats]);

  const hasSelection = selectedSeats.size > 0;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300",
        hasSelection ? "translate-y-0" : "translate-y-full",
        className
      )}
    >
      <div className="bg-background border-t shadow-lg">
        <div className="container py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Left - Selection Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {selectedSeats.size} {selectedSeats.size === 1 ? "seat" : "seats"} selected
                </span>
                {hasSelection && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-muted-foreground hover:text-destructive"
                    onClick={onClearSelection}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Seat List - Scrollable */}
              {hasSelection && (
                <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                  {selectedSeatDetails.map((seat) => (
                    <Badge
                      key={seat.id}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {seat.seatNumber}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Center - Total Price */}
            <div className="sm:text-center shrink-0">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{formatCurrency(totalPrice)}</div>
            </div>

            {/* Right - Continue Button */}
            <div className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2"
                onClick={onContinue}
                disabled={!hasSelection || isLoading}
              >
                {isLoading ? (
                  "Processing..."
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

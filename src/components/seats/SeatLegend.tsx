"use client";

import { cn } from "@/lib/utils";

interface LegendItem {
  label: string;
  className: string;
  pattern?: "x" | "dot";
}

const legendItems: LegendItem[] = [
  {
    label: "Available",
    className: "bg-muted border-2 border-muted-foreground/20",
  },
  {
    label: "Selected",
    className: "bg-primary border-2 border-primary",
  },
  {
    label: "Reserved",
    className: "bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400/50 opacity-70",
  },
  {
    label: "Booked",
    className: "bg-muted/50 border-2 border-muted-foreground/10 opacity-50",
    pattern: "x",
  },
  {
    label: "Blocked",
    className: "bg-red-100 dark:bg-red-900/30 border-2 border-red-400/50 opacity-50",
    pattern: "dot",
  },
];

const seatTypeItems = [
  {
    label: "VIP",
    className: "ring-2 ring-amber-400 ring-offset-1",
  },
  {
    label: "Premium",
    className: "ring-2 ring-slate-400 ring-offset-1",
  },
];

interface SeatLegendProps {
  className?: string;
  showSeatTypes?: boolean;
}

export function SeatLegend({ className, showSeatTypes = true }: SeatLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-3 text-sm",
        className
      )}
    >
      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className={cn(
                "relative w-5 h-5 rounded-t-md flex items-center justify-center",
                item.className
              )}
            >
              {item.pattern === "x" && (
                <>
                  <div className="absolute w-full h-0.5 bg-muted-foreground/30 rotate-45" />
                  <div className="absolute w-full h-0.5 bg-muted-foreground/30 -rotate-45" />
                </>
              )}
              {item.pattern === "dot" && (
                <div className="w-2 h-2 rounded-full bg-red-500/50" />
              )}
            </div>
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Seat Type Legend */}
      {showSeatTypes && (
        <>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {seatTypeItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-5 h-5 rounded-t-md bg-muted border-2 border-muted-foreground/20",
                    item.className
                  )}
                />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

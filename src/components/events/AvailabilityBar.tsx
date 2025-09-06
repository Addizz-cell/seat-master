import { cn } from "@/lib/utils";

interface AvailabilityBarProps {
  totalSeats: number;
  availableSeats: number;
  soldPercentage: number;
  showLabel?: boolean;
  className?: string;
}

export function AvailabilityBar({
  totalSeats,
  availableSeats,
  soldPercentage,
  showLabel = true,
  className,
}: AvailabilityBarProps) {
  const isLowAvailability = soldPercentage >= 80;
  const isAlmostSoldOut = soldPercentage >= 95;

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Availability</span>
          <span
            className={cn(
              "font-medium",
              isAlmostSoldOut && "text-destructive",
              isLowAvailability && !isAlmostSoldOut && "text-warning"
            )}
          >
            {availableSeats.toLocaleString()} of {totalSeats.toLocaleString()} seats left
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-500",
            isAlmostSoldOut
              ? "bg-destructive"
              : isLowAvailability
              ? "bg-warning"
              : "bg-primary"
          )}
          style={{ width: `${soldPercentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-muted-foreground text-right">
          {soldPercentage}% sold
        </p>
      )}
    </div>
  );
}

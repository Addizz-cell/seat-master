"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Accessibility, Star, Sparkles } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SeatStatus, SeatType } from "@/types";

const seatVariants = cva(
  "relative flex items-center justify-center rounded-t-lg text-xs font-medium transition-all duration-200 select-none",
  {
    variants: {
      status: {
        AVAILABLE:
          "bg-muted border-2 border-muted-foreground/20 hover:border-primary hover:bg-primary/10 cursor-pointer",
        SELECTED:
          "bg-primary text-primary-foreground border-2 border-primary scale-105 cursor-pointer shadow-md",
        RESERVED:
          "bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400/50 cursor-not-allowed opacity-70",
        BOOKED:
          "bg-muted/50 border-2 border-muted-foreground/10 cursor-not-allowed opacity-50",
        BLOCKED:
          "bg-red-100 dark:bg-red-900/30 border-2 border-red-400/50 cursor-not-allowed opacity-50",
      },
      seatType: {
        VIP: "ring-2 ring-amber-400 ring-offset-1",
        PREMIUM: "ring-2 ring-slate-400 ring-offset-1",
        REGULAR: "",
        ACCESSIBLE: "",
      },
      size: {
        sm: "w-8 h-8 text-[10px]",
        default: "w-10 h-10 text-xs",
        lg: "w-12 h-12 text-sm",
      },
    },
    defaultVariants: {
      status: "AVAILABLE",
      seatType: "REGULAR",
      size: "default",
    },
  }
);

interface SeatProps extends VariantProps<typeof seatVariants> {
  id: string;
  seatNumber: string;
  status: SeatStatus;
  seatType: SeatType;
  price: string;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

const seatTypeLabels: Record<SeatType, string> = {
  VIP: "VIP",
  PREMIUM: "Premium",
  REGULAR: "Standard",
  ACCESSIBLE: "Accessible",
};

export function Seat({
  id,
  seatNumber,
  status,
  seatType,
  price,
  isSelected = false,
  onSelect,
  disabled = false,
  size,
  className,
}: SeatProps) {
  const effectiveStatus = isSelected ? "SELECTED" : status;
  const isClickable = status === "AVAILABLE" && !disabled;

  const handleClick = () => {
    if (isClickable && onSelect) {
      onSelect(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && isClickable && onSelect) {
      e.preventDefault();
      onSelect(id);
    }
  };

  const seatContent = (
    <div
      role="button"
      tabIndex={isClickable ? 0 : -1}
      aria-label={`Seat ${seatNumber}, ${seatTypeLabels[seatType]}, ${formatCurrency(price)}, ${status.toLowerCase()}`}
      aria-pressed={isSelected}
      aria-disabled={!isClickable}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        seatVariants({ status: effectiveStatus, seatType, size }),
        className
      )}
    >
      {/* Seat Number */}
      <span className="relative z-10">{seatNumber.replace(/^[A-Z]+/, "")}</span>

      {/* Seat Type Indicators */}
      {seatType === "VIP" && (
        <Star className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 fill-amber-500" />
      )}
      {seatType === "PREMIUM" && (
        <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-slate-500" />
      )}
      {seatType === "ACCESSIBLE" && (
        <Accessibility className="absolute -top-1 -right-1 h-3 w-3 text-blue-500" />
      )}

      {/* Booked X Pattern */}
      {status === "BOOKED" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute w-full h-0.5 bg-muted-foreground/30 rotate-45" />
          <div className="absolute w-full h-0.5 bg-muted-foreground/30 -rotate-45" />
        </div>
      )}

      {/* Blocked Pattern */}
      {status === "BLOCKED" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
        </div>
      )}
    </div>
  );

  // Wrap with tooltip for more info
  return (
    <Tooltip>
      <TooltipTrigger asChild>{seatContent}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">Seat {seatNumber}</div>
        <div className="text-muted-foreground">
          {seatTypeLabels[seatType]} &bull; {formatCurrency(price)}
        </div>
        {status !== "AVAILABLE" && !isSelected && (
          <div className="text-muted-foreground capitalize">
            {status.toLowerCase().replace("_", " ")}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export { seatVariants };

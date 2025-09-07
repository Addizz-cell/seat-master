"use client";

import { useState } from "react";
import { Calendar, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { SeatType } from "@/types";

interface SeatInfo {
  id: string;
  seatNumber: string;
  row: string;
  section: string;
  seatType: SeatType;
  price: string;
}

interface EventInfo {
  id: string;
  name: string;
  eventDate: Date;
  venueName: string;
  venueCity: string;
}

interface OrderSummaryProps {
  event: EventInfo;
  seats: SeatInfo[];
  showServiceFee?: boolean;
  serviceFeeRate?: number;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const seatTypeLabels: Record<SeatType, string> = {
  VIP: "VIP Section",
  PREMIUM: "Premium Section",
  REGULAR: "Standard Section",
  ACCESSIBLE: "Accessible Section",
};

export function OrderSummary({
  event,
  seats,
  showServiceFee = true,
  serviceFeeRate = 0.05,
  className,
  collapsible = false,
  defaultCollapsed = false,
}: OrderSummaryProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const subtotal = seats.reduce((sum, seat) => sum + parseFloat(seat.price), 0);
  const serviceFee = showServiceFee ? subtotal * serviceFeeRate : 0;
  const total = subtotal + serviceFee;

  const content = (
    <>
      {/* Event Details */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {/* Event Thumbnail */}
          <div className="shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary/40">
              {event.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate">{event.name}</h3>
            <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {formatDate(event.eventDate)} at {formatTime(event.eventDate)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span>
                  {event.venueName}, {event.venueCity}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Seat List */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          Selected Seats ({seats.length})
        </h4>
        <div className="space-y-2">
          {seats.map((seat) => (
            <div
              key={seat.id}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {seat.seatNumber}
                </Badge>
                <span className="text-muted-foreground">
                  {seatTypeLabels[seat.seatType]}
                </span>
              </div>
              <span className="font-medium">{formatCurrency(seat.price)}</span>
            </div>
          ))}
        </div>
      </div>

      <Separator className="my-4" />

      {/* Price Breakdown */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {showServiceFee && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Service Fee ({(serviceFeeRate * 100).toFixed(0)}%)
            </span>
            <span>{formatCurrency(serviceFee)}</span>
          </div>
        )}

        <Separator className="my-2 border-dashed" />

        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    </>
  );

  if (collapsible) {
    return (
      <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
        <Card className={cn("overflow-hidden", className)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Order Summary</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{formatCurrency(total)}</span>
                  {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">{content}</CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Order Summary</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

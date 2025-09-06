"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PriceRange } from "./PriceRange";
import { AvailabilityBar } from "./AvailabilityBar";
import { CountdownTimer } from "./CountdownTimer";
import { formatDate, formatTime } from "@/lib/utils";
import type { EventStats } from "@/lib/data";
import type { EventStatus } from "@/types";

interface EventDetailSidebarProps {
  eventId: string;
  status: EventStatus;
  stats: EventStats;
  saleStartTime: Date;
}

export function EventDetailSidebar({
  eventId,
  status,
  stats,
  saleStartTime,
}: EventDetailSidebarProps) {
  const isUpcoming = status === "UPCOMING";
  const isSoldOut = status === "SOLD_OUT";
  const isCancelled = status === "CANCELLED";
  const isOnSale = status === "ON_SALE";

  // Check if sale starts within 24 hours
  const saleStartDate = new Date(saleStartTime);
  const now = new Date();
  const hoursUntilSale = (saleStartDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const showCountdown = isUpcoming && hoursUntilSale > 0 && hoursUntilSale <= 24;

  return (
    <Card className="sticky top-24">
      <CardHeader className="pb-4">
        <PriceRange
          minPrice={stats.minPrice}
          maxPrice={stats.maxPrice}
        />
        {stats.minPrice && stats.maxPrice && stats.minPrice !== stats.maxPrice && (
          <p className="text-sm text-muted-foreground">per ticket</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Availability */}
        {!isCancelled && stats.totalSeats > 0 && (
          <AvailabilityBar
            totalSeats={stats.totalSeats}
            availableSeats={stats.availableSeats}
            soldPercentage={stats.soldPercentage}
          />
        )}

        {/* Upcoming event info */}
        {isUpcoming && (
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">Sales start</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(saleStartTime)} at {formatTime(saleStartTime)}
            </p>
            {showCountdown && (
              <div className="pt-2">
                <CountdownTimer targetDate={saleStartDate} />
              </div>
            )}
          </div>
        )}

        {/* Sold out alert */}
        {isSoldOut && (
          <Alert>
            <AlertDescription>
              This event is sold out. Join the waitlist to be notified if tickets become available.
            </AlertDescription>
          </Alert>
        )}

        {/* Cancelled alert */}
        {isCancelled && (
          <Alert variant="destructive">
            <AlertDescription>
              This event has been cancelled. If you purchased tickets, a refund will be processed automatically.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3">
        {isOnSale && (
          <Button asChild className="w-full" size="lg">
            <Link href={`/events/${eventId}/seats`}>Select Seats</Link>
          </Button>
        )}

        {isUpcoming && (
          <Button disabled className="w-full" size="lg">
            Coming Soon
          </Button>
        )}

        {isSoldOut && (
          <>
            <Button disabled className="w-full" size="lg">
              Sold Out
            </Button>
            <Button variant="outline" className="w-full gap-2">
              <Bell className="h-4 w-4" />
              Notify Me
            </Button>
          </>
        )}

        {isCancelled && (
          <Button disabled variant="destructive" className="w-full" size="lg">
            Event Cancelled
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

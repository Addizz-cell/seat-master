"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Ticket,
  Calendar,
  MapPin,
  Download,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn, formatDate, formatTime, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingStatus, PaymentStatus, SeatType, EventCategory } from "@/types";

type FilterTab = "all" | "upcoming" | "past" | "cancelled";

interface BookingData {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  createdAt: string;
  event: {
    id: string;
    name: string;
    eventDate: string;
    venueName: string;
    venueCity: string;
    category: EventCategory;
  };
  seats: {
    seatNumber: string;
    section: string;
    seatType: SeatType;
  }[];
}

interface BookingsClientProps {
  bookings: BookingData[];
  counts: {
    all: number;
    upcoming: number;
    past: number;
    cancelled: number;
  };
}

const statusConfig: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  REFUNDED: {
    label: "Refunded",
    className: "bg-muted text-muted-foreground border-muted",
  },
  FAILED: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

const categoryGradients: Record<EventCategory, string> = {
  CONCERT: "from-purple-500 to-pink-500",
  SPORTS: "from-green-500 to-emerald-500",
  THEATER: "from-amber-500 to-orange-500",
  MOVIE: "from-blue-500 to-cyan-500",
};

export function BookingsClient({ bookings, counts }: BookingsClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const now = useMemo(() => new Date(), []);

  const filteredBookings = useMemo(() => {
    switch (activeTab) {
      case "upcoming":
        return bookings.filter(
          (b) => new Date(b.event.eventDate) > now && b.status === "CONFIRMED"
        );
      case "past":
        return bookings.filter(
          (b) => new Date(b.event.eventDate) <= now && b.status === "CONFIRMED"
        );
      case "cancelled":
        return bookings.filter(
          (b) => b.status === "CANCELLED" || b.status === "REFUNDED"
        );
      default:
        return bookings;
    }
  }, [bookings, activeTab, now]);

  const getEmptyMessage = () => {
    switch (activeTab) {
      case "upcoming":
        return "No upcoming bookings";
      case "past":
        return "No past bookings";
      case "cancelled":
        return "No cancelled bookings";
      default:
        return "No bookings yet";
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">My Bookings</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your ticket bookings
          </p>
        </div>

        {/* Filter Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as FilterTab)}
          className="mb-6"
        >
          <TabsList>
            <TabsTrigger value="all" className="gap-2">
              All
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {counts.all}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-2">
              Upcoming
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {counts.upcoming}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="past" className="gap-2">
              Past
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {counts.past}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-2">
              Cancelled
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {counts.cancelled}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
          <EmptyState message={getEmptyMessage()} showCTA={activeTab === "all"} />
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingCard({ booking }: { booking: BookingData }) {
  const status = statusConfig[booking.status];
  const gradient = categoryGradients[booking.event.category];
  const isPast = new Date(booking.event.eventDate) <= new Date();
  const isConfirmed = booking.status === "CONFIRMED";

  // Format seats summary
  const seatsSummary = useMemo(() => {
    const seatNumbers = booking.seats.map((s) => s.seatNumber).join(", ");
    const seatTypes = [...new Set(booking.seats.map((s) => s.seatType))];
    const typeLabel =
      seatTypes.length === 1
        ? seatTypes[0] === "VIP"
          ? "VIP"
          : seatTypes[0] === "PREMIUM"
          ? "Premium"
          : seatTypes[0] === "ACCESSIBLE"
          ? "Accessible"
          : "Standard"
        : "Mixed";
    return `${booking.seats.length} ${booking.seats.length === 1 ? "seat" : "seats"}: ${seatNumbers} (${typeLabel})`;
  }, [booking.seats]);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Event Thumbnail */}
          <Link
            href={`/events/${booking.event.id}`}
            className="shrink-0 sm:w-32 h-24 sm:h-auto relative"
          >
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-gradient-to-br",
                gradient,
                isPast && "opacity-60"
              )}
            >
              <span className="text-3xl font-bold text-white/30">
                {booking.event.name.charAt(0).toUpperCase()}
              </span>
            </div>
          </Link>

          {/* Booking Details */}
          <div className="flex-1 p-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0">
              {/* Event Name + Status */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link
                  href={`/events/${booking.event.id}`}
                  className="font-semibold truncate hover:text-primary transition-colors"
                >
                  {booking.event.name}
                </Link>
                <Badge
                  variant="outline"
                  className={cn("shrink-0 text-xs", status.className)}
                >
                  {status.label}
                </Badge>
              </div>

              {/* Date and Venue */}
              <div className="text-sm text-muted-foreground space-y-0.5 mb-2">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {formatDate(booking.event.eventDate)} at{" "}
                    {formatTime(booking.event.eventDate)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>
                    {booking.event.venueName}, {booking.event.venueCity}
                  </span>
                </div>
              </div>

              {/* Booking Reference */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <Ticket className="h-3 w-3" />
                <span className="font-mono">{booking.bookingReference}</span>
              </div>

              {/* Seats Summary */}
              <p className="text-sm">{seatsSummary}</p>
            </div>

            {/* Right Side - Amount + Actions */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l sm:pl-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">
                  {formatCurrency(booking.totalAmount)}
                </p>
              </div>
              <div className="flex gap-2">
                {isConfirmed && !isPast && (
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link href={`/bookings/${booking.id}`}>
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Tickets</span>
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-1" asChild>
                  <Link href={`/bookings/${booking.id}`}>
                    Details
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  message,
  showCTA,
}: {
  message: string;
  showCTA: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{message}</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {showCTA
          ? "Start exploring events and book your first tickets today!"
          : "Check other tabs to see your bookings."}
      </p>
      {showCTA && (
        <Button asChild>
          <Link href="/events">Browse Events</Link>
        </Button>
      )}
    </div>
  );
}

export function BookingsLoadingSkeleton() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        <Skeleton className="h-9 w-48 mb-2" />
        <Skeleton className="h-5 w-64 mb-6" />
        <Skeleton className="h-10 w-full max-w-md mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  <Skeleton className="h-24 sm:h-32 sm:w-32" />
                  <div className="flex-1 p-4">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2 mb-1" />
                    <Skeleton className="h-4 w-2/3 mb-2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

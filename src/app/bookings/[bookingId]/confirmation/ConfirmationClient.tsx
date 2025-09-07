"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Download,
  Copy,
  Check,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatTime, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { SeatType, BookingStatus } from "@/types";

interface BookingData {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  totalAmount: string;
  createdAt: string;
  event: {
    id: string;
    name: string;
    eventDate: string;
    venueName: string;
    venueCity: string;
  };
  seats: {
    id: string;
    seatNumber: string;
    row: string;
    section: string;
    seatType: SeatType;
    price: string;
  }[];
  userEmail: string;
}

interface ConfirmationClientProps {
  booking: BookingData;
}

export function ConfirmationClient({ booking }: ConfirmationClientProps) {
  const [copied, setCopied] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);

  const isConfirmed = booking.status === "CONFIRMED";

  // Show initial animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAnimation(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(booking.bookingReference);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          {/* Success Header with Animation */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4 relative">
              {/* Animated success icon */}
              <div
                className={cn(
                  "rounded-full bg-green-500/10 p-4 transition-all duration-500",
                  showAnimation && "animate-bounce"
                )}
              >
                <CheckCircle
                  className={cn(
                    "h-12 w-12 text-green-500 transition-transform duration-500",
                    showAnimation && "scale-110"
                  )}
                />
              </div>
              {/* Confetti-like decoration */}
              {isConfirmed && (
                <div className="absolute -top-2 -right-2">
                  <PartyPopper
                    className={cn(
                      "h-6 w-6 text-amber-500 transition-all duration-700",
                      showAnimation ? "opacity-100 rotate-12" : "opacity-0"
                    )}
                  />
                </div>
              )}
            </div>

            <h1
              className={cn(
                "text-3xl font-bold mb-2 transition-all duration-500",
                showAnimation && "animate-pulse"
              )}
            >
              {isConfirmed ? "Booking Confirmed!" : "Payment Processing"}
            </h1>
            <p className="text-muted-foreground">
              {isConfirmed
                ? "Your tickets have been booked successfully."
                : "Your payment is being processed. You'll receive a confirmation email shortly."}
            </p>

            {/* Copyable Booking Reference */}
            <button
              onClick={copyReference}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors group cursor-pointer"
            >
              <Ticket className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Booking Reference:{" "}
                <span className="font-mono">{booking.bookingReference}</span>
              </span>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>

          {/* Booking Details Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Event Details</span>
                <Badge
                  variant={isConfirmed ? "default" : "secondary"}
                  className={cn(
                    isConfirmed &&
                      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                  )}
                >
                  {isConfirmed ? "Confirmed" : "Processing"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Event Info */}
              <Link
                href={`/events/${booking.event.id}`}
                className="flex gap-4 group"
              >
                <div className="shrink-0 w-20 h-20 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 transition-colors">
                  <span className="text-3xl font-bold text-primary/40">
                    {booking.event.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {booking.event.name}
                  </h3>
                  <div className="text-sm text-muted-foreground space-y-1 mt-1">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(booking.event.eventDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatTime(booking.event.eventDate)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {booking.event.venueName}, {booking.event.venueCity}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              <Separator />

              {/* Seats */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3">
                  Your Seats ({booking.seats.length})
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {booking.seats.map((seat) => (
                    <div
                      key={seat.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {seat.seatNumber}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {seat.section}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {formatCurrency(seat.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Total */}
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total Paid</span>
                <span className="text-2xl font-bold">
                  {formatCurrency(booking.totalAmount)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="gap-2" asChild>
              <Link href="/bookings">
                <Ticket className="h-4 w-4" />
                View My Bookings
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/events">Browse More Events</Link>
            </Button>
          </div>

          {/* Download Tickets */}
          {isConfirmed && (
            <div className="mt-4">
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href={`/bookings/${booking.id}`}>
                  <Download className="h-4 w-4" />
                  Download Tickets
                </Link>
              </Button>
            </div>
          )}

          {/* Info Text */}
          <div className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <p>
              A confirmation email has been sent to{" "}
              <span className="font-medium text-foreground">
                {booking.userEmail}
              </span>{" "}
              with your tickets attached. Please bring your tickets (digital or
              printed) to the event venue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

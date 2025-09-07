import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  CreditCard,
  Download,
  QrCode,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import prisma from "@/lib/db";
import { formatDate, formatTime, formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { BookingStatus, SeatType } from "@/types";

interface BookingDetailPageProps {
  params: Promise<{ bookingId: string }>;
}

const statusConfig: Record<
  BookingStatus,
  { label: string; className: string; icon: typeof CheckCircle }
> = {
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    icon: CheckCircle,
  },
  PENDING: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    icon: AlertCircle,
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
  REFUNDED: {
    label: "Refunded",
    className: "bg-muted text-muted-foreground border-muted",
    icon: XCircle,
  },
  FAILED: {
    label: "Failed",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

const seatTypeLabels: Record<SeatType, string> = {
  VIP: "VIP",
  PREMIUM: "Premium",
  REGULAR: "Standard",
  ACCESSIBLE: "Accessible",
};

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { bookingId } = await params;

  // Check for user authentication
  const cookieStore = await cookies();
  const userId = cookieStore.get("user-id")?.value;

  if (!userId) {
    redirect(`/login?redirect=/bookings/${bookingId}`);
  }

  // Fetch booking with related data
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: true,
      bookingSeats: {
        include: {
          seat: true,
        },
      },
    },
  });

  if (!booking) {
    notFound();
  }

  // Verify user owns this booking
  if (booking.userId !== userId) {
    redirect("/bookings");
  }

  const status = statusConfig[booking.status];
  const StatusIcon = status.icon;
  const isConfirmed = booking.status === "CONFIRMED";
  const isPast = new Date(booking.event.eventDate) <= new Date();
  const canCancel = isConfirmed && !isPast;

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
          <Link href="/bookings">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to My Bookings
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Booking Header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold font-mono">
                  {booking.bookingReference}
                </h1>
                <Badge
                  variant="outline"
                  className={cn("flex items-center gap-1", status.className)}
                >
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Booked on {formatDate(booking.createdAt)}
              </p>
            </div>

            {/* Event Card */}
            <Card>
              <CardHeader>
                <CardTitle>Event Details</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/events/${booking.event.id}`}
                  className="flex gap-4 group"
                >
                  <div className="shrink-0 w-24 h-24 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:from-primary/30 transition-colors">
                    <span className="text-3xl font-bold text-primary/40">
                      {booking.event.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                      {booking.event.name}
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(booking.event.eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {formatTime(booking.event.eventDate)} (Doors:{" "}
                          {formatTime(booking.event.doorsOpenAt)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>
                          {booking.event.venueName}, {booking.event.venueAddress},{" "}
                          {booking.event.venueCity}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>

            {/* Tickets Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="h-5 w-5" />
                  Your Tickets ({booking.bookingSeats.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {booking.bookingSeats.map(({ seat, priceAtBooking }) => (
                    <div
                      key={seat.id}
                      className="relative border rounded-lg p-4 overflow-hidden"
                    >
                      {/* Ticket perforation effect */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-background rounded-r-full border-r border-y" />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-6 bg-background rounded-l-full border-l border-y" />

                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-2xl font-bold font-mono">
                            {seat.seatNumber}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {seat.section} · Row {seat.row}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {seatTypeLabels[seat.seatType]}
                        </Badge>
                      </div>

                      <Separator className="my-3" />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <QrCode className="h-8 w-8" />
                          <span className="text-xs">Scan at venue</span>
                        </div>
                        <p className="font-semibold">
                          {formatCurrency(priceAtBooking.toString())}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Booking Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <TimelineItem
                    icon={Ticket}
                    title="Booking Created"
                    description={`Reference: ${booking.bookingReference}`}
                    date={booking.createdAt}
                    completed
                  />
                  <TimelineItem
                    icon={CreditCard}
                    title="Payment Processed"
                    description={
                      booking.paymentStatus === "CAPTURED"
                        ? `Transaction ID: ${booking.paymentIntentId?.slice(0, 20)}...`
                        : booking.paymentStatus === "FAILED"
                        ? "Payment failed"
                        : "Awaiting payment"
                    }
                    date={booking.createdAt}
                    completed={booking.paymentStatus === "CAPTURED"}
                    failed={booking.paymentStatus === "FAILED"}
                  />
                  <TimelineItem
                    icon={CheckCircle}
                    title="Booking Confirmed"
                    description={
                      isConfirmed
                        ? "Tickets ready for download"
                        : "Awaiting confirmation"
                    }
                    date={booking.createdAt}
                    completed={isConfirmed}
                    isLast
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Payment Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {booking.bookingSeats.map(({ seat, priceAtBooking }) => (
                    <div
                      key={seat.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        Seat {seat.seatNumber}
                      </span>
                      <span>{formatCurrency(priceAtBooking.toString())}</span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex justify-between font-semibold">
                  <span>Total Paid</span>
                  <span className="text-lg">
                    {formatCurrency(booking.totalAmount.toString())}
                  </span>
                </div>

                {booking.paymentIntentId && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">
                      Transaction ID
                    </p>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {booking.paymentIntentId}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isConfirmed && (
                  <Button className="w-full gap-2">
                    <Download className="h-4 w-4" />
                    Download Tickets (PDF)
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-2">
                  <Copy className="h-4 w-4" />
                  Copy Booking Reference
                </Button>
                {canCancel && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                  >
                    Cancel Booking
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Help */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Need help with your booking? Contact our support team at{" "}
                  <a
                    href="mailto:support@ticketflow.com"
                    className="text-primary hover:underline"
                  >
                    support@ticketflow.com
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  description,
  date,
  completed,
  failed,
  isLast,
}: {
  icon: typeof CheckCircle;
  title: string;
  description: string;
  date: Date;
  completed?: boolean;
  failed?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            completed
              ? "bg-green-500/10 text-green-500"
              : failed
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 mt-2",
              completed ? "bg-green-500/30" : "bg-border"
            )}
          />
        )}
      </div>
      <div className="flex-1 pb-4">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(date)} at {formatTime(date)}
        </p>
      </div>
    </div>
  );
}

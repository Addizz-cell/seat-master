import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { BookingsClient } from "./BookingsClient";

export const metadata = {
  title: "My Bookings | TicketFlow",
  description: "View and manage your ticket bookings",
};

export default async function BookingsPage() {
  // Check for user authentication
  const cookieStore = await cookies();
  const userId = cookieStore.get("user-id")?.value;

  if (!userId) {
    redirect("/login?redirect=/bookings");
  }

  // Fetch all user bookings
  const bookings = await prisma.booking.findMany({
    where: { userId },
    include: {
      event: true,
      bookingSeats: {
        include: {
          seat: {
            select: {
              seatNumber: true,
              section: true,
              seatType: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Transform bookings for client component
  const bookingsData = bookings.map((booking) => ({
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    totalAmount: booking.totalAmount.toString(),
    createdAt: booking.createdAt.toISOString(),
    event: {
      id: booking.event.id,
      name: booking.event.name,
      eventDate: booking.event.eventDate.toISOString(),
      venueName: booking.event.venueName,
      venueCity: booking.event.venueCity,
      category: booking.event.category,
    },
    seats: booking.bookingSeats.map(({ seat }) => ({
      seatNumber: seat.seatNumber,
      section: seat.section,
      seatType: seat.seatType,
    })),
  }));

  // Calculate counts for tabs
  const now = new Date();
  const counts = {
    all: bookingsData.length,
    upcoming: bookingsData.filter(
      (b) => new Date(b.event.eventDate) > now && b.status === "CONFIRMED"
    ).length,
    past: bookingsData.filter(
      (b) => new Date(b.event.eventDate) <= now && b.status === "CONFIRMED"
    ).length,
    cancelled: bookingsData.filter(
      (b) => b.status === "CANCELLED" || b.status === "REFUNDED"
    ).length,
  };

  return <BookingsClient bookings={bookingsData} counts={counts} />;
}

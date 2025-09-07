import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import { ConfirmationClient } from "./ConfirmationClient";

interface ConfirmationPageProps {
  params: Promise<{ bookingId: string }>;
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { bookingId } = await params;

  // Check for user authentication
  const cookieStore = await cookies();
  const userId = cookieStore.get("user-id")?.value;

  if (!userId) {
    redirect("/login");
  }

  // Fetch booking with related data
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: true,
      user: {
        select: {
          email: true,
        },
      },
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
    redirect("/");
  }

  // Transform data for client component
  const bookingData = {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    totalAmount: booking.totalAmount.toString(),
    createdAt: booking.createdAt.toISOString(),
    event: {
      id: booking.event.id,
      name: booking.event.name,
      eventDate: booking.event.eventDate.toISOString(),
      venueName: booking.event.venueName,
      venueCity: booking.event.venueCity,
    },
    seats: booking.bookingSeats.map(({ seat, priceAtBooking }) => ({
      id: seat.id,
      seatNumber: seat.seatNumber,
      row: seat.row,
      section: seat.section,
      seatType: seat.seatType,
      price: priceAtBooking.toString(),
    })),
    userEmail: booking.user.email,
  };

  return <ConfirmationClient booking={bookingData} />;
}

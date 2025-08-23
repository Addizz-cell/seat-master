/**
 * ============================================================================
 * NAIVE BOOKING SERVICE - INTENTIONALLY BUGGY!
 * ============================================================================
 *
 * ⚠️  WARNING: THIS CODE HAS A CRITICAL RACE CONDITION  ⚠️
 *
 * This service is designed to DEMONSTRATE the race condition problem that
 * occurs when multiple users try to book the same seat simultaneously.
 *
 * THE BUG:
 * --------
 * In the reserveSeats() method, there's a gap between:
 *   1. Checking if seat.status === 'AVAILABLE' (line ~80)
 *   2. Updating the seat to 'RESERVED' (line ~100)
 *
 * During this gap (especially with the artificial delay), multiple concurrent
 * requests can all pass the availability check before any of them updates
 * the seat. This means:
 *
 *   Request A: Checks seat → Available ✓
 *   Request B: Checks seat → Available ✓  (A hasn't updated yet!)
 *   Request C: Checks seat → Available ✓  (A and B haven't updated yet!)
 *   Request A: Updates seat → Reserved
 *   Request B: Updates seat → Reserved (OVERWRITES A's reservation!)
 *   Request C: Updates seat → Reserved (OVERWRITES B's reservation!)
 *
 * Result: 3 users think they have the seat, but only 1 actually does.
 *
 * WHY THIS MATTERS:
 * -----------------
 * - Users get confirmation emails for seats they don't have
 * - Payment is processed but tickets are invalid
 * - Customer support nightmare
 * - Loss of trust and revenue
 *
 * THE FIX (coming in next phase):
 * -------------------------------
 * - Database transactions with row-level locking
 * - Optimistic locking with version field
 * - Distributed locks using Redis
 *
 * TO TEST THE RACE CONDITION:
 * ---------------------------
 * 1. Reset database: npx prisma migrate reset
 * 2. Start server: npm run dev
 * 3. Run test: npm run test:race
 *
 * Expected: Multiple users will "successfully" reserve the same seat!
 *
 * ============================================================================
 */

import prisma from "@/lib/db";
import { addMinutes } from "date-fns";

// Reservation expiry time in minutes
const RESERVATION_EXPIRY_MINUTES = 10;

/**
 * Artificial delay to make race condition more likely to occur.
 * In real systems, this delay might come from:
 * - Network latency
 * - Database load
 * - Other processing
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a human-readable booking reference.
 * Format: TKT-XXXX-XXXX (e.g., TKT-A3F2-9K7B)
 */
function generateBookingReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars (0, O, 1, I)
  const segment = () =>
    Array.from(
      { length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `TKT-${segment()}-${segment()}`;
}

export interface ReservationResult {
  reservationIds: string[];
  seats: Array<{
    id: string;
    seatNumber: string;
    section: string;
    row: string;
    price: string;
  }>;
  expiresAt: Date;
  totalAmount: string;
}

export interface BookingResult {
  id: string;
  bookingReference: string;
  totalAmount: string;
  status: string;
  seats: Array<{
    id: string;
    seatNumber: string;
    section: string;
    row: string;
    priceAtBooking: string;
  }>;
  createdAt: Date;
}

/**
 * Reserve seats for a user - NAIVE IMPLEMENTATION WITH RACE CONDITION
 *
 * ⚠️ DO NOT USE IN PRODUCTION ⚠️
 *
 * This implementation checks availability and then updates seats WITHOUT
 * proper locking. Multiple concurrent requests can all pass the check
 * before any update occurs.
 */
export async function reserveSeats(
  eventId: string,
  seatIds: string[],
  userId: string
): Promise<ReservationResult> {
  console.log(
    `[NaiveBooking] User ${userId} attempting to reserve ${seatIds.length} seat(s)`
  );

  const reservationIds: string[] = [];
  const reservedSeats: ReservationResult["seats"] = [];
  let totalAmount = 0;

  const expiresAt = addMinutes(new Date(), RESERVATION_EXPIRY_MINUTES);

  for (const seatId of seatIds) {
    // =========================================================================
    // STEP 1: Query the seat from database
    // =========================================================================
    const seat = await prisma.seat.findUnique({
      where: { id: seatId },
      select: {
        id: true,
        eventId: true,
        seatNumber: true,
        section: true,
        row: true,
        price: true,
        status: true,
      },
    });

    if (!seat) {
      throw new Error(`Seat ${seatId} not found`);
    }

    if (seat.eventId !== eventId) {
      throw new Error(`Seat ${seatId} does not belong to event ${eventId}`);
    }

    // =========================================================================
    // STEP 2: Check if seat is available
    //
    // 🐛 BUG: This check is NOT atomic with the update below!
    // Multiple requests can pass this check simultaneously.
    // =========================================================================
    if (seat.status !== "AVAILABLE") {
      throw new Error(
        `Seat ${seat.seatNumber} is not available (status: ${seat.status})`
      );
    }

    console.log(
      `[NaiveBooking] Seat ${seat.seatNumber} appears available for user ${userId}`
    );

    // =========================================================================
    // STEP 3: Artificial delay to make race condition more visible
    //
    // In production, this delay might come from:
    // - Database connection pool wait time
    // - Network latency to database
    // - Other business logic processing
    // - Garbage collection pauses
    //
    // 🐛 BUG: During this delay, other requests can also pass the check above!
    // =========================================================================
    await sleep(100);

    // =========================================================================
    // STEP 4: Update the seat to RESERVED
    //
    // 🐛 BUG: By now, another request might have already reserved this seat!
    // We're blindly overwriting without checking again.
    // =========================================================================
    await prisma.seat.update({
      where: { id: seatId },
      data: {
        status: "RESERVED",
        reservedBy: userId,
        reservedUntil: expiresAt,
        version: { increment: 1 },
      },
    });

    console.log(
      `[NaiveBooking] ✓ Seat ${seat.seatNumber} marked as RESERVED for user ${userId}`
    );

    // =========================================================================
    // STEP 5: Create Reservation record
    // =========================================================================
    const reservation = await prisma.reservation.create({
      data: {
        userId,
        eventId,
        seatId,
        status: "ACTIVE",
        expiresAt,
      },
    });

    reservationIds.push(reservation.id);
    reservedSeats.push({
      id: seat.id,
      seatNumber: seat.seatNumber,
      section: seat.section,
      row: seat.row,
      price: String(seat.price),
    });
    totalAmount += Number(seat.price);
  }

  console.log(
    `[NaiveBooking] User ${userId} "reserved" ${reservedSeats.length} seat(s) - Total: $${totalAmount}`
  );

  return {
    reservationIds,
    seats: reservedSeats,
    expiresAt,
    totalAmount: totalAmount.toFixed(2),
  };
}

/**
 * Confirm a booking from reservations - NAIVE IMPLEMENTATION
 *
 * This method is less prone to race conditions since reservations
 * are already created, but it still lacks proper idempotency handling.
 */
export async function confirmBooking(
  reservationIds: string[],
  userId: string,
  idempotencyKey: string
): Promise<BookingResult> {
  console.log(
    `[NaiveBooking] User ${userId} confirming booking with ${reservationIds.length} reservation(s)`
  );

  // Check for existing booking with this idempotency key
  const existingBooking = await prisma.booking.findUnique({
    where: { idempotencyKey },
    include: {
      bookingSeats: {
        include: {
          seat: {
            select: {
              id: true,
              seatNumber: true,
              section: true,
              row: true,
            },
          },
        },
      },
    },
  });

  if (existingBooking) {
    console.log(
      `[NaiveBooking] Found existing booking for idempotency key: ${existingBooking.bookingReference}`
    );
    return {
      id: existingBooking.id,
      bookingReference: existingBooking.bookingReference,
      totalAmount: String(existingBooking.totalAmount),
      status: existingBooking.status,
      seats: existingBooking.bookingSeats.map((bs) => ({
        id: bs.seat.id,
        seatNumber: bs.seat.seatNumber,
        section: bs.seat.section,
        row: bs.seat.row,
        priceAtBooking: String(bs.priceAtBooking),
      })),
      createdAt: existingBooking.createdAt,
    };
  }

  // Fetch and validate reservations
  const reservations = await prisma.reservation.findMany({
    where: {
      id: { in: reservationIds },
      userId,
      status: "ACTIVE",
    },
    include: {
      seat: {
        select: {
          id: true,
          seatNumber: true,
          section: true,
          row: true,
          price: true,
          eventId: true,
        },
      },
    },
  });

  if (reservations.length !== reservationIds.length) {
    throw new Error(
      `Some reservations not found or not active. Found ${reservations.length} of ${reservationIds.length}`
    );
  }

  // Check for expired reservations
  const now = new Date();
  const expiredReservations = reservations.filter((r) => r.expiresAt < now);
  if (expiredReservations.length > 0) {
    throw new Error(
      `${expiredReservations.length} reservation(s) have expired`
    );
  }

  // Verify all reservations are for the same event
  const eventIds = new Set(reservations.map((r) => r.seat.eventId));
  if (eventIds.size !== 1) {
    throw new Error("All reservations must be for the same event");
  }
  const eventId = reservations[0].seat.eventId;

  // Calculate total amount
  const totalAmount = reservations.reduce(
    (sum, r) => sum + Number(r.seat.price),
    0
  );

  // Create the booking
  const bookingReference = generateBookingReference();
  const booking = await prisma.booking.create({
    data: {
      bookingReference,
      userId,
      eventId,
      totalAmount,
      status: "CONFIRMED",
      paymentStatus: "CAPTURED", // Simulating successful payment
      idempotencyKey,
      confirmedAt: new Date(),
      bookingSeats: {
        create: reservations.map((r) => ({
          seatId: r.seat.id,
          priceAtBooking: r.seat.price,
        })),
      },
    },
    include: {
      bookingSeats: {
        include: {
          seat: {
            select: {
              id: true,
              seatNumber: true,
              section: true,
              row: true,
            },
          },
        },
      },
    },
  });

  // Update seats to BOOKED
  await prisma.seat.updateMany({
    where: {
      id: { in: reservations.map((r) => r.seatId) },
    },
    data: {
      status: "BOOKED",
      bookingId: booking.id,
      reservedBy: null,
      reservedUntil: null,
    },
  });

  // Update reservations to CONFIRMED
  await prisma.reservation.updateMany({
    where: {
      id: { in: reservationIds },
    },
    data: {
      status: "CONFIRMED",
    },
  });

  // Decrement available seats count
  await prisma.event.update({
    where: { id: eventId },
    data: {
      availableSeats: { decrement: reservations.length },
    },
  });

  console.log(
    `[NaiveBooking] ✓ Booking confirmed: ${bookingReference} for $${totalAmount}`
  );

  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    totalAmount: String(booking.totalAmount),
    status: booking.status,
    seats: booking.bookingSeats.map((bs) => ({
      id: bs.seat.id,
      seatNumber: bs.seat.seatNumber,
      section: bs.seat.section,
      row: bs.seat.row,
      priceAtBooking: String(bs.priceAtBooking),
    })),
    createdAt: booking.createdAt,
  };
}

/**
 * Release expired reservations (cleanup job)
 *
 * This would typically run on a schedule (e.g., every minute)
 * to release seats that were reserved but never booked.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find expired active reservations
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      seatId: true,
      eventId: true,
    },
  });

  if (expiredReservations.length === 0) {
    return 0;
  }

  // Release seats
  await prisma.seat.updateMany({
    where: {
      id: { in: expiredReservations.map((r) => r.seatId) },
      status: "RESERVED",
    },
    data: {
      status: "AVAILABLE",
      reservedBy: null,
      reservedUntil: null,
    },
  });

  // Mark reservations as expired
  await prisma.reservation.updateMany({
    where: {
      id: { in: expiredReservations.map((r) => r.id) },
    },
    data: {
      status: "EXPIRED",
    },
  });

  console.log(
    `[NaiveBooking] Released ${expiredReservations.length} expired reservation(s)`
  );

  return expiredReservations.length;
}

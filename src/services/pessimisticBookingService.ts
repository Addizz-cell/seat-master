/**
 * ============================================================================
 * PESSIMISTIC BOOKING SERVICE - DATABASE-LEVEL LOCKING
 * ============================================================================
 *
 * This service uses PostgreSQL's SELECT FOR UPDATE to prevent race conditions.
 * Unlike the naive implementation, this guarantees only ONE user can book a seat.
 *
 * HOW SELECT FOR UPDATE WORKS:
 * ----------------------------
 * When you execute SELECT ... FOR UPDATE, PostgreSQL:
 * 1. Acquires an exclusive row-level lock on the selected rows
 * 2. Other transactions trying to SELECT FOR UPDATE the same rows will BLOCK
 * 3. The lock is held until the transaction commits or rolls back
 *
 * Example timeline with 3 concurrent requests for the same seat:
 *
 *   Request A: SELECT FOR UPDATE → Gets lock, proceeds
 *   Request B: SELECT FOR UPDATE → BLOCKS (waiting for A's lock)
 *   Request C: SELECT FOR UPDATE → BLOCKS (waiting for A's lock)
 *   Request A: UPDATE, COMMIT → Releases lock
 *   Request B: Gets lock, checks status → ALREADY RESERVED → Throws error
 *   Request C: Gets lock, checks status → ALREADY RESERVED → Throws error
 *
 * Result: Only Request A succeeds. Others fail gracefully.
 *
 * WHY SORT SEAT IDS (DEADLOCK PREVENTION):
 * ----------------------------------------
 * If User A locks seats [1, 2] and User B locks seats [2, 1]:
 *   User A: Locks seat 1, tries to lock seat 2
 *   User B: Locks seat 2, tries to lock seat 1
 *   → DEADLOCK! Both waiting for each other.
 *
 * By always locking in sorted order, all users follow the same path:
 *   User A: Locks seat 1, then seat 2
 *   User B: Tries to lock seat 1 → BLOCKS (A has it)
 *   User A: Commits → Releases locks
 *   User B: Locks seat 1, then seat 2 → Sees they're taken → Fails
 *   → No deadlock!
 *
 * PROS:
 * -----
 * ✅ Simple to implement with raw SQL
 * ✅ Guaranteed consistency (database enforces it)
 * ✅ No external dependencies (just PostgreSQL)
 * ✅ ACID compliant
 *
 * CONS:
 * -----
 * ❌ Blocking reduces throughput (requests queue up)
 * ❌ Doesn't scale horizontally (single database bottleneck)
 * ❌ Long transactions can cause lock timeouts
 * ❌ Potential for deadlocks if not careful with lock ordering
 *
 * WHEN TO USE:
 * ------------
 * - Single database deployments
 * - Moderate traffic levels
 * - When simplicity is more important than scalability
 * - As a fallback when Redis is unavailable
 *
 * ============================================================================
 */

import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { addMinutes } from 'date-fns';

// Reservation expiry time in minutes
const RESERVATION_EXPIRY_MINUTES = 10;

// Transaction timeout in milliseconds
const TRANSACTION_TIMEOUT = 10000; // 10 seconds

/**
 * Generate a human-readable booking reference.
 * Format: TKT-XXXX-XXXX (e.g., TKT-A3F2-9K7B)
 */
function generateBookingReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

// Type for raw seat query result
interface RawSeat {
  id: string;
  eventId: string;
  seatNumber: string;
  row: string;
  section: string;
  seatType: string;
  price: unknown;
  status: string;
  version: number;
  reservedBy: string | null;
  reservedUntil: Date | null;
  bookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reserve seats with PESSIMISTIC LOCKING using SELECT FOR UPDATE.
 *
 * This method:
 * 1. Sorts seat IDs to prevent deadlocks
 * 2. Opens a transaction with Serializable isolation
 * 3. Locks each seat row with SELECT FOR UPDATE
 * 4. Checks availability (while holding the lock)
 * 5. Updates the seat and creates reservation
 * 6. Commits the transaction, releasing locks
 *
 * Other concurrent requests for the same seats will BLOCK until this
 * transaction completes, then they'll see the updated status and fail.
 */
export async function reserveSeats(
  eventId: string,
  seatIds: string[],
  userId: string
): Promise<ReservationResult> {
  console.log(`[PessimisticBooking] User ${userId} attempting to reserve ${seatIds.length} seat(s)`);

  // =========================================================================
  // STEP 1: Sort seat IDs to prevent deadlock
  //
  // If we always acquire locks in the same order (alphabetically by ID),
  // we prevent circular wait conditions that cause deadlocks.
  // =========================================================================
  const sortedSeatIds = [...seatIds].sort();
  console.log(`[PessimisticBooking] Lock order: ${sortedSeatIds.map(id => id.substring(0, 8)).join(', ')}`);

  const expiresAt = addMinutes(new Date(), RESERVATION_EXPIRY_MINUTES);

  // =========================================================================
  // STEP 2: Execute everything in a transaction with pessimistic locking
  // =========================================================================
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const reservationIds: string[] = [];
        const reservedSeats: ReservationResult['seats'] = [];
        let totalAmount = 0;

        for (const seatId of sortedSeatIds) {
          // =================================================================
          // STEP 3: SELECT FOR UPDATE - This is the key!
          //
          // This raw SQL query:
          // - Selects the seat row
          // - Acquires an EXCLUSIVE lock on it
          // - Other transactions trying to lock this row will BLOCK here
          // - The lock is held until we COMMIT or ROLLBACK
          // =================================================================
          const seats = await tx.$queryRaw<RawSeat[]>`
            SELECT * FROM "seats"
            WHERE "id" = ${seatId}
            AND "eventId" = ${eventId}
            FOR UPDATE
          `;

          if (seats.length === 0) {
            throw new Error(`Seat ${seatId} not found or does not belong to event`);
          }

          const seat = seats[0];

          // =================================================================
          // STEP 4: Check availability (while holding the lock)
          //
          // At this point, we have exclusive access to this row.
          // No other transaction can read or modify it until we commit.
          // =================================================================
          if (seat.status !== 'AVAILABLE') {
            throw new Error(`Seat ${seat.seatNumber} is not available (status: ${seat.status})`);
          }

          console.log(`[PessimisticBooking] 🔒 Locked and verified seat ${seat.seatNumber} for user ${userId}`);

          // =================================================================
          // STEP 5: Update the seat to RESERVED
          //
          // We're still holding the lock, so this update is safe.
          // The version increment provides additional optimistic locking
          // for any code paths that might not use FOR UPDATE.
          // =================================================================
          await tx.$executeRaw`
            UPDATE "seats"
            SET "status" = 'RESERVED',
                "reservedBy" = ${userId},
                "reservedUntil" = ${expiresAt},
                "version" = "version" + 1,
                "updatedAt" = NOW()
            WHERE "id" = ${seatId}
          `;

          // =================================================================
          // STEP 6: Create Reservation record
          // =================================================================
          const reservation = await tx.reservation.create({
            data: {
              userId,
              eventId,
              seatId,
              status: 'ACTIVE',
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

        console.log(`[PessimisticBooking] ✓ User ${userId} reserved ${reservedSeats.length} seat(s) atomically`);

        return {
          reservationIds,
          seats: reservedSeats,
          expiresAt,
          totalAmount: totalAmount.toFixed(2),
        };
      },
      {
        // Serializable is the strictest isolation level
        // It prevents phantom reads and ensures complete isolation
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Timeout prevents long-running transactions from blocking forever
        timeout: TRANSACTION_TIMEOUT,
      }
    );

    return result;
  } catch (error) {
    // Handle specific Prisma transaction errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2028') {
        // Transaction timeout - another transaction is holding the lock too long
        console.log(`[PessimisticBooking] ⏱️ Transaction timeout for user ${userId}`);
        throw new Error('Request timed out. Please try again.');
      }
      if (error.code === 'P2034') {
        // Transaction conflict - serialization failure
        console.log(`[PessimisticBooking] 🔄 Serialization conflict for user ${userId}`);
        throw new Error('Concurrent modification detected. Please try again.');
      }
    }

    // Re-throw the original error
    throw error;
  }
}

/**
 * Confirm a booking from reservations with pessimistic locking.
 */
export async function confirmBooking(
  reservationIds: string[],
  userId: string,
  idempotencyKey: string
): Promise<BookingResult> {
  console.log(`[PessimisticBooking] User ${userId} confirming booking with ${reservationIds.length} reservation(s)`);

  // Check for existing booking with this idempotency key (outside transaction)
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
    console.log(`[PessimisticBooking] Found existing booking: ${existingBooking.bookingReference}`);
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

  // Sort reservation IDs for consistent lock ordering
  const sortedReservationIds = [...reservationIds].sort();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Lock and fetch reservations with their seats
        const reservations = await tx.reservation.findMany({
          where: {
            id: { in: sortedReservationIds },
            userId,
            status: 'ACTIVE',
          },
          include: {
            seat: true,
          },
          orderBy: { id: 'asc' }, // Consistent order
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
          throw new Error(`${expiredReservations.length} reservation(s) have expired`);
        }

        // Verify all reservations are for the same event
        const eventIds = new Set(reservations.map((r) => r.seat.eventId));
        if (eventIds.size !== 1) {
          throw new Error('All reservations must be for the same event');
        }
        const eventId = reservations[0].seat.eventId;

        // Lock all seats for update
        const seatIds = reservations.map((r) => r.seatId).sort();
        for (const seatId of seatIds) {
          await tx.$queryRaw`
            SELECT id FROM "seats"
            WHERE "id" = ${seatId}
            FOR UPDATE
          `;
        }

        // Calculate total amount
        const totalAmount = reservations.reduce((sum, r) => sum + Number(r.seat.price), 0);

        // Create the booking
        const bookingReference = generateBookingReference();
        const booking = await tx.booking.create({
          data: {
            bookingReference,
            userId,
            eventId,
            totalAmount,
            status: 'CONFIRMED',
            paymentStatus: 'CAPTURED',
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
        await tx.$executeRaw`
          UPDATE "seats"
          SET "status" = 'BOOKED',
              "bookingId" = ${booking.id},
              "reservedBy" = NULL,
              "reservedUntil" = NULL,
              "version" = "version" + 1,
              "updatedAt" = NOW()
          WHERE "id" = ANY(${seatIds}::uuid[])
        `;

        // Update reservations to CONFIRMED
        await tx.reservation.updateMany({
          where: { id: { in: reservationIds } },
          data: { status: 'CONFIRMED' },
        });

        // Decrement available seats count
        await tx.event.update({
          where: { id: eventId },
          data: { availableSeats: { decrement: reservations.length } },
        });

        console.log(`[PessimisticBooking] ✓ Booking confirmed: ${bookingReference}`);

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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: TRANSACTION_TIMEOUT,
      }
    );

    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2028') {
        throw new Error('Request timed out. Please try again.');
      }
      if (error.code === 'P2034') {
        throw new Error('Concurrent modification detected. Please try again.');
      }
    }
    throw error;
  }
}

/**
 * ============================================================================
 * DISTRIBUTED BOOKING SERVICE - REDIS-BASED LOCKING
 * ============================================================================
 *
 * This service uses Redis distributed locks to prevent race conditions.
 * Unlike pessimistic locking (SELECT FOR UPDATE), this approach:
 *
 * ✅ Scales horizontally (works across multiple app servers)
 * ✅ Lower latency under contention (non-blocking lock acquisition)
 * ✅ Can coordinate any resource, not just database rows
 * ✅ Works with any database (not just PostgreSQL)
 *
 * HOW IT WORKS:
 * -------------
 *
 * 1. ACQUIRE DISTRIBUTED LOCKS
 *    - For each seat, create a Redis lock key: "seat:{eventId}:{seatId}"
 *    - Attempt to acquire ALL locks atomically
 *    - If any lock fails, release all and throw error
 *
 * 2. VERIFY STATE IN DATABASE
 *    - Within the lock, check seat status in PostgreSQL
 *    - If seat isn't AVAILABLE, throw error
 *    - This double-check prevents issues if lock was lost/reacquired
 *
 * 3. UPDATE DATABASE
 *    - Update seat status to RESERVED
 *    - Create reservation records
 *    - Create audit log entries
 *
 * 4. RELEASE LOCKS
 *    - Always release in finally block, even on error
 *    - Use atomic release to prevent releasing others' locks
 *
 * COMPARISON:
 * -----------
 *
 * | Aspect            | Pessimistic (DB)   | Distributed (Redis) |
 * |-------------------|--------------------|---------------------|
 * | Lock mechanism    | SELECT FOR UPDATE  | Redis SET NX        |
 * | Scalability       | Single DB          | Multiple servers    |
 * | Blocking          | Yes (waits)        | No (fails fast)     |
 * | Latency           | Higher contention  | Lower contention    |
 * | Consistency       | Strong (ACID)      | Eventual*           |
 *
 * *If Redis fails, locks are lost. For critical operations,
 * combine with database-level checks (which we do here).
 *
 * ============================================================================
 */

import prisma from '@/lib/db';
import {
  acquireMultipleLocks,
  releaseMultipleLocks,
  seatLockKeys,
  type LockOptions,
} from '@/lib/locks';
import {
  SeatLockError,
  SeatNotFoundError,
  SeatNotAvailableError,
  ReservationNotFoundError,
  ReservationExpiredError,
} from '@/lib/errors';
import { addMinutes } from 'date-fns';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Reservation expiry time in minutes */
const RESERVATION_EXPIRY_MINUTES = 10;

/** Lock options for seat operations */
const SEAT_LOCK_OPTIONS: LockOptions = {
  ttlSeconds: 30,    // Lock expires after 30 seconds
  retryCount: 3,     // Retry 3 times if lock not acquired
  retryDelayMs: 100, // Wait 100ms between retries
};

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Reserve seats using distributed locking.
 *
 * This function:
 * 1. Acquires Redis locks for all requested seats
 * 2. Verifies seat availability in the database
 * 3. Updates seats to RESERVED status
 * 4. Creates reservation records
 * 5. Creates audit log entries
 * 6. Releases all locks (always, even on error)
 *
 * @param eventId - The event ID
 * @param seatIds - Array of seat IDs to reserve
 * @param userId - The user making the reservation
 * @returns ReservationResult with reservation IDs and seat details
 *
 * @throws SeatLockError - If locks cannot be acquired
 * @throws SeatNotFoundError - If a seat doesn't exist
 * @throws SeatNotAvailableError - If a seat isn't available
 */
export async function reserveSeats(
  eventId: string,
  seatIds: string[],
  userId: string
): Promise<ReservationResult> {
  const startTime = Date.now();
  console.log(`[DistributedBooking] User ${userId} attempting to reserve ${seatIds.length} seat(s)`);

  // =========================================================================
  // STEP 1: ACQUIRE DISTRIBUTED LOCKS
  //
  // Create lock keys for each seat and acquire them all.
  // Keys are automatically sorted to prevent deadlock.
  // If any lock fails, all acquired locks are released.
  // =========================================================================
  const lockKeys = seatLockKeys(eventId, seatIds);
  console.log(`[DistributedBooking] Acquiring locks for: ${lockKeys.map(k => k.substring(0, 30)).join(', ')}`);

  const locks = await acquireMultipleLocks(lockKeys, SEAT_LOCK_OPTIONS);

  if (!locks) {
    console.log(`[DistributedBooking] ❌ Failed to acquire locks - seats may be in use`);
    throw new SeatLockError(
      'Could not acquire locks - seats may be in use by another request',
      lockKeys
    );
  }

  console.log(`[DistributedBooking] 🔒 Acquired ${locks.length} locks in ${Date.now() - startTime}ms`);

  try {
    // =========================================================================
    // STEP 2: VERIFY AND RESERVE WITHIN DATABASE TRANSACTION
    //
    // Even though we have Redis locks, we still use a database transaction
    // for atomicity. This provides defense-in-depth:
    // - Redis locks prevent concurrent access
    // - DB transaction ensures all-or-nothing updates
    // =========================================================================
    const expiresAt = addMinutes(new Date(), RESERVATION_EXPIRY_MINUTES);

    const result = await prisma.$transaction(async (tx) => {
      const reservationIds: string[] = [];
      const reservedSeats: ReservationResult['seats'] = [];
      let totalAmount = 0;

      // Process each seat
      for (const seatId of seatIds) {
        // =================================================================
        // STEP 2a: Fetch and verify seat status
        // =================================================================
        const seat = await tx.seat.findUnique({
          where: { id: seatId },
          select: {
            id: true,
            eventId: true,
            seatNumber: true,
            row: true,
            section: true,
            price: true,
            status: true,
            version: true,
          },
        });

        if (!seat) {
          throw new SeatNotFoundError(seatId, eventId);
        }

        if (seat.eventId !== eventId) {
          throw new SeatNotFoundError(seatId, eventId);
        }

        if (seat.status !== 'AVAILABLE') {
          throw new SeatNotAvailableError(seat.seatNumber, seat.status);
        }

        console.log(`[DistributedBooking] ✓ Seat ${seat.seatNumber} verified as AVAILABLE`);

        // =================================================================
        // STEP 2b: Update seat to RESERVED
        // =================================================================
        await tx.seat.update({
          where: { id: seatId },
          data: {
            status: 'RESERVED',
            reservedBy: userId,
            reservedUntil: expiresAt,
            version: { increment: 1 },
          },
        });

        // =================================================================
        // STEP 2c: Create Reservation record
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

        // =================================================================
        // STEP 2d: Create Audit Log entry
        // =================================================================
        await tx.auditLog.create({
          data: {
            entityType: 'Seat',
            entityId: seatId,
            action: 'RESERVE',
            userId,
            oldValue: { status: 'AVAILABLE' },
            newValue: {
              status: 'RESERVED',
              reservedBy: userId,
              reservedUntil: expiresAt.toISOString(),
            },
            metadata: {
              eventId,
              seatNumber: seat.seatNumber,
              section: seat.section,
              row: seat.row,
              price: String(seat.price),
              reservationId: reservation.id,
            },
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

      return {
        reservationIds,
        seats: reservedSeats,
        expiresAt,
        totalAmount: totalAmount.toFixed(2),
      };
    });

    const duration = Date.now() - startTime;
    console.log(`[DistributedBooking] ✅ User ${userId} reserved ${result.seats.length} seat(s) in ${duration}ms`);

    return result;
  } finally {
    // =========================================================================
    // STEP 3: ALWAYS RELEASE LOCKS
    //
    // This runs regardless of success or failure.
    // Using atomic release ensures we don't release someone else's lock.
    // =========================================================================
    console.log(`[DistributedBooking] 🔓 Releasing ${locks.length} locks`);
    await releaseMultipleLocks(locks);
  }
}

/**
 * Confirm a booking from reservations using distributed locking.
 *
 * This function:
 * 1. Checks for existing booking (idempotency)
 * 2. Validates and loads reservations
 * 3. Acquires Redis locks for all seats
 * 4. Creates the booking record
 * 5. Updates seats to BOOKED status
 * 6. Creates audit log entries
 * 7. Releases all locks (always, even on error)
 *
 * @param reservationIds - Array of reservation IDs to confirm
 * @param userId - The user confirming the booking
 * @param idempotencyKey - Unique key to prevent duplicate bookings
 * @returns BookingResult with booking details
 *
 * @throws ReservationNotFoundError - If reservations don't exist or wrong user
 * @throws ReservationExpiredError - If any reservation has expired
 * @throws SeatLockError - If locks cannot be acquired
 */
export async function confirmBooking(
  reservationIds: string[],
  userId: string,
  idempotencyKey: string
): Promise<BookingResult> {
  const startTime = Date.now();
  console.log(`[DistributedBooking] User ${userId} confirming ${reservationIds.length} reservation(s)`);

  // =========================================================================
  // STEP 1: CHECK IDEMPOTENCY (Before acquiring locks)
  //
  // If we've already processed this idempotency key, return the existing
  // booking. This handles retries safely without acquiring locks.
  // =========================================================================
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
    console.log(`[DistributedBooking] Found existing booking: ${existingBooking.bookingReference}`);
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

  // =========================================================================
  // STEP 2: LOAD AND VALIDATE RESERVATIONS
  //
  // Fetch reservations and check:
  // - All exist and belong to the user
  // - All are still ACTIVE
  // - None have expired
  // - All are for the same event
  // =========================================================================
  const reservations = await prisma.reservation.findMany({
    where: {
      id: { in: reservationIds },
      userId,
      status: 'ACTIVE',
    },
    include: {
      seat: true,
    },
    orderBy: { id: 'asc' },
  });

  if (reservations.length !== reservationIds.length) {
    const foundIds = new Set(reservations.map((r) => r.id));
    const missingId = reservationIds.find((id) => !foundIds.has(id)) || reservationIds[0];
    throw new ReservationNotFoundError(missingId, userId);
  }

  // Check for expired reservations
  const now = new Date();
  for (const reservation of reservations) {
    if (reservation.expiresAt < now) {
      throw new ReservationExpiredError(reservation.id, reservation.expiresAt);
    }
  }

  // Verify all reservations are for the same event
  const eventIds = new Set(reservations.map((r) => r.seat.eventId));
  if (eventIds.size !== 1) {
    throw new Error('All reservations must be for the same event');
  }
  const eventId = reservations[0].seat.eventId;

  // =========================================================================
  // STEP 3: ACQUIRE DISTRIBUTED LOCKS FOR ALL SEATS
  // =========================================================================
  const seatIds = reservations.map((r) => r.seatId);
  const lockKeys = seatLockKeys(eventId, seatIds);

  console.log(`[DistributedBooking] Acquiring locks for booking confirmation`);
  const locks = await acquireMultipleLocks(lockKeys, SEAT_LOCK_OPTIONS);

  if (!locks) {
    throw new SeatLockError(
      'Could not acquire locks for booking confirmation - please try again',
      lockKeys
    );
  }

  try {
    // =========================================================================
    // STEP 4: CREATE BOOKING WITHIN DATABASE TRANSACTION
    // =========================================================================
    const result = await prisma.$transaction(async (tx) => {
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
      await tx.seat.updateMany({
        where: { id: { in: seatIds } },
        data: {
          status: 'BOOKED',
          bookingId: booking.id,
          reservedBy: null,
          reservedUntil: null,
          version: { increment: 1 },
        },
      });

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

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          entityType: 'Booking',
          entityId: booking.id,
          action: 'CONFIRM',
          userId,
          newValue: {
            bookingReference,
            totalAmount: totalAmount.toFixed(2),
            seatCount: seatIds.length,
            seats: reservations.map((r) => ({
              seatId: r.seat.id,
              seatNumber: r.seat.seatNumber,
              price: String(r.seat.price),
            })),
          },
          metadata: {
            eventId,
            reservationIds,
            idempotencyKey,
          },
        },
      });

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
    });

    const duration = Date.now() - startTime;
    console.log(`[DistributedBooking] ✅ Booking confirmed: ${result.bookingReference} in ${duration}ms`);

    return result;
  } finally {
    // =========================================================================
    // STEP 5: ALWAYS RELEASE LOCKS
    // =========================================================================
    console.log(`[DistributedBooking] 🔓 Releasing ${locks.length} locks`);
    await releaseMultipleLocks(locks);
  }
}

/**
 * Release expired reservations.
 * This should be called periodically by a cron job or background worker.
 *
 * @returns Number of reservations released
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find expired active reservations
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: now },
    },
    include: {
      seat: {
        select: {
          id: true,
          eventId: true,
          seatNumber: true,
        },
      },
    },
  });

  if (expiredReservations.length === 0) {
    return 0;
  }

  console.log(`[DistributedBooking] Releasing ${expiredReservations.length} expired reservation(s)`);

  // Group by event for efficient lock acquisition
  const byEvent = expiredReservations.reduce((acc, r) => {
    if (!acc[r.seat.eventId]) {
      acc[r.seat.eventId] = [];
    }
    acc[r.seat.eventId].push(r);
    return acc;
  }, {} as Record<string, typeof expiredReservations>);

  let released = 0;

  for (const [eventId, reservations] of Object.entries(byEvent)) {
    const seatIds = reservations.map((r) => r.seatId);
    const lockKeys = seatLockKeys(eventId, seatIds);

    const locks = await acquireMultipleLocks(lockKeys, {
      ttlSeconds: 30,
      retryCount: 1, // Don't retry much for cleanup
      retryDelayMs: 50,
    });

    if (!locks) {
      console.log(`[DistributedBooking] Could not acquire locks for cleanup - skipping batch`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Release seats
        await tx.seat.updateMany({
          where: {
            id: { in: seatIds },
            status: 'RESERVED',
          },
          data: {
            status: 'AVAILABLE',
            reservedBy: null,
            reservedUntil: null,
            version: { increment: 1 },
          },
        });

        // Mark reservations as expired
        await tx.reservation.updateMany({
          where: {
            id: { in: reservations.map((r) => r.id) },
          },
          data: {
            status: 'EXPIRED',
          },
        });

        // Create audit log entries
        for (const reservation of reservations) {
          await tx.auditLog.create({
            data: {
              entityType: 'Reservation',
              entityId: reservation.id,
              action: 'EXPIRE',
              oldValue: { status: 'ACTIVE' },
              newValue: { status: 'EXPIRED' },
              metadata: {
                seatId: reservation.seatId,
                seatNumber: reservation.seat.seatNumber,
                expiredAt: now.toISOString(),
              },
            },
          });
        }
      });

      released += reservations.length;
    } finally {
      await releaseMultipleLocks(locks);
    }
  }

  console.log(`[DistributedBooking] Released ${released} expired reservation(s)`);
  return released;
}

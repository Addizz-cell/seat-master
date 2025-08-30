/**
 * ============================================================================
 * PERIODIC CLEANUP
 * ============================================================================
 *
 * This module provides a fallback mechanism for cleaning up expired
 * reservations that may have been missed by the scheduled job system.
 *
 * WHY IS THIS NEEDED?
 * -------------------
 *
 * While BullMQ's delayed jobs are reliable, there are edge cases where
 * cleanup jobs might be missed:
 *
 * 1. Worker was down when the job was scheduled to run
 * 2. Redis was temporarily unavailable
 * 3. Job was removed accidentally
 * 4. Bug in job scheduling code
 *
 * This periodic cleanup runs every 60 seconds and catches any expired
 * reservations that are still in ACTIVE status. It's a safety net, not
 * the primary cleanup mechanism.
 *
 * HOW IT WORKS:
 * -------------
 *
 * 1. Query for ACTIVE reservations where expiresAt < now
 * 2. For each expired reservation:
 *    a. Try to acquire a lock (no retries - skip if locked)
 *    b. Verify the reservation is still ACTIVE
 *    c. Release the seat
 *    d. Mark reservation as EXPIRED
 *    e. Increment available seats
 *    f. Create audit log
 * 3. Report results
 *
 * CONCURRENCY SAFETY:
 * -------------------
 *
 * This cleanup uses the same distributed locking as the scheduled jobs
 * and the booking service. If a seat is currently being processed by
 * another system (scheduled cleanup, booking confirmation, etc.), the
 * periodic cleanup will skip it and catch it on the next run.
 *
 * ============================================================================
 */

import prisma from '../lib/db';
import { acquireLock } from '../lib/locks';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum reservations to process per run (prevents long-running queries) */
const MAX_RESERVATIONS_PER_RUN = 100;

/** Lock TTL for cleanup operations (seconds) */
const CLEANUP_LOCK_TTL_SECONDS = 30;

// ============================================================================
// TYPES
// ============================================================================

export interface CleanupResult {
  /** Number of reservations successfully cleaned up */
  cleaned: number;
  /** Number of reservations that failed to clean up (locked or error) */
  failed: number;
  /** Total number of expired reservations found */
  total: number;
  /** Duration of the cleanup run in milliseconds */
  durationMs: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Run periodic cleanup of expired reservations.
 *
 * This function finds all expired but still ACTIVE reservations and
 * releases them back to the available pool. It's designed to be called
 * on a regular interval (e.g., every 60 seconds) as a fallback for
 * any missed scheduled cleanup jobs.
 *
 * @returns Cleanup results with counts and duration
 */
export async function runPeriodicCleanup(): Promise<CleanupResult> {
  const startTime = Date.now();
  const now = new Date();

  // =========================================================================
  // STEP 1: FIND EXPIRED ACTIVE RESERVATIONS
  // =========================================================================
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
          section: true,
          row: true,
          status: true,
        },
      },
    },
    take: MAX_RESERVATIONS_PER_RUN,
    orderBy: { expiresAt: 'asc' }, // Process oldest first
  });

  const total = expiredReservations.length;

  if (total === 0) {
    return {
      cleaned: 0,
      failed: 0,
      total: 0,
      durationMs: Date.now() - startTime,
    };
  }

  console.log(`[PeriodicCleanup] Found ${total} expired reservation(s) to process`);

  // =========================================================================
  // STEP 2: PROCESS EACH RESERVATION
  // =========================================================================
  let cleaned = 0;
  let failed = 0;

  for (const reservation of expiredReservations) {
    const { id: reservationId, seatId, userId, seat } = reservation;
    const { eventId, seatNumber } = seat;

    // =========================================================================
    // STEP 2a: TRY TO ACQUIRE LOCK (no retries)
    //
    // If the seat is currently being processed by another system
    // (booking, scheduled cleanup, etc.), skip it. We'll catch it
    // on the next periodic run.
    // =========================================================================
    const lockKey = `seat:${eventId}:${seatId}`;
    const lock = await acquireLock(lockKey, {
      ttlSeconds: CLEANUP_LOCK_TTL_SECONDS,
      retryCount: 0, // No retries - skip if locked
      retryDelayMs: 0,
    });

    if (!lock) {
      console.log(
        `[PeriodicCleanup] Could not acquire lock for seat ${seatNumber} - skipping`
      );
      failed++;
      continue;
    }

    try {
      // =========================================================================
      // STEP 2b: DOUBLE-CHECK RESERVATION STATUS
      //
      // The reservation might have been confirmed or already cleaned up
      // by another process while we were iterating.
      // =========================================================================
      const currentReservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!currentReservation || currentReservation.status !== 'ACTIVE') {
        console.log(
          `[PeriodicCleanup] Reservation ${reservationId} already processed - skipping`
        );
        continue;
      }

      // =========================================================================
      // STEP 2c: RELEASE THE SEAT
      // =========================================================================
      await prisma.$transaction(async (tx) => {
        // Update reservation status to EXPIRED
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'EXPIRED' },
        });

        // Update seat status to AVAILABLE
        await tx.seat.update({
          where: { id: seatId },
          data: {
            status: 'AVAILABLE',
            reservedBy: null,
            reservedUntil: null,
            version: { increment: 1 },
          },
        });

        // Increment available seats count for the event
        await tx.event.update({
          where: { id: eventId },
          data: { availableSeats: { increment: 1 } },
        });

        // Create audit log entry
        await tx.auditLog.create({
          data: {
            entityType: 'Reservation',
            entityId: reservationId,
            action: 'EXPIRE',
            userId,
            oldValue: { status: 'ACTIVE', seatStatus: 'RESERVED' },
            newValue: { status: 'EXPIRED', seatStatus: 'AVAILABLE' },
            metadata: {
              eventId,
              seatId,
              seatNumber,
              section: seat.section,
              row: seat.row,
              expiredAt: now.toISOString(),
              processedByPeriodicCleanup: true,
            },
          },
        });
      });

      console.log(
        `[PeriodicCleanup] ✅ Released seat ${seatNumber} (reservation ${reservationId})`
      );
      cleaned++;
    } catch (error) {
      console.error(
        `[PeriodicCleanup] ❌ Error processing reservation ${reservationId}:`,
        error
      );
      failed++;
    } finally {
      // Always release the lock
      await lock.release();
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[PeriodicCleanup] Completed: ${cleaned} cleaned, ${failed} failed, ${total} total in ${durationMs}ms`
  );

  return { cleaned, failed, total, durationMs };
}

// ============================================================================
// INTERVAL MANAGER
// ============================================================================

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the periodic cleanup interval.
 *
 * @param intervalMs - How often to run cleanup (default: 60000ms = 1 minute)
 */
export function startPeriodicCleanup(intervalMs: number = 60000): void {
  if (cleanupInterval) {
    console.warn('[PeriodicCleanup] Already running - call stop() first');
    return;
  }

  console.log(
    `[PeriodicCleanup] Starting periodic cleanup every ${intervalMs / 1000}s`
  );

  // Run immediately on start
  runPeriodicCleanup().catch((error) => {
    console.error('[PeriodicCleanup] Initial run failed:', error);
  });

  // Then run on interval
  cleanupInterval = setInterval(async () => {
    try {
      await runPeriodicCleanup();
    } catch (error) {
      console.error('[PeriodicCleanup] Interval run failed:', error);
    }
  }, intervalMs);
}

/**
 * Stop the periodic cleanup interval.
 */
export function stopPeriodicCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[PeriodicCleanup] Stopped');
  }
}

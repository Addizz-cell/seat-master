/**
 * ============================================================================
 * RESERVATION CLEANUP WORKER
 * ============================================================================
 *
 * This worker processes expired reservations and releases seats back to the
 * pool. It is triggered by jobs scheduled in the reservation-cleanup queue.
 *
 * HOW IT WORKS:
 * -------------
 *
 * 1. When a reservation is created, a cleanup job is scheduled to run at
 *    the expiration time (typically 10-15 minutes later).
 *
 * 2. When the job fires, this worker:
 *    a. Fetches the reservation from the database
 *    b. Checks if it's still ACTIVE (might have been confirmed)
 *    c. Acquires a distributed lock for the seat
 *    d. Updates the seat to AVAILABLE and reservation to EXPIRED
 *    e. Increments the event's available seat count
 *    f. Creates an audit log entry
 *
 * 3. If the reservation was already confirmed (status !== ACTIVE), the
 *    worker skips processing - this is normal and expected.
 *
 * 4. If the lock can't be acquired, the job will retry with exponential
 *    backoff (configured in queue.ts).
 *
 * RUNNING THE WORKER:
 * -------------------
 * npm run workers
 *
 * ============================================================================
 */

import { Worker, Job } from 'bullmq';
import prisma from '../lib/db';
import { acquireLock } from '../lib/locks';
import {
  redisConnection,
  type ReservationCleanupJobData,
} from '../lib/queue';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How many jobs to process concurrently */
const WORKER_CONCURRENCY = 5;

/** Lock TTL for cleanup operations (seconds) */
const CLEANUP_LOCK_TTL_SECONDS = 30;

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a reservation cleanup job.
 *
 * This function is called when a scheduled cleanup job fires.
 * It releases the seat back to the available pool if the reservation
 * hasn't been confirmed.
 *
 * @param job - The BullMQ job containing reservation details
 */
async function processCleanup(
  job: Job<ReservationCleanupJobData>
): Promise<void> {
  const { reservationId, seatId, eventId, userId } = job.data;
  const startTime = Date.now();

  console.log(
    `[CleanupWorker] Processing job ${job.id} for reservation ${reservationId}`
  );

  // =========================================================================
  // STEP 1: FETCH RESERVATION
  // =========================================================================
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      seat: {
        select: {
          id: true,
          seatNumber: true,
          section: true,
          row: true,
          status: true,
          eventId: true,
        },
      },
    },
  });

  if (!reservation) {
    console.log(`[CleanupWorker] Reservation ${reservationId} not found - skipping`);
    return;
  }

  // =========================================================================
  // STEP 2: CHECK IF ALREADY PROCESSED
  // =========================================================================
  if (reservation.status !== 'ACTIVE') {
    console.log(
      `[CleanupWorker] Reservation ${reservationId} status is ${reservation.status} - skipping`
    );
    return;
  }

  // =========================================================================
  // STEP 3: VERIFY EXPIRATION TIME
  //
  // If the reservation hasn't expired yet, throw an error to reschedule.
  // This can happen if the system clock is slightly off or if the job
  // was processed early for some reason.
  // =========================================================================
  const now = new Date();
  if (reservation.expiresAt > now) {
    const remainingMs = reservation.expiresAt.getTime() - now.getTime();
    console.log(
      `[CleanupWorker] Reservation ${reservationId} not yet expired (${Math.round(remainingMs / 1000)}s remaining) - rescheduling`
    );
    throw new Error(`Reservation not yet expired - will retry`);
  }

  // =========================================================================
  // STEP 4: ACQUIRE DISTRIBUTED LOCK
  //
  // We need to lock the seat before modifying it to prevent race conditions
  // with simultaneous booking attempts.
  // =========================================================================
  const lockKey = `seat:${eventId}:${seatId}`;
  const lock = await acquireLock(lockKey, {
    ttlSeconds: CLEANUP_LOCK_TTL_SECONDS,
    retryCount: 3,
    retryDelayMs: 100,
  });

  if (!lock) {
    console.log(
      `[CleanupWorker] Could not acquire lock for seat ${seatId} - will retry`
    );
    throw new Error('Could not acquire lock - will retry');
  }

  try {
    // =========================================================================
    // STEP 5: DOUBLE-CHECK RESERVATION STATUS
    //
    // The reservation might have been confirmed while we were waiting for
    // the lock. Check again within the lock to be safe.
    // =========================================================================
    const currentReservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!currentReservation || currentReservation.status !== 'ACTIVE') {
      console.log(
        `[CleanupWorker] Reservation ${reservationId} was confirmed while waiting for lock - skipping`
      );
      return;
    }

    // =========================================================================
    // STEP 6: RELEASE THE SEAT
    //
    // Update the seat to AVAILABLE, mark the reservation as EXPIRED,
    // increment available seats count, and create an audit log entry.
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
            seatNumber: reservation.seat.seatNumber,
            section: reservation.seat.section,
            row: reservation.seat.row,
            expiredAt: now.toISOString(),
            processedByWorker: true,
          },
        },
      });
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CleanupWorker] ✅ Released seat ${reservation.seat.seatNumber} (reservation ${reservationId}) in ${duration}ms`
    );
  } finally {
    // =========================================================================
    // STEP 7: ALWAYS RELEASE THE LOCK
    // =========================================================================
    await lock.release();
  }
}

// ============================================================================
// WORKER CREATION
// ============================================================================

/**
 * Create and configure the reservation cleanup worker.
 *
 * @returns Configured BullMQ Worker instance
 */
export function createCleanupWorker(): Worker<ReservationCleanupJobData> {
  const worker = new Worker<ReservationCleanupJobData>(
    'reservation-cleanup',
    processCleanup,
    {
      connection: redisConnection,
      concurrency: WORKER_CONCURRENCY,
    }
  );

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================

  worker.on('completed', (job) => {
    console.log(`[CleanupWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[CleanupWorker] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[CleanupWorker] Worker error:', error);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[CleanupWorker] Job ${jobId} stalled`);
  });

  console.log('[CleanupWorker] Worker initialized');

  return worker;
}

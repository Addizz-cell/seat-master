import { Queue, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

/**
 * ============================================================================
 * BULLMQ QUEUE CONFIGURATION
 * ============================================================================
 *
 * This module sets up job queues for background processing:
 *
 * 1. RESERVATION_CLEANUP - Releases expired reservations back to the pool
 * 2. BOOKING_NOTIFICATIONS - Future: sends email confirmations
 *
 * Uses Redis as the backing store, sharing the same Redis instance
 * as the distributed locking system.
 *
 * ============================================================================
 */

// ============================================================================
// REDIS CONNECTION FOR BULLMQ
// ============================================================================

/**
 * BullMQ requires its own Redis connection (not shared with ioredis singleton).
 * This is because BullMQ uses blocking commands that could interfere with
 * regular Redis operations.
 */
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL for connection options
function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port, 10) || 6379,
  };
}

const redisConfig = parseRedisUrl(redisUrl);

/**
 * Redis connection options for BullMQ.
 * Using connection options instead of IORedis instance for better TypeScript compatibility.
 */
export const redisConnection: ConnectionOptions = {
  host: redisConfig.host,
  port: redisConfig.port,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false, // Faster connection
};

// ============================================================================
// QUEUE DEFINITIONS
// ============================================================================

/**
 * Job data types for type safety
 */
export interface ReservationCleanupJobData {
  reservationId: string;
  seatId: string;
  eventId: string;
  userId: string;
  expiresAt: string; // ISO date string
}

export interface BookingNotificationJobData {
  bookingId: string;
  userId: string;
  email: string;
  bookingReference: string;
  eventName: string;
  seats: string[];
}

/**
 * Default job options for all queues.
 * - removeOnComplete: Keep last 100 completed jobs for debugging
 * - removeOnFail: Keep last 500 failed jobs for analysis
 * - attempts: Retry failed jobs up to 3 times
 * - backoff: Exponential backoff starting at 1 second
 */
const defaultJobOptions = {
  removeOnComplete: 100,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
};

/**
 * Queue for processing expired reservations.
 *
 * When a reservation is created, a cleanup job is scheduled to run
 * at the expiration time. If the user completes the booking, the
 * job is cancelled. Otherwise, it releases the seat back to the pool.
 */
export const reservationCleanupQueue = new Queue<ReservationCleanupJobData>(
  'reservation-cleanup',
  {
    connection: redisConnection,
    defaultJobOptions,
  }
);

/**
 * Queue for sending booking notifications.
 * Future enhancement: email confirmations, SMS alerts, etc.
 */
export const bookingNotificationQueue = new Queue<BookingNotificationJobData>(
  'booking-notifications',
  {
    connection: redisConnection,
    defaultJobOptions,
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Schedule a cleanup job for a reservation.
 *
 * Called when a reservation is created. The job will run at the
 * expiration time and release the seat if the reservation wasn't
 * converted to a booking.
 *
 * @param data - Reservation details for the cleanup job
 * @returns The created job
 *
 * @example
 * await scheduleReservationCleanup({
 *   reservationId: 'uuid',
 *   seatId: 'uuid',
 *   eventId: 'uuid',
 *   userId: 'user123',
 *   expiresAt: '2024-01-01T00:15:00.000Z'
 * });
 */
export async function scheduleReservationCleanup(
  data: ReservationCleanupJobData
): Promise<Job<ReservationCleanupJobData, unknown, string>> {
  const expiresAt = new Date(data.expiresAt);
  const now = new Date();
  const delay = Math.max(0, expiresAt.getTime() - now.getTime());

  console.log(
    `[Queue] Scheduling cleanup for reservation ${data.reservationId} in ${Math.round(delay / 1000)}s`
  );

  // Use reservationId as jobId to prevent duplicates
  // If a job with this ID already exists, it won't be created again
  const job = await reservationCleanupQueue.add(
    'cleanup',
    data,
    {
      delay,
      jobId: `cleanup:${data.reservationId}`,
    }
  );

  return job;
}

/**
 * Cancel a scheduled cleanup job.
 *
 * Called when a reservation is successfully converted to a booking.
 * Removes the pending cleanup job so the seat isn't released.
 *
 * @param reservationId - The reservation ID to cancel cleanup for
 * @returns true if job was found and removed, false otherwise
 *
 * @example
 * const cancelled = await cancelReservationCleanup('uuid');
 * console.log(cancelled ? 'Cleanup cancelled' : 'No pending cleanup found');
 */
export async function cancelReservationCleanup(
  reservationId: string
): Promise<boolean> {
  const jobId = `cleanup:${reservationId}`;

  try {
    // Try to find the job in different states
    const job = await reservationCleanupQueue.getJob(jobId);

    if (job) {
      // Remove the job from the queue
      await job.remove();
      console.log(`[Queue] Cancelled cleanup for reservation ${reservationId}`);
      return true;
    }

    console.log(`[Queue] No pending cleanup found for reservation ${reservationId}`);
    return false;
  } catch (error) {
    console.error(`[Queue] Error cancelling cleanup for ${reservationId}:`, error);
    return false;
  }
}

/**
 * Get queue statistics for monitoring.
 *
 * @returns Object with counts for each queue state
 */
export async function getQueueStats(): Promise<{
  cleanup: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  notifications: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}> {
  const [cleanupCounts, notificationCounts] = await Promise.all([
    reservationCleanupQueue.getJobCounts(),
    bookingNotificationQueue.getJobCounts(),
  ]);

  return {
    cleanup: {
      waiting: cleanupCounts.waiting || 0,
      active: cleanupCounts.active || 0,
      completed: cleanupCounts.completed || 0,
      failed: cleanupCounts.failed || 0,
      delayed: cleanupCounts.delayed || 0,
    },
    notifications: {
      waiting: notificationCounts.waiting || 0,
      active: notificationCounts.active || 0,
      completed: notificationCounts.completed || 0,
      failed: notificationCounts.failed || 0,
      delayed: notificationCounts.delayed || 0,
    },
  };
}

/**
 * Gracefully close all queue connections.
 * Call this during application shutdown.
 */
export async function closeQueues(): Promise<void> {
  console.log('[Queue] Closing queue connections...');
  await Promise.all([
    reservationCleanupQueue.close(),
    bookingNotificationQueue.close(),
  ]);
  console.log('[Queue] All queues closed');
}

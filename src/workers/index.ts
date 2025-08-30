/**
 * ============================================================================
 * WORKER ENTRY POINT
 * ============================================================================
 *
 * This is the main entry point for background workers. It starts:
 *
 * 1. Reservation Cleanup Worker - Processes scheduled cleanup jobs
 * 2. Periodic Cleanup - Fallback for missed scheduled jobs (every 60s)
 *
 * HOW TO RUN:
 * -----------
 * npm run workers
 *
 * REQUIREMENTS:
 * -------------
 * - Redis must be running (npm run docker:up)
 * - PostgreSQL must be running (npm run docker:up)
 *
 * GRACEFUL SHUTDOWN:
 * ------------------
 * The worker handles SIGTERM and SIGINT signals for graceful shutdown.
 * When shutting down:
 * 1. Stops accepting new jobs
 * 2. Waits for current jobs to complete
 * 3. Cleans up connections
 * 4. Exits cleanly
 *
 * ============================================================================
 */

import { createCleanupWorker } from './reservationCleanupWorker';
import { startPeriodicCleanup, stopPeriodicCleanup } from './periodicCleanup';
import { closeQueues, getQueueStats } from '../lib/queue';
import type { Worker } from 'bullmq';
import type { ReservationCleanupJobData } from '../lib/queue';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How often to run periodic cleanup (milliseconds) */
const PERIODIC_CLEANUP_INTERVAL_MS = 60000; // 1 minute

/** How often to log queue stats (milliseconds) */
const STATS_LOG_INTERVAL_MS = 300000; // 5 minutes

// ============================================================================
// STARTUP BANNER
// ============================================================================

function printBanner(): void {
  console.log('');
  console.log('============================================================');
  console.log('  BOOKING SYSTEM - BACKGROUND WORKERS');
  console.log('============================================================');
  console.log('');
  console.log('  Workers starting:');
  console.log('  -----------------');
  console.log('  1. Reservation Cleanup Worker (BullMQ)');
  console.log('     - Processes scheduled cleanup jobs');
  console.log('     - Releases expired reservations');
  console.log('');
  console.log('  2. Periodic Cleanup (Fallback)');
  console.log(`     - Runs every ${PERIODIC_CLEANUP_INTERVAL_MS / 1000}s`);
  console.log('     - Catches any missed scheduled jobs');
  console.log('');
  console.log('============================================================');
  console.log('');
}

// ============================================================================
// STATS LOGGING
// ============================================================================

async function logQueueStats(): Promise<void> {
  try {
    const stats = await getQueueStats();
    console.log('');
    console.log('[Stats] Queue status:');
    console.log(`  Cleanup queue: waiting=${stats.cleanup.waiting}, active=${stats.cleanup.active}, delayed=${stats.cleanup.delayed}, completed=${stats.cleanup.completed}, failed=${stats.cleanup.failed}`);
    console.log(`  Notifications queue: waiting=${stats.notifications.waiting}, active=${stats.notifications.active}, delayed=${stats.notifications.delayed}`);
    console.log('');
  } catch (error) {
    console.error('[Stats] Error getting queue stats:', error);
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main(): Promise<void> {
  printBanner();

  // Track workers and intervals for cleanup
  let cleanupWorker: Worker<ReservationCleanupJobData> | null = null;
  let statsInterval: NodeJS.Timeout | null = null;
  let isShuttingDown = false;

  // =========================================================================
  // GRACEFUL SHUTDOWN HANDLER
  // =========================================================================
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      console.log(`[Shutdown] Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    console.log('');
    console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new work
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }

    stopPeriodicCleanup();

    // Wait for current jobs to complete
    if (cleanupWorker) {
      console.log('[Shutdown] Closing cleanup worker...');
      await cleanupWorker.close();
      cleanupWorker = null;
    }

    // Close queue connections
    await closeQueues();

    console.log('[Shutdown] Graceful shutdown complete');
    process.exit(0);
  };

  // Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Fatal] Unhandled rejection:', reason);
    shutdown('unhandledRejection').catch(() => process.exit(1));
  });

  // =========================================================================
  // START WORKERS
  // =========================================================================
  try {
    // Start the cleanup worker
    console.log('[Startup] Starting reservation cleanup worker...');
    cleanupWorker = createCleanupWorker();
    console.log('[Startup] ✅ Cleanup worker started');

    // Start periodic cleanup
    console.log('[Startup] Starting periodic cleanup...');
    startPeriodicCleanup(PERIODIC_CLEANUP_INTERVAL_MS);
    console.log('[Startup] ✅ Periodic cleanup started');

    // Start stats logging
    statsInterval = setInterval(logQueueStats, STATS_LOG_INTERVAL_MS);

    // Log initial stats
    await logQueueStats();

    console.log('');
    console.log('============================================================');
    console.log('  ALL WORKERS RUNNING');
    console.log('  Press Ctrl+C to stop');
    console.log('============================================================');
    console.log('');
  } catch (error) {
    console.error('[Startup] Failed to start workers:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('[Fatal] Main function failed:', error);
  process.exit(1);
});

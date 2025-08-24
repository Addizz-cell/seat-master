/**
 * ============================================================================
 * DISTRIBUTED LOCKING UTILITIES
 * ============================================================================
 *
 * This module provides Redis-based distributed locks that work across multiple
 * application servers. Unlike PostgreSQL's SELECT FOR UPDATE (which only works
 * within a single database connection), these locks can coordinate between
 * any number of servers sharing the same Redis instance.
 *
 * KEY CONCEPTS:
 * -------------
 *
 * 1. LOCK OWNERSHIP
 *    Each lock has a unique value (UUID) that identifies who holds it.
 *    This prevents a process from accidentally releasing someone else's lock
 *    if their own lock expired while they were processing.
 *
 * 2. TTL (Time To Live)
 *    Locks automatically expire after a set time (default 30s).
 *    This prevents deadlocks if a process crashes while holding a lock.
 *    WARNING: If your processing takes longer than TTL, the lock will expire
 *    and another process might acquire it! Set TTL carefully.
 *
 * 3. DEADLOCK PREVENTION
 *    When acquiring multiple locks, always acquire them in sorted order.
 *    This prevents the circular wait condition that causes deadlocks:
 *    - BAD:  Process A locks [seat1, seat2], Process B locks [seat2, seat1]
 *    - GOOD: Both processes lock [seat1, seat2] in that order
 *
 * 4. ATOMIC RELEASE (Lua Script)
 *    We use a Lua script to atomically check ownership and release.
 *    This prevents the following race condition:
 *    - Process A's lock expires
 *    - Process B acquires the same lock
 *    - Process A tries to release (without checking) and removes B's lock!
 *
 * COMPARISON WITH OTHER APPROACHES:
 * ---------------------------------
 *
 * | Approach              | Scales Horizontally | Complexity | Consistency |
 * |-----------------------|---------------------|------------|-------------|
 * | SELECT FOR UPDATE     | ❌ No               | Low        | Strong      |
 * | Redis Distributed Lock| ✅ Yes              | Medium     | Eventual*   |
 * | Redlock (Multi-Redis) | ✅ Yes              | High       | Strong      |
 *
 * *Eventual consistency: If Redis fails, locks might be lost. For critical
 * financial transactions, consider Redlock or database-level locks.
 *
 * ============================================================================
 */

import redis from './redis';
import { v4 as uuidv4 } from 'uuid';
import type { AcquiredLock } from '@/types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for acquiring a lock.
 */
export interface LockOptions {
  /** Lock TTL in seconds. Default: 30. Set based on expected processing time. */
  ttlSeconds?: number;
  /** Number of retry attempts if lock is not immediately available. Default: 3 */
  retryCount?: number;
  /** Delay between retry attempts in milliseconds. Default: 100 */
  retryDelayMs?: number;
}

const DEFAULT_LOCK_OPTIONS: Required<LockOptions> = {
  ttlSeconds: 30,
  retryCount: 3,
  retryDelayMs: 100,
};

// ============================================================================
// LUA SCRIPTS
// ============================================================================

/**
 * Lua script for atomic lock release.
 *
 * WHY LUA SCRIPT IS CRITICAL:
 * ---------------------------
 * Consider this scenario WITHOUT atomic check-and-delete:
 *
 * 1. Process A acquires lock with value "A123"
 * 2. Process A takes too long, lock expires automatically
 * 3. Process B acquires the same lock with value "B456"
 * 4. Process A finishes and calls DELETE on the key
 * 5. Process A just deleted Process B's lock! 💥
 *
 * With this Lua script:
 * - Step 4 would check: is the value still "A123"? NO, it's "B456"
 * - Step 4 returns 0 (not deleted), Process B's lock is safe ✅
 *
 * The script runs atomically - no other command can run between
 * the GET and DEL operations.
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  else
    return 0
  end
`;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Sleep for a specified duration.
 * Used for retry delays when lock acquisition fails.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire a distributed lock on a single key.
 *
 * @param key - The lock key (e.g., "seat:event123:seatABC")
 * @param options - Lock options (TTL, retry settings)
 * @returns AcquiredLock object if successful, null if lock could not be acquired
 *
 * @example
 * const lock = await acquireLock('seat:123', { ttlSeconds: 10 });
 * if (!lock) {
 *   throw new Error('Could not acquire lock - seat may be in use');
 * }
 * try {
 *   await processReservation();
 * } finally {
 *   await lock.release();
 * }
 */
export async function acquireLock(
  key: string,
  options: LockOptions = {}
): Promise<AcquiredLock | null> {
  const { ttlSeconds, retryCount, retryDelayMs } = {
    ...DEFAULT_LOCK_OPTIONS,
    ...options,
  };

  // Generate a unique value for this lock holder
  // Using UUID ensures uniqueness across all processes/servers
  const value = uuidv4();
  const ttlMs = ttlSeconds * 1000;

  // Attempt to acquire the lock with retries
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    // SET key value NX (only if Not eXists) PX milliseconds (expire)
    // This is atomic - either we get the lock or we don't
    const result = await redis.set(key, value, 'PX', ttlMs, 'NX');

    if (result === 'OK') {
      console.log(`[Lock] 🔒 Acquired: ${key} (value: ${value.substring(0, 8)}...)`);

      // Return lock object with release method
      return {
        key,
        value,
        release: async () => releaseLock(key, value),
      };
    }

    // Lock not acquired, wait before retrying
    if (attempt < retryCount) {
      console.log(`[Lock] ⏳ Waiting to retry: ${key} (attempt ${attempt + 1}/${retryCount})`);
      await sleep(retryDelayMs);
    }
  }

  // Could not acquire lock after all retries
  console.log(`[Lock] ❌ Failed to acquire: ${key}`);
  return null;
}

/**
 * Release a distributed lock.
 *
 * IMPORTANT: This uses a Lua script to atomically verify ownership
 * before releasing. This prevents accidentally releasing someone
 * else's lock if your own lock expired.
 *
 * @param key - The lock key
 * @param value - The unique value identifying the lock holder
 * @returns true if lock was released, false if lock was not owned by caller
 */
export async function releaseLock(key: string, value: string): Promise<boolean> {
  const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, value);
  const released = result === 1;

  if (released) {
    console.log(`[Lock] 🔓 Released: ${key}`);
  } else {
    console.log(`[Lock] ⚠️ Not released (not owned or expired): ${key}`);
  }

  return released;
}

/**
 * Acquire multiple locks in a safe, deadlock-free manner.
 *
 * DEADLOCK PREVENTION:
 * --------------------
 * This function SORTS the keys before acquiring locks.
 * This ensures all processes acquire locks in the same order,
 * preventing circular wait conditions.
 *
 * Example of deadlock without sorting:
 * - Process A: acquires lock1, waits for lock2
 * - Process B: acquires lock2, waits for lock1
 * - DEADLOCK! Neither can proceed.
 *
 * With sorting (both acquire in order lock1, lock2):
 * - Process A: acquires lock1, acquires lock2, proceeds
 * - Process B: waits for lock1, eventually acquires both, proceeds
 * - No deadlock! ✅
 *
 * ROLLBACK ON FAILURE:
 * -------------------
 * If any lock fails to acquire, all previously acquired locks
 * are released before returning null. This prevents partial
 * lock states that could cause issues.
 *
 * @param keys - Array of lock keys to acquire
 * @param options - Lock options (shared across all locks)
 * @returns Array of AcquiredLock objects if ALL locks acquired, null if ANY failed
 */
export async function acquireMultipleLocks(
  keys: string[],
  options: LockOptions = {}
): Promise<AcquiredLock[] | null> {
  if (keys.length === 0) {
    return [];
  }

  // CRITICAL: Sort keys to prevent deadlock
  const sortedKeys = [...keys].sort();

  console.log(`[Lock] 🔒 Acquiring ${sortedKeys.length} locks in order:`,
    sortedKeys.map(k => k.substring(0, 30)).join(', '));

  const acquiredLocks: AcquiredLock[] = [];

  for (const key of sortedKeys) {
    const lock = await acquireLock(key, options);

    if (lock) {
      acquiredLocks.push(lock);
    } else {
      // Failed to acquire this lock - release all previously acquired locks
      console.log(`[Lock] ❌ Failed to acquire lock: ${key}, releasing ${acquiredLocks.length} acquired locks`);

      // Release in parallel for speed
      await releaseMultipleLocks(acquiredLocks);

      return null;
    }
  }

  console.log(`[Lock] ✅ All ${acquiredLocks.length} locks acquired successfully`);
  return acquiredLocks;
}

/**
 * Release multiple locks in parallel.
 *
 * Releasing in parallel is safe and faster than sequential release.
 * Each release is independent - if one fails, others still succeed.
 *
 * @param locks - Array of AcquiredLock objects to release
 */
export async function releaseMultipleLocks(locks: AcquiredLock[]): Promise<void> {
  if (locks.length === 0) {
    return;
  }

  console.log(`[Lock] 🔓 Releasing ${locks.length} locks`);

  // Release all locks in parallel
  const results = await Promise.allSettled(
    locks.map((lock) => lock.release())
  );

  // Log any failures (shouldn't happen normally, but useful for debugging)
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(`[Lock] ⚠️ ${failures.length} lock releases failed:`, failures);
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Execute a function while holding a lock.
 *
 * This is the recommended way to use locks - it ensures the lock
 * is always released, even if the function throws an error.
 *
 * @param key - The lock key
 * @param fn - The function to execute while holding the lock
 * @param options - Lock options
 * @returns The result of fn, or throws if lock couldn't be acquired
 *
 * @example
 * const result = await withLock('seat:123', async () => {
 *   // This code runs exclusively - no other process can have this lock
 *   return await reserveSeat('123');
 * });
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(key, options);

  if (!lock) {
    throw new Error(`Could not acquire lock: ${key}`);
  }

  try {
    return await fn();
  } finally {
    // ALWAYS release the lock, even on error
    await lock.release();
  }
}

/**
 * Execute a function while holding multiple locks.
 *
 * Similar to withLock but for multiple resources.
 * Locks are acquired in sorted order to prevent deadlocks.
 *
 * @param keys - Array of lock keys
 * @param fn - The function to execute while holding all locks
 * @param options - Lock options (shared across all locks)
 * @returns The result of fn, or throws if any lock couldn't be acquired
 *
 * @example
 * const result = await withMultipleLocks(
 *   ['seat:event1:seatA', 'seat:event1:seatB'],
 *   async () => {
 *     // This code runs exclusively for both seats
 *     return await reserveMultipleSeats(['seatA', 'seatB']);
 *   }
 * );
 */
export async function withMultipleLocks<T>(
  keys: string[],
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const locks = await acquireMultipleLocks(keys, options);

  if (!locks) {
    throw new Error(`Could not acquire all locks: ${keys.join(', ')}`);
  }

  try {
    return await fn();
  } finally {
    // ALWAYS release all locks, even on error
    await releaseMultipleLocks(locks);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a lock key for a seat.
 * Using a consistent key format is important for lock coordination.
 *
 * @param eventId - The event ID
 * @param seatId - The seat ID
 * @returns Lock key in format "seat:{eventId}:{seatId}"
 */
export function seatLockKey(eventId: string, seatId: string): string {
  return `seat:${eventId}:${seatId}`;
}

/**
 * Generate lock keys for multiple seats.
 *
 * @param eventId - The event ID
 * @param seatIds - Array of seat IDs
 * @returns Array of lock keys
 */
export function seatLockKeys(eventId: string, seatIds: string[]): string[] {
  return seatIds.map((seatId) => seatLockKey(eventId, seatId));
}

/**
 * Check if a lock exists (for debugging/monitoring).
 * Does NOT acquire the lock.
 *
 * @param key - The lock key
 * @returns true if lock exists, false otherwise
 */
export async function isLocked(key: string): Promise<boolean> {
  const value = await redis.get(key);
  return value !== null;
}

/**
 * Get the TTL (time to live) of a lock in milliseconds.
 * Useful for monitoring lock health.
 *
 * @param key - The lock key
 * @returns TTL in milliseconds, -1 if key exists but has no TTL, -2 if key doesn't exist
 */
export async function getLockTTL(key: string): Promise<number> {
  return redis.pttl(key);
}

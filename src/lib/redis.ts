import Redis from 'ioredis';

/**
 * Redis Client Singleton
 *
 * This pattern prevents multiple Redis connections in development
 * due to Next.js hot reloading. In production, it creates a single connection.
 *
 * Redis is used for:
 * - Distributed locks (preventing race conditions during bookings)
 * - Caching (reducing database load)
 * - Session management (optional)
 */

// Extend the global type to include our Redis instance
declare global {
  // eslint-disable-next-line no-var
  var redis: Redis | undefined;
}

// Create a single Redis client instance
const redisClientSingleton = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const client = new Redis(redisUrl, {
    // Retry strategy for connection failures
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Maximum retry attempts
    maxRetriesPerRequest: 3,
    // Enable offline queue to buffer commands when disconnected
    enableOfflineQueue: true,
    // Connection timeout
    connectTimeout: 10000,
    // Reconnect on error
    reconnectOnError(err) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    },
  });

  // Event handlers for debugging
  client.on('connect', () => {
    console.log('✅ Redis: Connected');
  });

  client.on('ready', () => {
    console.log('✅ Redis: Ready to accept commands');
  });

  client.on('error', (err) => {
    console.error('❌ Redis Error:', err);
  });

  client.on('close', () => {
    console.log('⚠️  Redis: Connection closed');
  });

  client.on('reconnecting', () => {
    console.log('🔄 Redis: Reconnecting...');
  });

  return client;
};

// Use existing instance in development, create new one in production
const redis = globalThis.redis ?? redisClientSingleton();

// In development, save the instance to global to prevent multiple instances
if (process.env.NODE_ENV !== 'production') {
  globalThis.redis = redis;
}

/**
 * Helper function to acquire a distributed lock
 *
 * @param key - Lock key (e.g., 'lock:seat:123')
 * @param ttl - Time to live in seconds (default: 10s)
 * @returns Lock token if acquired, null otherwise
 */
export async function acquireLock(
  key: string,
  ttl: number = 10
): Promise<string | null> {
  // Generate a unique token for this lock
  const token = `${Date.now()}-${Math.random()}`;

  // SET key value NX (only if not exists) EX ttl (expire after ttl seconds)
  const result = await redis.set(key, token, 'EX', ttl, 'NX');

  return result === 'OK' ? token : null;
}

/**
 * Helper function to release a distributed lock
 *
 * @param key - Lock key
 * @param token - Lock token (to prevent releasing someone else's lock)
 * @returns true if released, false otherwise
 */
export async function releaseLock(
  key: string,
  token: string
): Promise<boolean> {
  // Lua script to atomically check token and delete
  // This prevents releasing a lock that was acquired by someone else
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(script, 1, key, token);
  return result === 1;
}

export default redis;

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * PrismaClient Singleton
 *
 * This pattern prevents multiple instances of Prisma Client in development
 * due to Next.js hot reloading. In production, it creates a single instance.
 *
 * Prisma 7 requires an adapter for database connections.
 * Learn more: https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices
 */

// Extend the global type to include our prisma instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Create a single Prisma Client instance
const prismaClientSingleton = () => {
  // Create PostgreSQL connection pool
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });
};

// Use existing instance in development, create new one in production
const prisma = globalThis.prisma ?? prismaClientSingleton();

// In development, save the instance to global to prevent multiple instances
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

export default prisma;

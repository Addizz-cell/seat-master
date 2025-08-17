/**
 * Verification script to test database and Redis connections
 *
 * Run with: npx tsx scripts/verify-setup.ts
 */

import prisma from '../src/lib/db';
import redis from '../src/lib/redis';

async function verifySetup() {
  console.log('🔍 Verifying setup...\n');

  let success = true;

  // Test PostgreSQL connection
  try {
    console.log('Testing PostgreSQL connection...');
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ PostgreSQL: Connected successfully\n');
  } catch (error) {
    console.error('❌ PostgreSQL: Connection failed');
    console.error(error);
    success = false;
  }

  // Test Redis connection
  try {
    console.log('Testing Redis connection...');
    const pong = await redis.ping();
    if (pong === 'PONG') {
      console.log('✅ Redis: Connected successfully');

      // Test set/get
      await redis.set('test-key', 'test-value', 'EX', 10);
      const value = await redis.get('test-key');
      console.log(`✅ Redis: Set/Get working (value: ${value})\n`);
    }
  } catch (error) {
    console.error('❌ Redis: Connection failed');
    console.error(error);
    success = false;
  }

  // Cleanup
  try {
    await prisma.$disconnect();
    await redis.quit();
  } catch (error) {
    // Ignore cleanup errors
  }

  if (success) {
    console.log('✅ All systems operational!\n');
    console.log('Next steps:');
    console.log('1. Define your database schema in prisma/schema.prisma');
    console.log('2. Run: npx prisma migrate dev');
    console.log('3. Start building your API endpoints\n');
  } else {
    console.log('\n❌ Setup verification failed. Please check:');
    console.log('1. Docker containers are running: docker-compose ps');
    console.log('2. Environment variables are set correctly in .env.local');
    console.log('3. Ports 5432 (PostgreSQL) and 6379 (Redis) are not in use\n');
    process.exit(1);
  }
}

verifySetup();

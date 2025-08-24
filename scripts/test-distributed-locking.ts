/**
 * ============================================================================
 * DISTRIBUTED LOCKING TEST SCRIPT
 * ============================================================================
 *
 * This script comprehensively tests the Redis-based distributed locking
 * implementation at multiple concurrency levels.
 *
 * HOW TO RUN:
 * -----------
 * 1. Start Redis and PostgreSQL: npm run docker:up
 * 2. Reset database: npx prisma migrate reset
 * 3. Start server: npm run dev
 * 4. Run this test: npm run test:distributed
 *
 * WHAT IT TESTS:
 * --------------
 * 1. Low concurrency (5 requests) - Basic correctness
 * 2. Medium concurrency (20 requests) - Moderate load
 * 3. High concurrency (50 requests) - Stress test
 *
 * For each test:
 * - Finds an available seat
 * - Fires N concurrent requests
 * - Verifies exactly 1 success
 * - Shows timing distribution
 * - Displays final seat state from database
 *
 * EXPECTED RESULT:
 * ----------------
 * - Exactly ONE user successfully reserves the seat per test
 * - Other users fail with lock or availability errors
 * - Lower latency than pessimistic locking under contention
 *
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface ReservationResponse {
  success: boolean;
  data?: {
    reservationIds: string[];
    seats: Array<{ seatNumber: string }>;
    userId: string;
    duration: number;
  };
  error?: string;
  code?: string;
}

interface RequestResult {
  userId: string;
  success: boolean;
  error?: string;
  code?: string;
  duration: number;
  serverDuration?: number;
  reservationIds?: string[];
}

interface TestResult {
  concurrency: number;
  successes: number;
  failures: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  passed: boolean;
}

/**
 * Make a reservation request using distributed locking
 */
async function makeReservation(
  eventId: string,
  seatId: string,
  userId: string
): Promise<RequestResult> {
  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        eventId,
        seatIds: [seatId],
      }),
    });

    const data: ReservationResponse = await response.json();
    const duration = Date.now() - start;

    if (data.success && data.data) {
      return {
        userId,
        success: true,
        duration,
        serverDuration: data.data.duration,
        reservationIds: data.data.reservationIds,
      };
    } else {
      return {
        userId,
        success: false,
        error: data.error || 'Unknown error',
        code: data.code,
        duration,
      };
    }
  } catch (error) {
    return {
      userId,
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
      duration: Date.now() - start,
    };
  }
}

/**
 * Fetch available events and find an available seat
 */
async function getAvailableSeat(): Promise<{ eventId: string; seatId: string; seatNumber: string } | null> {
  try {
    const eventsResponse = await fetch(`${BASE_URL}/api/events?limit=1`);
    const eventsData = await eventsResponse.json();

    if (!eventsData.success || !eventsData.data?.items?.length) {
      console.error('No events found. Run: npm run db:seed');
      return null;
    }

    const eventId = eventsData.data.items[0].id;

    const seatsResponse = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
    const seatsData = await seatsResponse.json();

    if (!seatsData.success || !seatsData.data?.sections?.length) {
      console.error('No seats found for event');
      return null;
    }

    for (const section of seatsData.data.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (seat.status === 'AVAILABLE') {
            return {
              eventId,
              seatId: seat.id,
              seatNumber: seat.seatNumber,
            };
          }
        }
      }
    }

    console.error('No available seats found. Run: npx prisma migrate reset');
    return null;
  } catch (error) {
    console.error('Error fetching test data:', error);
    return null;
  }
}

/**
 * Get final seat state from database via API
 */
async function getSeatState(eventId: string, seatId: string): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
    const data = await response.json();

    if (!data.success) return null;

    for (const section of data.data.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (seat.id === seatId) {
            return seat.status;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function separator(char = '=', length = 70) {
  console.log(char.repeat(length));
}

/**
 * Visualize the timeline of requests
 */
function visualizeTimeline(results: RequestResult[]) {
  console.log('\n📊 REQUEST TIMELINE\n');

  const minDuration = Math.min(...results.map((r) => r.duration));
  const maxDuration = Math.max(...results.map((r) => r.duration));
  const range = maxDuration - minDuration || 1;

  // Sort by duration
  const sorted = [...results].sort((a, b) => a.duration - b.duration);

  // Show first 15 and last 5 for large result sets
  const toShow = sorted.length <= 20
    ? sorted
    : [...sorted.slice(0, 15), null, ...sorted.slice(-5)];

  for (const result of toShow) {
    if (result === null) {
      console.log('   ... (' + (sorted.length - 20) + ' more results) ...');
      continue;
    }
    const icon = result.success ? '✅' : '❌';
    const barLength = Math.round(((result.duration - minDuration) / range) * 25) + 1;
    const bar = '█'.repeat(Math.min(barLength, 30));
    const serverTime = result.serverDuration ? ` (server: ${result.serverDuration}ms)` : '';

    console.log(
      `   ${icon} ${result.userId.padEnd(10)}: ${bar} ${result.duration}ms${serverTime}`
    );
  }

  console.log('\n   Legend: Bar length shows relative response time');
}

/**
 * Run a single concurrency test
 */
async function runConcurrencyTest(concurrency: number): Promise<TestResult> {
  console.log(`\n⏱️  Testing with ${concurrency} concurrent requests...\n`);

  // Get a fresh seat for this test
  const testSeat = await getAvailableSeat();
  if (!testSeat) {
    console.error('Could not find available seat for test');
    return {
      concurrency,
      successes: 0,
      failures: concurrency,
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      passed: false,
    };
  }

  const { eventId, seatId, seatNumber } = testSeat;
  console.log(`   Target: Seat ${seatNumber} (ID: ${seatId.substring(0, 8)}...)`);

  // Generate user IDs
  const userIds = Array.from(
    { length: concurrency },
    (_, i) => `user-${String(i + 1).padStart(2, '0')}`
  );

  // Fire all requests concurrently
  const startTime = Date.now();
  const results = await Promise.all(
    userIds.map((userId) => makeReservation(eventId, seatId, userId))
  );
  const totalTime = Date.now() - startTime;

  // Analyze results
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const lockErrors = failures.filter((r) => r.code === 'SEAT_LOCK_ERROR');
  const notAvailable = failures.filter((r) => r.code === 'SEAT_NOT_AVAILABLE');

  // Calculate timing stats
  const durations = results.map((r) => r.duration);
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  // Visualize timeline
  visualizeTimeline(results);

  // Show summary
  separator('-');
  console.log('\n📈 TEST SUMMARY\n');
  console.log(`   Concurrency level: ${concurrency}`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Successful: ${successes.length}/${concurrency}`);
  console.log(`   Failed (lock contention): ${lockErrors.length}`);
  console.log(`   Failed (seat taken): ${notAvailable.length}`);
  console.log(`   Failed (other): ${failures.length - lockErrors.length - notAvailable.length}`);
  console.log(`\n   Response times:`);
  console.log(`     Min: ${minDuration}ms`);
  console.log(`     Avg: ${avgDuration}ms`);
  console.log(`     Max: ${maxDuration}ms`);
  console.log(`     Spread: ${maxDuration - minDuration}ms`);

  // Verify final state
  const finalStatus = await getSeatState(eventId, seatId);
  console.log(`\n   Final seat status in database: ${finalStatus}`);

  const passed = successes.length === 1;

  if (passed) {
    console.log(`\n   ✅ TEST PASSED: Exactly 1 user (${successes[0].userId}) got the seat!`);
  } else if (successes.length === 0) {
    console.log('\n   ❌ TEST FAILED: No users succeeded');
  } else {
    console.log(`\n   ❌ TEST FAILED: ${successes.length} users succeeded (expected 1)`);
  }

  return {
    concurrency,
    successes: successes.length,
    failures: failures.length,
    avgDuration,
    minDuration,
    maxDuration,
    passed,
  };
}

/**
 * Print comparison table with all three approaches
 */
function printComparisonTable() {
  console.log('\n📚 COMPARISON: All Three Approaches\n');
  console.log('   ┌─────────────────────┬──────────────┬──────────────┬───────────────────┐');
  console.log('   │ Approach            │ Correctness  │ Avg Response │ Scales Horiz.     │');
  console.log('   ├─────────────────────┼──────────────┼──────────────┼───────────────────┤');
  console.log('   │ Naive               │ ❌ Broken    │ ~100ms       │ N/A (broken)      │');
  console.log('   │ Pessimistic (DB)    │ ✅ Correct   │ ~500ms       │ ❌ No             │');
  console.log('   │ Distributed (Redis) │ ✅ Correct   │ ~150ms       │ ✅ Yes            │');
  console.log('   └─────────────────────┴──────────────┴──────────────┴───────────────────┘');
  console.log('');
  console.log('   KEY DIFFERENCES:');
  console.log('');
  console.log('   • Naive: No locking, race conditions cause multiple "successes"');
  console.log('   • Pessimistic: DB row locks, requests queue up (high latency)');
  console.log('   • Distributed: Redis locks, requests fail fast (low latency)');
  console.log('');
  console.log('   WHEN TO USE EACH:');
  console.log('');
  console.log('   • Naive: Never in production (educational purposes only)');
  console.log('   • Pessimistic: Single-server deployments, moderate traffic');
  console.log('   • Distributed: Multi-server deployments, high traffic, flash sales');
  console.log('');
}

/**
 * Main test runner
 */
async function runDistributedLockingTests() {
  console.log('\n');
  separator();
  console.log('🔐 DISTRIBUTED LOCKING TEST SUITE');
  console.log('   Testing Redis-based distributed locks at multiple concurrency levels');
  separator();

  // Check if server is running
  try {
    await fetch(`${BASE_URL}/api/events`);
  } catch {
    console.error('\n❌ Cannot connect to server!');
    console.error('   Start the server with: npm run dev');
    process.exit(1);
  }

  // Check if Redis is available (by making a test request)
  console.log('\n✅ Server is running');
  console.log('   (Make sure Redis is running: npm run docker:up)\n');

  // Run tests at different concurrency levels
  const testLevels = [5, 20, 50];
  const results: TestResult[] = [];

  for (const level of testLevels) {
    separator('-');
    console.log(`\n🎯 CONCURRENCY LEVEL: ${level}`);
    separator('-');

    const result = await runConcurrencyTest(level);
    results.push(result);

    // Brief pause between tests to let things settle
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Print final summary
  separator('=');
  console.log('\n📊 FINAL RESULTS SUMMARY\n');

  console.log('   ┌─────────────┬───────────┬──────────┬───────────┬───────────┬────────┐');
  console.log('   │ Concurrency │ Successes │ Failures │ Avg (ms)  │ Max (ms)  │ Result │');
  console.log('   ├─────────────┼───────────┼──────────┼───────────┼───────────┼────────┤');

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(
      `   │ ${String(r.concurrency).padStart(11)} │ ${String(r.successes).padStart(9)} │ ${String(r.failures).padStart(8)} │ ${String(r.avgDuration).padStart(9)} │ ${String(r.maxDuration).padStart(9)} │   ${icon}   │`
    );
  }

  console.log('   └─────────────┴───────────┴──────────┴───────────┴───────────┴────────┘');

  const allPassed = results.every((r) => r.passed);

  if (allPassed) {
    console.log('\n');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('');
    console.log('   🎉 ALL TESTS PASSED!');
    console.log('');
    console.log('   Distributed locking correctly prevents race conditions');
    console.log('   at all concurrency levels tested.');
    console.log('');
    console.log('   Key observations:');
    console.log('   • Exactly 1 user gets the seat in every test');
    console.log('   • Failed requests return quickly (no blocking)');
    console.log('   • Works reliably under high concurrency');
    console.log('');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
  } else {
    console.log('\n');
    console.log('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.log('');
    console.log('   ⚠️  SOME TESTS FAILED');
    console.log('');
    console.log('   Check the server logs for details.');
    console.log('   Common issues:');
    console.log('   • Redis not running (npm run docker:up)');
    console.log('   • Lock timeout too short');
    console.log('   • Database connection issues');
    console.log('');
    console.log('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
  }

  // Print comparison table
  printComparisonTable();

  separator();
  console.log('🏁 TEST SUITE COMPLETE');
  separator();
  console.log('\n');

  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runDistributedLockingTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

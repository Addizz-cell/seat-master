/**
 * ============================================================================
 * PESSIMISTIC LOCKING TEST SCRIPT
 * ============================================================================
 *
 * This script tests the pessimistic locking implementation to verify that
 * race conditions are prevented using PostgreSQL's SELECT FOR UPDATE.
 *
 * HOW TO RUN:
 * -----------
 * 1. Reset database: npx prisma migrate reset
 * 2. Start server: npm run dev
 * 3. Run this test: npm run test:pessimistic
 *
 * EXPECTED RESULT:
 * ----------------
 * - Exactly ONE user successfully reserves the seat
 * - Other users fail with "not available" error
 * - Response times show queuing effect (later requests take longer)
 *
 * COMPARISON WITH NAIVE:
 * ----------------------
 * Naive (npm run test:race):
 *   - Multiple users "succeed" (race condition!)
 *   - All requests are fast (~100ms)
 *   - Broken: Multiple users think they have the same seat
 *
 * Pessimistic (npm run test:pessimistic):
 *   - Exactly ONE user succeeds
 *   - Requests queue up (increasing latency)
 *   - Correct: Only the winner gets the seat
 *
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 10;

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

/**
 * Make a reservation request using pessimistic locking
 */
async function makeReservation(
  eventId: string,
  seatId: string,
  userId: string
): Promise<RequestResult> {
  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/pessimistic/reservations`, {
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
 * Fetch available events and seats
 */
async function getTestSeat(): Promise<{ eventId: string; seatId: string; seatNumber: string } | null> {
  try {
    const eventsResponse = await fetch(`${BASE_URL}/api/events?limit=1`);
    const eventsData = await eventsResponse.json();

    if (!eventsData.success || !eventsData.data?.items?.length) {
      console.error('No events found. Run: npm run db:seed');
      return null;
    }

    const eventId = eventsData.data.items[0].id;
    const eventName = eventsData.data.items[0].name;

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
            console.log(`\n📍 Found available seat in "${eventName}"`);
            console.log(`   Section: ${section.section}, Row: ${row.row}, Seat: ${seat.seatNumber}`);
            console.log(`   Price: $${seat.price}`);
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

function separator(char = '=', length = 70) {
  console.log(char.repeat(length));
}

/**
 * Visualize the timeline of requests
 */
function visualizeTimeline(results: RequestResult[]) {
  console.log('\n📊 REQUEST TIMELINE\n');

  // Find the range
  const minDuration = Math.min(...results.map((r) => r.duration));
  const maxDuration = Math.max(...results.map((r) => r.duration));
  const range = maxDuration - minDuration || 1;

  // Sort by duration to show queue effect
  const sorted = [...results].sort((a, b) => a.duration - b.duration);

  for (const result of sorted) {
    const icon = result.success ? '✅' : '❌';
    const barLength = Math.round(((result.duration - minDuration) / range) * 30) + 1;
    const bar = '█'.repeat(barLength);
    const serverTime = result.serverDuration ? ` (server: ${result.serverDuration}ms)` : '';

    console.log(
      `   ${icon} ${result.userId}: ${bar} ${result.duration}ms${serverTime}`
    );
  }

  console.log('\n   Legend: Bar length shows relative wait time (longer = waited for locks)');
}

async function runPessimisticLockingTest() {
  console.log('\n');
  separator();
  console.log('🔒 PESSIMISTIC LOCKING TEST');
  console.log('   Testing SELECT FOR UPDATE with concurrent requests');
  separator();

  // Check if server is running
  try {
    await fetch(`${BASE_URL}/api/events`);
  } catch {
    console.error('\n❌ Cannot connect to server!');
    console.error('   Start the server with: npm run dev');
    process.exit(1);
  }

  // Get a test seat
  const testSeat = await getTestSeat();
  if (!testSeat) {
    console.error('\n❌ Could not find a seat to test with.');
    console.error('   Make sure to run: npx prisma migrate reset');
    process.exit(1);
  }

  const { eventId, seatId, seatNumber } = testSeat;

  console.log(`\n🎯 Target: Seat ${seatNumber} (ID: ${seatId.substring(0, 8)}...)`);
  console.log(`   Concurrent requests: ${CONCURRENT_REQUESTS}`);

  separator('-');
  console.log('\n⏱️  Firing concurrent requests...\n');
  console.log('   (Requests will queue up waiting for locks)\n');

  // Generate user IDs
  const userIds = Array.from(
    { length: CONCURRENT_REQUESTS },
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
  const seatNotAvailable = failures.filter((r) => r.code === 'SEAT_NOT_AVAILABLE');

  // Show timeline visualization
  visualizeTimeline(results);

  separator('-');
  console.log('\n📊 RESULTS\n');

  // Print individual results
  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const status = result.success ? 'RESERVED' : 'FAILED';
    const detail = result.success
      ? `(${result.reservationIds?.[0]?.substring(0, 8)}...)`
      : `(${result.error?.substring(0, 40)}...)`;
    console.log(`   ${icon} ${result.userId}: ${status} [${result.duration}ms] ${detail}`);
  }

  separator('-');
  console.log('\n📈 SUMMARY\n');
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Successful: ${successes.length}/${CONCURRENT_REQUESTS}`);
  console.log(`   Failed (seat taken): ${seatNotAvailable.length}`);
  console.log(`   Failed (other): ${failures.length - seatNotAvailable.length}`);

  // Calculate average wait times
  const avgDuration = Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length);
  const minDuration = Math.min(...results.map((r) => r.duration));
  const maxDuration = Math.max(...results.map((r) => r.duration));

  console.log(`\n   Response times:`);
  console.log(`     Min: ${minDuration}ms`);
  console.log(`     Avg: ${avgDuration}ms`);
  console.log(`     Max: ${maxDuration}ms`);
  console.log(`     Spread: ${maxDuration - minDuration}ms (shows queuing effect)`);

  separator('=');

  // Verify exactly 1 success
  if (successes.length === 1) {
    console.log('\n');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('');
    console.log('   🎉 PESSIMISTIC LOCKING WORKS!');
    console.log('');
    console.log(`   Only ${successes[0].userId} got the seat!`);
    console.log('');
    console.log('   What happened:');
    console.log('   1. First request acquired the row lock (SELECT FOR UPDATE)');
    console.log('   2. Other requests BLOCKED waiting for the lock');
    console.log('   3. First request committed, releasing the lock');
    console.log('   4. Others acquired lock, saw seat was RESERVED, failed');
    console.log('');
    console.log('   Notice the increasing response times?');
    console.log('   That\'s the queuing effect - each request waited for');
    console.log('   the previous one to release its lock.');
    console.log('');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('\n');
  } else if (successes.length === 0) {
    console.log('\n');
    console.log('❌ All requests failed - check server logs');
    console.log('\n');
  } else {
    console.log('\n');
    console.log('⚠️  UNEXPECTED: Multiple successes!');
    console.log(`   ${successes.length} users got the seat`);
    console.log('   This should not happen with pessimistic locking.');
    console.log('   Check the service implementation.');
    console.log('\n');
  }

  // Comparison with naive
  console.log('📚 COMPARISON: Naive vs Pessimistic\n');
  console.log('   ┌────────────────┬────────────────┬────────────────┐');
  console.log('   │                │ Naive          │ Pessimistic    │');
  console.log('   ├────────────────┼────────────────┼────────────────┤');
  console.log('   │ Correctness    │ ❌ Broken      │ ✅ Correct     │');
  console.log('   │ Successes      │ ~5-10 (race!)  │ Exactly 1      │');
  console.log('   │ Latency        │ ~100ms all     │ Increases      │');
  console.log('   │ Scalability    │ N/A (broken)   │ Limited        │');
  console.log('   └────────────────┴────────────────┴────────────────┘');
  console.log('\n');
  console.log('   Next: Try distributed locking with Redis for better scalability!');
  console.log('\n');

  separator();
  console.log('🏁 TEST COMPLETE');
  separator();
  console.log('\n');
}

// Run the test
runPessimisticLockingTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

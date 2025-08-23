/**
 * ============================================================================
 * RACE CONDITION TEST SCRIPT
 * ============================================================================
 *
 * This script demonstrates the race condition bug in the naive booking service.
 * It fires multiple concurrent requests to reserve the SAME seat, and shows
 * how multiple users can "successfully" reserve it due to the lack of proper
 * locking.
 *
 * HOW TO RUN:
 * -----------
 * 1. Reset database: npx prisma migrate reset
 * 2. Start server: npm run dev
 * 3. Run this test: npm run test:race
 *
 * EXPECTED RESULT:
 * ----------------
 * Multiple users will successfully "reserve" the same seat!
 * This is the bug we'll fix with proper locking in the next phase.
 *
 * ============================================================================
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 10; // Number of users trying to book simultaneously

interface ReservationResponse {
  success: boolean;
  data?: {
    reservationIds: string[];
    seats: Array<{ seatNumber: string }>;
    userId: string;
    totalAmount: string;
  };
  error?: string;
}

interface RequestResult {
  userId: string;
  success: boolean;
  error?: string;
  duration: number;
  reservationIds?: string[];
}

/**
 * Make a reservation request for a specific user
 */
async function makeReservation(
  eventId: string,
  seatId: string,
  userId: string
): Promise<RequestResult> {
  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/naive/reservations`, {
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
        reservationIds: data.data.reservationIds,
      };
    } else {
      return {
        userId,
        success: false,
        error: data.error || 'Unknown error',
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
    // Get events
    const eventsResponse = await fetch(`${BASE_URL}/api/events?limit=1`);
    const eventsData = await eventsResponse.json();

    if (!eventsData.success || !eventsData.data?.items?.length) {
      console.error('No events found. Run: npm run db:seed');
      return null;
    }

    const eventId = eventsData.data.items[0].id;
    const eventName = eventsData.data.items[0].name;

    // Get seats for this event
    const seatsResponse = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
    const seatsData = await seatsResponse.json();

    if (!seatsData.success || !seatsData.data?.sections?.length) {
      console.error('No seats found for event');
      return null;
    }

    // Find first available seat
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

    console.error('No available seats found');
    return null;
  } catch (error) {
    console.error('Error fetching test data:', error);
    return null;
  }
}

/**
 * Print a visual separator
 */
function separator(char = '=', length = 70) {
  console.log(char.repeat(length));
}

/**
 * Main test function
 */
async function runRaceConditionTest() {
  console.log('\n');
  separator();
  console.log('🏁 RACE CONDITION TEST');
  console.log('   Testing naive booking service with concurrent requests');
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
    console.error('   Make sure to run: npm run db:seed');
    process.exit(1);
  }

  const { eventId, seatId, seatNumber } = testSeat;

  console.log(`\n🎯 Target: Seat ${seatNumber} (ID: ${seatId.substring(0, 8)}...)`);
  console.log(`   Concurrent requests: ${CONCURRENT_REQUESTS}`);

  separator('-');
  console.log('\n⏱️  Firing concurrent requests...\n');

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

  separator('-');
  console.log('\n📊 RESULTS\n');

  // Print individual results
  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const status = result.success ? 'RESERVED' : 'FAILED';
    const detail = result.success
      ? `(${result.reservationIds?.[0]?.substring(0, 8)}...)`
      : `(${result.error})`;
    console.log(`   ${icon} ${result.userId}: ${status} ${detail} [${result.duration}ms]`);
  }

  separator('-');
  console.log('\n📈 SUMMARY\n');
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Successful: ${successes.length}/${CONCURRENT_REQUESTS}`);
  console.log(`   Failed: ${failures.length}/${CONCURRENT_REQUESTS}`);

  separator('=');

  // The moment of truth!
  if (successes.length > 1) {
    console.log('\n');
    console.log('🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛');
    console.log('');
    console.log('   ⚠️  RACE CONDITION DETECTED! ⚠️');
    console.log('');
    console.log(`   ${successes.length} users successfully "reserved" the SAME seat!`);
    console.log('');
    console.log('   Winners:');
    for (const success of successes) {
      console.log(`     • ${success.userId}`);
    }
    console.log('');
    console.log('   In a real system, this would mean:');
    console.log('   • Multiple customers paying for the same seat');
    console.log('   • Confirmation emails sent to all of them');
    console.log('   • Angry customers when they arrive at the venue');
    console.log('   • Refunds, complaints, and lost trust');
    console.log('');
    console.log('🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛🐛');
    console.log('\n');
    console.log('💡 Next step: Implement proper locking to fix this!');
    console.log('   See Phase 6: Safe Booking Service with Redis Locks');
    console.log('\n');
  } else if (successes.length === 1) {
    console.log('\n');
    console.log('✅ Only 1 user got the seat - no race condition this time!');
    console.log('');
    console.log('   This can happen when:');
    console.log('   • Server is under low load');
    console.log('   • Requests happened to be serialized');
    console.log('   • Database was fast enough');
    console.log('');
    console.log('   Try running again - race conditions are probabilistic!');
    console.log('   You can also increase CONCURRENT_REQUESTS in the script.');
    console.log('\n');
  } else {
    console.log('\n');
    console.log('❌ All requests failed - unexpected result');
    console.log('   Check the server logs for errors.');
    console.log('\n');
  }

  // Verify the database state
  console.log('🔍 Verifying database state...\n');
  const seatsResponse = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
  const seatsData = await seatsResponse.json();

  if (seatsData.success) {
    for (const section of seatsData.data.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (seat.id === seatId) {
            console.log(`   Seat ${seat.seatNumber} final status: ${seat.status}`);
            if (successes.length > 1) {
              console.log(`   ⚠️  But ${successes.length} users think they have it!`);
            }
          }
        }
      }
    }
  }

  console.log('\n');
  separator();
  console.log('🏁 TEST COMPLETE');
  separator();
  console.log('\n');
}

// Run the test
runRaceConditionTest().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

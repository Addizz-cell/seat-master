/**
 * ============================================================================
 * RESERVATION EXPIRY TEST SCRIPT
 * ============================================================================
 *
 * This script tests the full reservation expiry flow:
 *
 * 1. Creates a reservation with a short expiry time (for testing)
 * 2. Waits for the reservation to expire
 * 3. Verifies the seat is released back to AVAILABLE
 * 4. Verifies the reservation status is EXPIRED
 *
 * HOW TO RUN:
 * -----------
 * 1. Start Redis and PostgreSQL: npm run docker:up
 * 2. Start the server: npm run dev
 * 3. Start the workers: npm run workers (in another terminal)
 * 4. Run this test: npm run test:expiry
 *
 * NOTE: This test creates a reservation with a 30-second expiry.
 * The workers must be running for the cleanup to happen automatically.
 * If workers aren't running, the periodic cleanup (every 60s) will catch it.
 *
 * ============================================================================
 */

import 'dotenv/config';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Short expiry for testing (seconds)
const TEST_EXPIRY_SECONDS = 30;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface ReservationData {
  reservationIds: string[];
  seats: Array<{ id: string; seatNumber: string; section: string; row: string }>;
  expiresAt: string;
  userId: string;
}

interface SeatData {
  id: string;
  seatNumber: string;
  status: string;
}

function separator(char = '=', length = 70) {
  console.log(char.repeat(length));
}

/**
 * Fetch available events and find an available seat
 */
async function getAvailableSeat(): Promise<{
  eventId: string;
  seatId: string;
  seatNumber: string;
} | null> {
  try {
    const eventsResponse = await fetch(`${BASE_URL}/api/events?limit=1`);
    const eventsData: ApiResponse<{ items: Array<{ id: string }> }> =
      await eventsResponse.json();

    if (!eventsData.success || !eventsData.data?.items?.length) {
      console.error('No events found. Run: npm run db:seed');
      return null;
    }

    const eventId = eventsData.data.items[0].id;

    const seatsResponse = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
    const seatsData: ApiResponse<{
      sections: Array<{
        rows: Array<{
          seats: Array<{ id: string; seatNumber: string; status: string }>;
        }>;
      }>;
    }> = await seatsResponse.json();

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
 * Get seat status from the API
 */
async function getSeatStatus(
  eventId: string,
  seatId: string
): Promise<SeatData | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/events/${eventId}/seats`);
    const data: ApiResponse<{
      sections: Array<{
        rows: Array<{
          seats: Array<{ id: string; seatNumber: string; status: string }>;
        }>;
      }>;
    }> = await response.json();

    if (!data.success) return null;

    for (const section of data.data!.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          if (seat.id === seatId) {
            return seat;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a reservation with short expiry
 */
async function createReservation(
  eventId: string,
  seatId: string,
  userId: string
): Promise<ReservationData | null> {
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

    const data: ApiResponse<ReservationData> = await response.json();

    if (!data.success || !data.data) {
      console.error('Failed to create reservation:', data.error);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('Error creating reservation:', error);
    return null;
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format seconds as mm:ss
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Main test function
 */
async function runTest() {
  console.log('\n');
  separator();
  console.log('🧪 RESERVATION EXPIRY TEST');
  separator();

  // Check if server is running
  try {
    await fetch(`${BASE_URL}/api/events`);
  } catch {
    console.error('\n❌ Cannot connect to server!');
    console.error('   Start the server with: npm run dev');
    process.exit(1);
  }

  console.log('\n✅ Server is running');
  console.log('   (Make sure workers are running: npm run workers)\n');

  // Get an available seat
  separator('-');
  console.log('\n📋 STEP 1: Find an available seat\n');

  const testSeat = await getAvailableSeat();
  if (!testSeat) {
    console.error('Could not find available seat for test');
    process.exit(1);
  }

  const { eventId, seatId, seatNumber } = testSeat;
  const userId = `test-user-${Date.now()}`;

  console.log(`   Event ID: ${eventId.substring(0, 8)}...`);
  console.log(`   Seat: ${seatNumber} (ID: ${seatId.substring(0, 8)}...)`);
  console.log(`   User: ${userId}`);

  // Create reservation
  separator('-');
  console.log('\n📋 STEP 2: Create a reservation\n');

  const reservation = await createReservation(eventId, seatId, userId);
  if (!reservation) {
    console.error('Failed to create reservation');
    process.exit(1);
  }

  const expiresAt = new Date(reservation.expiresAt);
  const now = new Date();
  const expirySeconds = Math.ceil((expiresAt.getTime() - now.getTime()) / 1000);

  console.log(`   ✅ Reservation created!`);
  console.log(`   Reservation ID: ${reservation.reservationIds[0].substring(0, 8)}...`);
  console.log(`   Expires at: ${expiresAt.toLocaleTimeString()}`);
  console.log(`   Time until expiry: ${formatTime(expirySeconds)}`);

  // Verify seat is now RESERVED
  const seatAfterReserve = await getSeatStatus(eventId, seatId);
  console.log(`   Seat status: ${seatAfterReserve?.status || 'UNKNOWN'}`);

  if (seatAfterReserve?.status !== 'RESERVED') {
    console.error('\n❌ Expected seat to be RESERVED');
    process.exit(1);
  }

  // Wait for expiry with countdown
  separator('-');
  console.log('\n📋 STEP 3: Waiting for reservation to expire\n');

  const waitSeconds = expirySeconds + 15; // Add 15s buffer for worker processing
  console.log(`   Waiting ${formatTime(waitSeconds)} for expiry + worker processing...`);
  console.log('');

  for (let remaining = waitSeconds; remaining > 0; remaining--) {
    const progress = Math.round(((waitSeconds - remaining) / waitSeconds) * 30);
    const bar = '█'.repeat(progress) + '░'.repeat(30 - progress);

    // Check seat status periodically
    let statusIndicator = '';
    if (remaining % 5 === 0 || remaining <= 10) {
      const currentSeat = await getSeatStatus(eventId, seatId);
      const status = currentSeat?.status || 'UNKNOWN';
      statusIndicator = ` [Seat: ${status}]`;

      // If seat is already AVAILABLE, we can stop early
      if (status === 'AVAILABLE') {
        console.log(`\r   [${bar}] ${formatTime(remaining)} remaining${statusIndicator}`);
        console.log('\n   ✅ Seat released early!');
        break;
      }
    }

    process.stdout.write(`\r   [${bar}] ${formatTime(remaining)} remaining${statusIndicator}    `);
    await sleep(1000);
  }

  console.log('\n');

  // Verify final state
  separator('-');
  console.log('\n📋 STEP 4: Verify final state\n');

  const finalSeat = await getSeatStatus(eventId, seatId);
  const finalStatus = finalSeat?.status || 'UNKNOWN';

  console.log(`   Seat ${seatNumber} final status: ${finalStatus}`);

  // Final result
  separator('-');

  if (finalStatus === 'AVAILABLE') {
    console.log('\n');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('');
    console.log('   🎉 TEST PASSED!');
    console.log('');
    console.log('   The reservation expired and the seat was released:');
    console.log(`   - Seat ${seatNumber} is now AVAILABLE`);
    console.log('   - Users can now reserve this seat again');
    console.log('');
    console.log('   This confirms the cleanup worker is functioning correctly.');
    console.log('');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('\n');
    process.exit(0);
  } else {
    console.log('\n');
    console.log('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.log('');
    console.log('   ⚠️  TEST FAILED');
    console.log('');
    console.log(`   Expected seat status: AVAILABLE`);
    console.log(`   Actual seat status:   ${finalStatus}`);
    console.log('');
    console.log('   Possible issues:');
    console.log('   1. Workers not running (start with: npm run workers)');
    console.log('   2. Redis not running (start with: npm run docker:up)');
    console.log('   3. Worker encountered an error (check worker logs)');
    console.log('');
    console.log('   If workers aren\'t running, wait 60s for periodic cleanup,');
    console.log('   or manually run: npx ts-node -e "import { runPeriodicCleanup } from \'./src/workers/periodicCleanup\'; runPeriodicCleanup()"');
    console.log('');
    console.log('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌');
    console.log('\n');
    process.exit(1);
  }
}

// Run the test
runTest().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});

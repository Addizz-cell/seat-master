/**
 * API Test Script
 *
 * Tests the basic API routes for events and seats.
 * Run with: npm run test:api (after starting the dev server)
 *
 * Prerequisites:
 * 1. Docker containers running (npm run docker:up)
 * 2. Database seeded (npm run db:seed)
 * 3. Dev server running (npm run dev)
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  data?: unknown;
}

const results: TestResult[] = [];

/**
 * Helper to make API requests and measure timing
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: T; duration: number }> {
  const start = Date.now();

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  const duration = Date.now() - start;

  return { status: response.status, data, duration };
}

/**
 * Run a test and record the result
 */
async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; data?: unknown; error?: string }>
): Promise<void> {
  const start = Date.now();
  try {
    const result = await testFn();
    results.push({
      name,
      passed: result.passed,
      duration: Date.now() - start,
      error: result.error,
      data: result.data,
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testGetEvents(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  const { status, data, duration } = await apiRequest<{
    success: boolean;
    data?: { items: unknown[]; pagination: unknown };
    error?: string;
  }>('GET', '/api/events');

  console.log(`  Response time: ${duration}ms`);

  if (status !== 200) {
    return { passed: false, error: `Expected status 200, got ${status}` };
  }

  if (!data.success) {
    return { passed: false, error: data.error };
  }

  const items = data.data?.items ?? [];
  console.log(`  Found ${items.length} events`);

  if (items.length === 0) {
    return { passed: false, error: 'No events found. Did you run db:seed?' };
  }

  return { passed: true, data: { count: items.length, pagination: data.data?.pagination } };
}

async function testGetEventsWithSearch(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  const { status, data } = await apiRequest<{
    success: boolean;
    data?: { items: Array<{ name: string }> };
    error?: string;
  }>('GET', '/api/events?query=rock');

  if (status !== 200 || !data.success) {
    return { passed: false, error: data.error || `Status: ${status}` };
  }

  const items = data.data?.items ?? [];
  console.log(`  Found ${items.length} events matching "rock"`);

  // Check if results contain "rock" in name
  const allMatch = items.every(
    (e) => e.name.toLowerCase().includes('rock')
  );

  if (items.length > 0 && !allMatch) {
    return { passed: false, error: 'Search results do not all contain "rock"' };
  }

  return { passed: true, data: { count: items.length } };
}

async function testGetEventsWithPagination(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  const { status, data } = await apiRequest<{
    success: boolean;
    data?: { items: unknown[]; pagination: { page: number; limit: number; total: number } };
    error?: string;
  }>('GET', '/api/events?page=0&limit=2');

  if (status !== 200 || !data.success) {
    return { passed: false, error: data.error || `Status: ${status}` };
  }

  const items = data.data?.items ?? [];
  const pagination = data.data?.pagination;

  if (items.length > 2) {
    return { passed: false, error: `Expected max 2 items, got ${items.length}` };
  }

  console.log(`  Page ${(pagination?.page ?? 0) + 1}, showing ${items.length} of ${pagination?.total ?? 0}`);

  return { passed: true, data: pagination };
}

async function testGetSingleEvent(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  // First get an event ID
  const { data: listData } = await apiRequest<{
    success: boolean;
    data?: { items: Array<{ id: string; name: string }> };
  }>('GET', '/api/events?limit=1');

  if (!listData.success || !listData.data?.items.length) {
    return { passed: false, error: 'Could not get event list' };
  }

  const eventId = listData.data.items[0].id;
  const eventName = listData.data.items[0].name;

  // Fetch single event
  const { status, data, duration } = await apiRequest<{
    success: boolean;
    data?: { id: string; name: string; _count: { seats: number; bookings: number } };
    error?: string;
  }>('GET', `/api/events/${eventId}`);

  console.log(`  Response time: ${duration}ms`);

  if (status !== 200 || !data.success) {
    return { passed: false, error: data.error || `Status: ${status}` };
  }

  console.log(`  Event: ${data.data?.name}`);
  console.log(`  Seats: ${data.data?._count?.seats}, Bookings: ${data.data?._count?.bookings}`);

  if (data.data?.id !== eventId) {
    return { passed: false, error: 'Returned event ID does not match' };
  }

  return { passed: true, data: { id: eventId, name: eventName, _count: data.data?._count } };
}

async function testGetEventNotFound(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { status, data } = await apiRequest<{
    success: boolean;
    error?: string;
    code?: string;
  }>('GET', `/api/events/${fakeId}`);

  if (status !== 404) {
    return { passed: false, error: `Expected status 404, got ${status}` };
  }

  if (data.code !== 'NOT_FOUND') {
    return { passed: false, error: `Expected code NOT_FOUND, got ${data.code}` };
  }

  console.log(`  Correctly returned 404 for non-existent event`);

  return { passed: true };
}

async function testGetEventInvalidId(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  const { status, data } = await apiRequest<{
    success: boolean;
    error?: string;
    code?: string;
  }>('GET', '/api/events/not-a-valid-uuid');

  if (status !== 400) {
    return { passed: false, error: `Expected status 400, got ${status}` };
  }

  if (data.code !== 'INVALID_ID') {
    return { passed: false, error: `Expected code INVALID_ID, got ${data.code}` };
  }

  console.log(`  Correctly returned 400 for invalid UUID`);

  return { passed: true };
}

async function testGetSeats(): Promise<{ passed: boolean; data?: unknown; error?: string }> {
  // First get an event ID
  const { data: listData } = await apiRequest<{
    success: boolean;
    data?: { items: Array<{ id: string; name: string }> };
  }>('GET', '/api/events?limit=1');

  if (!listData.success || !listData.data?.items.length) {
    return { passed: false, error: 'Could not get event list' };
  }

  const eventId = listData.data.items[0].id;

  // Fetch seats
  const { status, data, duration } = await apiRequest<{
    success: boolean;
    data?: {
      eventId: string;
      sections: Array<{ section: string; rows: Array<{ row: string; seats: unknown[] }> }>;
      stats: { totalSeats: number; availableSeats: number };
    };
    error?: string;
  }>('GET', `/api/events/${eventId}/seats`);

  console.log(`  Response time: ${duration}ms`);

  if (status !== 200 || !data.success) {
    return { passed: false, error: data.error || `Status: ${status}` };
  }

  const seatMap = data.data;
  console.log(`  Sections: ${seatMap?.sections.length}`);
  console.log(`  Total seats: ${seatMap?.stats.totalSeats}`);
  console.log(`  Available: ${seatMap?.stats.availableSeats}`);

  // Verify structure
  if (!seatMap?.sections || !Array.isArray(seatMap.sections)) {
    return { passed: false, error: 'Invalid seat map structure' };
  }

  // Check that each section has rows and seats
  for (const section of seatMap.sections) {
    if (!section.rows || !Array.isArray(section.rows)) {
      return { passed: false, error: `Section ${section.section} missing rows` };
    }
    for (const row of section.rows) {
      if (!row.seats || !Array.isArray(row.seats)) {
        return { passed: false, error: `Row ${row.row} missing seats` };
      }
    }
  }

  // Print section breakdown
  console.log('  Section breakdown:');
  for (const section of seatMap.sections) {
    const seatCount = section.rows.reduce((sum, row) => sum + row.seats.length, 0);
    console.log(`    - ${section.section}: ${section.rows.length} rows, ${seatCount} seats`);
  }

  return {
    passed: true,
    data: {
      eventId,
      sectionCount: seatMap.sections.length,
      stats: seatMap.stats,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Ticket Booking System - API Tests');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(60));
  console.log();

  // Check if server is running
  try {
    await fetch(`${BASE_URL}/api/events`);
  } catch {
    console.error('❌ Cannot connect to server. Is it running?');
    console.error(`   Start with: npm run dev`);
    console.error(`   Then run: npm run test:api`);
    process.exit(1);
  }

  // Run tests
  console.log('1. GET /api/events');
  await runTest('List events', testGetEvents);
  console.log();

  console.log('2. GET /api/events?query=rock');
  await runTest('Search events', testGetEventsWithSearch);
  console.log();

  console.log('3. GET /api/events?page=0&limit=2');
  await runTest('Paginate events', testGetEventsWithPagination);
  console.log();

  console.log('4. GET /api/events/:id');
  await runTest('Get single event', testGetSingleEvent);
  console.log();

  console.log('5. GET /api/events/:id (not found)');
  await runTest('Event not found', testGetEventNotFound);
  console.log();

  console.log('6. GET /api/events/:id (invalid ID)');
  await runTest('Invalid event ID', testGetEventInvalidId);
  console.log();

  console.log('7. GET /api/events/:id/seats');
  await runTest('Get seat map', testGetSeats);
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const time = `(${result.duration}ms)`;
    console.log(`${icon} ${result.name} ${time}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log();
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});

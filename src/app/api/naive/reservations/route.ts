import { NextRequest, NextResponse } from 'next/server';
import { reserveSeats } from '@/services/naiveBookingService';
import { reserveSeatsSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse } from '@/types';
import type { ReservationResult } from '@/services/naiveBookingService';

/**
 * POST /api/naive/reservations
 *
 * ⚠️  NAIVE IMPLEMENTATION - INTENTIONALLY BUGGY  ⚠️
 *
 * This endpoint demonstrates the race condition problem.
 * It does NOT use proper locking, so multiple concurrent requests
 * can all succeed in reserving the same seat.
 *
 * For testing:
 * - Send x-user-id header to specify user (or random will be generated)
 * - Fire multiple concurrent requests for the same seat
 * - Observe multiple successful reservations for the same seat
 */
export async function POST(request: NextRequest) {
  try {
    // Get or generate user ID
    let userId = request.headers.get('x-user-id');
    if (!userId) {
      userId = `test-user-${Math.random().toString(36).substring(2, 10)}`;
    }

    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate request body
    const validation = safeValidate(reserveSeatsSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { eventId, seatIds } = validation.data;

    // Call naive booking service (with race condition!)
    const result = await reserveSeats(eventId, seatIds, userId);

    const response: ApiResponse<ReservationResult & { userId: string }> = {
      success: true,
      data: {
        ...result,
        userId,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/naive/reservations] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code: 'RESERVATION_FAILED',
    };

    // Determine status code based on error
    const status = errorMessage.includes('not available') ? 409 : 500;
    return NextResponse.json(response, { status });
  }
}

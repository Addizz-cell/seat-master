import { NextRequest, NextResponse } from 'next/server';
import { confirmBooking } from '@/services/pessimisticBookingService';
import { confirmBookingSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse } from '@/types';
import type { BookingResult } from '@/services/pessimisticBookingService';

/**
 * POST /api/pessimistic/bookings
 *
 * Confirm a booking from reservations using pessimistic locking.
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID from header
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'x-user-id header is required',
        code: 'MISSING_USER_ID',
      };
      return NextResponse.json(response, { status: 401 });
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
    const validation = safeValidate(confirmBookingSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { reservationIds, idempotencyKey } = validation.data;

    // Confirm booking with pessimistic locking
    const result = await confirmBooking(reservationIds, userId, idempotencyKey);

    const response: ApiResponse<BookingResult> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/pessimistic/bookings] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    let status = 500;
    let code = 'BOOKING_FAILED';

    if (errorMessage.includes('not found') || errorMessage.includes('not active')) {
      status = 404;
      code = 'RESERVATION_NOT_FOUND';
    } else if (errorMessage.includes('expired')) {
      status = 410; // Gone
      code = 'RESERVATION_EXPIRED';
    } else if (errorMessage.includes('timed out')) {
      status = 408;
      code = 'LOCK_TIMEOUT';
    }

    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code,
    };

    return NextResponse.json(response, { status });
  }
}

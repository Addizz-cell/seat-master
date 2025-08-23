import { NextRequest, NextResponse } from 'next/server';
import { confirmBooking } from '@/services/naiveBookingService';
import { confirmBookingSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse } from '@/types';
import type { BookingResult } from '@/services/naiveBookingService';

/**
 * POST /api/naive/bookings
 *
 * ⚠️  NAIVE IMPLEMENTATION  ⚠️
 *
 * Confirms a booking from existing reservations.
 * Less prone to race conditions since reservations are already created,
 * but demonstrates the full booking flow.
 *
 * Request body:
 * - reservationIds: string[] - IDs of reservations to confirm
 * - idempotencyKey: string - Unique key to prevent duplicate bookings
 * - paymentMethodId?: string - Optional payment method (not used in naive impl)
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

    // Confirm booking
    const result = await confirmBooking(reservationIds, userId, idempotencyKey);

    const response: ApiResponse<BookingResult> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/naive/bookings] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code: 'BOOKING_FAILED',
    };

    // Determine status code based on error
    let status = 500;
    if (errorMessage.includes('not found') || errorMessage.includes('not active')) {
      status = 404;
    } else if (errorMessage.includes('expired')) {
      status = 410; // Gone
    }

    return NextResponse.json(response, { status });
  }
}

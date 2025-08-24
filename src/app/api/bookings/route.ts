import { NextRequest, NextResponse } from 'next/server';
import { confirmBooking } from '@/services/distributedBookingService';
import { confirmBookingSchema, safeValidate } from '@/validations/schemas';
import {
  SeatLockError,
  ReservationNotFoundError,
  ReservationExpiredError,
  getErrorCode,
} from '@/lib/errors';
import type { ApiResponse } from '@/types';
import type { BookingResult } from '@/services/distributedBookingService';

/**
 * POST /api/bookings
 *
 * Confirm a booking from reservations using DISTRIBUTED LOCKING.
 *
 * This endpoint converts temporary reservations into a confirmed booking.
 * It uses Redis distributed locks and idempotency keys to ensure
 * safe handling of retries and concurrent requests.
 *
 * Request body:
 * {
 *   "reservationIds": ["uuid", "uuid", ...],
 *   "idempotencyKey": "uuid"  // Client-generated, unique per booking attempt
 * }
 *
 * Headers:
 * - x-user-id: Required. User ID confirming the booking.
 *
 * Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "bookingReference": "TKT-XXXX-XXXX",
 *     "totalAmount": "150.00",
 *     "status": "CONFIRMED",
 *     "seats": [...],
 *     "createdAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 *
 * Idempotency:
 * - If the same idempotencyKey is used again, returns the existing booking
 * - This safely handles retries without creating duplicate bookings
 *
 * Error responses:
 * - 400 Bad Request: Invalid JSON or validation error
 * - 401 Unauthorized: Missing x-user-id header
 * - 404 Not Found: Reservation doesn't exist or wrong user
 * - 409 Conflict: Lock contention
 * - 410 Gone: Reservation has expired
 * - 500 Internal Server Error: Unexpected error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // =========================================================================
    // VALIDATE USER ID
    // =========================================================================
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'x-user-id header is required',
        code: 'MISSING_USER_ID',
      };
      return NextResponse.json(response, { status: 401 });
    }

    // =========================================================================
    // PARSE REQUEST BODY
    // =========================================================================
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

    // =========================================================================
    // VALIDATE REQUEST BODY
    // =========================================================================
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

    // =========================================================================
    // CALL DISTRIBUTED BOOKING SERVICE
    // =========================================================================
    const result = await confirmBooking(reservationIds, userId, idempotencyKey);
    const duration = Date.now() - startTime;

    console.log(`[POST /api/bookings] Success for ${userId} in ${duration}ms`);

    const response: ApiResponse<BookingResult> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[POST /api/bookings] Error after ${duration}ms:`, error);

    // =========================================================================
    // ERROR HANDLING - Map errors to HTTP status codes
    // =========================================================================

    // Seat lock contention (409 Conflict)
    if (error instanceof SeatLockError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 409 });
    }

    // Reservation not found (404 Not Found)
    if (error instanceof ReservationNotFoundError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Reservation expired (410 Gone)
    if (error instanceof ReservationExpiredError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 410 });
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code: 'BOOKING_FAILED',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

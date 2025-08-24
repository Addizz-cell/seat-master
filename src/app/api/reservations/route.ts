import { NextRequest, NextResponse } from 'next/server';
import { reserveSeats } from '@/services/distributedBookingService';
import { reserveSeatsSchema, safeValidate } from '@/validations/schemas';
import {
  SeatLockError,
  SeatNotFoundError,
  SeatNotAvailableError,
  getErrorCode,
} from '@/lib/errors';
import type { ApiResponse } from '@/types';
import type { ReservationResult } from '@/services/distributedBookingService';

/**
 * POST /api/reservations
 *
 * Reserve seats using DISTRIBUTED LOCKING with Redis.
 *
 * This is the production endpoint that scales horizontally.
 * It uses Redis distributed locks to coordinate between multiple
 * application servers, ensuring exactly ONE user can reserve a seat.
 *
 * Request body:
 * {
 *   "eventId": "uuid",
 *   "seatIds": ["uuid", "uuid", ...]
 * }
 *
 * Headers:
 * - x-user-id: Required. User ID making the reservation.
 *
 * Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "reservationIds": ["uuid", ...],
 *     "seats": [...],
 *     "expiresAt": "2024-01-01T00:00:00.000Z",
 *     "totalAmount": "150.00",
 *     "userId": "...",
 *     "duration": 123
 *   }
 * }
 *
 * Error responses:
 * - 400 Bad Request: Invalid JSON or validation error
 * - 401 Unauthorized: Missing x-user-id header
 * - 404 Not Found: Seat doesn't exist
 * - 409 Conflict: Seat not available or lock contention
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

    // =========================================================================
    // CALL DISTRIBUTED BOOKING SERVICE
    // =========================================================================
    const result = await reserveSeats(eventId, seatIds, userId);
    const duration = Date.now() - startTime;

    console.log(`[POST /api/reservations] Success for ${userId} in ${duration}ms`);

    const response: ApiResponse<ReservationResult & { userId: string; duration: number }> = {
      success: true,
      data: {
        ...result,
        userId,
        duration,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[POST /api/reservations] Error after ${duration}ms:`, error);

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

    // Seat not found (404 Not Found)
    if (error instanceof SeatNotFoundError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Seat not available (409 Conflict)
    if (error instanceof SeatNotAvailableError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 409 });
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code: 'RESERVATION_FAILED',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

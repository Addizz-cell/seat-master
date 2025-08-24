import { NextRequest, NextResponse } from "next/server";
import { reserveSeats } from "@/services/pessimisticBookingService";
import { reserveSeatsSchema, safeValidate } from "@/validations/schemas";
import type { ApiResponse } from "@/types";
import type { ReservationResult } from "@/services/pessimisticBookingService";

/**
 * POST /api/pessimistic/reservations
 *
 * Reserve seats using PESSIMISTIC LOCKING (SELECT FOR UPDATE).
 *
 * This endpoint uses PostgreSQL's row-level locking to prevent race conditions.
 * When multiple users try to reserve the same seat:
 * - First request acquires the lock and proceeds
 * - Other requests BLOCK until the first completes
 * - After first commits, others see the updated status and fail
 *
 * Result: Exactly ONE user successfully reserves the seat.
 *
 * Trade-offs:
 * - ✅ Guaranteed consistency
 * - ❌ Requests queue up (blocking)
 * - ❌ Higher latency under contention
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get or generate user ID
    let userId = request.headers.get("x-user-id");
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
        error: "Invalid JSON in request body",
        code: "INVALID_JSON",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate request body
    const validation = safeValidate(reserveSeatsSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: "VALIDATION_ERROR",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { eventId, seatIds } = validation.data;

    // Call pessimistic booking service
    const result = await reserveSeats(eventId, seatIds, userId);
    const duration = Date.now() - startTime;

    console.log(
      `[POST /api/pessimistic/reservations] Success for ${userId} in ${duration}ms`
    );

    const response: ApiResponse<
      ReservationResult & { userId: string; duration: number }
    > = {
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
    console.error(
      `[POST /api/pessimistic/reservations] Error after ${duration}ms:`,
      error
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Determine appropriate status code
    let status = 500;
    let code = "RESERVATION_FAILED";

    if (errorMessage.includes("not available")) {
      status = 409; // Conflict - seat already taken
      code = "SEAT_NOT_AVAILABLE";
    } else if (errorMessage.includes("timed out")) {
      status = 408; // Request Timeout
      code = "LOCK_TIMEOUT";
    } else if (errorMessage.includes("Concurrent modification")) {
      status = 409; // Conflict
      code = "CONCURRENT_MODIFICATION";
    } else if (errorMessage.includes("not found")) {
      status = 404;
      code = "NOT_FOUND";
    }

    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code,
    };

    return NextResponse.json(response, { status });
  }
}

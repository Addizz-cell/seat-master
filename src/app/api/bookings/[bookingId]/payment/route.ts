/**
 * ============================================================================
 * PAYMENT API ROUTE
 * ============================================================================
 *
 * Creates a payment intent for a booking and returns the client secret
 * for frontend payment collection.
 *
 * FLOW:
 * -----
 * 1. Client calls POST /api/bookings/:bookingId/payment
 * 2. Server creates Stripe PaymentIntent
 * 3. Server returns clientSecret to client
 * 4. Client uses Stripe.js to collect card details and confirm payment
 * 5. Stripe webhook notifies server of payment result
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/services/paymentService';
import {
  BookingNotFoundError,
  PaymentError,
  getErrorCode,
} from '@/lib/errors';
import prisma from '@/lib/db';
import type { ApiResponse } from '@/types';

interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

/**
 * POST /api/bookings/:bookingId/payment
 *
 * Create a payment intent for a booking.
 *
 * Headers:
 * - x-user-id: Required. User ID must own the booking.
 *
 * Response (201 Created):
 * {
 *   "success": true,
 *   "data": {
 *     "clientSecret": "pi_xxx_secret_xxx",
 *     "paymentIntentId": "pi_xxx",
 *     "amount": 150.00,
 *     "currency": "usd"
 *   }
 * }
 *
 * Error responses:
 * - 401 Unauthorized: Missing x-user-id header
 * - 403 Forbidden: User doesn't own the booking
 * - 404 Not Found: Booking doesn't exist
 * - 409 Conflict: Booking is not in a payable state
 * - 402 Payment Required: Payment intent creation failed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const startTime = Date.now();
  const { bookingId } = await params;

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
    // FETCH AND VALIDATE BOOKING
    // =========================================================================
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        totalAmount: true,
        status: true,
        paymentStatus: true,
        paymentIntentId: true,
      },
    });

    if (!booking) {
      throw new BookingNotFoundError(bookingId);
    }

    // Verify user owns the booking
    if (booking.userId !== userId) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'You do not have permission to pay for this booking',
        code: 'FORBIDDEN',
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Check if booking is in a payable state
    if (booking.status === 'CONFIRMED') {
      const response: ApiResponse<never> = {
        success: false,
        error: 'This booking has already been paid for',
        code: 'ALREADY_PAID',
      };
      return NextResponse.json(response, { status: 409 });
    }

    if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      const response: ApiResponse<never> = {
        success: false,
        error: `Cannot pay for a ${booking.status.toLowerCase()} booking`,
        code: 'BOOKING_NOT_PAYABLE',
      };
      return NextResponse.json(response, { status: 409 });
    }

    if (booking.status === 'FAILED' && booking.paymentStatus === 'FAILED') {
      // Allow retry for failed payments by creating a new payment intent
      console.log(
        `[POST /api/bookings/${bookingId}/payment] Retrying failed payment`
      );
    }

    // =========================================================================
    // CREATE PAYMENT INTENT
    // =========================================================================
    const amount = Number(booking.totalAmount);
    const { clientSecret, paymentIntentId } = await createPaymentIntent(
      bookingId,
      amount,
      'usd'
    );

    const duration = Date.now() - startTime;
    console.log(
      `[POST /api/bookings/${bookingId}/payment] Success in ${duration}ms`
    );

    const response: ApiResponse<PaymentIntentResponse> = {
      success: true,
      data: {
        clientSecret,
        paymentIntentId,
        amount,
        currency: 'usd',
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[POST /api/bookings/${bookingId}/payment] Error after ${duration}ms:`,
      error
    );

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================

    if (error instanceof BookingNotFoundError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (error instanceof PaymentError) {
      const response: ApiResponse<never> = {
        success: false,
        error: error.message,
        code: getErrorCode(error),
      };
      return NextResponse.json(response, { status: 402 });
    }

    // Generic error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const response: ApiResponse<never> = {
      success: false,
      error: errorMessage,
      code: 'PAYMENT_FAILED',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * ============================================================================
 * PAYMENT SERVICE - STRIPE INTEGRATION
 * ============================================================================
 *
 * Handles all payment-related operations using Stripe:
 * - Creating payment intents for bookings
 * - Processing successful payments
 * - Handling payment failures
 * - Processing refunds
 *
 * PAYMENT FLOW:
 * -------------
 * 1. User reserves seats → Booking created with status PENDING
 * 2. createPaymentIntent() → Creates Stripe PaymentIntent, returns clientSecret
 * 3. Frontend collects card details and confirms payment
 * 4. Stripe webhook notifies success/failure
 * 5. handlePaymentSuccess() → Updates booking to CONFIRMED
 *    OR handlePaymentFailure() → Updates booking to FAILED
 *
 * ============================================================================
 */

import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import prisma from '@/lib/db';
import { PaymentError, BookingNotFoundError } from '@/lib/errors';

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: string;
}

// ============================================================================
// CREATE PAYMENT INTENT
// ============================================================================

/**
 * Create a Stripe PaymentIntent for a booking.
 *
 * This is called after a user has reserved seats and is ready to pay.
 * The clientSecret is returned to the frontend to collect payment details.
 *
 * @param bookingId - The booking ID to create payment for
 * @param amount - Amount in dollars (will be converted to cents)
 * @param currency - Currency code (default: 'usd')
 * @returns PaymentIntent client secret and ID
 *
 * @example
 * const { clientSecret, paymentIntentId } = await createPaymentIntent(
 *   'booking-123',
 *   150.00,
 *   'usd'
 * );
 */
export async function createPaymentIntent(
  bookingId: string,
  amount: number,
  currency: string = 'usd'
): Promise<PaymentIntentResult> {
  console.log(`[PaymentService] Creating PaymentIntent for booking ${bookingId}, amount: $${amount}`);

  // =========================================================================
  // STEP 1: Fetch booking with event and seats
  // =========================================================================
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
        },
      },
      bookingSeats: {
        include: {
          seat: {
            select: {
              id: true,
              seatNumber: true,
              section: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    throw new BookingNotFoundError(bookingId);
  }

  // Check if booking already has a payment intent
  if (booking.paymentIntentId) {
    console.log(`[PaymentService] Booking ${bookingId} already has PaymentIntent: ${booking.paymentIntentId}`);

    // Retrieve existing payment intent to return its client secret
    const existingIntent = await stripe.paymentIntents.retrieve(booking.paymentIntentId);

    if (existingIntent.client_secret) {
      return {
        clientSecret: existingIntent.client_secret,
        paymentIntentId: existingIntent.id,
      };
    }
  }

  // =========================================================================
  // STEP 2: Create Stripe PaymentIntent
  // =========================================================================
  const amountInCents = Math.round(amount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      eventId: booking.event.id,
      eventName: booking.event.name,
      userId: booking.userId,
      seatCount: String(booking.bookingSeats.length),
      seats: booking.bookingSeats.map((bs) => bs.seat.seatNumber).join(', '),
    },
    description: `Tickets for ${booking.event.name} - ${booking.bookingReference}`,
  });

  console.log(`[PaymentService] Created PaymentIntent: ${paymentIntent.id}`);

  // =========================================================================
  // STEP 3: Update booking with PaymentIntent ID
  // =========================================================================
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      paymentIntentId: paymentIntent.id,
      paymentStatus: 'AUTHORIZED',
    },
  });

  // =========================================================================
  // STEP 4: Create audit log
  // =========================================================================
  await prisma.auditLog.create({
    data: {
      entityType: 'Booking',
      entityId: bookingId,
      action: 'PAYMENT_INTENT_CREATED',
      userId: booking.userId,
      newValue: {
        paymentIntentId: paymentIntent.id,
        amount: amountInCents,
        currency,
      },
      metadata: {
        bookingReference: booking.bookingReference,
        eventId: booking.eventId,
      },
    },
  });

  if (!paymentIntent.client_secret) {
    throw new PaymentError('Failed to create payment intent - no client secret returned');
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

// ============================================================================
// HANDLE PAYMENT SUCCESS
// ============================================================================

/**
 * Handle a successful payment from Stripe webhook.
 *
 * Called when payment_intent.succeeded webhook is received.
 * Updates the booking to CONFIRMED status.
 *
 * @param paymentIntentId - The Stripe PaymentIntent ID
 * @returns The updated booking for notification purposes
 */
export async function handlePaymentSuccess(
  paymentIntentId: string
): Promise<{ bookingId: string; bookingReference: string; userId: string; eventId: string }> {
  console.log(`[PaymentService] Handling payment success for PaymentIntent: ${paymentIntentId}`);

  // =========================================================================
  // STEP 1: Find booking by paymentIntentId
  // =========================================================================
  const booking = await prisma.booking.findFirst({
    where: { paymentIntentId },
    select: {
      id: true,
      bookingReference: true,
      userId: true,
      eventId: true,
      status: true,
      paymentStatus: true,
    },
  });

  if (!booking) {
    console.error(`[PaymentService] No booking found for PaymentIntent: ${paymentIntentId}`);
    throw new PaymentError(`No booking found for PaymentIntent: ${paymentIntentId}`);
  }

  // Check if already processed (idempotency)
  if (booking.status === 'CONFIRMED' && booking.paymentStatus === 'CAPTURED') {
    console.log(`[PaymentService] Booking ${booking.id} already confirmed, skipping`);
    return {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      userId: booking.userId,
      eventId: booking.eventId,
    };
  }

  // =========================================================================
  // STEP 2: Update booking to CONFIRMED
  // =========================================================================
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      confirmedAt: new Date(),
    },
  });

  // =========================================================================
  // STEP 3: Create audit log
  // =========================================================================
  await prisma.auditLog.create({
    data: {
      entityType: 'Booking',
      entityId: booking.id,
      action: 'PAYMENT_SUCCESS',
      userId: booking.userId,
      oldValue: {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      },
      newValue: {
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
      },
      metadata: {
        paymentIntentId,
        bookingReference: booking.bookingReference,
      },
    },
  });

  console.log(`[PaymentService] ✅ Booking ${booking.bookingReference} confirmed successfully`);

  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
    userId: booking.userId,
    eventId: booking.eventId,
  };
}

// ============================================================================
// HANDLE PAYMENT FAILURE
// ============================================================================

/**
 * Handle a failed payment from Stripe webhook.
 *
 * Called when payment_intent.payment_failed webhook is received.
 * Updates the booking to FAILED status.
 * TODO: Trigger seat release for failed payments.
 *
 * @param paymentIntentId - The Stripe PaymentIntent ID
 * @param errorMessage - Optional error message from Stripe
 */
export async function handlePaymentFailure(
  paymentIntentId: string,
  errorMessage?: string
): Promise<void> {
  console.log(`[PaymentService] Handling payment failure for PaymentIntent: ${paymentIntentId}`);
  if (errorMessage) {
    console.log(`[PaymentService] Error: ${errorMessage}`);
  }

  // =========================================================================
  // STEP 1: Find booking by paymentIntentId
  // =========================================================================
  const booking = await prisma.booking.findFirst({
    where: { paymentIntentId },
    select: {
      id: true,
      bookingReference: true,
      userId: true,
      eventId: true,
      status: true,
      paymentStatus: true,
    },
  });

  if (!booking) {
    console.error(`[PaymentService] No booking found for PaymentIntent: ${paymentIntentId}`);
    return; // Don't throw - webhook should still return 200
  }

  // Check if already failed (idempotency)
  if (booking.status === 'FAILED') {
    console.log(`[PaymentService] Booking ${booking.id} already marked as failed, skipping`);
    return;
  }

  // =========================================================================
  // STEP 2: Update booking to FAILED
  // =========================================================================
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: 'FAILED',
      paymentStatus: 'FAILED',
      metadata: {
        paymentFailureReason: errorMessage || 'Payment failed',
        failedAt: new Date().toISOString(),
      },
    },
  });

  // =========================================================================
  // STEP 3: Create audit log
  // =========================================================================
  await prisma.auditLog.create({
    data: {
      entityType: 'Booking',
      entityId: booking.id,
      action: 'PAYMENT_FAILED',
      userId: booking.userId,
      oldValue: {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      },
      newValue: {
        status: 'FAILED',
        paymentStatus: 'FAILED',
      },
      metadata: {
        paymentIntentId,
        bookingReference: booking.bookingReference,
        errorMessage,
      },
    },
  });

  console.log(`[PaymentService] ❌ Booking ${booking.bookingReference} marked as FAILED`);

  // TODO: Trigger seat release
  // This would release the reserved seats back to available
  // For now, the reservation expiry worker will handle this
}

// ============================================================================
// REFUND PAYMENT
// ============================================================================

/**
 * Refund a payment for a booking.
 *
 * Creates a Stripe refund and updates the booking status.
 *
 * @param bookingId - The booking ID to refund
 * @param reason - Optional reason for the refund
 * @returns Refund details
 */
export async function refundPayment(
  bookingId: string,
  reason?: string
): Promise<RefundResult> {
  console.log(`[PaymentService] Processing refund for booking ${bookingId}`);
  if (reason) {
    console.log(`[PaymentService] Reason: ${reason}`);
  }

  // =========================================================================
  // STEP 1: Find booking and paymentIntentId
  // =========================================================================
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingReference: true,
      userId: true,
      eventId: true,
      paymentIntentId: true,
      totalAmount: true,
      status: true,
      paymentStatus: true,
    },
  });

  if (!booking) {
    throw new BookingNotFoundError(bookingId);
  }

  if (!booking.paymentIntentId) {
    throw new PaymentError(`Booking ${bookingId} has no payment intent to refund`);
  }

  if (booking.paymentStatus === 'REFUNDED') {
    console.log(`[PaymentService] Booking ${bookingId} already refunded`);
    throw new PaymentError(`Booking ${bookingId} has already been refunded`);
  }

  // =========================================================================
  // STEP 2: Create Stripe refund
  // =========================================================================
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: booking.paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        refundReason: reason || 'Customer requested refund',
      },
    });
  } catch (error) {
    console.error(`[PaymentService] Stripe refund failed:`, error);
    throw new PaymentError(
      `Failed to process refund: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  console.log(`[PaymentService] Stripe refund created: ${refund.id}`);

  // =========================================================================
  // STEP 3: Update booking status
  // =========================================================================
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      cancelledAt: new Date(),
      metadata: {
        refundId: refund.id,
        refundReason: reason || 'Customer requested refund',
        refundedAt: new Date().toISOString(),
      },
    },
  });

  // =========================================================================
  // STEP 4: Create audit log
  // =========================================================================
  await prisma.auditLog.create({
    data: {
      entityType: 'Booking',
      entityId: bookingId,
      action: 'REFUND',
      userId: booking.userId,
      oldValue: {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      },
      newValue: {
        status: 'REFUNDED',
        paymentStatus: 'REFUNDED',
        refundId: refund.id,
      },
      metadata: {
        paymentIntentId: booking.paymentIntentId,
        bookingReference: booking.bookingReference,
        refundReason: reason,
        refundAmount: refund.amount,
      },
    },
  });

  console.log(`[PaymentService] ✅ Booking ${booking.bookingReference} refunded successfully`);

  return {
    refundId: refund.id,
    amount: refund.amount,
    status: refund.status ?? 'pending',
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the status of a payment intent from Stripe.
 * Useful for debugging or manual verification.
 *
 * @param paymentIntentId - The Stripe PaymentIntent ID
 * @returns PaymentIntent status and details
 */
export async function getPaymentStatus(paymentIntentId: string): Promise<{
  status: Stripe.PaymentIntent.Status;
  amount: number;
  currency: string;
  metadata: Stripe.Metadata;
}> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    metadata: paymentIntent.metadata,
  };
}

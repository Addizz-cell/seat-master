/**
 * ============================================================================
 * STRIPE WEBHOOK HANDLER
 * ============================================================================
 *
 * Handles incoming webhook events from Stripe.
 *
 * WEBHOOK EVENTS HANDLED:
 * -----------------------
 * - payment_intent.succeeded: Payment successful, confirm the booking
 * - payment_intent.payment_failed: Payment failed, mark booking as failed
 * - charge.refunded: Refund processed (logged for audit)
 *
 * SECURITY:
 * ---------
 * - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
 * - Rejects requests with invalid signatures
 * - Uses raw body for signature verification
 *
 * SETUP:
 * ------
 * 1. Install Stripe CLI: brew install stripe/stripe-cli/stripe
 * 2. Login: stripe login
 * 3. Forward webhooks: stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * 4. Copy the webhook signing secret (whsec_...) to .env.local
 *
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import stripe, { webhookSecret } from '@/lib/stripe';
import {
  handlePaymentSuccess,
  handlePaymentFailure,
} from '@/services/paymentService';

/**
 * POST /api/webhooks/stripe
 *
 * Receives and processes Stripe webhook events.
 *
 * IMPORTANT: This endpoint must:
 * 1. Read the raw body (not parsed JSON) for signature verification
 * 2. Return 200 quickly to acknowledge receipt
 * 3. Process events idempotently (same event may be sent multiple times)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // =========================================================================
  // STEP 1: Get raw body and signature
  // =========================================================================
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header');
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // =========================================================================
  // STEP 2: Verify webhook signature
  // =========================================================================
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Stripe Webhook] Signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 400 }
    );
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  // =========================================================================
  // STEP 3: Handle events
  // =========================================================================
  try {
    switch (event.type) {
      // =====================================================================
      // PAYMENT SUCCESS
      // =====================================================================
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Stripe Webhook] PaymentIntent succeeded: ${paymentIntent.id}`);

        try {
          const result = await handlePaymentSuccess(paymentIntent.id);
          console.log(
            `[Stripe Webhook] ✅ Booking ${result.bookingReference} confirmed`
          );
        } catch (error) {
          // Log but don't fail the webhook - Stripe will retry
          console.error(
            `[Stripe Webhook] Error handling payment success:`,
            error
          );
          // Still return 200 to prevent infinite retries
          // The payment is successful, we should investigate manually
        }
        break;
      }

      // =====================================================================
      // PAYMENT FAILED
      // =====================================================================
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const errorMessage = paymentIntent.last_payment_error?.message;

        console.log(
          `[Stripe Webhook] PaymentIntent failed: ${paymentIntent.id}`
        );
        if (errorMessage) {
          console.log(`[Stripe Webhook] Error: ${errorMessage}`);
        }

        try {
          await handlePaymentFailure(paymentIntent.id, errorMessage);
          console.log(`[Stripe Webhook] ❌ Booking marked as failed`);
        } catch (error) {
          console.error(
            `[Stripe Webhook] Error handling payment failure:`,
            error
          );
        }
        break;
      }

      // =====================================================================
      // REFUND PROCESSED
      // =====================================================================
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log(
          `[Stripe Webhook] Charge refunded: ${charge.id}, amount: ${charge.amount_refunded}`
        );

        // Log for audit purposes - the refund was initiated by us
        // so the booking should already be updated
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;

        if (paymentIntentId) {
          console.log(
            `[Stripe Webhook] Refund for PaymentIntent: ${paymentIntentId}`
          );
        }
        break;
      }

      // =====================================================================
      // PAYMENT REQUIRES ACTION
      // =====================================================================
      case 'payment_intent.requires_action': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[Stripe Webhook] PaymentIntent requires action: ${paymentIntent.id}`
        );
        // This is informational - the frontend needs to handle 3D Secure
        break;
      }

      // =====================================================================
      // PAYMENT PROCESSING
      // =====================================================================
      case 'payment_intent.processing': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[Stripe Webhook] PaymentIntent processing: ${paymentIntent.id}`
        );
        // Payment is being processed (e.g., bank transfer)
        break;
      }

      // =====================================================================
      // PAYMENT CANCELED
      // =====================================================================
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[Stripe Webhook] PaymentIntent canceled: ${paymentIntent.id}`
        );

        try {
          await handlePaymentFailure(paymentIntent.id, 'Payment was canceled');
        } catch (error) {
          console.error(
            `[Stripe Webhook] Error handling payment cancellation:`,
            error
          );
        }
        break;
      }

      // =====================================================================
      // UNHANDLED EVENT
      // =====================================================================
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    // Log error but return 200 to acknowledge receipt
    // Stripe will retry on 5xx errors
    console.error(`[Stripe Webhook] Error processing event:`, error);
  }

  const duration = Date.now() - startTime;
  console.log(`[Stripe Webhook] Processed ${event.type} in ${duration}ms`);

  // =========================================================================
  // STEP 4: Acknowledge receipt
  // =========================================================================
  return NextResponse.json({ received: true });
}

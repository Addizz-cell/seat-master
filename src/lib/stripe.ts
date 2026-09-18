/**
 * ============================================================================
 * STRIPE CLIENT CONFIGURATION
 * ============================================================================
 *
 * Configures and exports the Stripe client for server-side operations.
 *
 * USAGE:
 * ------
 * import stripe from '@/lib/stripe';
 *
 * // Create a payment intent
 * const paymentIntent = await stripe.paymentIntents.create({
 *   amount: 5000, // $50.00 in cents
 *   currency: 'usd',
 * });
 *
 * ENVIRONMENT VARIABLES:
 * ----------------------
 * STRIPE_SECRET_KEY: Your Stripe secret key (sk_test_... or sk_live_...)
 *
 * ============================================================================
 */

import Stripe from 'stripe';

// Use a placeholder only so importing this module does not fail during a Vercel build.
// Real payment requests still require STRIPE_SECRET_KEY to be configured.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder';

/**
 * Stripe client instance configured with:
 * - API version set for consistency
 * - TypeScript types enabled
 */
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-12-15.clover', // Use latest stable API version
  typescript: true,
});

export default stripe;

/**
 * Webhook signing secret for verifying Stripe webhooks.
 * This is set when running `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 */
export const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

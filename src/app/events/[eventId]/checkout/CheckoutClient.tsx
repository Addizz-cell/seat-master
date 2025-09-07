"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { StripeProvider } from "@/components/providers/StripeProvider";
import { ReservationTimer } from "@/components/booking/ReservationTimer";
import { OrderSummary } from "@/components/booking/OrderSummary";
import { PaymentForm } from "@/components/booking/PaymentForm";
import {
  ReservationFailed,
  NetworkError,
  GenericError,
  LeaveCheckoutDialog,
} from "@/components/booking/CheckoutErrors";
import type { SeatType } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

type CheckoutState =
  | "loading" // Creating reservation
  | "ready" // Show checkout form
  | "processing" // Payment in progress
  | "success" // Redirect to confirmation
  | "error" // Show error with recovery
  | "expired"; // Timer ran out

interface SeatInfo {
  id: string;
  seatNumber: string;
  row: string;
  section: string;
  seatType: SeatType;
  price: string;
}

interface EventInfo {
  id: string;
  name: string;
  eventDate: Date;
  venueName: string;
  venueCity: string;
}

interface ReservationData {
  reservationIds: string[];
  seats: SeatInfo[];
  expiresAt: Date;
  totalAmount: string;
  bookingId: string;
  clientSecret: string;
}

interface CheckoutClientProps {
  eventId: string;
  event: EventInfo;
  seatIds: string[];
  userId: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CheckoutClient({
  eventId,
  event,
  seatIds,
  userId,
}: CheckoutClientProps) {
  const router = useRouter();
  const [state, setState] = useState<CheckoutState>("loading");
  const [reservationData, setReservationData] = useState<ReservationData | null>(null);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const hasInitialized = useRef(false);

  // Calculate total with service fee
  const serviceFeeRate = 0.05;
  const subtotal = reservationData
    ? reservationData.seats.reduce((sum, seat) => sum + parseFloat(seat.price), 0)
    : 0;
  const serviceFee = subtotal * serviceFeeRate;
  const total = subtotal + serviceFee;

  // =========================================================================
  // CREATE RESERVATION + BOOKING + PAYMENT INTENT
  // =========================================================================
  // Helper to safely parse JSON response
  const parseJsonResponse = async (response: Response, context: string) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error(`[CheckoutClient] ${context} - Non-JSON response:`, text.substring(0, 200));
      throw new Error(`Server error during ${context}. Please try again.`);
    }
  };

  const initializeCheckout = useCallback(async () => {
    setState("loading");
    setError(null);

    try {
      // Step 1: Create reservation
      const reservationRes = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          eventId,
          seatIds,
        }),
      });

      const reservationResult = await parseJsonResponse(reservationRes, "reservation");

      if (!reservationResult.success) {
        // Handle seat unavailable
        if (reservationRes.status === 409) {
          setError({
            type: "seats_unavailable",
            message: reservationResult.error || "The selected seats are no longer available.",
          });
          setState("error");
          return;
        }
        throw new Error(reservationResult.error || "Failed to reserve seats");
      }

      const { reservationIds, seats, expiresAt, totalAmount } = reservationResult.data;

      // Step 2: Create booking (pending)
      const idempotencyKey = crypto.randomUUID();
      const bookingRes = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          reservationIds,
          idempotencyKey,
        }),
      });

      const bookingResult = await parseJsonResponse(bookingRes, "booking");

      if (!bookingResult.success) {
        throw new Error(bookingResult.error || "Failed to create booking");
      }

      const bookingId = bookingResult.data.id;

      // Step 3: Create payment intent
      const paymentRes = await fetch(`/api/bookings/${bookingId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
      });

      const paymentResult = await parseJsonResponse(paymentRes, "payment");

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Failed to create payment intent");
      }

      const { clientSecret } = paymentResult.data;

      // Transform seat data to match our interface
      const seatInfo: SeatInfo[] = seats.map((seat: {
        id: string;
        seatNumber: string;
        row: string;
        section: string;
        seatType: SeatType;
        price: string | number | { toString(): string };
      }) => ({
        id: seat.id,
        seatNumber: seat.seatNumber,
        row: seat.row,
        section: seat.section,
        seatType: seat.seatType,
        price: typeof seat.price === "object" ? seat.price.toString() : String(seat.price),
      }));

      setReservationData({
        reservationIds,
        seats: seatInfo,
        expiresAt: new Date(expiresAt),
        totalAmount: typeof totalAmount === "object" ? totalAmount.toString() : String(totalAmount),
        bookingId,
        clientSecret,
      });
      setState("ready");
    } catch (err) {
      console.error("[CheckoutClient] Error initializing checkout:", err);
      const message = err instanceof Error ? err.message : "Failed to initialize checkout";

      // Check for network errors
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError({ type: "network", message: "Unable to connect to the server." });
      } else {
        setError({ type: "generic", message });
      }
      setState("error");
    }
  }, [eventId, seatIds, userId]);

  // Initialize on mount
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      initializeCheckout();
    }
  }, [initializeCheckout]);

  // =========================================================================
  // HANDLERS
  // =========================================================================
  const handleExpired = useCallback(() => {
    setState("expired");
    router.push(`/events/${eventId}/seats`);
  }, [eventId, router]);

  const handlePaymentSuccess = useCallback(
    (paymentIntentId: string) => {
      setState("success");
      toast.success("Payment successful! Redirecting to confirmation...");

      // Redirect to confirmation page
      router.push(`/bookings/${reservationData?.bookingId}/confirmation`);
    },
    [reservationData?.bookingId, router]
  );

  const handlePaymentError = useCallback((errorMessage: string) => {
    toast.error(errorMessage);
    // Don't change state - let user retry with PaymentForm
  }, []);

  const handleBackToSeats = useCallback(() => {
    router.push(`/events/${eventId}/seats`);
  }, [eventId, router]);

  const handleRetry = useCallback(() => {
    hasInitialized.current = false;
    initializeCheckout();
  }, [initializeCheckout]);

  // Handle browser back/navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state === "ready" || state === "processing") {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state]);

  // =========================================================================
  // RENDER STATES
  // =========================================================================

  // Loading State
  if (state === "loading") {
    return <CheckoutSkeleton />;
  }

  // Error State
  if (state === "error" && error) {
    if (error.type === "seats_unavailable") {
      return (
        <ReservationFailed
          message={error.message}
          onBackToSeats={handleBackToSeats}
        />
      );
    }
    if (error.type === "network") {
      return <NetworkError message={error.message} onRetry={handleRetry} />;
    }
    return (
      <GenericError
        message={error.message}
        onRetry={handleRetry}
        onBackToSeats={handleBackToSeats}
      />
    );
  }

  // Success State (brief - redirecting)
  if (state === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-pulse text-center">
          <h2 className="text-xl font-semibold mb-2">Payment Successful!</h2>
          <p className="text-muted-foreground">Redirecting to your confirmation...</p>
        </div>
      </div>
    );
  }

  // Ready State - Main Checkout UI
  if (state === "ready" && reservationData) {
    return (
      <>
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Left Column - Order Summary (Desktop) */}
          <div className="hidden lg:block lg:col-span-2">
            <OrderSummary
              event={event}
              seats={reservationData.seats}
              showServiceFee
              serviceFeeRate={serviceFeeRate}
            />
          </div>

          {/* Right Column - Payment */}
          <div className="lg:col-span-3 space-y-6">
            {/* Timer */}
            <ReservationTimer
              expiresAt={reservationData.expiresAt}
              onExpired={handleExpired}
            />

            {/* Mobile Order Summary (Collapsible) */}
            <div className="lg:hidden">
              <OrderSummary
                event={event}
                seats={reservationData.seats}
                showServiceFee
                serviceFeeRate={serviceFeeRate}
                collapsible
                defaultCollapsed
              />
            </div>

            {/* Stripe Payment Form */}
            <StripeProvider clientSecret={reservationData.clientSecret}>
              <PaymentForm
                amount={total}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            </StripeProvider>
          </div>
        </div>

        {/* Mobile Sticky Footer */}
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-background border-t p-4 shadow-lg">
          <div className="container flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-bold">
                ${total.toFixed(2)}
              </p>
            </div>
            <ReservationTimer
              expiresAt={reservationData.expiresAt}
              onExpired={handleExpired}
              className="w-auto"
            />
          </div>
        </div>

        {/* Spacer for mobile sticky footer */}
        <div className="h-24 lg:hidden" />

        {/* Leave Checkout Dialog */}
        <LeaveCheckoutDialog
          open={showLeaveDialog}
          onConfirm={handleBackToSeats}
          onCancel={() => setShowLeaveDialog(false)}
        />
      </>
    );
  }

  return null;
}

// ============================================================================
// SKELETON LOADER
// ============================================================================

function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* Left Column - Order Summary Skeleton */}
      <div className="hidden lg:block lg:col-span-2">
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="flex gap-3">
              <Skeleton className="h-16 w-16 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
            <Skeleton className="h-px w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Payment Skeleton */}
      <div className="lg:col-span-3 space-y-6">
        {/* Timer Skeleton */}
        <Skeleton className="h-20 w-full rounded-lg" />

        {/* Payment Form Skeleton */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <div className="flex gap-4">
              <Skeleton className="h-12 w-1/2" />
              <Skeleton className="h-12 w-1/2" />
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

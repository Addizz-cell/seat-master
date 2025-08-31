/**
 * ============================================================================
 * CUSTOM ERROR CLASSES
 * ============================================================================
 *
 * Domain-specific errors for the booking system.
 * These errors provide:
 * 1. Type-safe error handling (instanceof checks)
 * 2. Consistent error names for logging
 * 3. Easy mapping to HTTP status codes in API routes
 *
 * ERROR HIERARCHY:
 * ----------------
 * Error (built-in)
 * └── BookingError (base class)
 *     ├── SeatLockError (409 Conflict)
 *     ├── SeatNotFoundError (404 Not Found)
 *     ├── SeatNotAvailableError (409 Conflict)
 *     ├── ReservationNotFoundError (404 Not Found)
 *     └── ReservationExpiredError (410 Gone)
 *
 * USAGE IN API ROUTES:
 * --------------------
 * try {
 *   const result = await reserveSeats(...);
 * } catch (error) {
 *   if (error instanceof SeatLockError) {
 *     return NextResponse.json({ error: error.message }, { status: 409 });
 *   }
 *   if (error instanceof SeatNotFoundError) {
 *     return NextResponse.json({ error: error.message }, { status: 404 });
 *   }
 *   // ... handle other errors
 * }
 *
 * ============================================================================
 */

/**
 * Base error class for all booking-related errors.
 * Extends Error to add the error code property.
 */
export class BookingError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    // Maintains proper stack trace for where error was thrown (V8 engines)
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Thrown when a distributed lock cannot be acquired.
 * This typically means another process is currently operating on the same resource.
 *
 * HTTP Status: 409 Conflict
 *
 * @example
 * throw new SeatLockError('Could not acquire lock for seat A1');
 * throw new SeatLockError('Seats are being processed by another request', ['seat1', 'seat2']);
 */
export class SeatLockError extends BookingError {
  readonly affectedKeys?: string[];

  constructor(message: string, affectedKeys?: string[]) {
    super(message, "SEAT_LOCK_ERROR");
    this.name = "SeatLockError";
    this.affectedKeys = affectedKeys;
  }
}

/**
 * Thrown when a requested seat does not exist in the database.
 *
 * HTTP Status: 404 Not Found
 *
 * @example
 * throw new SeatNotFoundError('seat-123');
 * throw new SeatNotFoundError('seat-123', 'event-456');
 */
export class SeatNotFoundError extends BookingError {
  readonly seatId: string;
  readonly eventId?: string;

  constructor(seatId: string, eventId?: string) {
    const message = eventId
      ? `Seat ${seatId} not found for event ${eventId}`
      : `Seat ${seatId} not found`;
    super(message, "SEAT_NOT_FOUND");
    this.name = "SeatNotFoundError";
    this.seatId = seatId;
    this.eventId = eventId;
  }
}

/**
 * Thrown when a seat is not available for reservation.
 * This could mean the seat is already reserved, booked, or otherwise unavailable.
 *
 * HTTP Status: 409 Conflict
 *
 * @example
 * throw new SeatNotAvailableError('A1', 'RESERVED');
 * throw new SeatNotAvailableError('B3', 'BOOKED');
 */
export class SeatNotAvailableError extends BookingError {
  readonly seatNumber: string;
  readonly currentStatus: string;

  constructor(seatNumber: string, currentStatus: string) {
    super(
      `Seat ${seatNumber} is not available (current status: ${currentStatus})`,
      "SEAT_NOT_AVAILABLE"
    );
    this.name = "SeatNotAvailableError";
    this.seatNumber = seatNumber;
    this.currentStatus = currentStatus;
  }
}

/**
 * Thrown when a requested reservation does not exist or is not in an expected state.
 *
 * HTTP Status: 404 Not Found
 *
 * @example
 * throw new ReservationNotFoundError('reservation-123');
 * throw new ReservationNotFoundError('reservation-123', 'user-456');
 */
export class ReservationNotFoundError extends BookingError {
  readonly reservationId: string;
  readonly userId?: string;

  constructor(reservationId: string, userId?: string) {
    const message = userId
      ? `Reservation ${reservationId} not found for user ${userId}`
      : `Reservation ${reservationId} not found`;
    super(message, "RESERVATION_NOT_FOUND");
    this.name = "ReservationNotFoundError";
    this.reservationId = reservationId;
    this.userId = userId;
  }
}

/**
 * Thrown when a reservation has expired.
 * Reservations typically expire after 10-15 minutes if not converted to a booking.
 *
 * HTTP Status: 410 Gone
 *
 * @example
 * throw new ReservationExpiredError('reservation-123', expiredAt);
 */
export class ReservationExpiredError extends BookingError {
  readonly reservationId: string;
  readonly expiredAt: Date;

  constructor(reservationId: string, expiredAt: Date) {
    super(
      `Reservation ${reservationId} expired at ${expiredAt.toISOString()}`,
      "RESERVATION_EXPIRED"
    );
    this.name = "ReservationExpiredError";
    this.reservationId = reservationId;
    this.expiredAt = expiredAt;
  }
}

/**
 * Thrown when a booking cannot be completed due to a conflict.
 * This is a general error for booking-related conflicts not covered by other errors.
 *
 * HTTP Status: 409 Conflict
 *
 * @example
 * throw new BookingConflictError('Booking already exists for these seats');
 */
export class BookingConflictError extends BookingError {
  constructor(message: string) {
    super(message, "BOOKING_CONFLICT");
    this.name = "BookingConflictError";
  }
}

/**
 * Thrown when a validation error occurs.
 * Used for input validation failures.
 *
 * HTTP Status: 400 Bad Request
 *
 * @example
 * throw new ValidationError('Invalid seat IDs provided');
 */
export class ValidationError extends BookingError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.field = field;
  }
}

/**
 * Thrown when a requested booking does not exist.
 *
 * HTTP Status: 404 Not Found
 *
 * @example
 * throw new BookingNotFoundError('booking-123');
 */
export class BookingNotFoundError extends BookingError {
  readonly bookingId: string;

  constructor(bookingId: string) {
    super(`Booking ${bookingId} not found`, "BOOKING_NOT_FOUND");
    this.name = "BookingNotFoundError";
    this.bookingId = bookingId;
  }
}

/**
 * Thrown when a payment operation fails.
 *
 * HTTP Status: 402 Payment Required (for payment failures)
 * HTTP Status: 400 Bad Request (for invalid payment operations)
 *
 * @example
 * throw new PaymentError('Payment intent creation failed');
 * throw new PaymentError('Refund failed: insufficient funds');
 */
export class PaymentError extends BookingError {
  readonly stripeErrorCode?: string;

  constructor(message: string, stripeErrorCode?: string) {
    super(message, "PAYMENT_ERROR");
    this.name = "PaymentError";
    this.stripeErrorCode = stripeErrorCode;
  }
}

/**
 * Thrown when a booking fails after payment has been processed.
 * This should trigger a compensating transaction (refund).
 *
 * HTTP Status: 500 Internal Server Error
 *
 * @example
 * throw new BookingFailureException('Booking confirmation failed, payment refunded');
 */
export class BookingFailureException extends BookingError {
  readonly wasRefunded: boolean;

  constructor(message: string, wasRefunded: boolean = false) {
    super(message, "BOOKING_FAILURE");
    this.name = "BookingFailureException";
    this.wasRefunded = wasRefunded;
  }
}

/**
 * Map error instances to HTTP status codes.
 * Use this in API routes for consistent error handling.
 *
 * @param error - The error to map
 * @returns HTTP status code
 *
 * @example
 * } catch (error) {
 *   const status = getErrorStatusCode(error);
 *   return NextResponse.json({ error: error.message }, { status });
 * }
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof SeatLockError) return 409;
  if (error instanceof SeatNotFoundError) return 404;
  if (error instanceof SeatNotAvailableError) return 409;
  if (error instanceof ReservationNotFoundError) return 404;
  if (error instanceof ReservationExpiredError) return 410;
  if (error instanceof BookingConflictError) return 409;
  if (error instanceof ValidationError) return 400;
  if (error instanceof BookingNotFoundError) return 404;
  if (error instanceof PaymentError) return 402;
  if (error instanceof BookingFailureException) return 500;
  if (error instanceof BookingError) return 500;
  return 500;
}

/**
 * Get the error code from an error instance.
 * Falls back to 'UNKNOWN_ERROR' for non-booking errors.
 *
 * @param error - The error to get code from
 * @returns Error code string
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof BookingError) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

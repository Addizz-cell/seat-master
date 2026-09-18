/**
 * TypeScript Types for Ticket Booking System
 *
 * This file contains all shared types used throughout the application.
 * Types are organized by domain: API, Events, Seats, Reservations, Bookings, and Locking.
 */

import type {
  Event,
  Seat,
  Booking,
  EventCategory,
  EventStatus,
  SeatType,
  SeatStatus,
  BookingStatus,
  PaymentStatus,
} from '../generated/prisma/client'

/**
 * Decimal type from Prisma for monetary values.
 * Using string representation for JSON serialization compatibility.
 */
type Decimal = string;

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Discriminated union for API responses.
 * Using a discriminated union (success: true/false) allows TypeScript to
 * narrow the type based on the success property, providing better type safety.
 *
 * @example
 * const response = await fetch('/api/events');
 * const result: ApiResponse<Event[]> = await response.json();
 * if (result.success) {
 *   console.log(result.data); // TypeScript knows data exists
 * } else {
 *   console.error(result.error); // TypeScript knows error exists
 * }
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * Pagination parameters for list endpoints.
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated response wrapper for list endpoints.
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Event with relationship counts.
 * Used when displaying event details with statistics.
 */
export interface EventWithCounts extends Event {
  _count: {
    seats: number;
    bookings: number;
    reservations: number;
  };
}

/**
 * Minimal event data for list displays.
 * Optimized for performance - only includes fields needed for event cards/lists.
 * Includes computed minPrice from the cheapest available seat.
 */
export interface EventListItem {
  id: string;
  name: string;
  venueName: string;
  venueCity: string;
  eventDate: Date;
  status: EventStatus;
  category: EventCategory;
  /** Minimum ticket price (cheapest available seat) */
  minPrice: Decimal | null;
  /** Number of seats still available */
  availableSeats: number;
  /** Total seat capacity */
  totalSeats: number;
}

/**
 * Full event details with seat breakdown by section.
 * Used on event detail pages.
 */
export interface EventDetails extends Event {
  seatsBySection: {
    section: string;
    seatType: SeatType;
    totalSeats: number;
    availableSeats: number;
    minPrice: Decimal;
    maxPrice: Decimal;
  }[];
}

// ============================================================================
// SEAT TYPES
// ============================================================================

/**
 * Seat with computed selectability status.
 * Used in seat map rendering to determine if a seat can be selected.
 */
export interface SeatWithStatus extends Seat {
  /**
   * Whether this seat can be selected by the current user.
   * A seat is selectable if:
   * - status is AVAILABLE, OR
   * - status is RESERVED AND reservedBy is the current user
   */
  isSelectable: boolean;
}

/**
 * Individual seat data for seat map rendering.
 * Simplified structure optimized for the UI.
 */
export interface SeatMapSeat {
  id: string;
  seatNumber: string;
  seatType: SeatType;
  status: SeatStatus;
  price: Decimal;
  isSelectable: boolean;
  /** True if this seat is currently selected by the user */
  isSelected?: boolean;
}

/**
 * Row containing seats in a section.
 */
export interface SeatMapRow {
  row: string;
  seats: SeatMapSeat[];
}

/**
 * Section containing rows of seats.
 */
export interface SeatMapSection {
  section: string;
  seatType: SeatType;
  rows: SeatMapRow[];
}

/**
 * Complete seat map data structure for rendering.
 * Nested structure: sections → rows → seats
 * This hierarchical structure makes it easy to render
 * seat maps with proper grouping and layout.
 */
export interface SeatMapData {
  eventId: string;
  sections: SeatMapSection[];
  /** Summary statistics */
  stats: {
    totalSeats: number;
    availableSeats: number;
    reservedSeats: number;
    bookedSeats: number;
  };
}

// ============================================================================
// RESERVATION TYPES
// ============================================================================

/**
 * Request payload for reserving seats.
 * Sent when user adds seats to cart/selection.
 */
export interface ReservationRequest {
  eventId: string;
  /** Array of seat IDs to reserve (max 10 per request) */
  seatIds: string[];
}

/**
 * Response after successfully reserving seats.
 * Contains all information needed for checkout flow.
 */
export interface ReservationResponse {
  /** IDs of the created reservation records */
  reservationIds: string[];
  /** The reserved seats with current status */
  seats: SeatWithStatus[];
  /** When the reservation expires (typically 10-15 minutes) */
  expiresAt: Date;
  /** Total amount for all reserved seats */
  totalAmount: Decimal;
  /** Breakdown by seat type */
  breakdown: {
    seatType: SeatType;
    count: number;
    subtotal: Decimal;
  }[];
}

/**
 * Active reservation info for the user's cart/checkout.
 */
export interface ActiveReservation {
  id: string;
  eventId: string;
  seat: {
    id: string;
    seatNumber: string;
    row: string;
    section: string;
    seatType: SeatType;
    price: Decimal;
  };
  expiresAt: Date;
  /** Seconds remaining until expiration */
  expiresIn: number;
}

// ============================================================================
// BOOKING TYPES
// ============================================================================

/**
 * Request payload for confirming a booking.
 * Converts reservations into a confirmed booking.
 */
export interface BookingRequest {
  /** Reservation IDs to include in this booking */
  reservationIds: string[];
  /**
   * Client-generated idempotency key (UUID v4).
   * CRITICAL: This prevents duplicate bookings if the request is retried.
   * Generate this client-side and reuse for retries of the same booking attempt.
   */
  idempotencyKey: string;
  /** Payment method ID from payment provider (e.g., Stripe) */
  paymentMethodId?: string;
}

/**
 * Response after successfully creating a booking.
 */
export interface BookingResponse {
  booking: BookingWithSeats;
  /**
   * Client secret for completing payment (if using Stripe PaymentIntents).
   * The frontend uses this to confirm payment with Stripe.js.
   */
  clientSecret?: string;
}

/**
 * Booking with its associated seats.
 * Used in booking confirmation and history views.
 */
export interface BookingWithSeats extends Booking {
  seats: {
    id: string;
    seatNumber: string;
    row: string;
    section: string;
    seatType: SeatType;
    priceAtBooking: Decimal;
  }[];
  event: {
    id: string;
    name: string;
    venueName: string;
    venueCity: string;
    eventDate: Date;
  };
}

/**
 * Booking list item for history displays.
 */
export interface BookingListItem {
  id: string;
  bookingReference: string;
  eventName: string;
  eventDate: Date;
  venueName: string;
  totalAmount: Decimal;
  seatCount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
}

// ============================================================================
// DISTRIBUTED LOCKING TYPES
// ============================================================================

/**
 * Result of attempting to acquire a distributed lock.
 * Used internally by the locking service.
 */
export interface LockResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean;
  /** The unique value used to identify this lock holder (for safe release) */
  lockValue?: string;
  /** The key used for the lock in Redis */
  lockKey?: string;
  /** If not acquired, reason why (e.g., "already_locked", "timeout") */
  reason?: string;
}

/**
 * An acquired distributed lock with a release method.
 * Provides a clean interface for using locks with try/finally patterns.
 *
 * @example
 * const lock = await lockService.acquire(`seat:${seatId}`);
 * if (!lock) {
 *   throw new Error('Could not acquire lock');
 * }
 * try {
 *   // Critical section - only one process can execute this at a time
 *   await updateSeat(seatId);
 * } finally {
 *   await lock.release();
 * }
 */
export interface AcquiredLock {
  /** The Redis key for this lock */
  key: string;
  /** The unique value identifying this lock holder */
  value: string;
  /**
   * Release the lock. Safe to call multiple times.
   * Uses Lua scripting to ensure we only release our own lock.
   */
  release: () => Promise<boolean>;
}

// ============================================================================
// SEARCH AND FILTER TYPES
// ============================================================================

/**
 * Parameters for searching/filtering events.
 */
export interface EventSearchParams {
  /** Text search in event name and description */
  query?: string;
  /** Filter by city */
  city?: string;
  /** Filter by event category */
  category?: EventCategory;
  /** Filter events on or after this date */
  dateFrom?: Date;
  /** Filter events on or before this date */
  dateTo?: Date;
  /** Pagination */
  page?: number;
  limit?: number;
}

/**
 * Search results with facets for filtering UI.
 */
export interface EventSearchResults {
  events: EventListItem[];
  pagination: PaginatedResponse<EventListItem>['pagination'];
  /** Aggregated counts for filter facets */
  facets: {
    cities: { city: string; count: number }[];
    categories: { category: EventCategory; count: number }[];
  };
}

// ============================================================================
// USER SESSION TYPES
// ============================================================================

/**
 * User session data stored in JWT/session.
 */
export interface UserSession {
  userId: string;
  email: string;
  name: string;
}

/**
 * Authenticated request context.
 */
export interface AuthContext {
  user: UserSession;
}

// ============================================================================
// RE-EXPORT PRISMA ENUMS FOR CONVENIENCE
// ============================================================================

export type {
  EventCategory,
  EventStatus,
  SeatType,
  SeatStatus,
  BookingStatus,
  PaymentStatus,
} from '../generated/prisma/client'

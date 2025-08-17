import { z } from 'zod';

/**
 * Zod Validation Schemas for Ticket Booking System
 *
 * These schemas provide runtime validation for API requests,
 * ensuring data integrity and security throughout the application.
 *
 * Key Design Decisions:
 * - All IDs use UUID format for security (non-guessable)
 * - Seat limits prevent ticket hoarding during flash sales
 * - Date validations ensure logical ordering (e.g., sale starts before event)
 */

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * UUID v4 validation schema.
 * Used for all entity IDs in the system.
 */
export const uuidSchema = z.uuid({
  error: 'Invalid ID format. Expected UUID.',
});

/**
 * Pagination schema with sensible defaults.
 * - page: 0-indexed for easier offset calculation
 * - limit: max 50 to prevent excessive data fetching
 */
export const paginationSchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(0, 'Page must be 0 or greater')
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50')
    .default(20),
});

// ============================================================================
// EVENT SCHEMAS
// ============================================================================

/**
 * Event category enum matching Prisma schema.
 */
export const eventCategorySchema = z.enum([
  'CONCERT',
  'SPORTS',
  'MOVIE',
  'THEATER',
] as const);

/**
 * Schema for creating a new event.
 *
 * Validation Rules:
 * - Name and venue are required with length limits
 * - Event date must be in the future
 * - Sale must start before the event
 * - Sale end time (if provided) must be after sale start
 * - Doors open time (if provided) must be before event start
 */
export const createEventSchema = z
  .object({
    /** Event name - displayed in listings and tickets */
    name: z
      .string()
      .min(1, 'Event name is required')
      .max(255, 'Event name cannot exceed 255 characters'),

    /** Detailed description of the event */
    description: z.string().optional(),

    /** Name of the venue hosting the event */
    venueName: z
      .string()
      .min(1, 'Venue name is required')
      .max(255, 'Venue name cannot exceed 255 characters'),

    /** Full address of the venue */
    venueAddress: z.string().optional(),

    /** City where the venue is located - used for filtering */
    venueCity: z
      .string()
      .min(1, 'City is required')
      .max(100, 'City name cannot exceed 100 characters'),

    /** Event category for filtering and discovery */
    category: eventCategorySchema,

    /** When the event takes place */
    eventDate: z.iso.datetime({
      error: 'Invalid datetime format. Use ISO 8601.',
    }),

    /** When attendees can enter the venue */
    doorsOpenAt: z.iso
      .datetime({ error: 'Invalid datetime format. Use ISO 8601.' })
      .optional(),

    /** When ticket sales begin - critical for flash sales */
    saleStartTime: z.iso.datetime({
      error: 'Invalid datetime format. Use ISO 8601.',
    }),

    /** When ticket sales end */
    saleEndTime: z.iso
      .datetime({ error: 'Invalid datetime format. Use ISO 8601.' })
      .optional(),

    /** Promotional image URL */
    imageUrl: z.url({ error: 'Invalid image URL' }).optional(),
  })
  .refine(
    (data) => {
      const eventDate = new Date(data.eventDate);
      const saleStart = new Date(data.saleStartTime);
      return saleStart < eventDate;
    },
    {
      message: 'Sale start time must be before the event date',
      path: ['saleStartTime'],
    }
  )
  .refine(
    (data) => {
      if (!data.saleEndTime) return true;
      const saleStart = new Date(data.saleStartTime);
      const saleEnd = new Date(data.saleEndTime);
      return saleEnd > saleStart;
    },
    {
      message: 'Sale end time must be after sale start time',
      path: ['saleEndTime'],
    }
  )
  .refine(
    (data) => {
      if (!data.doorsOpenAt) return true;
      const eventDate = new Date(data.eventDate);
      const doorsOpen = new Date(data.doorsOpenAt);
      return doorsOpen < eventDate;
    },
    {
      message: 'Doors open time must be before the event date',
      path: ['doorsOpenAt'],
    }
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;

// ============================================================================
// SEAT RESERVATION SCHEMAS
// ============================================================================

/**
 * Schema for reserving seats.
 *
 * IMPORTANT: Max 10 seats per reservation to prevent ticket hoarding.
 * During flash sales (e.g., Taylor Swift tickets), bots and scalpers
 * try to reserve hundreds of seats. This limit:
 * - Gives regular users a fair chance
 * - Reduces server load during high-traffic periods
 * - Allows legitimate group purchases (families, friends)
 */
export const reserveSeatsSchema = z.object({
  /** The event to reserve seats for */
  eventId: uuidSchema,

  /**
   * Array of seat IDs to reserve.
   * Minimum 1: Must select at least one seat
   * Maximum 10: Prevents ticket hoarding and ensures fair access
   */
  seatIds: z
    .array(uuidSchema)
    .min(1, 'At least one seat must be selected')
    .max(10, 'Maximum 10 seats can be reserved at once to ensure fair access'),
});

export type ReserveSeatsInput = z.infer<typeof reserveSeatsSchema>;

// ============================================================================
// BOOKING CONFIRMATION SCHEMAS
// ============================================================================

/**
 * Schema for confirming a booking (converting reservations to purchase).
 *
 * The idempotencyKey is CRITICAL for preventing duplicate bookings:
 * - Network issues may cause retries
 * - Users may click "Book" multiple times
 * - The key ensures only ONE booking is created per unique request
 *
 * Client should generate the key (crypto.randomUUID()) and reuse it
 * for all retries of the same booking attempt.
 */
export const confirmBookingSchema = z.object({
  /**
   * Reservation IDs to convert to a booking.
   * All reservations must belong to the same user and event.
   */
  reservationIds: z
    .array(uuidSchema)
    .min(1, 'At least one reservation is required'),

  /**
   * Client-generated idempotency key (UUID v4).
   * MUST be generated client-side and reused for retries.
   * Server will return existing booking if key already exists.
   */
  idempotencyKey: uuidSchema,

  /**
   * Payment method ID from payment provider (e.g., Stripe pm_xxx).
   * Optional if using a different payment flow.
   */
  paymentMethodId: z.string().optional(),
});

export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

// ============================================================================
// SEARCH AND FILTER SCHEMAS
// ============================================================================

/**
 * Schema for searching and filtering events.
 *
 * Supports multiple filter combinations:
 * - Text search in name/description
 * - City filter for location-based discovery
 * - Category filter for event type
 * - Date range for planning ahead
 *
 * All filters are optional - empty search returns all events.
 */
export const searchEventsSchema = z
  .object({
    /** Text search query - searches name and description */
    query: z.string().optional(),

    /** Filter by city name (exact match, case-insensitive) */
    city: z.string().optional(),

    /** Filter by event category */
    category: eventCategorySchema.optional(),

    /** Filter events on or after this date */
    dateFrom: z.iso
      .datetime({ error: 'Invalid datetime format. Use ISO 8601.' })
      .optional(),

    /** Filter events on or before this date */
    dateTo: z.iso
      .datetime({ error: 'Invalid datetime format. Use ISO 8601.' })
      .optional(),

    /** Pagination - page number (0-indexed) */
    page: z.coerce.number().int().min(0).default(0),

    /** Pagination - results per page (1-50) */
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(
    (data) => {
      if (!data.dateFrom || !data.dateTo) return true;
      return new Date(data.dateFrom) <= new Date(data.dateTo);
    },
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateFrom'],
    }
  );

export type SearchEventsInput = z.infer<typeof searchEventsSchema>;

// ============================================================================
// USER AUTHENTICATION SCHEMAS
// ============================================================================

/**
 * Schema for user registration.
 */
export const registerUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name cannot exceed 100 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'), // bcrypt limit
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

/**
 * Schema for user login.
 */
export const loginUserSchema = z.object({
  email: z.email({ error: 'Invalid email address' }),
  password: z.string().min(1, 'Password is required'),
});

export type LoginUserInput = z.infer<typeof loginUserSchema>;

// ============================================================================
// SEAT MANAGEMENT SCHEMAS
// ============================================================================

/**
 * Schema for getting seats by event.
 */
export const getSeatsSchema = z.object({
  eventId: uuidSchema,
  /** Filter by section (e.g., "VIP", "Orchestra") */
  section: z.string().optional(),
  /** Filter by seat type */
  seatType: z.enum(['REGULAR', 'VIP', 'PREMIUM', 'ACCESSIBLE'] as const).optional(),
  /** Only show available seats */
  availableOnly: z.coerce.boolean().default(false),
});

export type GetSeatsInput = z.infer<typeof getSeatsSchema>;

// ============================================================================
// BOOKING MANAGEMENT SCHEMAS
// ============================================================================

/**
 * Schema for getting user's bookings.
 */
export const getUserBookingsSchema = z.object({
  /** Filter by booking status */
  status: z
    .enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REFUNDED', 'FAILED'] as const)
    .optional(),
  ...paginationSchema.shape,
});

export type GetUserBookingsInput = z.infer<typeof getUserBookingsSchema>;

/**
 * Schema for cancelling a booking.
 */
export const cancelBookingSchema = z.object({
  bookingId: uuidSchema,
  /** Reason for cancellation (for audit log) */
  reason: z.string().max(500).optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely parse and validate input against a schema.
 * Returns a discriminated union for type-safe error handling.
 *
 * @example
 * const result = safeValidate(reserveSeatsSchema, requestBody);
 * if (!result.success) {
 *   return Response.json({ error: result.error }, { status: 400 });
 * }
 * const { eventId, seatIds } = result.data;
 */
export function safeValidate<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format Zod 4 errors into a readable message
  const issues = z.flattenError(result.error);
  const fieldErrors = Object.entries(issues.fieldErrors)
    .map(([field, messages]) => `${field}: ${(messages as string[]).join(', ')}`)
    .join('; ');
  const formErrors = issues.formErrors.join('; ');

  const errorMessage = [formErrors, fieldErrors].filter(Boolean).join('; ');
  return { success: false, error: errorMessage || 'Validation failed' };
}

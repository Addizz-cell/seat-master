import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { uuidSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse, EventWithCounts } from '@/types';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * GET /api/events/:eventId
 *
 * Fetch a single event by ID with relationship counts.
 * Returns event details including seat and booking statistics.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const validation = safeValidate(uuidSchema, eventId);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid event ID format',
        code: 'INVALID_ID',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Fetch event with counts
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: {
          select: {
            seats: true,
            bookings: {
              where: { status: 'CONFIRMED' },
            },
            reservations: {
              where: { status: 'ACTIVE' },
            },
          },
        },
      },
    });

    if (!event) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Event not found',
        code: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    console.log(`[GET /api/events/${eventId}] Found event: ${event.name}`);

    const response: ApiResponse<EventWithCounts> = {
      success: true,
      data: event as EventWithCounts,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/events/:eventId] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred while fetching the event',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

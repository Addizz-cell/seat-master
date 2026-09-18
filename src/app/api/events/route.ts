import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { searchEventsSchema, createEventSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse, EventListItem, PaginatedResponse } from '@/types';
import { Prisma } from '../../../../generated/prisma/client';

/**
 * GET /api/events
 *
 * List and search events with pagination.
 * By default, only shows ON_SALE and UPCOMING events.
 *
 * Query Parameters:
 * - query: Search in event name and venue name
 * - city: Filter by city (case-insensitive)
 * - category: Filter by event category
 * - dateFrom: Filter events on or after this date
 * - dateTo: Filter events on or before this date
 * - page: Page number (0-indexed, default: 0)
 * - limit: Results per page (1-50, default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const params = {
      query: searchParams.get('query') || undefined,
      city: searchParams.get('city') || undefined,
      category: searchParams.get('category') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      page: searchParams.get('page') || undefined,
      limit: searchParams.get('limit') || undefined,
    };

    // Validate query parameters
    const validation = safeValidate(searchEventsSchema, params);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { query, city, category, dateFrom, dateTo, page, limit } = validation.data;

    // Build where clause
    const where: Prisma.EventWhereInput = {
      // Default: only show ON_SALE and UPCOMING events
      status: { in: ['ON_SALE', 'UPCOMING'] },
    };

    // Text search in name and venue name
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { venueName: { contains: query, mode: 'insensitive' } },
      ];
    }

    // City filter (case-insensitive)
    if (city) {
      where.venueCity = { equals: city, mode: 'insensitive' };
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // Date range filter
    if (dateFrom) {
      where.eventDate = { ...where.eventDate as object, gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.eventDate = { ...where.eventDate as object, lte: new Date(dateTo) };
    }

    // Calculate pagination
    const skip = page * limit;

    // Fetch events with count
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true,
          name: true,
          venueName: true,
          venueCity: true,
          eventDate: true,
          status: true,
          category: true,
          availableSeats: true,
          totalSeats: true,
          // Get minimum price from available seats
          seats: {
            where: { status: 'AVAILABLE' },
            orderBy: { price: 'asc' },
            take: 1,
            select: { price: true },
          },
        },
        orderBy: { eventDate: 'asc' },
        skip,
        take: limit,
      }),
      prisma.event.count({ where }),
    ]);

    // Transform to EventListItem format
    const items: EventListItem[] = events.map((event) => ({
      id: event.id,
      name: event.name,
      venueName: event.venueName,
      venueCity: event.venueCity,
      eventDate: event.eventDate,
      status: event.status,
      category: event.category,
      availableSeats: event.availableSeats,
      totalSeats: event.totalSeats,
      minPrice: event.seats[0]?.price?.toString() ?? null,
    }));

    const totalPages = Math.ceil(total / limit);

    const response: ApiResponse<PaginatedResponse<EventListItem>> = {
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages - 1,
          hasPrev: page > 0,
        },
      },
    };

    console.log(`[GET /api/events] Found ${items.length} events (page ${page + 1}/${totalPages || 1})`);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/events] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred while fetching events',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * POST /api/events
 *
 * Create a new event (admin endpoint).
 * Creates event in DRAFT status with 0 seats initially.
 * Seats should be added separately via a seats endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate request body
    const validation = safeValidate(createEventSchema, body);
    if (!validation.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: validation.error,
        code: 'VALIDATION_ERROR',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const data = validation.data;

    // Create event with DRAFT status
    const event = await prisma.event.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        venueName: data.venueName,
        venueAddress: data.venueAddress ?? '',
        venueCity: data.venueCity,
        eventDate: new Date(data.eventDate),
        doorsOpenAt: data.doorsOpenAt ? new Date(data.doorsOpenAt) : new Date(data.eventDate),
        saleStartTime: new Date(data.saleStartTime),
        saleEndTime: data.saleEndTime ? new Date(data.saleEndTime) : new Date(data.eventDate),
        status: 'DRAFT',
        totalSeats: 0,
        availableSeats: 0,
      },
    });

    console.log(`[POST /api/events] Created event: ${event.id} - ${event.name}`);

    const response: ApiResponse<typeof event> = {
      success: true,
      data: event,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/events] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred while creating the event',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

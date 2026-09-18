/**
 * Server-side data fetching functions
 * These functions are used by Server Components to fetch data directly from the database.
 */

import prisma from "@/lib/db";
import type { EventListItem, EventCategory, PaginatedResponse } from "@/types";
import type { Event } from "../generated/prisma/client";
import { Prisma } from "../generated/prisma/client";

// ============================================================================
// TYPES
// ============================================================================

export interface EventFilters {
  query?: string;
  city?: string;
  category?: EventCategory;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface EventStats {
  minPrice: string | null;
  maxPrice: string | null;
  totalSeats: number;
  availableSeats: number;
  soldPercentage: number;
}

export interface EventWithStats extends Event {
  stats: EventStats;
}

export interface FilterFacets {
  cities: { city: string; count: number }[];
  categories: { category: EventCategory; count: number }[];
}

// ============================================================================
// EVENT LIST FUNCTIONS
// ============================================================================

/**
 * Get paginated list of events with optional filters
 */
export async function getEvents(
  filters: EventFilters = {}
): Promise<PaginatedResponse<EventListItem>> {
  const {
    query,
    city,
    category,
    dateFrom,
    dateTo,
    page = 0,
    limit = 12,
  } = filters;

  // Build where clause
  const where: Prisma.EventWhereInput = {
    status: { in: ["ON_SALE", "UPCOMING"] },
  };

  // Text search
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { venueName: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
  }

  // City filter
  if (city) {
    where.venueCity = { equals: city, mode: "insensitive" };
  }

  // Category filter
  if (category) {
    where.category = category;
  }

  // Date range filter
  if (dateFrom) {
    where.eventDate = { ...((where.eventDate as object) || {}), gte: new Date(dateFrom) };
  }
  if (dateTo) {
    where.eventDate = { ...((where.eventDate as object) || {}), lte: new Date(dateTo) };
  }

  const skip = page * limit;

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
        seats: {
          where: { status: "AVAILABLE" },
          orderBy: { price: "asc" },
          take: 1,
          select: { price: true },
        },
      },
      orderBy: { eventDate: "asc" },
      skip,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

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

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages - 1,
      hasPrev: page > 0,
    },
  };
}

/**
 * Get filter facets (available cities and categories with counts)
 */
export async function getFilterFacets(): Promise<FilterFacets> {
  const [cityResults, categoryResults] = await Promise.all([
    prisma.event.groupBy({
      by: ["venueCity"],
      where: { status: { in: ["ON_SALE", "UPCOMING"] } },
      _count: { venueCity: true },
      orderBy: { venueCity: "asc" },
    }),
    prisma.event.groupBy({
      by: ["category"],
      where: { status: { in: ["ON_SALE", "UPCOMING"] } },
      _count: { category: true },
    }),
  ]);

  return {
    cities: cityResults.map((r) => ({
      city: r.venueCity,
      count: r._count.venueCity,
    })),
    categories: categoryResults.map((r) => ({
      category: r.category,
      count: r._count.category,
    })),
  };
}

// ============================================================================
// SINGLE EVENT FUNCTIONS
// ============================================================================

/**
 * Get a single event by ID
 */
export async function getEvent(eventId: string): Promise<Event | null> {
  return prisma.event.findUnique({
    where: { id: eventId },
  });
}

/**
 * Get event statistics (price range, availability)
 */
export async function getEventStats(eventId: string): Promise<EventStats | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      totalSeats: true,
      availableSeats: true,
    },
  });

  if (!event) return null;

  // Get price range from seats
  const [minPriceResult, maxPriceResult] = await Promise.all([
    prisma.seat.findFirst({
      where: { eventId, status: "AVAILABLE" },
      orderBy: { price: "asc" },
      select: { price: true },
    }),
    prisma.seat.findFirst({
      where: { eventId, status: "AVAILABLE" },
      orderBy: { price: "desc" },
      select: { price: true },
    }),
  ]);

  const soldSeats = event.totalSeats - event.availableSeats;
  const soldPercentage = event.totalSeats > 0
    ? Math.round((soldSeats / event.totalSeats) * 100)
    : 0;

  return {
    minPrice: minPriceResult?.price?.toString() ?? null,
    maxPrice: maxPriceResult?.price?.toString() ?? null,
    totalSeats: event.totalSeats,
    availableSeats: event.availableSeats,
    soldPercentage,
  };
}

/**
 * Get event with stats combined
 */
export async function getEventWithStats(eventId: string): Promise<EventWithStats | null> {
  const [event, stats] = await Promise.all([
    getEvent(eventId),
    getEventStats(eventId),
  ]);

  if (!event || !stats) return null;

  return {
    ...event,
    stats,
  };
}

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { uuidSchema, safeValidate } from '@/validations/schemas';
import type { ApiResponse, SeatMapData, SeatMapSection, SeatMapRow, SeatMapSeat } from '@/types';
import { SeatStatus } from '@/generated/prisma/client';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * GET /api/events/:eventId/seats
 *
 * Fetch all seats for an event, transformed into a nested structure
 * optimized for seat map rendering.
 *
 * Structure:
 * - sections[] (VIP, Premium, Orchestra, Balcony)
 *   - rows[] (A, B, C, ...)
 *     - seats[] (A1, A2, A3, ...)
 *
 * Each seat includes:
 * - id, seatNumber, seatType, status, price
 * - isSelectable: true if seat can be selected (AVAILABLE status)
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

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    });

    if (!event) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Event not found',
        code: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Fetch all seats for the event
    const seats = await prisma.seat.findMany({
      where: { eventId },
      orderBy: [
        { section: 'asc' },
        { row: 'asc' },
        { seatNumber: 'asc' },
      ],
      select: {
        id: true,
        seatNumber: true,
        row: true,
        section: true,
        seatType: true,
        status: true,
        price: true,
      },
    });

    // Transform flat list into nested structure
    const seatMap = buildSeatMap(eventId, seats);

    console.log(
      `[GET /api/events/${eventId}/seats] Found ${seats.length} seats in ${seatMap.sections.length} sections`
    );

    const response: ApiResponse<SeatMapData> = {
      success: true,
      data: seatMap,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/events/:eventId/seats] Error:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: 'An unexpected error occurred while fetching seats',
      code: 'INTERNAL_ERROR',
    };
    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * Transform a flat list of seats into a nested structure for seat map rendering.
 *
 * The structure is: sections → rows → seats
 * This makes it easy for the frontend to render the seat map with proper grouping.
 */
function buildSeatMap(
  eventId: string,
  seats: Array<{
    id: string;
    seatNumber: string;
    row: string;
    section: string;
    seatType: string;
    status: SeatStatus;
    price: unknown;
  }>
): SeatMapData {
  // Group seats by section
  const sectionMap = new Map<string, Map<string, SeatMapSeat[]>>();
  const sectionTypes = new Map<string, string>();

  // Statistics
  let totalSeats = 0;
  let availableSeats = 0;
  let reservedSeats = 0;
  let bookedSeats = 0;

  for (const seat of seats) {
    totalSeats++;

    // Count by status
    switch (seat.status) {
      case 'AVAILABLE':
        availableSeats++;
        break;
      case 'RESERVED':
        reservedSeats++;
        break;
      case 'BOOKED':
        bookedSeats++;
        break;
    }

    // Get or create section
    if (!sectionMap.has(seat.section)) {
      sectionMap.set(seat.section, new Map());
      sectionTypes.set(seat.section, seat.seatType);
    }
    const rowMap = sectionMap.get(seat.section)!;

    // Get or create row
    if (!rowMap.has(seat.row)) {
      rowMap.set(seat.row, []);
    }
    const rowSeats = rowMap.get(seat.row)!;

    // Add seat to row
    const seatMapSeat: SeatMapSeat = {
      id: seat.id,
      seatNumber: seat.seatNumber,
      seatType: seat.seatType as SeatMapSeat['seatType'],
      status: seat.status,
      price: String(seat.price),
      isSelectable: seat.status === 'AVAILABLE',
    };
    rowSeats.push(seatMapSeat);
  }

  // Convert maps to arrays with proper sorting
  const sections: SeatMapSection[] = [];

  // Define section order (VIP first, then Premium, Orchestra, Balcony)
  const sectionOrder = ['VIP', 'Premium', 'Orchestra', 'Balcony'];

  // Sort sections by predefined order, then alphabetically for unknown sections
  const sortedSections = Array.from(sectionMap.keys()).sort((a, b) => {
    const aIndex = sectionOrder.indexOf(a);
    const bIndex = sectionOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const sectionName of sortedSections) {
    const rowMap = sectionMap.get(sectionName)!;
    const rows: SeatMapRow[] = [];

    // Sort rows alphabetically
    const sortedRows = Array.from(rowMap.keys()).sort((a, b) => {
      // Handle numeric row names
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    });

    for (const rowName of sortedRows) {
      const rowSeats = rowMap.get(rowName)!;

      // Sort seats by seat number
      rowSeats.sort((a, b) => {
        // Extract numeric part from seat number for proper sorting
        const aMatch = a.seatNumber.match(/(\d+)/);
        const bMatch = b.seatNumber.match(/(\d+)/);
        if (aMatch && bMatch) {
          return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
        }
        return a.seatNumber.localeCompare(b.seatNumber);
      });

      rows.push({
        row: rowName,
        seats: rowSeats,
      });
    }

    sections.push({
      section: sectionName,
      seatType: sectionTypes.get(sectionName) as SeatMapSection['seatType'],
      rows,
    });
  }

  return {
    eventId,
    sections,
    stats: {
      totalSeats,
      availableSeats,
      reservedSeats,
      bookedSeats,
    },
  };
}

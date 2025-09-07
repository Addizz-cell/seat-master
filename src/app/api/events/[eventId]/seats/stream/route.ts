import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { uuidSchema, safeValidate } from '@/validations/schemas';

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * GET /api/events/:eventId/seats/stream
 *
 * Server-Sent Events endpoint for real-time seat status updates.
 * Clients connect to this endpoint to receive live updates when:
 * - Seats become reserved/booked by other users
 * - Reservations expire and seats become available again
 *
 * The stream sends:
 * - Initial "connected" message on connection
 * - Heartbeat every 30 seconds to keep connection alive
 * - "seat_update" messages when seat statuses change
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { eventId } = await params;

  // Validate eventId format
  const validation = safeValidate(uuidSchema, eventId);
  if (!validation.success) {
    return new Response('Invalid event ID format', { status: 400 });
  }

  // Check if event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    return new Response('Event not found', { status: 404 });
  }

  // Store the last known state of seats for comparison
  let lastSeatStates = new Map<string, string>();

  // Initialize with current seat states
  const initialSeats = await prisma.seat.findMany({
    where: { eventId },
    select: { id: true, seatNumber: true, status: true },
  });

  for (const seat of initialSeats) {
    lastSeatStates.set(seat.id, seat.status);
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      const initialMessage = {
        type: 'initial',
        seats: initialSeats.map((s) => ({
          id: s.id,
          seatNumber: s.seatNumber,
          status: s.status,
        })),
        timestamp: Date.now(),
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));

      // Poll for updates every 2 seconds
      const pollInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const currentSeats = await prisma.seat.findMany({
            where: { eventId },
            select: { id: true, seatNumber: true, status: true },
          });

          // Find seats that have changed
          const changedSeats: Array<{
            id: string;
            seatNumber: string;
            status: string;
            previousStatus: string;
          }> = [];

          for (const seat of currentSeats) {
            const previousStatus = lastSeatStates.get(seat.id);
            if (previousStatus && previousStatus !== seat.status) {
              changedSeats.push({
                id: seat.id,
                seatNumber: seat.seatNumber,
                status: seat.status,
                previousStatus,
              });
            }
            lastSeatStates.set(seat.id, seat.status);
          }

          // Send update if there are changes
          if (changedSeats.length > 0) {
            const updateMessage = {
              type: 'seat_update',
              seats: changedSeats,
              timestamp: Date.now(),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(updateMessage)}\n\n`));
          }
        } catch (error) {
          console.error('[SSE] Error polling seat updates:', error);
        }
      }, 2000);

      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval);
          return;
        }

        try {
          const heartbeat = {
            type: 'heartbeat',
            timestamp: Date.now(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeat)}\n\n`));
        } catch {
          // Connection might be closed
          clearInterval(heartbeatInterval);
          clearInterval(pollInterval);
        }
      }, 30000);

      // Handle client disconnect through AbortSignal
      request.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
        controller.close();
      });
    },

    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
}

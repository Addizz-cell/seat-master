"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import type { SeatMapSeat, SeatStatus } from "@/types";

interface SeatUpdate {
  type: "seat_update" | "initial" | "heartbeat";
  seats?: Array<{
    id: string;
    seatNumber: string;
    status: SeatStatus;
    previousStatus?: SeatStatus;
  }>;
  timestamp: number;
}

interface UseSeatUpdatesOptions {
  eventId: string;
  enabled?: boolean;
  onSeatUpdate?: (updates: SeatUpdate["seats"]) => void;
  selectedSeats?: Set<string>;
}

interface UseSeatUpdatesReturn {
  isConnected: boolean;
  lastUpdate: number | null;
  error: string | null;
  reconnect: () => void;
}

export function useSeatUpdates({
  eventId,
  enabled = true,
  onSeatUpdate,
  selectedSeats,
}: UseSeatUpdatesOptions): UseSeatUpdatesReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!enabled || !eventId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      const url = `/api/events/${eventId}/seats/stream`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data: SeatUpdate = JSON.parse(event.data);
          setLastUpdate(data.timestamp);

          if (data.type === "seat_update" && data.seats) {
            // Check if any of the user's selected seats were taken
            if (selectedSeats && selectedSeats.size > 0) {
              for (const seat of data.seats) {
                if (
                  selectedSeats.has(seat.id) &&
                  seat.previousStatus === "AVAILABLE" &&
                  (seat.status === "RESERVED" || seat.status === "BOOKED")
                ) {
                  toast.warning(`Seat ${seat.seatNumber} was just booked by someone else`, {
                    description: "Please select a different seat.",
                  });
                }
              }
            }

            // Notify of seats becoming unavailable (for general updates)
            const takenSeats = data.seats.filter(
              (s) =>
                s.previousStatus === "AVAILABLE" &&
                (s.status === "RESERVED" || s.status === "BOOKED")
            );

            if (takenSeats.length > 0 && takenSeats.length <= 3) {
              // Only show toast for small number of changes to avoid spam
              const seatNumbers = takenSeats.map((s) => s.seatNumber).join(", ");
              toast.info(`Seat${takenSeats.length > 1 ? "s" : ""} ${seatNumbers} just became unavailable`);
            }

            // Call the update callback
            onSeatUpdate?.(data.seats);
          }
        } catch (e) {
          console.error("[useSeatUpdates] Failed to parse message:", e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);

        // Don't show error toast for normal disconnections
        if (eventSource.readyState === EventSource.CLOSED) {
          // Attempt to reconnect with exponential backoff
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

          if (reconnectAttemptsRef.current <= 5) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            setError("Connection lost. Please refresh the page.");
          }
        }
      };
    } catch (e) {
      console.error("[useSeatUpdates] Failed to connect:", e);
      setError("Failed to connect to seat updates");
    }
  }, [eventId, enabled, onSeatUpdate, selectedSeats]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastUpdate,
    error,
    reconnect,
  };
}

import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { getEventWithStats } from "@/lib/data";
import { SeatSelectionClient } from "./SeatSelectionClient";

interface SeatsPageProps {
  params: Promise<{ eventId: string }>;
}

export async function generateMetadata({
  params,
}: SeatsPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventWithStats(eventId);

  if (!event) {
    return {
      title: "Event Not Found",
    };
  }

  return {
    title: `Select Seats - ${event.name}`,
    description: `Select your seats for ${event.name} at ${event.venueName}`,
  };
}

export default async function SeatsPage({ params }: SeatsPageProps) {
  const { eventId } = await params;

  // Check authentication
  // For now, we check for a user-id cookie or session
  // In a real app, this would use a proper auth library like NextAuth.js
  const cookieStore = await cookies();
  const userId = cookieStore.get("user-id")?.value;

  if (!userId) {
    // Redirect to login with return URL
    redirect(`/login?redirect=/events/${eventId}/seats`);
  }

  // Fetch event data
  const event = await getEventWithStats(eventId);

  if (!event) {
    notFound();
  }

  // Check if event is on sale
  if (event.status !== "ON_SALE") {
    // Redirect back to event page if not on sale
    redirect(`/events/${eventId}`);
  }

  return (
    <SeatSelectionClient
      eventId={eventId}
      eventName={event.name}
      eventDate={event.eventDate}
      venueName={event.venueName}
      userId={userId}
    />
  );
}

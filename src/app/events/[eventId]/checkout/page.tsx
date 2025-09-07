import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEventWithStats } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { CheckoutClient } from "./CheckoutClient";

interface CheckoutPageProps {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ seats?: string }>;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutPageProps) {
  const { eventId } = await params;
  const { seats } = await searchParams;

  // Check for user authentication
  const cookieStore = await cookies();
  const userId = cookieStore.get("user-id")?.value;

  if (!userId) {
    redirect(`/login?redirect=/events/${eventId}/checkout?seats=${seats}`);
  }

  // Validate seats parameter
  if (!seats) {
    redirect(`/events/${eventId}/seats`);
  }

  const seatIds = seats.split(",").filter(Boolean);
  if (seatIds.length === 0) {
    redirect(`/events/${eventId}/seats`);
  }

  // Fetch event data
  const event = await getEventWithStats(eventId);
  if (!event) {
    notFound();
  }

  // Check event is on sale
  if (event.status !== "ON_SALE") {
    redirect(`/events/${eventId}`);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
          <Link href={`/events/${eventId}/seats`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to seat selection
          </Link>
        </Button>

        <h1 className="text-2xl font-bold mb-6 md:mb-8">Checkout</h1>

        <CheckoutClient
          eventId={eventId}
          event={{
            id: event.id,
            name: event.name,
            eventDate: event.eventDate,
            venueName: event.venueName,
            venueCity: event.venueCity,
          }}
          seatIds={seatIds}
          userId={userId}
        />
      </div>
    </div>
  );
}

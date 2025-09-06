import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  DoorOpen,
} from "lucide-react";
import { getEventWithStats } from "@/lib/data";
import { formatDate, formatTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Separator } from "@/components/ui/separator";
import { EventDetailSidebar } from "@/components/events/EventDetailSidebar";
import { ShareButton } from "@/components/events/ShareButton";
import type { EventStatus, EventCategory } from "@/types";

interface EventDetailPageProps {
  params: Promise<{ eventId: string }>;
}

const statusConfig: Record<
  EventStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ON_SALE: { label: "On Sale", variant: "default" },
  UPCOMING: { label: "Coming Soon", variant: "secondary" },
  SOLD_OUT: { label: "Sold Out", variant: "destructive" },
  DRAFT: { label: "Draft", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  COMPLETED: { label: "Completed", variant: "outline" },
};

const categoryConfig: Record<
  EventCategory,
  { label: string; className: string }
> = {
  CONCERT: {
    label: "Concert",
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  SPORTS: {
    label: "Sports",
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  THEATER: {
    label: "Theater",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  MOVIE: {
    label: "Movie",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
};

const categoryGradients: Record<EventCategory, string> = {
  CONCERT: "from-purple-500 to-pink-500",
  SPORTS: "from-green-500 to-emerald-500",
  THEATER: "from-amber-500 to-orange-500",
  MOVIE: "from-blue-500 to-cyan-500",
};

export async function generateMetadata({
  params,
}: EventDetailPageProps): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getEventWithStats(eventId);

  if (!event) {
    return {
      title: "Event Not Found",
    };
  }

  return {
    title: event.name,
    description: event.description || `Get tickets for ${event.name} at ${event.venueName}`,
    openGraph: {
      title: event.name,
      description: event.description || `Get tickets for ${event.name} at ${event.venueName}`,
      type: "website",
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { eventId } = await params;
  const event = await getEventWithStats(eventId);

  if (!event) {
    notFound();
  }

  const status = statusConfig[event.status];
  const category = categoryConfig[event.category];
  const gradient = categoryGradients[event.category];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container py-6 md:py-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
          <Link href="/events">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to events
          </Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Image */}
            <div className="relative overflow-hidden rounded-xl">
              <AspectRatio ratio={16 / 9}>
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center bg-gradient-to-br",
                    gradient
                  )}
                >
                  <span className="text-8xl font-bold text-white/30">
                    {event.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </AspectRatio>
            </div>

            {/* Title and Badges */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge
                  variant={status.variant}
                  className={cn(
                    event.status === "ON_SALE" && "bg-success text-success-foreground"
                  )}
                >
                  {status.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("border", category.className)}
                >
                  {category.label}
                </Badge>
              </div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                  {event.name}
                </h1>
                <ShareButton title={event.name} className="shrink-0" />
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoCard
                icon={Calendar}
                label="Date"
                value={formatDate(event.eventDate)}
              />
              <InfoCard
                icon={Clock}
                label="Time"
                value={formatTime(event.eventDate)}
              />
              <InfoCard
                icon={MapPin}
                label="Venue"
                value={event.venueName}
                subValue={`${event.venueAddress}, ${event.venueCity}`}
              />
              <InfoCard
                icon={DoorOpen}
                label="Doors Open"
                value={formatTime(event.doorsOpenAt)}
              />
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-4">About this event</h2>
              {event.description ? (
                <div className="prose prose-sm max-w-none text-muted-foreground">
                  {event.description.split("\n").map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No description available for this event.
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Sidebar (Desktop) */}
          <div className="hidden lg:block">
            <EventDetailSidebar
              eventId={event.id}
              status={event.status}
              stats={event.stats}
              saleStartTime={event.saleStartTime}
            />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-background border-t p-4 shadow-lg">
        <div className="container flex items-center justify-between gap-4">
          <div>
            {event.stats.minPrice ? (
              <>
                <p className="text-sm text-muted-foreground">From</p>
                <p className="text-xl font-bold">
                  ${parseFloat(event.stats.minPrice).toFixed(2)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Price TBA</p>
            )}
          </div>
          {event.status === "ON_SALE" ? (
            <Button size="lg" asChild>
              <Link href={`/events/${event.id}/seats`}>Select Seats</Link>
            </Button>
          ) : event.status === "UPCOMING" ? (
            <Button size="lg" disabled>
              Coming Soon
            </Button>
          ) : event.status === "SOLD_OUT" ? (
            <Button size="lg" disabled>
              Sold Out
            </Button>
          ) : (
            <Button size="lg" disabled variant="destructive">
              Cancelled
            </Button>
          )}
        </div>
      </div>

      {/* Spacer for mobile bottom bar */}
      <div className="h-24 lg:hidden" />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-muted/50">
      <div className="shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {subValue && (
          <p className="text-sm text-muted-foreground truncate">{subValue}</p>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { EventListItem, EventStatus, EventCategory } from "@/types";

interface EventCardProps {
  event: EventListItem;
  className?: string;
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

// Gradient backgrounds for events without images
const categoryGradients: Record<EventCategory, string> = {
  CONCERT: "from-purple-500 to-pink-500",
  SPORTS: "from-green-500 to-emerald-500",
  THEATER: "from-amber-500 to-orange-500",
  MOVIE: "from-blue-500 to-cyan-500",
};

export function EventCard({ event, className }: EventCardProps) {
  const status = statusConfig[event.status];
  const category = categoryConfig[event.category];
  const gradient = categoryGradients[event.category];
  const isSoldOut = event.status === "SOLD_OUT";
  const isClickable = event.status !== "CANCELLED" && event.status !== "DRAFT";

  const cardContent = (
    <Card
      className={cn(
        "group overflow-hidden transition-all duration-300",
        isClickable && "hover:shadow-lg hover:-translate-y-1 cursor-pointer",
        !isClickable && "opacity-75",
        className
      )}
    >
      {/* Image Container */}
      <div className="relative overflow-hidden">
        <AspectRatio ratio={16 / 9}>
          {/* Fallback gradient with first letter */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-gradient-to-br",
              gradient,
              "transition-transform duration-300",
              isClickable && "group-hover:scale-105"
            )}
          >
            <span className="text-6xl font-bold text-white/30">
              {event.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </AspectRatio>

        {/* Status Badge (top-left) */}
        <Badge
          variant={status.variant}
          className={cn(
            "absolute top-3 left-3",
            event.status === "ON_SALE" && "bg-success text-success-foreground"
          )}
        >
          {status.label}
        </Badge>

        {/* Category Badge (top-right) */}
        <Badge
          variant="outline"
          className={cn("absolute top-3 right-3 border", category.className)}
        >
          {category.label}
        </Badge>
      </div>

      {/* Content */}
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg leading-tight line-clamp-2 mb-3 group-hover:text-primary transition-colors">
          {event.name}
        </h3>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>
              {formatDate(event.eventDate)} at {formatTime(event.eventDate)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {event.venueName}, {event.venueCity}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0" />
            <span>
              {isSoldOut ? (
                <span className="text-destructive">No seats available</span>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {event.availableSeats}
                  </span>{" "}
                  seats available
                </>
              )}
            </span>
          </div>
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="p-4 pt-0 flex items-center justify-between">
        <div>
          {event.minPrice && !isSoldOut ? (
            <p className="text-sm text-muted-foreground">
              Starting from{" "}
              <span className="text-lg font-bold text-foreground">
                {formatCurrency(event.minPrice)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isSoldOut ? "Check back later" : "Price TBA"}
            </p>
          )}
        </div>
        <Button
          size="sm"
          disabled={isSoldOut || !isClickable}
          className="gap-1 group/btn"
        >
          {isSoldOut ? "Sold Out" : "Get Tickets"}
          {!isSoldOut && isClickable && (
            <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
          )}
        </Button>
      </CardFooter>
    </Card>
  );

  if (!isClickable) {
    return cardContent;
  }

  return <Link href={`/events/${event.id}`}>{cardContent}</Link>;
}

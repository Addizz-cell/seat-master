import Link from "next/link";
import { Sparkles, Music, Trophy, Theater, ArrowRight } from "lucide-react";
import prisma from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EventCard } from "@/components/events/EventCard";
import type { EventListItem } from "@/types";

const categories = [
  {
    name: "Concerts",
    href: "/events?category=CONCERT",
    icon: Music,
    description: "Live music from your favorite artists",
    gradient: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-500",
  },
  {
    name: "Sports",
    href: "/events?category=SPORTS",
    icon: Trophy,
    description: "Exciting games and tournaments",
    gradient: "from-green-500/20 to-emerald-500/20",
    iconColor: "text-green-500",
  },
  {
    name: "Theater",
    href: "/events?category=THEATER",
    icon: Theater,
    description: "Broadway shows and performances",
    gradient: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-500",
  },
];

async function getFeaturedEvents(): Promise<EventListItem[]> {
  try {
    const events = await prisma.event.findMany({
      where: {
        status: { in: ["ON_SALE", "UPCOMING"] },
      },
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
      take: 6,
    });

    return events.map((event) => ({
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
  } catch (error) {
    console.error("Error fetching featured events:", error);
    return [];
  }
}

export default async function HomePage() {
  const featuredEvents = await getFeaturedEvents();

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-primary/5 to-transparent">
        <div className="container py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            {/* Flash Sale Badge */}
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 px-4 py-1.5 text-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Flash Sales Now Live
            </Badge>

            {/* Heading */}
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Book Tickets to{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Unforgettable
              </span>{" "}
              Events
            </h1>

            {/* Subheading */}
            <p className="mt-6 text-lg text-muted-foreground md:text-xl max-w-2xl mx-auto">
              Your premier destination for concerts, sports, theater, and more.
              Secure your seats to the hottest events in seconds with real-time
              availability.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base" asChild>
                <Link href="/events">
                  Browse Events
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base"
                asChild
              >
                <Link href="/signup">Create Account</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
        </div>
      </section>

      {/* Categories Section */}
      <section className="container py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Explore by Category
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Find events that match your interests
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.name} href={category.href} className="group">
              <Card className="h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardContent className="p-6">
                  <div
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${category.gradient}`}
                  >
                    <category.icon className={`h-6 w-6 ${category.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    {category.name}
                    <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                  </h3>
                  <p className="text-muted-foreground">{category.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Events Section */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Featured Events
              </h2>
              <p className="mt-2 text-muted-foreground">
                Don&apos;t miss these popular upcoming events
              </p>
            </div>
            <Button variant="outline" asChild className="hidden sm:flex">
              <Link href="/events">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {featuredEvents.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-background rounded-lg border">
              <p className="text-muted-foreground">
                No events available at the moment. Check back soon!
              </p>
            </div>
          )}

          <div className="mt-8 text-center sm:hidden">
            <Button variant="outline" asChild>
              <Link href="/events">
                View all events
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground">
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Never Miss a Sale
            </h2>
            <p className="mt-4 text-primary-foreground/80 text-lg">
              Create an account to get instant notifications when tickets go on
              sale for your favorite artists and teams.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="mt-8 h-12 px-8"
              asChild
            >
              <Link href="/signup">Sign Up Free</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

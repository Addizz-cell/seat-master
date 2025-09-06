import Link from "next/link";
import { CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EventNotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="container max-w-md text-center py-16 px-4">
        <div className="rounded-full bg-muted p-6 inline-flex mb-6">
          <CalendarX className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Event Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The event you&apos;re looking for doesn&apos;t exist or may have been removed.
          It could also be that the event link is incorrect.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/events">Browse Events</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReservationTimerProps {
  expiresAt: Date;
  onExpired: () => void;
  className?: string;
}

type TimerState = "default" | "warning" | "urgent" | "expired";

function getTimerState(secondsRemaining: number): TimerState {
  if (secondsRemaining <= 0) return "expired";
  if (secondsRemaining <= 120) return "urgent"; // < 2 minutes
  if (secondsRemaining <= 300) return "warning"; // < 5 minutes
  return "default";
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ReservationTimer({
  expiresAt,
  onExpired,
  className,
}: ReservationTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    return Math.max(0, Math.floor((expiry - now) / 1000));
  });
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const [hasExpired, setHasExpired] = useState(false);

  const timerState = getTimerState(secondsRemaining);

  const handleExpired = useCallback(() => {
    if (!hasExpired) {
      setHasExpired(true);
      setShowExpiredDialog(true);
    }
  }, [hasExpired]);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      handleExpired();
      return;
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        handleExpired();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, secondsRemaining, handleExpired]);

  const handleDialogClose = () => {
    setShowExpiredDialog(false);
    onExpired();
  };

  return (
    <>
      <Alert
        className={cn(
          "transition-all duration-300",
          timerState === "default" && "border-muted bg-muted/50",
          timerState === "warning" &&
            "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          timerState === "urgent" &&
            "border-destructive/50 bg-destructive/10 text-destructive animate-pulse",
          className
        )}
      >
        {timerState === "urgent" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        )}
        <AlertTitle
          className={cn(
            timerState === "warning" && "text-amber-700 dark:text-amber-400",
            timerState === "urgent" && "text-destructive"
          )}
        >
          {timerState === "urgent"
            ? "Time is running out!"
            : "Complete your purchase"}
        </AlertTitle>
        <AlertDescription
          className={cn(
            "font-mono text-lg",
            timerState === "default" && "text-foreground",
            timerState === "warning" && "text-amber-700 dark:text-amber-400",
            timerState === "urgent" && "text-destructive font-bold"
          )}
        >
          {timerState === "urgent"
            ? `Only ${formatTime(secondsRemaining)} remaining!`
            : `Time remaining: ${formatTime(secondsRemaining)}`}
        </AlertDescription>
      </Alert>

      <AlertDialog open={showExpiredDialog} onOpenChange={setShowExpiredDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reservation Expired</AlertDialogTitle>
            <AlertDialogDescription>
              Your reservation has expired. The seats you selected may no longer
              be available. You&apos;ll need to start the booking process again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleDialogClose}>
              Return to Seat Selection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

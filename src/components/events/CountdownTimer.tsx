"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  targetDate: Date;
  className?: string;
  onComplete?: () => void;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetDate: Date): TimeLeft | null {
  const difference = targetDate.getTime() - new Date().getTime();

  if (difference <= 0) {
    return null;
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

export function CountdownTimer({
  targetDate,
  className,
  onComplete,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() =>
    calculateTimeLeft(targetDate)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetDate);
      setTimeLeft(newTimeLeft);

      if (!newTimeLeft) {
        clearInterval(timer);
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete]);

  if (!timeLeft) {
    return null;
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 1;
  const showDays = timeLeft.days > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        isUrgent && "text-destructive animate-pulse-slow",
        className
      )}
    >
      <Clock className="h-4 w-4" />
      <div className="flex items-center gap-1 font-mono">
        {showDays && (
          <>
            <TimeUnit value={timeLeft.days} label="d" />
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <TimeUnit value={timeLeft.hours} label="h" />
        <span className="text-muted-foreground">:</span>
        <TimeUnit value={timeLeft.minutes} label="m" />
        <span className="text-muted-foreground">:</span>
        <TimeUnit value={timeLeft.seconds} label="s" />
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="tabular-nums">
      {value.toString().padStart(2, "0")}
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

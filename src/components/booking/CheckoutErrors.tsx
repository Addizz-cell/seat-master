"use client";

import { AlertCircle, CreditCard, Clock, WifiOff, ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BaseErrorProps {
  className?: string;
}

// ============================================================================
// RESERVATION FAILED - Seats no longer available
// ============================================================================

interface ReservationFailedProps extends BaseErrorProps {
  message?: string;
  onBackToSeats: () => void;
}

export function ReservationFailed({
  message = "The seats you selected are no longer available. Someone else may have booked them while you were checking out.",
  onBackToSeats,
  className,
}: ReservationFailedProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Seats Unavailable</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      <Button onClick={onBackToSeats} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Seat Selection
      </Button>
    </div>
  );
}

// ============================================================================
// PAYMENT FAILED - Card declined or payment error
// ============================================================================

interface PaymentFailedProps extends BaseErrorProps {
  message?: string;
  onRetry: () => void;
  onBackToSeats: () => void;
}

export function PaymentFailed({
  message = "Your payment could not be processed. Please check your card details and try again.",
  onRetry,
  onBackToSeats,
  className,
}: PaymentFailedProps) {
  return (
    <Alert variant="destructive" className={cn("mb-4", className)}>
      <CreditCard className="h-4 w-4" />
      <AlertTitle>Payment Failed</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-4">{message}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry} className="gap-1">
            <RefreshCw className="h-3 w-3" />
            Try Again
          </Button>
          <Button size="sm" variant="outline" onClick={onBackToSeats}>
            Change Seats
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

// ============================================================================
// RESERVATION EXPIRED - Timer ran out (Dialog version)
// ============================================================================

interface ReservationExpiredDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReservationExpiredDialog({
  open,
  onClose,
}: ReservationExpiredDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-amber-500/10 p-3">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
          </div>
          <AlertDialogTitle className="text-center">
            Reservation Expired
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Your reservation has expired and the seats have been released. Don&apos;t
            worry - you can start over and select your seats again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogAction onClick={onClose}>
            Return to Seat Selection
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// NETWORK ERROR - Generic connection error with retry
// ============================================================================

interface NetworkErrorProps extends BaseErrorProps {
  message?: string;
  onRetry: () => void;
}

export function NetworkError({
  message = "Unable to connect to the server. Please check your internet connection and try again.",
  onRetry,
  className,
}: NetworkErrorProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      <Button onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}

// ============================================================================
// GENERIC ERROR - Catch-all error display
// ============================================================================

interface GenericErrorProps extends BaseErrorProps {
  title?: string;
  message: string;
  showRetry?: boolean;
  showBackToSeats?: boolean;
  onRetry?: () => void;
  onBackToSeats?: () => void;
}

export function GenericError({
  title = "Something went wrong",
  message,
  showRetry = true,
  showBackToSeats = true,
  onRetry,
  onBackToSeats,
  className,
}: GenericErrorProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      <div className="flex gap-3">
        {showRetry && onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
        {showBackToSeats && onBackToSeats && (
          <Button variant="outline" onClick={onBackToSeats} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Seats
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CONFIRMATION DIALOG - Before leaving checkout
// ============================================================================

interface LeaveCheckoutDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LeaveCheckoutDialog({
  open,
  onConfirm,
  onCancel,
}: LeaveCheckoutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave Checkout?</AlertDialogTitle>
          <AlertDialogDescription>
            If you leave now, your reservation will be cancelled and your seats
            will be released. Are you sure you want to leave?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Stay</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Leave Checkout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

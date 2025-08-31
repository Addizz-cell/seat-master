import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as USD currency
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "$0.00"
  }
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numAmount)
}

/**
 * Format a date as "Sat, Dec 15, 2024"
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ""
  const dateObj = typeof date === "string" ? new Date(date) : date
  return format(dateObj, "EEE, MMM d, yyyy")
}

/**
 * Format a time as "8:00 PM"
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return ""
  const dateObj = typeof date === "string" ? new Date(date) : date
  return format(dateObj, "h:mm a")
}

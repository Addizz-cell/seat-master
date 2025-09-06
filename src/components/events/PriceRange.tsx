import { formatCurrency } from "@/lib/utils";

interface PriceRangeProps {
  minPrice: string | null;
  maxPrice: string | null;
  className?: string;
}

export function PriceRange({ minPrice, maxPrice, className }: PriceRangeProps) {
  if (!minPrice && !maxPrice) {
    return (
      <span className={className}>
        <span className="text-muted-foreground">Price TBA</span>
      </span>
    );
  }

  const min = minPrice ? parseFloat(minPrice) : null;
  const max = maxPrice ? parseFloat(maxPrice) : null;

  // If only one price or both are the same
  if (!min || !max || min === max) {
    return (
      <span className={className}>
        <span className="text-2xl font-bold">{formatCurrency(min || max)}</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="text-2xl font-bold">{formatCurrency(min)}</span>
      <span className="text-muted-foreground mx-2">-</span>
      <span className="text-2xl font-bold">{formatCurrency(max)}</span>
    </span>
  );
}

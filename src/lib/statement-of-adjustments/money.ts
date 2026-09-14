/**
 * Integer-cent money helpers for Statement of Adjustments.
 * Avoids IEEE-754 drift for authoritative totals.
 */

export function toCents(amount: number | null | undefined): number {
  if (amount == null || Number.isNaN(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function addCents(...parts: number[]): number {
  return parts.reduce((sum, n) => sum + n, 0);
}

/** Format CAD with exactly 2 decimals; optional leading minus for credits/deposits. */
export function formatSoaCurrency(
  amount: number,
  opts?: { asCredit?: boolean }
): string {
  const value = opts?.asCredit ? -Math.abs(amount) : amount;
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (value < 0) return `-${formatted}`;
  return formatted;
}

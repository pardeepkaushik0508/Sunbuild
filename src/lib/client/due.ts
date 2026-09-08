import { differenceInCalendarDays, startOfDay } from "date-fns";

/** Days before due date that count as "due soon" (inclusive). */
export const DUE_SOON_DAYS = 7;

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export type DueBadge = "OVERDUE" | "DUE_SOON" | "DUE_NOW" | null;

/**
 * Centralized due-date badge for client-facing cards.
 * `dueNow` marks due today; otherwise within DUE_SOON_DAYS → DUE_SOON.
 */
export function resolveDueBadge(
  dueDate: Date | string | null | undefined,
  options?: { treatPaidOrDone?: boolean; isSettled?: boolean }
): DueBadge {
  if (options?.isSettled) return null;
  const due = asDate(dueDate);
  if (!due) return null;

  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  const days = differenceInCalendarDays(dueDay, today);

  if (days < 0) return "OVERDUE";
  if (days === 0) return "DUE_NOW";
  if (days <= DUE_SOON_DAYS) return "DUE_SOON";
  return null;
}

export function dueBadgeLabel(badge: DueBadge): string | null {
  if (badge === "OVERDUE") return "Overdue";
  if (badge === "DUE_SOON") return "Due soon";
  if (badge === "DUE_NOW") return "Due now";
  return null;
}

import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { InvoiceStatus, ScheduleStatus } from "@prisma/client";
import { resolveDueBadge, dueBadgeLabel, type DueBadge } from "@/lib/client/due";

export function formatDurationDays(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): string {
  if (!start || !end) return "—";
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  const days = Math.max(1, differenceInCalendarDays(e, s) + 1);
  return days === 1 ? "1 day" : `${days} days`;
}

/** Client-facing schedule status labels (derived from ScheduleStatus + dates). */
export function clientScheduleStatusLabel(
  status: ScheduleStatus | string,
  startDate?: Date | string | null,
  endDate?: Date | string | null
): string {
  const s = String(status).toUpperCase();
  if (s === "COMPLETED") return "Completed";
  if (s === "DELAYED") return "Delayed";
  if (s === "IN_PROGRESS") return "In progress";

  // PLANNED → Starting soon if within 7 days
  if (startDate) {
    const start = startOfDay(
      startDate instanceof Date ? startDate : new Date(startDate)
    );
    const today = startOfDay(new Date());
    const days = differenceInCalendarDays(start, today);
    if (days < 0 && endDate) {
      const end = startOfDay(
        endDate instanceof Date ? endDate : new Date(endDate)
      );
      if (end.getTime() >= today.getTime()) return "In progress";
    }
    if (days >= 0 && days <= 7) return "Starting soon";
  }
  return "Planned";
}

export function invoicePaymentBadge(
  status: InvoiceStatus | string,
  dueDate?: Date | string | null
): {
  label: string;
  tone: "success" | "warning" | "danger" | "default" | "info";
} {
  const s = String(status).toUpperCase();
  if (s === "PAID") return { label: "Paid", tone: "success" };
  if (s === "VOID") return { label: "Void", tone: "default" };
  if (s === "DRAFT") return { label: "Draft", tone: "default" };

  const due: DueBadge =
    s === "OVERDUE"
      ? "OVERDUE"
      : resolveDueBadge(dueDate, { isSettled: false });

  if (due === "OVERDUE" || s === "OVERDUE") {
    return { label: "Overdue", tone: "danger" };
  }
  if (due === "DUE_NOW") return { label: "Due now", tone: "danger" };
  if (due === "DUE_SOON") return { label: "Due soon", tone: "warning" };
  if (s === "VIEWED") return { label: "Viewed", tone: "info" };
  return { label: dueBadgeLabel(due) ?? "Due", tone: "warning" };
}

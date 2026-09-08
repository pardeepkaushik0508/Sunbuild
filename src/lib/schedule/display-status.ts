/** Start of local calendar day — overdue compares against this, not wall-clock ms. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export function isPastDue(
  dueDate: Date | string | null | undefined,
  status: string
): boolean {
  if (!dueDate) return false;
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "DONE" || s === "CANCELLED") return false;
  return toDate(dueDate).getTime() < startOfToday().getTime();
}

/** Badge / list label for milestones & schedule items. */
export function resolveScheduleDisplayStatus(
  status: string,
  dueDate?: Date | string | null
): string {
  if (status === "COMPLETED") return "COMPLETED";
  if (isPastDue(dueDate, status)) return "OVERDUE";
  return status;
}

/** Badge / list label for tasks. */
export function resolveTaskDisplayStatus(
  status: string,
  dueDate?: Date | string | null
): string {
  const s = status.toUpperCase();
  if (s === "DONE" || s === "CANCELLED") return status;
  if (isPastDue(dueDate, status)) return "OVERDUE";
  return status;
}

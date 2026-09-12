export type GanttTaskStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "AT_RISK"
  | "NOT_STARTED"
  | "PHASE";

export type GanttTask = {
  id: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  status: GanttTaskStatus;
  assigneeName?: string | null;
  projectName?: string | null;
  trade?: string | null;
  dependsOnId?: string | null;
  isPhase?: boolean;
  meta?: string | null;
  parentId?: string | null;
  progress?: number | null;
  isCritical?: boolean;
  isMilestone?: boolean;
  childrenCount?: number;
  href?: string | null;
};

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

/** Shared server/client helper — keep out of `"use client"` modules. */
export function mapScheduleStatus(
  status: string,
  endDate?: Date | string
): GanttTaskStatus {
  if (status === "COMPLETED") return "COMPLETED";
  // Past end date (and not complete) always shows at-risk / overdue on the Gantt.
  if (endDate && toDate(endDate).getTime() < Date.now()) {
    return "AT_RISK";
  }
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "DELAYED") return "AT_RISK";
  return "NOT_STARTED";
}

/** Map TaskStatus → Gantt bar status (DONE→COMPLETED, BLOCKED→AT_RISK, etc.). */
export function mapTaskStatus(
  status: string,
  endDate?: Date | string | null
): GanttTaskStatus {
  if (status === "DONE" || status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "NOT_STARTED";
  if (endDate && toDate(endDate).getTime() < Date.now()) {
    return "AT_RISK";
  }
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "BLOCKED") return "AT_RISK";
  return "NOT_STARTED";
}

/** Resolve a drawable [start, end] for a task (bars need both ends). */
export function resolveTaskGanttDates(input: {
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
}): { start: Date; end: Date } | null {
  const startRaw = input.startDate ? toDate(input.startDate) : null;
  const dueRaw = input.dueDate ? toDate(input.dueDate) : null;
  const createdRaw = input.createdAt ? toDate(input.createdAt) : null;

  const start = startRaw ?? dueRaw ?? createdRaw;
  if (!start || Number.isNaN(start.getTime())) return null;

  let end = dueRaw ?? startRaw ?? createdRaw ?? start;
  if (Number.isNaN(end.getTime())) end = start;
  if (end.getTime() < start.getTime()) end = start;
  return { start, end };
}

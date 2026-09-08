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

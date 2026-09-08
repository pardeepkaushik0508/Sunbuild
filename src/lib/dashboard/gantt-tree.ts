import { differenceInCalendarDays, max as maxDate, min as minDate } from "date-fns";
import {
  mapScheduleStatus,
  type GanttTask,
  type GanttTaskStatus,
} from "@/lib/schedule/gantt-status";

export type ScheduleRow = {
  id: string;
  title: string;
  trade: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  dependsOnId: string | null;
  assigneeName: string | null;
  projectName?: string | null;
};

/**
 * Build hierarchical Gantt rows: trade groups become expandable phases,
 * schedule items are children. Critical path = delayed / overdue / dependency
 * chain into delayed work.
 */
export function buildGanttTree(items: ScheduleRow[]): GanttTask[] {
  if (items.length === 0) return [];

  const criticalIds = resolveCriticalIds(items);
  const byTrade = new Map<string, ScheduleRow[]>();

  for (const item of items) {
    const key = (item.trade?.trim() || "General").trim();
    const list = byTrade.get(key) ?? [];
    list.push(item);
    byTrade.set(key, list);
  }

  const result: GanttTask[] = [];

  for (const [trade, rows] of byTrade) {
    const sorted = [...rows].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime()
    );
    const start = minDate(sorted.map((r) => r.startDate));
    const end = maxDate(sorted.map((r) => r.endDate));
    const weeks = Math.max(
      1,
      Math.ceil((differenceInCalendarDays(end, start) + 1) / 7)
    );
    const phaseId = `phase:${trade}`;
    const completed = sorted.filter((r) => r.status === "COMPLETED").length;
    const progress =
      sorted.length > 0
        ? Math.round((completed / sorted.length) * 100)
        : 0;

    result.push({
      id: phaseId,
      title: `${trade} Phase`,
      startDate: start,
      endDate: end,
      status: "PHASE",
      isPhase: true,
      assigneeName: sorted.find((r) => r.assigneeName)?.assigneeName ?? null,
      meta: `${sorted.length} task${sorted.length === 1 ? "" : "s"} • ${weeks} week${weeks === 1 ? "" : "s"}`,
      progress,
      childrenCount: sorted.length,
    });

    for (const row of sorted) {
      const status = mapScheduleStatus(row.status, row.endDate);
      result.push({
        id: row.id,
        title: row.title,
        startDate: row.startDate,
        endDate: row.endDate,
        status,
        parentId: phaseId,
        assigneeName: row.assigneeName,
        projectName: row.projectName,
        trade: row.trade,
        dependsOnId: row.dependsOnId,
        progress: statusProgress(status),
        isCritical: criticalIds.has(row.id),
        isMilestone: false,
      });
    }
  }

  return result;
}

function statusProgress(status: GanttTaskStatus): number {
  if (status === "COMPLETED") return 100;
  if (status === "IN_PROGRESS") return 55;
  if (status === "AT_RISK") return 35;
  return 0;
}

function resolveCriticalIds(items: ScheduleRow[]): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const delayed = new Set<string>();
  const now = Date.now();

  for (const item of items) {
    if (
      item.status === "DELAYED" ||
      (item.status !== "COMPLETED" && item.endDate.getTime() < now)
    ) {
      delayed.add(item.id);
    }
  }

  // Walk dependents of delayed items
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (delayed.has(item.id)) continue;
      if (item.dependsOnId && delayed.has(item.dependsOnId)) {
        delayed.add(item.id);
        changed = true;
      }
    }
  }

  // Also mark dependency chain leading into delayed (predecessors)
  for (const id of [...delayed]) {
    let cur = byId.get(id);
    while (cur?.dependsOnId) {
      if (delayed.has(cur.dependsOnId)) break;
      delayed.add(cur.dependsOnId);
      cur = byId.get(cur.dependsOnId);
    }
  }

  return delayed;
}

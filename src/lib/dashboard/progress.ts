/**
 * Shared project progress — keep Recent Jobs, Gantt footer, and project detail in sync.
 *
 * Dynamic formula (not manually editable):
 * - Milestone % = completed milestones / total milestones
 * - Task %      = done tasks / active tasks (excludes CANCELLED)
 * - Schedule %  = completed schedule items / total schedule items
 *
 * Overall = average of whichever of those sources have items.
 * Falls back to stored Project.progressPercent only when none of the above exist.
 * Completed / handed-over projects always report 100%.
 */
export type ProgressSourceItem = {
  status: string;
};

const MILESTONE_DONE = new Set(["COMPLETED"]);
const TASK_DONE = new Set(["DONE"]);
const TASK_IGNORE = new Set(["CANCELLED"]);
const SCHEDULE_DONE = new Set(["COMPLETED"]);
const PROJECT_COMPLETE = new Set(["COMPLETED", "HANDED_OVER"]);

function ratioPercent(
  items: ProgressSourceItem[],
  isDone: (status: string) => boolean,
  ignore?: (status: string) => boolean
): number | null {
  const countable = ignore
    ? items.filter((i) => !ignore(i.status))
    : items;
  if (countable.length === 0) return null;
  const completed = countable.filter((i) => isDone(i.status)).length;
  return clampPercent(Math.round((completed / countable.length) * 100));
}

/** Flat completion ratio (legacy helper — treats DONE/COMPLETED as complete). */
export function deriveProgressFromItems(items: ProgressSourceItem[]): number {
  if (items.length === 0) return 0;
  const completed = items.filter(
    (i) => i.status === "COMPLETED" || i.status === "DONE"
  ).length;
  return clampPercent(Math.round((completed / items.length) * 100));
}

export function computeProjectProgress(input: {
  progressPercent: number;
  status?: string;
  scheduleItems?: ProgressSourceItem[];
  milestones?: ProgressSourceItem[];
  tasks?: ProgressSourceItem[];
}): number {
  if (input.status && PROJECT_COMPLETE.has(input.status)) {
    return 100;
  }

  const parts: number[] = [];

  const milestonePct = ratioPercent(
    input.milestones ?? [],
    (s) => MILESTONE_DONE.has(s)
  );
  if (milestonePct != null) parts.push(milestonePct);

  const taskPct = ratioPercent(
    input.tasks ?? [],
    (s) => TASK_DONE.has(s),
    (s) => TASK_IGNORE.has(s)
  );
  if (taskPct != null) parts.push(taskPct);

  const schedulePct = ratioPercent(
    input.scheduleItems ?? [],
    (s) => SCHEDULE_DONE.has(s)
  );
  if (schedulePct != null) parts.push(schedulePct);

  if (parts.length === 0) return clampPercent(input.progressPercent);
  return averageProgress(parts);
}

export function averageProgress(percents: number[]): number {
  if (percents.length === 0) return 0;
  return clampPercent(
    Math.round(percents.reduce((s, n) => s + n, 0) / percents.length)
  );
}

function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
